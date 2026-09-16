import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zwanga.pending-referral-attribution.v2';
const CONSUMED_STORAGE_KEY = 'zwanga.consumed-referral-attributions.v1';
const ATTRIBUTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CONSUMED_ATTRIBUTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface PendingReferralAttribution {
  token: string;
  provider: 'chottulink';
  capturedAt: string;
  referringLink?: string;
  referrerFirstName?: string;
  isDeferred?: boolean;
}

interface ConsumedReferralAttribution {
  token: string;
  consumedAt: string;
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
    ...(typeof value.isDeferred === 'boolean'
      ? { isDeferred: value.isDeferred }
      : {}),
  };
};

const getConsumedAttributions = async (): Promise<ConsumedReferralAttribution[]> => {
  const raw = await AsyncStorage.getItem(CONSUMED_STORAGE_KEY);
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as ConsumedReferralAttribution[];
    const minimumDate = Date.now() - CONSUMED_ATTRIBUTION_MAX_AGE_MS;
    const normalized = Array.isArray(values)
      ? values.filter((value) => {
          const consumedAt = new Date(value?.consumedAt).getTime();
          return (
            TOKEN_PATTERN.test(value?.token ?? '') &&
            Number.isFinite(consumedAt) &&
            consumedAt >= minimumDate
          );
        })
      : [];
    if (normalized.length !== values.length) {
      await AsyncStorage.setItem(CONSUMED_STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    await AsyncStorage.removeItem(CONSUMED_STORAGE_KEY);
    return [];
  }
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
  if (pending.isDeferred) {
    const consumed = await getConsumedAttributions();
    if (consumed.some((entry) => entry.token === pending.token)) {
      return null;
    }
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  return pending;
};

export const clearPendingReferralAttribution = () =>
  AsyncStorage.removeItem(STORAGE_KEY);

/**
 * Marks an attribution as consumed before removing it. ChottuLink can return
 * the same cached install attribution on later launches; keeping this marker
 * prevents that deferred value from being silently applied to another account
 * on the same device. A new explicit (non-deferred) link click stays eligible.
 */
export const consumePendingReferralAttribution = async (token?: string) => {
  const pending = await getPendingReferralAttribution();
  const consumedToken = token ?? pending?.token;
  if (consumedToken && TOKEN_PATTERN.test(consumedToken)) {
    const values = await getConsumedAttributions();
    const next = [
      { token: consumedToken, consumedAt: new Date().toISOString() },
      ...values.filter((entry) => entry.token !== consumedToken),
    ].slice(0, 10);
    await AsyncStorage.setItem(CONSUMED_STORAGE_KEY, JSON.stringify(next));
  }
  await clearPendingReferralAttribution();
};
