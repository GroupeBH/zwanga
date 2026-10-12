import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mutex } from 'async-mutex';
import * as Crypto from 'expo-crypto';
import type { SubscriptionPaymentMethod } from '@/types';

export type WalletTopUpIntent = {
  userId: string;
  scope?: string;
  idempotencyKey: string;
  amount: number;
  method: SubscriptionPaymentMethod;
  phone?: string;
  paymentReference?: string;
};
const mutex = new Mutex();
const keyFor = (userId: string, scope = 'wallet') => `wallet-topup-intent:v1:${userId}:${scope}`;

export async function readWalletTopUpIntent(userId: string, scope?: string): Promise<WalletTopUpIntent | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId, scope));
  if (!raw) return null;
  const value = JSON.parse(raw) as WalletTopUpIntent;
  if (value?.userId !== userId || value.scope !== scope || !Number.isFinite(value.amount) || value.amount < 1 ||
    !['card', 'mobile_money'].includes(value.method) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey) ||
    (value.method === 'mobile_money' && !/^\+243\d{9}$/.test(value.phone ?? ''))) {
    throw new Error('La recharge en attente ne peut pas être restaurée. Contactez le support avant de réessayer.');
  }
  return value;
}

export async function prepareWalletTopUpIntent(input: Omit<WalletTopUpIntent, 'idempotencyKey'>) {
  if (!input.userId || !Number.isFinite(input.amount) || input.amount < 1) throw new Error('La recharge minimum est de 1 jeton et nécessite une session active.');
  return mutex.runExclusive(async () => {
    const existing = await readWalletTopUpIntent(input.userId, input.scope);
    if (existing) {
      if (existing.amount !== input.amount || existing.method !== input.method || existing.phone !== input.phone) {
        throw new Error('Une recharge attend une confirmation. Rouvrez le portefeuille pour reprendre cette recharge.');
      }
      return existing;
    }
    const intent = { ...input, idempotencyKey: Crypto.randomUUID() };
    // Fail closed: no POST unless its retry key is durable.
    await AsyncStorage.setItem(keyFor(input.userId, input.scope), JSON.stringify(intent));
    return intent;
  });
}

export async function rememberWalletTopUpReference(intent: WalletTopUpIntent, paymentReference: string | null) {
  if (!paymentReference) return;
  await mutex.runExclusive(async () => {
    const current = await readWalletTopUpIntent(intent.userId, intent.scope);
    if (current?.idempotencyKey === intent.idempotencyKey) {
      await AsyncStorage.setItem(keyFor(intent.userId, intent.scope), JSON.stringify({ ...current, paymentReference }));
    }
  });
}

export async function clearWalletTopUpIntent(userId: string, scope: string | undefined, paymentReference: string | null) {
  if (!paymentReference) return;
  await mutex.runExclusive(async () => {
    const current = await readWalletTopUpIntent(userId, scope);
    if (current?.paymentReference === paymentReference) await AsyncStorage.removeItem(keyFor(userId, scope));
  });
}
