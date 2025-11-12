import { useEffect } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { initializeAuth } from '@/store/slices/authSlice';

/**
 * Hook pour initialiser l'authentification au démarrage de l'application
 * Charge les tokens depuis SecureStore et les met dans le state Redux
 */
export function useAuthInit() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Initialiser l'authentification au montage du composant
    dispatch(initializeAuth());
  }, [dispatch]);
}

