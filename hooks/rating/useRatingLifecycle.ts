import { useCallback, useEffect, useRef } from 'react';

/** A saved review may survive blur; native UI and delayed navigation must not. */
export function useRatingLifecycle(scope: string, active: boolean) {
  const state = useRef({ scope, active, mounted: true, leaving: false, scopeEpoch: 0, uiEpoch: 0 });
  const successReturnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (state.current.scope !== scope || state.current.active !== active) {
    if (state.current.scope !== scope) state.current.scopeEpoch++;
    state.current = { ...state.current, scope, active, leaving: false, uiEpoch: state.current.uiEpoch + 1 };
  }
  const cancelReturn = useCallback(() => {
    if (successReturnTimeoutRef.current !== null) clearTimeout(successReturnTimeoutRef.current);
    successReturnTimeoutRef.current = null;
  }, []);
  const captureRatingSession = useCallback(() => {
    const { scopeEpoch, uiEpoch } = state.current;
    const canUpdate = () => state.current.mounted && state.current.scopeEpoch === scopeEpoch;
    return {
      canUpdate,
      canPresent: () => canUpdate() && state.current.active && !state.current.leaving && state.current.uiEpoch === uiEpoch,
    };
  }, []);
  const beginLeaving = useCallback(() => {
    if (!state.current.mounted || !state.current.active || state.current.leaving) return false;
    state.current.leaving = true;
    state.current.uiEpoch++;
    cancelReturn();
    return true;
  }, [cancelReturn]);
  useEffect(() => {
    cancelReturn();
    return cancelReturn;
  }, [active, scope, cancelReturn]);
  useEffect(() => {
    state.current.mounted = true;
    return () => {
      state.current.mounted = false;
      state.current.scopeEpoch++;
      state.current.uiEpoch++;
      cancelReturn();
    };
  }, [cancelReturn]);
  return { captureRatingSession, beginLeaving, successReturnTimeoutRef };
}
