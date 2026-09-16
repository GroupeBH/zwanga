import { getApiErrorMessage } from '@/utils/errorHelpers';

// Notifee setup
export type NotifeeModule = typeof import('@notifee/react-native');
export type NotifeeDefault = NotifeeModule['default'];
export type AndroidImportanceEnum = NotifeeModule['AndroidImportance'];

export let notifeeInstance: NotifeeDefault | null = null;
export let androidImportanceEnum: AndroidImportanceEnum | undefined;
export let hasTriedLoadingNotifee = false;

export type SocialAuthProvider = 'google' | 'apple';

export type SocialSignupSeed = {
  provider: SocialAuthProvider;
  idToken: string;
  profileName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  nonce?: string | null;
};

export const getAuthErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error.trim()) {
    return getApiErrorMessage({ message: error }, fallback);
  }

  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const authError = error as {
    data?: { message?: unknown; error?: unknown };
    message?: unknown;
    error?: unknown;
  };
  const rawMessage =
    authError.data?.message ??
    authError.data?.error ??
    authError.message ??
    authError.error;

  if (Array.isArray(rawMessage)) {
    return getApiErrorMessage(
      {
        ...authError,
        message: rawMessage.filter((item): item is string => typeof item === 'string').join('\n'),
      },
      fallback,
    );
  }

  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    return getApiErrorMessage({ ...authError, message: rawMessage }, fallback);
  }

  return getApiErrorMessage(authError, fallback);
};

export const normalizeAuthErrorMessage = (message: string) =>
  message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const isSocialSignupRequiredError = (error: unknown, provider: SocialAuthProvider) => {
  const message = normalizeAuthErrorMessage(getAuthErrorMessage(error, ''));

  return (
    message.includes(provider) &&
    message.includes('telephone') &&
    message.includes('inscription') &&
    (message.includes('premiere') || message.includes('requis'))
  );
};

export const shouldCompleteSocialRegistration = (error: unknown) => {
  const message = normalizeAuthErrorMessage(getAuthErrorMessage(error, ''));

  return (
    message.includes('telephone') &&
    message.includes('inscription') &&
    (message.includes('premiere') || message.includes('requis'))
  );
};

export function ensureAuthNotifeeLoaded() {
  if (hasTriedLoadingNotifee) {
    return;
  }
  hasTriedLoadingNotifee = true;
  try {
    const notifeeModule = require('@notifee/react-native') as NotifeeModule;
    notifeeInstance = notifeeModule.default ?? (notifeeModule as unknown as NotifeeDefault);
    androidImportanceEnum = notifeeModule.AndroidImportance;
  } catch (error) {
    console.warn('[Notifee] Module not available. Notifications disabled in this environment.');
  }
}
