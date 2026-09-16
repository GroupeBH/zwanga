import { useCallback, useEffect, useRef } from 'react';

/** One route calculation at a time; an obsolete RTK Query response cannot redraw a new route. */
export function useNavigationRequestGuard(enabled: boolean, screenKey: string) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pendingRef = useRef<{ key: string; abort?: () => void } | null>(null);
  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.abort?.();
  }, []);
  useEffect(() => {
    enabledRef.current = enabled;
    return () => { enabledRef.current = false; cancel(); };
  }, [cancel, enabled, screenKey]);
  const begin = useCallback((key: string) => {
    if (!enabledRef.current || pendingRef.current?.key === key) return null;
    cancel();
    const pending: { key: string; abort?: () => void } = { key };
    pendingRef.current = pending;
    return {
      attach: (request: { abort: () => void }) => {
        if (pendingRef.current !== pending) request.abort();
        else pending.abort = () => request.abort();
      },
      isCurrent: () => enabledRef.current && pendingRef.current === pending,
      finish: () => { if (pendingRef.current === pending) pendingRef.current = null; },
    };
  }, [cancel]);
  return { begin, cancel };
}
