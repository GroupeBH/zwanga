import * as SecureStore from 'expo-secure-store';
import { decodeJWT } from '@/utils/jwt';
import type { AuthMode, AuthStep } from '@/components/auth/types';
import type { TripRequestVehicleType, UserGender } from '@/types';

const KEY = 'zwanga_auth_flow_v1';
export const AUTH_DRAFT_TTL_MS = 30 * 60 * 1000;
const textFields = ['phone', 'firstName', 'lastName', 'email', 'vehicleBrand', 'vehicleModel', 'vehicleColor', 'vehiclePlate', 'googlePhone'] as const;
const nullableFields = ['profilePicture', 'googleIdToken', 'googleProfileName', 'googleFirstName', 'googleLastName', 'googleEmail', 'appleNonce'] as const;
export type DraftState = Record<typeof textFields[number], string> & Record<typeof nullableFields[number], string | null> & {
  mode: AuthMode; step: AuthStep; gender: UserGender | null;
  role: 'driver' | 'passenger'; vehicleType: TripRequestVehicleType | null;
  googleFlow: 'signup' | null; googleSignupStep: 'phone' | 'otp' | 'profile';
  isGooglePhoneVerified: boolean; socialProvider: 'google' | 'apple' | null;
};
type Draft = { version: 1; savedAt: number; expiresAt: number; state: DraftState };
let cached: Draft | null = null;
let revision = 0;
let openedThisLaunch = false;
export const markAuthFlowOpened = () => { openedThisLaunch = true; };
export const shouldResumeAuthFlow = () => !openedThisLaunch && Boolean(getAuthDraftSnapshot());
let writes: Promise<void> = Promise.resolve();

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max ? value : '';
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback;

/** Explicit allowlist: never store PIN, OTP digits, reset proof, session tokens or API results. */
export function selectAuthDraftState(input: unknown): DraftState {
  const source = object(input);
  const result = {
    ...Object.fromEntries(textFields.map(key => [key, text(source[key])])),
    ...Object.fromEntries(nullableFields.map(key => [key, text(source[key], key === 'googleIdToken' ? 12000 : 1500) || null])),
    mode: choice(source.mode, ['login', 'signup'], 'login'),
    step: choice(source.step, ['phone', 'sms', 'pin', 'profile', 'kyc', 'resetPin'], 'phone'),
    gender: ['male', 'female', 'other', 'prefer_not_to_say'].includes(source.gender as string) ? source.gender : null,
    role: choice(source.role, ['driver', 'passenger'], 'passenger'),
    vehicleType: ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'].includes(source.vehicleType as string) ? source.vehicleType : null,
    googleFlow: source.googleFlow === 'signup' ? 'signup' : null,
    googleSignupStep: choice(source.googleSignupStep, ['phone', 'otp', 'profile'], 'phone'),
    isGooglePhoneVerified: source.isGooglePhoneVerified === true,
    socialProvider: source.socialProvider === 'apple' || source.socialProvider === 'google' ? source.socialProvider : null,
  } as DraftState;
  // A reset proof only lives in memory. A recreated process must verify the OTP again.
  // Likewise, a regular signup must ask for its PIN again before submitting retained profile data.
  if (['profile', 'kyc'].includes(result.step) && !result.googleIdToken) result.step = 'pin';
  return result;
}

function valid(draft: Draft | null): draft is Draft {
  if (!draft || draft.version !== 1 || !Number.isFinite(draft.savedAt) || !Number.isFinite(draft.expiresAt)) return false;
  const now = Date.now();
  if (draft.savedAt > now || draft.expiresAt <= now || draft.expiresAt - draft.savedAt > AUTH_DRAFT_TTL_MS) return false;
  const s = draft.state;
  if (!s || (s.step === 'phone' && !s.googleIdToken) || !(s.phone || s.googlePhone)) return false;
  if (s.googleIdToken) {
    const expiry = decodeJWT(s.googleIdToken)?.exp;
    // This is only a freshness check. Only the backend can confirm identity/phone verification; this draft only restores UI.
    if (typeof expiry !== 'number' || expiry * 1000 <= now || !s.socialProvider || s.googleFlow !== 'signup') return false;
  }
  return true;
}

function enqueue(task: () => Promise<void>): Promise<void> {
  const result = writes.then(task);
  writes = result.catch(() => {});
  return result;
}

export function getAuthDraftSnapshot(): DraftState | null {
  return valid(cached) ? cached.state : null;
}

export function clearAuthFlowDraft(): Promise<void> {
  revision += 1;
  cached = null;
  return enqueue(() => SecureStore.deleteItemAsync(KEY));
}

export async function restoreAuthFlowDraft(): Promise<DraftState | null> {
  const generation = revision;
  await writes;
  // Propagate transient keychain failures to the startup retry screen; never erase on read failure.
  const raw = await SecureStore.getItemAsync(KEY);
  if (generation !== revision) return getAuthDraftSnapshot();
  let parsed: Draft | null = null;
  try {
    if (raw) {
      const value = JSON.parse(raw);
      parsed = { ...value, state: selectAuthDraftState(value.state) };
    }
  } catch { /* Malformed or obsolete drafts are not resumable. */ }
  cached = valid(parsed) ? parsed : null;
  if (raw && !cached) await clearAuthFlowDraft();
  return getAuthDraftSnapshot();
}

export function saveAuthFlowDraft(input: unknown): Promise<void> {
  const state = selectAuthDraftState(input);
  const now = Date.now();
  const next: Draft = { version: 1, savedAt: now, expiresAt: now + AUTH_DRAFT_TTL_MS, state };
  if (!valid(next)) return clearAuthFlowDraft();
  const generation = ++revision;
  cached = next;
  return enqueue(async () => {
    if (generation !== revision) return;
    await SecureStore.setItemAsync(KEY, JSON.stringify(next), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });
}

export const flushAuthFlowDraft = () => writes;
