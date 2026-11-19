import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTokenSessionVersion } from '@/services/tokenSession';

export const HOME_PREPARATION_MAX_MS = 8_000;

/** Once per account/session. A refresh or an OS permission interruption cannot
 * put a usable Home back behind a loader. Slow/offline data remains recoverable inline. */
export function useHomePreparation(options: {
  userId?: string; active: boolean; onHome: boolean; ready: boolean; online: boolean; profileFailed: boolean;
}) {
  const [, update] = useState(0);
  const version = getTokenSessionVersion();
  const entry = useMemo(() => ({ mounted: true, prepared: false, released: false, startedAt: null as number | null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.userId, version]);
  const latest = useRef({ entry, options, version }); latest.current = { entry, options, version };
  useEffect(() => { entry.mounted = true; return () => { entry.mounted = false; }; }, [entry]);
  const reportPrepared = useCallback(() => {
    if (!entry.mounted || latest.current.entry !== entry || !latest.current.options.active ||
      !latest.current.options.onHome || version !== getTokenSessionVersion() || entry.prepared) return;
    entry.prepared = true; entry.released = true; update(value => value + 1);
  }, [entry, version]);
  useEffect(() => {
    if (!options.userId || !options.active || !options.ready || entry.released) return;
    const release = () => {
      if (!entry.mounted || latest.current.entry !== entry || entry.released) return;
      entry.released = true; update(value => value + 1);
    };
    if (!options.onHome || !options.online || options.profileFailed) { release(); return; }
    entry.startedAt ??= Date.now();
    const timer = setTimeout(release, Math.max(0, HOME_PREPARATION_MAX_MS - (Date.now() - entry.startedAt)));
    return () => clearTimeout(timer);
  }, [entry, options.userId, options.active, options.ready, options.onHome, options.online, options.profileFailed]);
  return { reportPrepared, pending: Boolean(options.userId && options.active && options.ready && options.onHome &&
    options.online && !options.profileFailed && !entry.released) };
}
