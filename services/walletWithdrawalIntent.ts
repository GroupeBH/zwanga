import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mutex } from 'async-mutex';
import * as Crypto from 'expo-crypto';

export type WalletWithdrawalIntent = { userId: string; idempotencyKey: string; tokens: number; phone: string };
const mutex = new Mutex();
const keyFor = (userId: string) => `wallet-withdrawal-intent:v1:${userId}`;

export async function readWalletWithdrawalIntent(userId: string): Promise<WalletWithdrawalIntent | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as WalletWithdrawalIntent;
  if (value.userId !== userId || !Number.isFinite(value.tokens) || value.tokens < 1 ||
    !/^\+?243\d{9}$/.test(value.phone) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey)) {
    throw new Error('Impossible de restaurer la demande de retrait en sécurité');
  }
  return value;
}

export async function prepareWalletWithdrawalIntent(userId: string, tokens: number, phone: string) {
  return mutex.runExclusive(async () => {
    const existing = await readWalletWithdrawalIntent(userId);
    if (existing) {
      if (existing.tokens !== tokens || existing.phone !== phone) throw new Error('Une demande attend une confirmation');
      return existing;
    }
    const intent = { userId, tokens, phone, idempotencyKey: Crypto.randomUUID() };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(intent));
    return intent;
  });
}

export async function clearWalletWithdrawalIntent(intent: WalletWithdrawalIntent) {
  await mutex.runExclusive(async () => {
    const current = await readWalletWithdrawalIntent(intent.userId);
    if (current?.idempotencyKey === intent.idempotencyKey) await AsyncStorage.removeItem(keyFor(intent.userId));
  });
}
