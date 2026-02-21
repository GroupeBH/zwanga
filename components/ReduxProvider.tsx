import { DialogProvider } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { IdentityProvider } from '@/contexts/IdentityContext';
import { TutorialProvider } from '@/contexts/TutorialContext';
import { store } from '@/store';
import { initializeAuth } from '@/store/slices/authSlice';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Provider } from 'react-redux';
import { AuthGuard } from './AuthGuard';
import { NotificationHandler } from './NotificationHandler';

interface ReduxProviderProps {
  children: React.ReactNode;
}

export function ReduxProvider({ children }: ReduxProviderProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialiser l'authentification depuis SecureStore au demarrage
    const initializeStore = async () => {
      try {
        // Initialiser l'auth (charge les tokens depuis SecureStore)
        await store.dispatch(initializeAuth());
      } catch (error) {
        console.error('Erreur lors de l\'initialisation du store:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeStore();
  }, []);

  return (
    <Provider store={store}>
      {isLoading ? (
        // Ecran de chargement pendant la restauration du state
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : (
        <>
          <NotificationHandler />
          <AuthGuard>
            <DialogProvider>
              <TutorialProvider>
                <IdentityProvider>
                  {children}
                </IdentityProvider>
              </TutorialProvider>
            </DialogProvider>
          </AuthGuard>
        </>
      )}
    </Provider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  appContainer: {
    flex: 1,
  },
});

