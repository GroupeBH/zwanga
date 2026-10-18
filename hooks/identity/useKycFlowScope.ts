import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';
import { getTokenSessionVersion } from '@/services/tokenSession';

/** Native camera transitions may background the app; leaving the route invalidates the flow. */
export function useKycFlowScope(onLeave?: () => void) {
  const focused = useIsFocused();
  const state = useRef({ mounted: true, focused, epoch: 0 });
  if (state.current.focused !== focused) {
    state.current.focused = focused;
    state.current.epoch++;
  }
  useEffect(() => {
    const lifecycle = state.current;
    lifecycle.mounted = true;
    return () => { lifecycle.mounted = false; lifecycle.epoch++; };
  }, []);
  useEffect(() => () => { onLeave?.(); }, [focused, onLeave]);
  return useCallback(() => {
    const epoch = state.current.epoch, version = getTokenSessionVersion();
    const current = () => state.current.mounted && state.current.focused &&
      state.current.epoch === epoch && version === getTokenSessionVersion();
    return { current, canUpdate: () => state.current.mounted && version === getTokenSessionVersion(),
      canLaunch: () => current() && AppState.currentState === 'active' };
  }, []);
}
