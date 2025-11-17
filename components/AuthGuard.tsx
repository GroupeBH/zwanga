import { Colors } from '@/constants/styles';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectAccessToken,
  selectIsAuthenticated,
  selectIsLoading,
  selectRefreshToken,
} from '@/store/selectors';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { refreshAccessToken } from '@/services/tokenRefresh';
import { isTokenExpired } from '@/utils/jwt';
import { logout } from '@/store/slices/authSlice';

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
    if (!isAuthenticated && !inAuthGroup) {
      // L'utilisateur n'est pas authentifié et n'est pas sur la page auth
      // Rediriger vers auth
      console.log('Non authentifié - redirection vers /auth');
      router.replace('/auth');
    } else if (isAuthenticated && inAuthGroup) {
      // L'utilisateur est authentifié mais est sur la page auth
      // Rediriger vers les tabs
      console.log('Authentifié - redirection vers /(tabs)');
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, inAuthGroup, router]);

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

