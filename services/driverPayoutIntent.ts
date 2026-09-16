import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mutex } from 'async-mutex';
import * as Crypto from 'expo-crypto';

export interface DriverPayoutIntent {
  userId: string;
  idempotencyKey: string;
  amount: number;
  phone: string;
}

const mutex = new Mutex();
const keyFor = (userId: string) => `driver-payout-intent:v1:${userId}`;

export async function readDriverPayoutIntent(userId: string): Promise<DriverPayoutIntent | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as DriverPayoutIntent;
  // Never silently discard a potentially submitted payment intent.
  if (value.userId !== userId || !Number.isFinite(value.amount) || value.amount <= 0 ||
    typeof value.phone !== 'string' || !/^\+243\d{9}$/.test(value.phone) ||
    typeof value.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey)) {
    throw new Error('Payout intent cannot be restored safely');
  }
  return value;
}

export async function prepareDriverPayoutIntent(userId: string, amount: number, phone: string): Promise<DriverPayoutIntent> {
  return mutex.runExclusive(async () => {
    const existing = await readDriverPayoutIntent(userId);
    if (existing) {
      if (existing.amount !== amount || existing.phone !== phone) throw new Error('Unresolved payout intent');
      return existing;
    }
    const intent = { userId, amount, phone, idempotencyKey: Crypto.randomUUID() };
    // Persist BEFORE the POST. A timeout or app restart must reuse the same key.
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(intent));
    return intent;
  });
}

export async function clearDriverPayoutIntent(intent: DriverPayoutIntent): Promise<void> {
  await mutex.runExclusive(async () => {
    const existing = await readDriverPayoutIntent(intent.userId);
    if (existing?.idempotencyKey === intent.idempotencyKey) await AsyncStorage.removeItem(keyFor(intent.userId));
  });
}
