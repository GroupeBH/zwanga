import { useCallback, useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useAppEntryPending } from '@/features/navigation/appEntryContext';
import { reportMainScreenReady, type MainScreen } from '@/services/mainScreenReadiness';

/** Attach only to the successful screen root, never to its loader/error view. */
export function useMainScreenReady(activeAndUsable: boolean, screen: MainScreen) {
  const [laidOut, setLaidOut] = useState(false);
  const entryPending = useAppEntryPending();
  const onLayout = useCallback(() => setLaidOut(true), []);
  useEffect(() => {
    if (!activeAndUsable || !laidOut || entryPending) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) reportMainScreenReady(screen);
    });
    return () => { cancelled = true; task.cancel(); };
  }, [activeAndUsable, laidOut, entryPending, screen]);
  return onLayout;
}
