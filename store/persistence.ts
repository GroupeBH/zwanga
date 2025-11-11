import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootState } from './index';

const PERSIST_KEY = '@zwanga:store';

/**
 * Sauvegarde l'état Redux dans AsyncStorage
 */
export const saveState = async (state: RootState) => {
  try {
    // Ne persister que certaines parties du state
    const stateToPersist = {
      auth: {
        user: state.auth.user,
        token: state.auth.token,
        isAuthenticated: state.auth.isAuthenticated,
      },
      // Optionnel: persister quelques trajets favoris ou récents
      // trips: state.trips.items.slice(0, 10),
    };
    
    const serializedState = JSON.stringify(stateToPersist);
    await AsyncStorage.setItem(PERSIST_KEY, serializedState);
  } catch (err) {
    console.error('Erreur lors de la sauvegarde du state:', err);
  }
};

/**
 * Charge l'état Redux depuis AsyncStorage
 */
export const loadState = async (): Promise<Partial<RootState> | undefined> => {
  try {
    const serializedState = await AsyncStorage.getItem(PERSIST_KEY);
    if (serializedState === null) {
      return undefined;
    }
    return JSON.parse(serializedState);
  } catch (err) {
    console.error('Erreur lors du chargement du state:', err);
    return undefined;
  }
};

/**
 * Supprime l'état persisté (utile lors du logout)
 */
export const clearPersistedState = async () => {
  try {
    await AsyncStorage.removeItem(PERSIST_KEY);
  } catch (err) {
    console.error('Erreur lors de la suppression du state:', err);
  }
};

/**
 * Middleware pour auto-sauvegarder le state à chaque action
 */
export const createPersistenceMiddleware = () => {
  let timeout: NodeJS.Timeout;
  
  return (store: any) => (next: any) => (action: any) => {
    const result = next(action);
    
    // Debounce: sauvegarder seulement après 1 seconde d'inactivité
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      saveState(store.getState());
    }, 1000);
    
    return result;
  };
};

