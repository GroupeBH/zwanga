import Constants from 'expo-constants';
import { Platform } from 'react-native';

type AnalyticsPrimitive = string | number | boolean | null | undefined;
export type AnalyticsParams = Record<string, AnalyticsPrimitive>;

type AnalyticsUser = {
  id?: string | null;
  role?: string | null;
  status?: string | null;
  verified?: boolean | null;
  identityVerified?: boolean | null;
};

type FirebaseAnalyticsInstance = {
  setAnalyticsCollectionEnabled(enabled: boolean): Promise<void>;
  logEvent(name: string, params?: Record<string, string | number>): Promise<void>;
  logScreenView(params: { screen_name: string; screen_class?: string }): Promise<void>;
  setUserId(id: string | null): Promise<void>;
  setUserProperties(properties: Record<string, string | null>): Promise<void>;
};

type MetaSdk = {
  AppEventsLogger?: {
    logEvent(
      eventName: string,
      valueToSumOrParams?: number | Record<string, string | number>,
      params?: Record<string, string | number>,
    ): void;
    setUserID?(userId: string | null): void;
  };
  Settings?: {
    setAutoLogAppEventsEnabled?(enabled: boolean): void;
    initializeSDK?(): void;
  };
};

let hasInitializedAnalytics = false;
let hasWarnedAboutMissingNativeSdk = false;

function isTruthyConfigValue(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function isMetaAnalyticsEnabled() {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return isTruthyConfigValue(extra.EXPO_PUBLIC_META_ENABLED);
}

function canUseNativeSdk() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function warnMissingSdk(moduleName: string, error: unknown) {
  if (hasWarnedAboutMissingNativeSdk) {
    return;
  }

  hasWarnedAboutMissingNativeSdk = true;
  if (__DEV__) {
    console.warn(`[analytics] Native module "${moduleName}" unavailable.`, error);
  }
}

function getFirebaseAnalytics(): FirebaseAnalyticsInstance | null {
  if (!canUseNativeSdk()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('@react-native-firebase/app') as {
      getApp: () => unknown;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analyticsModule = require('@react-native-firebase/analytics') as {
      getAnalytics: (app?: unknown) => unknown;
      setAnalyticsCollectionEnabled: (analytics: unknown, enabled: boolean) => Promise<void>;
      logEvent: (
        analytics: unknown,
        name: string,
        params?: Record<string, string | number>,
      ) => Promise<void>;
      logScreenView: (
        analytics: unknown,
        params: { screen_name: string; screen_class?: string },
      ) => Promise<void>;
      setUserId: (analytics: unknown, id: string | null) => Promise<void>;
      setUserProperties: (
        analytics: unknown,
        properties: Record<string, string | null>,
      ) => Promise<void>;
    };

    const firebaseAnalytics = analyticsModule.getAnalytics(appModule.getApp());

    return {
      setAnalyticsCollectionEnabled(enabled) {
        return analyticsModule.setAnalyticsCollectionEnabled(firebaseAnalytics, enabled);
      },
      logEvent(name, params) {
        return analyticsModule.logEvent(firebaseAnalytics, name, params);
      },
      logScreenView(params) {
        return analyticsModule.logScreenView(firebaseAnalytics, params);
      },
      setUserId(id) {
        return analyticsModule.setUserId(firebaseAnalytics, id);
      },
      setUserProperties(properties) {
        return analyticsModule.setUserProperties(firebaseAnalytics, properties);
      },
    };
  } catch (error) {
    warnMissingSdk('@react-native-firebase/analytics', error);
    return null;
  }
}

function getMetaSdk(): MetaSdk | null {
  if (!canUseNativeSdk() || !isMetaAnalyticsEnabled()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-fbsdk-next') as MetaSdk;
  } catch (error) {
    warnMissingSdk('react-native-fbsdk-next', error);
    return null;
  }
}

function sanitizeKey(key: string) {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return '';
  }

  const safeKey = /^[a-z]/.test(normalized) ? normalized : `param_${normalized}`;
  return safeKey.slice(0, 40);
}

function sanitizeValue(value: AnalyticsPrimitive): string | number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 100) : null;
  }

  return null;
}

function sanitizeParams(params?: AnalyticsParams): Record<string, string | number> | undefined {
  if (!params) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(params)
    .map(([key, value]) => [sanitizeKey(key), sanitizeValue(value)] as const)
    .filter(([key, value]) => Boolean(key) && value !== null);

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries);
}

function normalizeEventName(eventName: string) {
  const normalized = eventName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'custom_event';
  }

  return (/^[a-z]/.test(normalized) ? normalized : `event_${normalized}`).slice(0, 40);
}

function normalizeRoutePath(pathname: string) {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) {
        return ':id';
      }

      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) {
        return ':id';
      }

      if (segment.length > 24 && /^[0-9a-z_-]+$/i.test(segment)) {
        return ':id';
      }

      return segment;
    });

  return segments.join('/') || 'home';
}

export function getAnalyticsScreenName(pathname: string) {
  return normalizeRoutePath(pathname).replace(/\//g, '_');
}

export async function initializeAnalytics() {
  if (hasInitializedAnalytics) {
    return;
  }

  hasInitializedAnalytics = true;

  const firebaseAnalytics = getFirebaseAnalytics();
  const metaSdk = getMetaSdk();

  try {
    await firebaseAnalytics?.setAnalyticsCollectionEnabled(true);
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] Failed to enable Firebase Analytics collection.', error);
    }
  }

  try {
    metaSdk?.Settings?.setAutoLogAppEventsEnabled?.(true);
    metaSdk?.Settings?.initializeSDK?.();
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] Failed to initialize Meta App Events.', error);
    }
  }
}

export async function setAnalyticsUser(user: AnalyticsUser | null) {
  const firebaseAnalytics = getFirebaseAnalytics();
  const metaSdk = getMetaSdk();

  try {
    await firebaseAnalytics?.setUserId(user?.id ?? null);

    const userProperties = sanitizeParams({
      role: user?.role ?? undefined,
      status: user?.status ?? undefined,
      verified: user?.verified ?? undefined,
      identity_verified: user?.identityVerified ?? undefined,
      app_ownership: Constants.appOwnership ?? undefined,
    });

    if (userProperties) {
      await firebaseAnalytics?.setUserProperties(
        Object.fromEntries(
          Object.entries(userProperties).map(([key, value]) => [key, value == null ? null : String(value)]),
        ),
      );
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] Failed to update Firebase user context.', error);
    }
  }

  try {
    metaSdk?.AppEventsLogger?.setUserID?.(user?.id ?? null);
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] Failed to update Meta user context.', error);
    }
  }
}

export async function trackScreen(pathname: string) {
  const normalizedPath = normalizeRoutePath(pathname);
  const screenName = getAnalyticsScreenName(pathname);

  const firebaseAnalytics = getFirebaseAnalytics();
  const metaSdk = getMetaSdk();

  try {
    await firebaseAnalytics?.logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] Failed to log Firebase screen view.', error);
    }
  }

  try {
    metaSdk?.AppEventsLogger?.logEvent('screen_view', {
      screen_name: screenName,
      screen_path: normalizedPath,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] Failed to log Meta screen view.', error);
    }
  }
}

export async function trackEvent(eventName: string, params?: AnalyticsParams) {
  const normalizedEventName = normalizeEventName(eventName);
  const sanitizedParams = sanitizeParams(params);

  const firebaseAnalytics = getFirebaseAnalytics();
  const metaSdk = getMetaSdk();

  try {
    await firebaseAnalytics?.logEvent(normalizedEventName, sanitizedParams);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[analytics] Failed to log Firebase event "${normalizedEventName}".`, error);
    }
  }

  try {
    metaSdk?.AppEventsLogger?.logEvent(normalizedEventName, sanitizedParams);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[analytics] Failed to log Meta event "${normalizedEventName}".`, error);
    }
  }
}
