import { AppState } from 'react-native';

export const isAppActive = () => AppState.currentState === 'active';
let activeSince = Date.now();
let backgrounded = AppState.currentState === 'background';
/** Keep read-only subscriptions through iOS interruptions, but not real sleep. */
export const isAppForeground = () => !backgrounded;
/** Shared foreground boundary: a summary fetched just before a consumer mounts
 * is valid, but one from the previous visit cannot close the new entry. */
export const getAppActiveSince = () => activeSince;
const listeners = new Set<() => void>();
let nativeSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
export const subscribeAppActivity = (listener: () => void) => {
  listeners.add(listener);
  if (!nativeSubscription) {
    nativeSubscription = AppState.addEventListener('change', () => {
      const active = isAppActive();
      if (AppState.currentState === 'background') backgrounded = true;
      if (active && backgrounded) { activeSince = Date.now(); backgrounded = false; }
      listeners.forEach((notify) => notify());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      nativeSubscription?.remove();
      nativeSubscription = null;
    }
  };
};
