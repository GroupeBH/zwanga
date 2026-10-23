import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mutex } from 'async-mutex';
import * as Crypto from 'expo-crypto';
import type { ReferralWithdrawal } from '@/types';

export type ReferralWithdrawalIntent = {
  userId: string; tokens: number; phone: string; idempotencyKey: string; withdrawalId?: string;
};
const mutex = new Mutex();
const keyFor = (userId: string) => `referral-withdrawal-intent:v1:${userId}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readReferralWithdrawalIntent(userId: string): Promise<ReferralWithdrawalIntent | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as ReferralWithdrawalIntent;
  if (!value || value.userId !== userId || !Number.isFinite(value.tokens) || value.tokens <= 0 ||
      !/^\+243\d{9}$/.test(value.phone) || !uuid.test(value.idempotencyKey) ||
      (value.withdrawalId !== undefined && !uuid.test(value.withdrawalId))) {
    throw new Error('La demande de retrait enregistrée ne peut pas être restaurée en sécurité. Contactez le support.');
  }
  return value;
}

export function prepareReferralWithdrawalIntent(userId: string, tokens: number, phone: string) {
  return mutex.runExclusive(async () => {
    const existing = await readReferralWithdrawalIntent(userId);
    if (existing) return { intent: existing, created: false }; // Original amount and destination.
    const intent: ReferralWithdrawalIntent = { userId, tokens, phone, idempotencyKey: Crypto.randomUUID() };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(intent)); // Before any POST.
    return { intent, created: true };
  });
}

export function clearReferralWithdrawalIntent(intent: ReferralWithdrawalIntent) {
  return mutex.runExclusive(async () => {
    if ((await readReferralWithdrawalIntent(intent.userId))?.idempotencyKey === intent.idempotencyKey) {
      await AsyncStorage.removeItem(keyFor(intent.userId));
    }
  });
}

export function recordReferralWithdrawal(intent: ReferralWithdrawalIntent, result: ReferralWithdrawal) {
  return mutex.runExclusive(async () => {
    if (!uuid.test(result.id) || result.idempotencyKey !== intent.idempotencyKey ||
        Number(result.tokens) !== intent.tokens || typeof result.phone !== 'string' || result.phone.replace(/^\+?/, '+') !== intent.phone ||
        !['pending', 'initiated', 'succeeded', 'failed', 'cancelled'].includes(result.status)) {
      throw new Error('La confirmation du retrait ne correspond pas à la demande. Contactez le support.');
    }
    if ((await readReferralWithdrawalIntent(intent.userId))?.idempotencyKey !== intent.idempotencyKey) return null;
    if (['succeeded', 'failed', 'cancelled'].includes(result.status)) {
      await AsyncStorage.removeItem(keyFor(intent.userId));
      return null;
    }
    const next = { ...intent, withdrawalId: result.id };
    await AsyncStorage.setItem(keyFor(intent.userId), JSON.stringify(next));
    return next;
  });
}
