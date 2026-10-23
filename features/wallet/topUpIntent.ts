import type { SubscriptionPayment, WalletPaymentResponse } from '@/types';
import type { InitiateWalletTopUpPayload } from '@/store/api/walletApi';
import { serializePaymentStorage, waitForPaymentStorage } from '@/features/arrival-payment/paymentStorage';

type Payload = Omit<InitiateWalletTopUpPayload, 'intentScope'>;
type Intent = { version: 1; key: string; payload: Payload; orderNumber?: string | null };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown> };
const UNRESOLVED = 'Une recharge est déjà en cours. Reprenez le même montant et le même moyen de paiement pour la vérifier, sans payer une seconde fois.';

export function createTopUpIntentStore(storage: Storage, uuid: () => string) {
  const storageKey = (userId: string, scope: string) => `zwanga:topup-intent:v1:${encodeURIComponent(userId)}:${encodeURIComponent(scope)}`;
  const read = async (key: string): Promise<Intent | null> => {
    const raw = await waitForPaymentStorage(storage.getItem(key));
    if (!raw) return null;
    const value = JSON.parse(raw) as Intent;
    // Never erase an unreadable intent and silently issue a second charge.
    if (value.version !== 1 || typeof value.key !== 'string' || !value.key ||
        !value.payload || !Number.isFinite(value.payload.amount) || value.payload.amount <= 0 ||
        !['mobile_money', 'card'].includes(value.payload.method)) throw new Error(UNRESOLVED);
    return value;
  };
  return {
    async readPending(userId: string, scope: string) {
      return userId ? read(storageKey(userId, scope)) : null;
    },
    async recover(userId: string, scope: string, send: (body: Payload) => Promise<WalletPaymentResponse>, isCurrent: () => boolean) {
      if (!userId || !isCurrent()) throw new Error('Session expirée. Reconnectez-vous.');
      return serializePaymentStorage(storageKey(userId, scope), async () => {
        const intent = await read(storageKey(userId, scope));
        if (!intent || !isCurrent()) throw new Error('Cette tentative doit être vérifiée avec l’aide de Zwanga.');
        // This endpoint only recovers/seals the original key. Never call /topups here.
        const response = await send({ amount: intent.payload.amount, method: intent.payload.method,
          phone: intent.payload.phone, idempotencyKey: intent.key });
        // Monitoring resumes by order number. Persist that correlation before
        // the screen replaces its unknown-intent marker with the recovered order.
        if (response.payment.orderNumber) {
          intent.orderNumber = response.payment.orderNumber;
          await storage.setItem(storageKey(userId, scope), JSON.stringify(intent));
        }
        return { ...response, clientIntentKey: intent.key };
      });
    },
    async run(userId: string, scope: string, payload: Payload,
      send: (body: Payload) => Promise<WalletPaymentResponse>, isCurrent: () => boolean) {
      if (!userId || !isCurrent()) throw new Error('Session expirée. Reconnectez-vous.');
      const key = storageKey(userId, scope);
      let expired = false;
      // The lock includes the request, so two screens/taps cannot claim different keys.
      try { return await serializePaymentStorage(key, async () => {
        let intent = await read(key);
        if (intent && (intent.payload.amount !== payload.amount || intent.payload.method !== payload.method ||
            intent.payload.phone !== payload.phone)) throw new Error(UNRESOLVED);
        if (!intent) {
          intent = { version: 1, key: uuid(), payload };
          // No HTTP mutation until durable storage has acknowledged the intent.
          await storage.setItem(key, JSON.stringify(intent));
        }
        if (expired || !isCurrent()) throw new Error('Opération interrompue. Réessayez pour vérifier la même recharge.');
        const response = await send({ ...intent.payload, idempotencyKey: intent.key });
        if (response.payment.orderNumber) {
          intent.orderNumber = response.payment.orderNumber;
          await storage.setItem(key, JSON.stringify(intent));
        }
        return { ...response, clientIntentKey: intent.key };
      }); } catch (error) { expired = true; throw error; }
    },
    async acknowledge(userId: string, scope: string, payment: SubscriptionPayment, clientIntentKey?: string) {
      if (!userId || !['succeeded', 'failed', 'cancelled'].includes(payment.status ?? '')) return;
      const key = storageKey(userId, scope);
      await serializePaymentStorage(key, async () => {
        const intent = await read(key);
        if (intent && ((clientIntentKey && intent.key === clientIntentKey) ||
            (payment.orderNumber && intent.orderNumber === payment.orderNumber))) await storage.removeItem(key);
      });
    },
  };
}

let store: Promise<ReturnType<typeof createTopUpIntentStore>> | undefined;
function getStore() {
  return store ??= Promise.all([import('@react-native-async-storage/async-storage'), import('expo-crypto')])
    .then(([storage, crypto]) => createTopUpIntentStore(storage.default, crypto.randomUUID));
}
export async function runWalletTopUpIntent(...args: Parameters<ReturnType<typeof createTopUpIntentStore>['run']>) {
  return (await getStore()).run(...args);
}
export async function recoverWalletTopUpIntent(...args: Parameters<ReturnType<typeof createTopUpIntentStore>['recover']>) {
  return (await getStore()).recover(...args);
}
export async function acknowledgeWalletTopUpIntent(userId: string | undefined, scope: string, response: WalletPaymentResponse) {
  if (!userId) return;
  await (await getStore()).acknowledge(userId, scope, response.payment, response.clientIntentKey);
}
export async function readWalletTopUpIntent(userId: string) {
  return (await getStore()).readPending(userId, 'wallet');
}
