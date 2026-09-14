import { useCallback, useEffect, useRef, useState } from 'react';
import { warnThrottled } from '@/utils/throttledWarning';

type Marker = { redraw: () => void };
type Refresh = { marker: Marker; loaded: boolean; timers: ReturnType<typeof setTimeout>[] };

/** Android marker snapshots: at most one refresh sequence per native marker, no work after release. */
export function useNavigationMarkerRefresh(enabled: boolean, screenKey: string) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const entriesRef = useRef(new Map<string, Refresh>());
  const [, update] = useState(0);

  useEffect(() => {
    enabledRef.current = enabled;
    const entries = entriesRef.current;
    return () => {
      enabledRef.current = false;
      entries.forEach((entry) => entry.timers.forEach(clearTimeout));
      entries.clear();
    };
  }, [enabled, screenKey]);

  const onReady = useCallback((key: string, getMarker: () => Marker | null) => {
    if (!enabledRef.current) return;
    const marker = getMarker();
    if (!marker) return;
    const entries = entriesRef.current;
    const previous = entries.get(key);
    if (previous?.marker === marker) return;
    previous?.timers.forEach(clearTimeout);
    const entry: Refresh = { marker, loaded: false, timers: [] };
    entries.set(key, entry);
    const isCurrent = () => enabledRef.current && entries.get(key) === entry && getMarker() === marker;
    entry.timers = [80, 220, 320].map((delay) => setTimeout(() => {
      if (!isCurrent()) {
        entry.timers.forEach(clearTimeout);
        if (entries.get(key) === entry) entries.delete(key);
        return;
      }
      if (delay < 320) {
        try { marker.redraw(); }
        catch (error) { warnThrottled('[NavigationMap] Rafraîchissement du repère ignoré:', error); }
      } else {
        entry.loaded = true;
        entry.timers = [];
        update((value) => value + 1);
      }
    }, delay));
  }, []);

  const isLoaded = useCallback((key: string) => entriesRef.current.get(key)?.loaded === true, []);
  return { onReady, isLoaded };
}
