import { Colors } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectIsLoading } from '@/store/selectors';
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
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isLoading = useAppSelector(selectIsLoading);

  console.log("isauth store;", isAuthenticated)

  useEffect(() => {
    // Attendre que le chargement soit terminé avant de rediriger
    if (isLoading) {
      return;
    }

    // Déterminer si on est dans une route protégée (tabs)
    const inAuthGroup = segments[0] === 'auth';
    const inTabsGroup = segments[0] === '(tabs)';

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
  }, [isAuthenticated, isLoading, segments]);

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

