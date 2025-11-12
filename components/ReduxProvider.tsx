import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { store } from '@/store';
import { initializeAuth } from '@/store/slices/authSlice';
import { Colors } from '@/constants/styles';

interface ReduxProviderProps {
  children: React.ReactNode;
}

export function ReduxProvider({ children }: ReduxProviderProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialiser l'authentification depuis SecureStore au démarrage
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

  if (isLoading) {
    // Écran de chargement pendant la restauration du state
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return <Provider store={store}>{children}</Provider>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
});

