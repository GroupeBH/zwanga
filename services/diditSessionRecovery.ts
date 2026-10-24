import * as SecureStore from 'expo-secure-store';
import type { DiditKycSession } from '@/store/api/userApi';

export type DiditRecovery = { session: DiditKycSession; submitted: boolean; launchUntil: number };
const key = (userId: string) => `zwanga_didit_${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

// SDK tokens/hosted URLs are credentials: never put them in AsyncStorage or logs.
export async function readDiditRecovery(userId: string): Promise<DiditRecovery | null> {
  const raw = await SecureStore.getItemAsync(key(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as DiditRecovery;
  return typeof value?.session?.sessionId === 'string' && Number.isFinite(value.launchUntil) ? value : null;
}

export async function saveDiditRecovery(userId: string, session: DiditKycSession, submitted = false): Promise<DiditRecovery> {
  const providerExpiry = Date.parse(session.expiresAt ?? '');
  const value: DiditRecovery = { session: submitted ? { ...session, sessionToken: null, url: '' } : session, submitted,
    launchUntil: Math.min(Date.now() + 10 * 60_000, Number.isFinite(providerExpiry) ? providerExpiry : Infinity) };
  await SecureStore.setItemAsync(key(userId), JSON.stringify(value));
  return value;
}

export async function clearDiditRecovery(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(key(userId));
}
