import { IS_ANDROID } from '@/features/home/homeMapPolicy';
import { useCallback, useEffect, useRef } from 'react';
import type { useHomeMap } from './useHomeMap';

type Props =
  Pick<ReturnType<typeof useHomeMap>,
    'passengerMarkerRefs'
    | 'setLoadedTripMarkerKeys'
  >
  & {
    enabled: boolean;
    tripId?: string;
  };

// Android needs a short redraw window while the marker image becomes available.
// Cancel native callbacks when the map or its active trip is released.
export function useHomeMarkerReadiness({ enabled, tripId, passengerMarkerRefs, setLoadedTripMarkerKeys }: Props) {
  const activeRef = useRef(false);
  const pendingRef = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  useEffect(() => {
    activeRef.current = enabled;
    const pending = pendingRef.current;
    return () => {
      activeRef.current = false;
      pending.forEach(timers => timers.forEach(clearTimeout));
      pending.clear();
    };
  }, [enabled, tripId]);

  return useCallback((key: string, bookingId: string) => {
    if (!IS_ANDROID || !activeRef.current) return;
    pendingRef.current.get(key)?.forEach(clearTimeout);
    const marker = passengerMarkerRefs.current[bookingId];
    const isCurrent = () => activeRef.current && marker && passengerMarkerRefs.current[bookingId] === marker;
    const timers = [80, 220].map(delay => setTimeout(() => {
      if (isCurrent()) marker?.redraw();
    }, delay));
    timers.push(setTimeout(() => {
      pendingRef.current.delete(key);
      if (!isCurrent()) return;
      setLoadedTripMarkerKeys(current => {
        if (current.has(key)) return current;
        return new Set([...current, key]);
      });
    }, 320));
    pendingRef.current.set(key, timers);
  }, [passengerMarkerRefs, setLoadedTripMarkerKeys]);
}
