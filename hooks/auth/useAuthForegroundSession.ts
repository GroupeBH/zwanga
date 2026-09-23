import { proactiveTokenRefresh } from '@/services/tokenRefresh';
import { useAppDispatch } from '@/store/hooks';
import { isTokenExpired } from '@/utils/jwt';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

interface Params {
  isLoading: boolean;
  lastAuthTime: React.RefObject<number | null>;
  lastAppState: React.RefObject<AppStateStatus>;
  appBackgroundedAt: React.RefObject<number | null>;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  latestAuthState: React.RefObject<{ isAuthenticated: boolean; accessToken: string | null; refreshToken: string | null; }>;
  isForegroundRefreshInFlight: React.RefObject<boolean>;
  lastForegroundRefreshAt: React.RefObject<number>;
  dispatch: ReturnType<typeof useAppDispatch>;
}

export function useAuthForegroundSession({
  isLoading,
  lastAuthTime,
  lastAppState,
  appBackgroundedAt,
  isAuthenticated,
  accessToken,
  refreshToken,
  latestAuthState,
  isForegroundRefreshInFlight,
  lastForegroundRefreshAt,
  dispatch,
}: Params) {
  useEffect(() => {
    if (isLoading) return;

    const MIN_FOREGROUND_REFRESH_INTERVAL_MS = 60_000;
    const MIN_BACKGROUND_DURATION_MS = 2_000;

    const justAuthenticated = () => {
      const timeSinceAuth = lastAuthTime.current
        ? Date.now() - lastAuthTime.current
        : Infinity;
      return timeSinceAuth < 5000;
    };

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousAppState = lastAppState.current;
      lastAppState.current = nextAppState;

      if (nextAppState !== 'active') {
        if (previousAppState === 'active') {
          appBackgroundedAt.current = Date.now();
        }
        return;
      }

      if (previousAppState === 'active') {
        return;
      }

      const backgroundDuration = appBackgroundedAt.current
        ? Date.now() - appBackgroundedAt.current
        : 0;
      appBackgroundedAt.current = null;

      // Android can emit brief inactive/active transitions around maps,
      // keyboards and native overlays without the app truly backgrounding.
      if (backgroundDuration < MIN_BACKGROUND_DURATION_MS) {
        return;
      }

      const {
        isAuthenticated: hasSession,
        accessToken: currentAccessToken,
        refreshToken: currentRefreshToken,
      } = latestAuthState.current;

      if (!hasSession || !currentRefreshToken) {
        return;
      }

      if (justAuthenticated()) {
        if (__DEV__) {
          console.log(
            '[AuthGuard] Recent login/signup detected - skip foreground refresh'
          );
        }
        return;
      }

      const now = Date.now();
      const hasExpiredAccessToken = currentAccessToken
        ? isTokenExpired(currentAccessToken)
        : false;
      if (
        isForegroundRefreshInFlight.current ||
        (!hasExpiredAccessToken &&
          now - lastForegroundRefreshAt.current < MIN_FOREGROUND_REFRESH_INTERVAL_MS)
      ) {
        return;
      }

      isForegroundRefreshInFlight.current = true;
      lastForegroundRefreshAt.current = now;

      if (__DEV__) {
        console.log('[AuthGuard] App foregrounded - proactive token check...');
      }
      proactiveTokenRefresh()
        // Only the session-scoped refresh service may revoke credentials.
        // An old foreground callback must never log out a newer login.
        .catch(() => undefined)
        .finally(() => {
          isForegroundRefreshInFlight.current = false;
        });
    });

    return () => subscription.remove();
  }, [isLoading, dispatch, appBackgroundedAt, isForegroundRefreshInFlight, lastAppState,
    lastAuthTime, lastForegroundRefreshAt, latestAuthState]);

  return {

  };
}
