import { useEffect, useRef, useState } from 'react';

/** Reconcile once per foreground transition, not on every cache update. */
export function useArrivalPaymentRefresh(active: boolean, refetch: () => unknown) {
  const [ready, setReady] = useState(false);
  const latest = useRef(refetch);
  latest.current = refetch;
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (active) void Promise.resolve().then(() => latest.current()).catch(() => undefined)
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [active]);
  return active && ready;
}
