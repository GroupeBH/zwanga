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
      // Si l'utilisateur est authentifié mais qu'on est dans le groupe auth, ne pas vérifier les tokens
      // (permet de laisser l'utilisateur compléter le processus d'inscription/KYC)
      if (isAuthenticated && inAuthGroup) {
        return;
      }

      // Si l'utilisateur est authentifié mais qu'on n'a pas encore de tokens dans le store Redux,
      // ne pas déconnecter immédiatement - les tokens sont peut-être en train d'être chargés
      // ou viennent d'être sauvegardés dans SecureStore via onQueryStarted
      // On attendra que les tokens soient chargés lors du prochain cycle de rendu
      if (isAuthenticated && !accessToken && !refreshToken) {
        console.log('[AuthGuard] Utilisateur authentifié mais tokens non encore dans le store - attente...');
        return;
      }

      // Aucun token disponible ET utilisateur non authentifié : rediriger vers /auth
      if (!accessToken && !refreshToken && !isAuthenticated) {
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
        // Ne pas rediriger vers /auth si le refresh a échoué à cause d'une erreur réseau
        // L'utilisateur reste connecté et peut utiliser l'app en mode offline
        // On redirige seulement si l'utilisateur n'est vraiment pas authentifié ET qu'on n'est pas en erreur réseau
        if (!refreshed && !inAuthGroup && !isAuthenticated && accessToken && refreshToken) {
          // Si on a des tokens mais que le refresh a échoué, c'est peut-être une erreur réseau
          // Ne pas rediriger immédiatement - laisser l'utilisateur utiliser l'app en mode offline
          console.log('[AuthGuard] Refresh échoué mais tokens présents - peut-être offline, pas de redirection');
          return;
        }
        if (!refreshed && !inAuthGroup && !isAuthenticated && !accessToken && !refreshToken) {
          // Pas de tokens du tout - rediriger vers /auth
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
    console.log(`[AuthGuard] Check: Auth=${isAuthenticated}, InAuthGroup=${inAuthGroup}, Segments=${JSON.stringify(segments)}, AccessToken=${!!accessToken}, RefreshToken=${!!refreshToken}`);

    // Si l'utilisateur est authentifié mais qu'on est dans le groupe auth, ne pas rediriger
    // (permet de laisser l'utilisateur compléter le processus d'inscription/KYC)
    if (isAuthenticated && inAuthGroup) {
      console.log('[AuthGuard] Authentifié dans le groupe auth. Pas de redirection automatique (pour permettre KYC).');
      return;
    }

    // Si l'utilisateur n'est pas authentifié et qu'on n'est pas dans le groupe auth, rediriger vers /auth
    // Mais seulement si on n'a vraiment pas de tokens (pour éviter les redirections pendant la connexion)
    if (!isAuthenticated && !inAuthGroup && !accessToken && !refreshToken) {
      console.log('[AuthGuard] Non authentifié et hors du groupe auth - redirection vers /auth');
      router.replace('/auth');
    }
  }, [isAuthenticated, isLoading, segments, inAuthGroup, router, accessToken, refreshToken]);

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

