import { useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useNavigationContainerRef, useRootNavigationState } from 'expo-router';
import { getHomeRootState, STARTUP_ROUTES } from '@/features/navigation/homeBackPolicy';

/** Native history policy; leave browser history and screen-specific Back handlers alone. */
export function useHomeRootNavigation(hasSession: boolean) {
  const navigation = useNavigationContainerRef();
  const observedState = useRootNavigationState();
  const [startupComplete, setStartupComplete] = useState(false);
  const lastRepairedState = useRef<ReturnType<typeof navigation.getRootState> | null>(null);

  useLayoutEffect(() => {
    if (Platform.OS === 'web') return;
    const reconcile = () => {
      if (!navigation.isReady()) return;
      // Read the latest state, not a render snapshot that may precede a notification navigation.
      const state = navigation.getRootState();
      const route = state?.routes[state.index];
      if (!route) return;
      if (!STARTUP_ROUTES.has(route.name)) setStartupComplete(true);

      const repaired = getHomeRootState(state, hasSession);
      if (!repaired) {
        lastRepairedState.current = null;
        return;
      }
      if (lastRepairedState.current === state) return;
      lastRepairedState.current = state;
      navigation.resetRoot(repaired);
    };
    if (!navigation.isReady()) return navigation.addListener('ready', reconcile);
    reconcile();
  }, [hasSession, navigation, observedState]);

  // Not persisted: a real process restart can show the opening flow again, not a Back press.
  return !startupComplete;
}
