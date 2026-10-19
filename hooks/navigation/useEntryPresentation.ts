import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Href } from 'expo-router';
import { ENTRY_COVER_MAX_MS } from '@/features/navigation/entryFreshness';
import { getTokenSessionVersion } from '@/services/tokenSession';

/** One short visual budget for BOTH entry phases. Revealed UI is never taken away
 * by a late automatic redirect; the verified destination becomes an explicit action. */
export function useEntryPresentation(options: {
  userId?: string; active: boolean; ready: boolean; path: string; fastHome: boolean;
  replace: (path: Href) => void;
}) {
  const [, update] = useState(0);
  const version = getTokenSessionVersion();
  const entry = useMemo(() => ({ version, userId: options.userId, active: options.active,
    mounted: true, path: '', startedAt: null as number | null,
    released: false, proposal: null as Href | null,
  }), [version, options.userId, options.active]); // Path changes must not reopen the cover.
  const latest = useRef({ entry, options }); latest.current = { entry, options };
  const current = useCallback(() => entry.mounted && latest.current.entry === entry &&
    getTokenSessionVersion() === entry.version && latest.current.options.active &&
    latest.current.options.ready && Boolean(entry.userId), [entry]);
  const reveal = useCallback(() => {
    if (!entry.mounted || latest.current.entry !== entry || entry.released) return;
    entry.released = true; update(value => value + 1);
  }, [entry]);
  useEffect(() => {
    entry.mounted = true;
    return () => { entry.mounted = false; };
  }, [entry]);
  useEffect(() => {
    if (entry.path === options.path) return;
    entry.path = options.path; entry.proposal = null;
    // Startup redirects precede the first entry budget; ordinary navigation does not.
    if (entry.startedAt !== null) reveal();
  }, [entry, options.path, reveal]);
  useEffect(() => {
    if (!options.active || !options.ready || !options.userId || entry.released) return;
    if (options.fastHome) { reveal(); return; }
    entry.startedAt ??= Date.now();
    const timer = setTimeout(reveal, Math.max(0, ENTRY_COVER_MAX_MS - (Date.now() - entry.startedAt)));
    return () => clearTimeout(timer);
  }, [entry, options.active, options.ready, options.userId, options.fastHome, reveal]);
  const replace = useCallback((destination: Href): boolean => {
    if (!current()) throw new Error('STALE_ENTRY_PRESENTATION');
    if (entry.released || latest.current.options.fastHome ||
      (entry.startedAt !== null && Date.now() - entry.startedAt >= ENTRY_COVER_MAX_MS)) {
      entry.released = true; entry.proposal = destination; update(value => value + 1);
      return false;
    }
    latest.current.options.replace(destination);
    return true;
  }, [current, entry]);
  const open = useCallback(() => {
    if (!current() || !entry.proposal || latest.current.options.path !== entry.path) return;
    // A deliberate tap, not a background decision. The destination owns its reads/actions.
    latest.current.options.replace(entry.proposal);
    entry.proposal = null; update(value => value + 1);
  }, [current, entry]);
  return { released: entry.released || options.fastHome, proposal: entry.proposal, replace, open, reveal };
}
