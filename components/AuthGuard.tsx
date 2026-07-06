import { Colors } from '@/constants/styles';
import { clearStoredFcmToken, obtainFcmToken } from '@/services/pushNotifications';
import {
  proactiveTokenRefresh,
  validateAndRefreshTokens,
} from '@/services/tokenRefresh';
import { getTokens } from '@/services/tokenStorage';
import { useUpdateFcmTokenMutation } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectAccessToken,
  selectIsAuthenticated,
  selectIsLoading,
  selectRefreshToken,
} from '@/store/selectors';
import { performLogout, setTokens } from '@/store/slices/authSlice';
import { isTokenExpired } from '@/utils/jwt';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  InteractionManager,
  StyleSheet,
  View,
} from 'react-native';
import type { AppStateStatus } from 'react-native';

/**
 * Route guard:
 * - redirects unauthenticated users to /auth-entry;
 * - redirects authenticated users away from auth screens.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isLoading = useAppSelector(selectIsLoading);
  const accessToken = useAppSelector(selectAccessToken);
  const refreshToken = useAppSelector(selectRefreshToken);
  const [updateFcmTokenMutation] = useUpdateFcmTokenMutation();
  const inAuthGroup = segments[0] === 'auth';
  const currentSegment = segments[0];
  const isPublicRoute =
    currentSegment === 'splash' ||
    currentSegment === 'onboarding' ||
    currentSegment === 'auth-entry' ||
    currentSegment === 'background-location-disclosure';
  const hasCheckedSecureStore = useRef(false);
  const isLoggingOut = useRef(false);
  const lastAuthTime = useRef<number | null>(null);
  const isRedirectingAfterLogout = useRef(false);
  const lastFcmSyncAccessToken = useRef<string | null>(null);
  const latestAuthState = useRef({ isAuthenticated, accessToken, refreshToken });
  const lastAppState = useRef<AppStateStatus>(AppState.currentState);
  const appBackgroundedAt = useRef<number | null>(null);
  const isForegroundRefreshInFlight = useRef(false);
  const lastForegroundRefreshAt = useRef(0);

  useEffect(() => {
    latestAuthState.current = { isAuthenticated, accessToken, refreshToken };
  }, [isAuthenticated, accessToken, refreshToken]);

  // Validate SecureStore tokens before hydrating Redux (ex: hot reload).
  useEffect(() => {
    if (isLoading || hasCheckedSecureStore.current) return;

    const checkSecureStore = async () => {
      if (!accessToken && !refreshToken && !isAuthenticated) {
        if (__DEV__) {
          console.log('[AuthGuard] Redux empty - validating SecureStore session...');
        }
        try {
          const hasValidSession = await validateAndRefreshTokens();
          if (!hasValidSession) {
            if (__DEV__) {
              console.log('[AuthGuard] No valid session found in SecureStore');
            }
            return;
          }

          const storedTokens = await getTokens();
          if (storedTokens.accessToken && storedTokens.refreshToken) {
            if (__DEV__) {
              console.log('[AuthGuard] Valid session found - hydrating Redux');
            }
            dispatch(
              setTokens({
                accessToken: storedTokens.accessToken,
                refreshToken: storedTokens.refreshToken,
              })
            );
          }
        } finally {
          hasCheckedSecureStore.current = true;
        }
      } else {
        hasCheckedSecureStore.current = true;
      }
    };

    checkSecureStore();
  }, [isLoading, accessToken, refreshToken, isAuthenticated, dispatch]);

  // Proactive refresh on foreground. Startup refresh is handled by initializeAuth().
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
        .then((valid) => {
          if (!valid && latestAuthState.current.isAuthenticated) {
            if (__DEV__) {
              console.log('[AuthGuard] Invalid session after foreground - local logout');
            }
            dispatch({ type: 'auth/logout' });
          }
        })
        .finally(() => {
          isForegroundRefreshInFlight.current = false;
        });
    });

    return () => subscription.remove();
  }, [isLoading, dispatch]);

  // Detect successful auth to avoid false-positive logout races.
  const wasAuthenticated = useRef(false);
  useEffect(() => {
    const hasTokenSession = Boolean(isAuthenticated && accessToken && refreshToken);
    if (hasTokenSession && !wasAuthenticated.current) {
      lastAuthTime.current = Date.now();
      if (__DEV__) {
        console.log('[AuthGuard] Successful authentication detected');
      }
    }
    wasAuthenticated.current = hasTokenSession;
  }, [isAuthenticated, accessToken, refreshToken]);

  // Token sanity and route enforcement.
  useEffect(() => {
    if (isLoading) return;

    const enforceTokens = async () => {
      const timeSinceLastAuth = lastAuthTime.current
        ? Date.now() - lastAuthTime.current
        : Infinity;
      const justAuthenticated = timeSinceLastAuth < 3000;

      if (isAuthenticated && inAuthGroup) {
        return;
      }

      if (isAuthenticated && !accessToken && !refreshToken) {
        if (justAuthenticated) {
          if (__DEV__) {
            console.log('[AuthGuard] Recent auth, waiting token propagation...');
          }
          return;
        }
        if (__DEV__) {
          console.log('[AuthGuard] Authenticated but tokens missing in Redux');
        }
        return;
      }

      if (
        !accessToken &&
        !refreshToken &&
        !isAuthenticated &&
        !justAuthenticated &&
        !isLoggingOut.current
      ) {
        if (!inAuthGroup && !isPublicRoute && !isRedirectingAfterLogout.current) {
          router.replace('/auth-entry');
        }
        return;
      }

      if (refreshToken && isTokenExpired(refreshToken) && !justAuthenticated) {
        if (!isLoggingOut.current) {
          isLoggingOut.current = true;
          isRedirectingAfterLogout.current = true;

          try {
            await dispatch(performLogout()).unwrap();
            if (__DEV__) {
              console.log('[AuthGuard] Logout done - redirecting to /auth-entry');
            }
            if (!inAuthGroup) {
              router.replace('/auth-entry');
            }
          } catch (error) {
            console.error('[AuthGuard] Logout error:', error);
            if (!inAuthGroup) {
              router.replace('/auth-entry');
            }
          } finally {
            isLoggingOut.current = false;
            setTimeout(() => {
              isRedirectingAfterLogout.current = false;
            }, 1000);
          }
        }
      }
    };

    enforceTokens();
  }, [
    accessToken,
    refreshToken,
    isAuthenticated,
    isLoading,
    dispatch,
    router,
    inAuthGroup,
    isPublicRoute,
  ]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (__DEV__) {
      console.log(
        `[AuthGuard] Check: Auth=${isAuthenticated}, InAuthGroup=${inAuthGroup}, Segments=${JSON.stringify(
          segments
        )}, AccessToken=${!!accessToken}, RefreshToken=${!!refreshToken}`
      );
    }

    if (isAuthenticated && accessToken && refreshToken) {
      if (segments[0] === 'auth-entry') {
        if (__DEV__) {
          console.log('[AuthGuard] Authenticated on auth-entry - redirect /(tabs)');
        }
        router.replace('/(tabs)');
        return;
      }

      if (inAuthGroup && segments[0] === 'auth' && segments.length === 1) {
        if (__DEV__) {
          console.log('[AuthGuard] Authenticated on /auth - redirect /(tabs)');
        }
        router.replace('/(tabs)');
        return;
      }
    }

    if (!isAuthenticated && !inAuthGroup && !isPublicRoute && !accessToken && !refreshToken) {
      if (__DEV__) {
        console.log('[AuthGuard] Unauthenticated outside auth - redirect /auth-entry');
      }
      router.replace('/auth-entry');
    }
  }, [
    isAuthenticated,
    isLoading,
    segments,
    inAuthGroup,
    isPublicRoute,
    router,
    accessToken,
    refreshToken,
  ]);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let interactionTask: { cancel: () => void } | null = null;

    const syncTokenWithBackend = async (token: string | null) => {
      if (!token) {
        return;
      }
      try {
        await updateFcmTokenMutation({ fcmToken: token }).unwrap();
      } catch (error) {
        console.warn('Unable to send FCM token to backend:', error);
      }
    };

    const registerPushToken = async () => {
      if (!isAuthenticated) {
        lastFcmSyncAccessToken.current = null;
        await clearStoredFcmToken();
        return;
      }

      if (!accessToken || lastFcmSyncAccessToken.current === accessToken) {
        return;
      }

      const token = await obtainFcmToken();
      if (!cancelled) {
        await syncTokenWithBackend(token);
        lastFcmSyncAccessToken.current = accessToken;
      }
    };

    interactionTask = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => {
        if (cancelled || AppState.currentState !== 'active') {
          return;
        }
        registerPushToken();
      }, 1200);
    });

    return () => {
      cancelled = true;
      interactionTask?.cancel();
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isAuthenticated, accessToken, updateFcmTokenMutation]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
});
