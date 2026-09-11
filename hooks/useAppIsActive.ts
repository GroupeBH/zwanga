import { useSyncExternalStore } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { isAppActive, subscribeAppActivity } from '@/services/appActivity';

export function useAppIsActive() {
  return useSyncExternalStore(subscribeAppActivity, isAppActive, () => true);
}

/** Navigation focus and native foreground state are different signals. */
export function useScreenIsActive() {
  const focused = useIsFocused();
  const active = useAppIsActive();
  return focused && active;
}
