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
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

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
  const hasCheckedSecureStore = useRef(false);
  const isLoggingOut = useRef(false);
  const lastAuthTime = useRef<number | null>(null);
  const isRedirectingAfterLogout = useRef(false);
  const hasCheckedTokensOnMount = useRef(false);

  // Validate SecureStore tokens before hydrating Redux (ex: hot reload).
  useEffect(() => {
    if (isLoading || hasCheckedSecureStore.current) return;

    const checkSecureStore = async () => {
      if (!accessToken && !refreshToken && !isAuthenticated) {
        console.log('[AuthGuard] Redux empty - validating SecureStore session...');
        try {
          const hasValidSession = await validateAndRefreshTokens();
          if (!hasValidSession) {
            console.log('[AuthGuard] No valid session found in SecureStore');
            return;
          }

          const storedTokens = await getTokens();
          if (storedTokens.accessToken && storedTokens.refreshToken) {
            console.log('[AuthGuard] Valid session found - hydrating Redux');
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

  // Proactive refresh on startup and on foreground.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !refreshToken) return;

    const justAuthenticated = () => {
      const timeSinceAuth = lastAuthTime.current
        ? Date.now() - lastAuthTime.current
        : Infinity;
      return timeSinceAuth < 5000;
    };

    if (!hasCheckedTokensOnMount.current) {
      hasCheckedTokensOnMount.current = true;

      if (justAuthenticated()) {
        console.log(
          '[AuthGuard] Recent login/signup detected - skip startup proactive refresh'
        );
      } else {
        console.log('[AuthGuard] Startup proactive token check...');
        proactiveTokenRefresh().then((valid) => {
          if (!valid) {
            console.log('[AuthGuard] Invalid session at startup - local logout');
            dispatch({ type: 'auth/logout' });
          }
        });
      }
    }

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (justAuthenticated()) {
          console.log(
            '[AuthGuard] Recent login/signup detected - skip foreground refresh'
          );
          return;
        }

        console.log('[AuthGuard] App foregrounded - proactive token check...');
        proactiveTokenRefresh().then((valid) => {
          if (!valid) {
            console.log('[AuthGuard] Invalid session after foreground - local logout');
            dispatch({ type: 'auth/logout' });
          }
        });
      }
    });

    return () => subscription.remove();
  }, [isLoading, isAuthenticated, refreshToken, dispatch]);

  // Detect successful auth to avoid false-positive logout races.
  useEffect(() => {
    if (isAuthenticated && accessToken && refreshToken) {
      lastAuthTime.current = Date.now();
      console.log('[AuthGuard] Successful authentication detected');
    }
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
          console.log('[AuthGuard] Recent auth, waiting token propagation...');
          return;
        }
        console.log('[AuthGuard] Authenticated but tokens missing in Redux');
        return;
      }

      if (
        !accessToken &&
        !refreshToken &&
        !isAuthenticated &&
        !justAuthenticated &&
        !isLoggingOut.current
      ) {
        if (!inAuthGroup && !isRedirectingAfterLogout.current) {
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
            console.log('[AuthGuard] Logout done - redirecting to /auth-entry');
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
  ]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    console.log(
      `[AuthGuard] Check: Auth=${isAuthenticated}, InAuthGroup=${inAuthGroup}, Segments=${JSON.stringify(
        segments
      )}, AccessToken=${!!accessToken}, RefreshToken=${!!refreshToken}`
    );

    if (isAuthenticated && accessToken && refreshToken) {
      if (segments[0] === 'auth-entry') {
        console.log('[AuthGuard] Authenticated on auth-entry - redirect /(tabs)');
        router.replace('/(tabs)');
        return;
      }

      if (inAuthGroup && segments[0] === 'auth' && segments.length === 1) {
        console.log('[AuthGuard] Authenticated on /auth - redirect /(tabs)');
        router.replace('/(tabs)');
        return;
      }
    }

    if (!isAuthenticated && !inAuthGroup && !accessToken && !refreshToken) {
      console.log('[AuthGuard] Unauthenticated outside auth - redirect /auth-entry');
      router.replace('/auth-entry');
    }
  }, [
    isAuthenticated,
    isLoading,
    segments,
    inAuthGroup,
    router,
    accessToken,
    refreshToken,
  ]);

  useEffect(() => {
    let cancelled = false;

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
        await clearStoredFcmToken();
        return;
      }

      const token = await obtainFcmToken();
      if (!cancelled) {
        await syncTokenWithBackend(token);
      }
    };

    registerPushToken();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, updateFcmTokenMutation]);

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
