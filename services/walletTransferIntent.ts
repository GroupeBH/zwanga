import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mutex } from 'async-mutex';
import * as Crypto from 'expo-crypto';
import type { TransferWalletPointsPayload } from '@/store/api/walletApi';

type Payload = Omit<TransferWalletPointsPayload, 'idempotencyKey'>;
export type WalletTransferIntent = { userId: string; idempotencyKey: string; payload: Payload };
const mutex = new Mutex();
const keyFor = (userId: string) => `wallet-transfer-intent:v1:${userId}`;
const signature = (payload: Payload) => JSON.stringify([payload.amount, payload.recipientUserId ?? '',
  payload.recipientPhone ?? '', payload.recipientEmail ?? '', payload.note ?? '']);
export class PendingWalletTransferError extends Error {
  constructor(readonly intent: WalletTransferIntent) { super('Un transfert attend encore sa confirmation.'); }
}
export async function readWalletTransferIntent(userId: string): Promise<WalletTransferIntent | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as WalletTransferIntent;
  if (value.userId !== userId || !value.payload || !Number.isFinite(value.payload.amount) || value.payload.amount <= 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey)) {
    throw new Error('Impossible de restaurer le transfert. Contactez le support avant de recommencer.');
  }
  return value;
}
export function prepareWalletTransferIntent(userId: string, payload: Payload) {
  return mutex.runExclusive(async () => {
    const existing = await readWalletTransferIntent(userId);
    if (existing) {
      if (signature(existing.payload) !== signature(payload)) throw new PendingWalletTransferError(existing);
      return { ...existing, resumed: true };
    }
    const intent = { userId, payload, idempotencyKey: Crypto.randomUUID() };
    // Never send money if the retry key could not be persisted first.
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(intent));
    return { ...intent, resumed: false };
  });
}
export function clearWalletTransferIntent(intent: WalletTransferIntent) {
  return mutex.runExclusive(async () => {
    if ((await readWalletTransferIntent(intent.userId))?.idempotencyKey === intent.idempotencyKey) {
      await AsyncStorage.removeItem(keyFor(intent.userId));
    }
  });
}
