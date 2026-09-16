import type { setupListeners } from '@reduxjs/toolkit/query';
import { AppState } from 'react-native';

/** Bridge native lifecycle signals into RTK Query without duplicate refetch events. */
export const nativeQueryListeners: NonNullable<Parameters<typeof setupListeners>[1]> = (dispatch, actions) => {
  let cancelled = false;
  let networkGeneration = 0;
  let online = true;
  let focused = true;
  let network: typeof import('expo-network') | undefined;
  let networkSubscription: { remove(): void } | undefined;

  const syncNetwork = (state: import('expo-network').NetworkState) => {
    if (cancelled) return;
    const connected = state.isInternetReachable ?? state.isConnected;
    if (typeof connected === 'boolean' && connected !== online) {
      online = connected;
      dispatch(online ? actions.onOnline() : actions.onOffline());
    }
  };
  const refreshNetwork = () => {
    const generation = ++networkGeneration;
    void network?.getNetworkStateAsync().then((state) => {
      if (generation === networkGeneration) syncNetwork(state);
    }).catch(() => undefined);
  };
  const syncAppState = () => {
    if (cancelled) return;
    const active = AppState.currentState === 'active';
    if (active !== focused) {
      focused = active;
      dispatch(active ? actions.onFocus() : actions.onFocusLost());
    }
    if (active) refreshNetwork();
  };
  const appSubscription = AppState.addEventListener('change', syncAppState);
  try {
    // Native rebuild required for connectivity signals; AppState remains available in an older client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    network = require('expo-network') as typeof import('expo-network');
    networkSubscription = network.addNetworkStateListener((state) => {
      networkGeneration += 1;
      syncNetwork(state);
    });
  } catch { /* Do not make network observation a startup dependency. */ }
  syncAppState();
  return () => {
    cancelled = true;
    appSubscription.remove();
    networkSubscription?.remove();
  };
};
