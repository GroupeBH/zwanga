import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { View, ActivityIndicator } from 'react-native';
import { store } from '@/store';
import { loadState } from '@/store/persistence';
import { setUser, setToken } from '@/store/slices/authSlice';

interface ReduxProviderProps {
  children: React.ReactNode;
}

export function ReduxProvider({ children }: ReduxProviderProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Charger l'état persisté au démarrage
    const initializeStore = async () => {
      try {
        const persistedState = await loadState();
        
        if (persistedState?.auth?.user && persistedState?.auth?.token) {
          // Restaurer l'utilisateur et le token
          store.dispatch(setUser(persistedState.auth.user));
          store.dispatch(setToken(persistedState.auth.token));
        }
      } catch (error) {
        console.error('Erreur lors du chargement du state persisté:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeStore();
  }, []);

  if (isLoading) {
    // Écran de chargement pendant la restauration du state
    return (
      <View className="flex-1 items-center justify-center bg-primary">
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  return <Provider store={store}>{children}</Provider>;
}

