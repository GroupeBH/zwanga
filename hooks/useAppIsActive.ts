import { useSyncExternalStore } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { isAppActive, isAppForeground, subscribeAppActivity } from '@/services/appActivity';

export function useAppIsActive() {
  return useSyncExternalStore(subscribeAppActivity, isAppActive, () => true);
}

/** Discovery only: do not use this for audio, GPS or permission prompts. */
export function useAppIsForeground() {
  return useSyncExternalStore(subscribeAppActivity, isAppForeground, () => true);
}

/** Navigation focus and native foreground state are different signals. */
export function useScreenIsActive() {
  const focused = useIsFocused();
  const active = useAppIsActive();
  return focused && active;
}
