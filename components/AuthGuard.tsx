import { Colors } from '@/constants/styles';
import { clearStoredFcmToken, obtainFcmToken } from '@/services/pushNotifications';
import { proactiveTokenRefresh } from '@/services/tokenRefresh';
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
  const hasCheckedSecureStore = useRef(false);
  const isLoggingOut = useRef(false);
  const lastAuthTime = useRef<number | null>(null);
  const isRedirectingAfterLogout = useRef(false);
  const hasCheckedTokensOnMount = useRef(false);

  // Vérifier SecureStore si Redux est vide (après un hot reload par exemple)
  useEffect(() => {
    if (isLoading || hasCheckedSecureStore.current) return;
    
    const checkSecureStore = async () => {
      if (!accessToken && !refreshToken && !isAuthenticated) {
        console.log('[AuthGuard] Redux vide - vérification SecureStore...');
        const storedTokens = await getTokens();
        
        if (storedTokens.accessToken && storedTokens.refreshToken) {
          console.log('[AuthGuard] Tokens trouvés dans SecureStore - chargement dans Redux');
          dispatch(setTokens({
            accessToken: storedTokens.accessToken!,
            refreshToken: storedTokens.refreshToken!,
          }));
          hasCheckedSecureStore.current = true;
        }
      }
    };
    
    checkSecureStore();
  }, [isLoading, accessToken, refreshToken, isAuthenticated, dispatch]);

  // Rafraîchissement proactif au démarrage de l'app et au retour du background
  // C'est le SEUL endroit où le refresh token est appelé automatiquement
  // SAUF si une connexion/inscription vient d'avoir lieu (tokens frais)
  useEffect(() => {
    if (isLoading || !isAuthenticated || !refreshToken) return;
    
    // Helper pour vérifier si on vient de s'authentifier
    const justAuthenticated = () => {
      const timeSinceAuth = lastAuthTime.current ? Date.now() - lastAuthTime.current : Infinity;
      return timeSinceAuth < 5000; // 5 secondes de grâce après auth
    };
    
    // Vérifier au démarrage (une seule fois)
    if (!hasCheckedTokensOnMount.current) {
      hasCheckedTokensOnMount.current = true;
      
      // Skip si connexion/inscription récente - les tokens sont frais
      if (justAuthenticated()) {
        console.log('[AuthGuard] Connexion/inscription récente - skip proactive refresh');
        return;
      }
      
      console.log('[AuthGuard] Vérification des tokens au démarrage...');
      proactiveTokenRefresh().then((valid) => {
        if (!valid && refreshToken && isTokenExpired(refreshToken)) {
          console.log('[AuthGuard] Refresh token expiré au démarrage - logout');
          dispatch(performLogout());
        }
      });
    }
    
    // Écouter les changements d'état de l'app (retour du background)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Skip si connexion/inscription récente - les tokens sont frais
        if (justAuthenticated()) {
          console.log('[AuthGuard] Connexion/inscription récente - skip refresh au retour');
          return;
        }
        
        console.log('[AuthGuard] App revenue au premier plan - vérification tokens...');
        proactiveTokenRefresh().then((valid) => {
          if (!valid && refreshToken && isTokenExpired(refreshToken)) {
            console.log('[AuthGuard] Refresh token expiré après retour - logout');
            dispatch(performLogout());
          }
        });
      }
    });
    
    return () => subscription.remove();
  }, [isLoading, isAuthenticated, refreshToken, dispatch]);

  // Surveiller les authentifications réussies pour éviter les faux positifs de logout
  useEffect(() => {
    if (isAuthenticated && accessToken && refreshToken) {
      lastAuthTime.current = Date.now();
      console.log('[AuthGuard] Authentification réussie détectée');
    }
  }, [isAuthenticated, accessToken, refreshToken]);

  // Vérification des tokens et redirections
  useEffect(() => {
    if (isLoading) return;

    const enforceTokens = async () => {
      const timeSinceLastAuth = lastAuthTime.current ? Date.now() - lastAuthTime.current : Infinity;
      const justAuthenticated = timeSinceLastAuth < 3000;

      // Si l'utilisateur est authentifié et dans le groupe auth, le laisser compléter son inscription/KYC
      if (isAuthenticated && inAuthGroup) {
        return;
      }

      // Si l'utilisateur est authentifié mais tokens pas encore propagés, attendre
      if (isAuthenticated && !accessToken && !refreshToken) {
        if (justAuthenticated) {
          console.log('[AuthGuard] Authentification récente - attente propagation tokens...');
          return;
        }
        console.log('[AuthGuard] Tokens non encore dans le store - attente...');
        return;
      }

      // Aucun token ET pas authentifié -> rediriger vers auth-entry
      if (!accessToken && !refreshToken && !isAuthenticated && !justAuthenticated && !isLoggingOut.current) {
        if (!inAuthGroup && !isRedirectingAfterLogout.current) {
          router.replace('/auth-entry');
        }
        return;
      }

      // Refresh token expiré -> déconnexion complète
      if (refreshToken && isTokenExpired(refreshToken) && !justAuthenticated) {
        if (!isLoggingOut.current) {
          isLoggingOut.current = true;
          isRedirectingAfterLogout.current = true;
          
          try {
            await dispatch(performLogout()).unwrap();
            console.log('[AuthGuard] Logout terminé - redirection vers /auth-entry');
            if (!inAuthGroup) {
              router.replace('/auth-entry');
            }
          } catch (error) {
            console.error('[AuthGuard] Erreur lors du logout:', error);
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
        return;
      }

      // NOTE: On ne rafraîchit PAS ici pour un access token expiré.
      // Le rafraîchissement se fait :
      // 1. Via proactiveTokenRefresh au démarrage/retour de l'app
      // 2. Via baseQueryWithReauth quand le serveur renvoie 401
      // 3. Via le backend quand KYC validé ou PIN changé
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

    // Si l'utilisateur est authentifié avec des tokens valides
    if (isAuthenticated && accessToken && refreshToken) {
      // Si on est sur auth-entry et authentifié, rediriger vers l'écran d'accueil
      if (segments[0] === 'auth-entry') {
        console.log('[AuthGuard] Authentifié sur auth-entry - redirection vers /(tabs)');
        router.replace('/(tabs)');
        return;
      }
      
      // Si on est dans le groupe auth (sur la page /auth), rediriger vers l'écran d'accueil
      // Cela permet de rediriger immédiatement après l'authentification réussie
      if (inAuthGroup && segments[0] === 'auth' && segments.length === 1) {
        console.log('[AuthGuard] Authentifié sur /auth - redirection vers /(tabs)');
        router.replace('/(tabs)');
        return;
      }
    }

    // Si l'utilisateur n'est pas authentifié et qu'on n'est pas dans le groupe auth, rediriger vers l'écran d'entrée auth
    // Mais seulement si on n'a vraiment pas de tokens (pour éviter les redirections pendant la connexion)
    if (!isAuthenticated && !inAuthGroup && !accessToken && !refreshToken) {
      console.log('[AuthGuard] Non authentifié et hors du groupe auth - redirection vers /auth-entry');
      router.replace('/auth-entry');
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

