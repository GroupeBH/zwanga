import { AppState } from 'react-native';

export const isAppActive = () => AppState.currentState === 'active';
const listeners = new Set<() => void>();
let nativeSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
export const subscribeAppActivity = (listener: () => void) => {
  listeners.add(listener);
  if (!nativeSubscription) {
    nativeSubscription = AppState.addEventListener('change', () => {
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
