import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { getTokenSessionVersion } from '@/services/tokenSession';

/** Captured before an await: blur/resume, logout or account changes invalidate old UI work. */
export function useWalletScreenScope(userId: string | undefined, active: boolean) {
  const scope = useMemo(() => ({ userId, active }), [userId, active]);
  const latest = useRef(scope);
  latest.current = scope;
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useCallback(() => {
    const version = getTokenSessionVersion();
    return () => mounted.current && Boolean(scope.userId) && scope.active &&
      latest.current === scope && version === getTokenSessionVersion();
  }, [scope]);
}
