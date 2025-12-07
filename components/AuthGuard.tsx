import { Colors } from '@/constants/styles';
import { clearStoredFcmToken, obtainFcmToken } from '@/services/pushNotifications';
import { refreshAccessToken } from '@/services/tokenRefresh';
import { useUpdateFcmTokenMutation } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectAccessToken,
  selectIsAuthenticated,
  selectIsLoading,
  selectRefreshToken,
} from '@/store/selectors';
import { logout } from '@/store/slices/authSlice';
import { isTokenExpired } from '@/utils/jwt';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/**
 * Composant de protection des routes
 * Redirige vers /auth si l'utilisateur n'est pas authentifié
 * Redirige vers /(tabs) si l'utilisateur est authentifié et sur /auth
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

  useEffect(() => {
    if (isLoading) return;

    const enforceTokens = async () => {
      // Aucun token disponible : forcer la déconnexion
      if (!accessToken && !refreshToken) {
        if (isAuthenticated) {
          dispatch(logout());
        }
        if (!inAuthGroup) {
          router.replace('/auth');
        }
        return;
      }

      // Refresh token expiré -> déconnexion
      if (refreshToken && isTokenExpired(refreshToken)) {
        dispatch(logout());
        if (!inAuthGroup) {
          router.replace('/auth');
        }
        return;
      }

      // Access token manquant ou expiré mais refresh token valide -> tentative de refresh
      if (!accessToken || (accessToken && isTokenExpired(accessToken))) {
        const refreshed = refreshToken ? await refreshAccessToken(refreshToken) : null;
        if (!refreshed && !inAuthGroup) {
          router.replace('/auth');
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
    // Attendre que le chargement soit terminé avant de rediriger
    if (isLoading) {
      return;
    }

    // Déterminer si on est dans une route protégée (tabs)
    console.log(`[AuthGuard] Check: Auth=${isAuthenticated}, InAuthGroup=${inAuthGroup}, Segments=${JSON.stringify(segments)}`);

    if (!isAuthenticated && !inAuthGroup) {
      console.log('[AuthGuard] Non authentifié et hors du groupe auth - redirection vers /auth');
      router.replace('/auth');
    } else if (isAuthenticated && inAuthGroup) {
      console.log('[AuthGuard] Authentifié dans le groupe auth. Pas de redirection automatique (pour permettre KYC).');
    }
    // Auto-redirection suppressed to allow post-registration flows (KYC)
  }, [isAuthenticated, isLoading, segments, inAuthGroup, router]);

  useEffect(() => {
    let cancelled = false;

    const syncTokenWithBackend = async (token: string | null) => {
      if (!token) {
        return;
      }
      try {
        await updateFcmTokenMutation({ fcmToken: token }).unwrap();
      } catch (error) {
        console.warn('Impossible d\'envoyer le token FCM au serveur:', error);
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

  // Afficher un loader pendant le chargement initial
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

