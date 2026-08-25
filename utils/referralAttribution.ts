import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zwanga.pending-referral-attribution.v2';
const ATTRIBUTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface PendingReferralAttribution {
  token: string;
  provider: 'chottulink';
  capturedAt: string;
  referringLink?: string;
  referrerFirstName?: string;
}

const normalize = (
  value: PendingReferralAttribution | null,
): PendingReferralAttribution | null => {
  if (
    !value ||
    value.provider !== 'chottulink' ||
    !TOKEN_PATTERN.test(value.token)
  ) {
    return null;
  }
  const capturedAt = new Date(value.capturedAt);
  if (
    Number.isNaN(capturedAt.getTime()) ||
    capturedAt.getTime() > Date.now() + 5 * 60 * 1000 ||
    capturedAt.getTime() < Date.now() - ATTRIBUTION_MAX_AGE_MS
  ) {
    return null;
  }
  return {
    token: value.token,
    provider: value.provider,
    capturedAt: capturedAt.toISOString(),
    ...(value.referringLink
      ? { referringLink: value.referringLink.slice(0, 500) }
      : {}),
    ...(value.referrerFirstName
      ? { referrerFirstName: value.referrerFirstName.slice(0, 100) }
      : {}),
  };
};

export const getPendingReferralAttribution = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const pending = normalize(
      JSON.parse(raw) as PendingReferralAttribution,
    );
    if (!pending) await AsyncStorage.removeItem(STORAGE_KEY);
    return pending;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const captureFirstReferralAttribution = async (
  value: PendingReferralAttribution,
) => {
  const existing = await getPendingReferralAttribution();
  if (existing) return existing;
  const pending = normalize(value);
  if (!pending) return null;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  return pending;
};

export const clearPendingReferralAttribution = () =>
  AsyncStorage.removeItem(STORAGE_KEY);
