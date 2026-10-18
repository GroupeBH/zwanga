import { useEffect, useRef } from 'react';
import { getRouteInfo } from '@/utils/routeApi';
import { calculateDistanceMeters, type NavigationCoordinate } from '@/utils/navigation/routeProgress';

type Props = {
  enabled: boolean;
  tripId?: string;
  origin: NavigationCoordinate | null;
  destination: NavigationCoordinate;
  duration?: number;
  progress: number;
  onEstimate: (value: Date | null) => void;
};

const MIN_READ_INTERVAL_MS = 30_000;
const STATIONARY_READ_INTERVAL_MS = 120_000;
const MIN_MOVEMENT_METERS = 50;

/** One in-flight ETA read; moving samples coalesce instead of restarting a debounce. */
export function useTripDetailArrivalEstimate(props: Props) {
  const { enabled, tripId, destination, origin, duration, onEstimate } = props;
  const latest = useRef(props);
  latest.current = props;
  const scheduleRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRead: { at: number; coordinate: NavigationCoordinate } | null = null;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (cancelled || pending) return;
      const current = latest.current;
      if (!current.origin || current.duration === undefined) return;
      const moved = !lastRead || calculateDistanceMeters(lastRead.coordinate, current.origin) >= MIN_MOVEMENT_METERS;
      const delay = lastRead
        ? Math.max(0, lastRead.at + (moved ? MIN_READ_INTERVAL_MS : STATIONARY_READ_INTERVAL_MS) - Date.now())
        : 0;
      timer = setTimeout(() => {
        timer = undefined;
        if (cancelled) return;
        const sample = latest.current;
        if (!sample.origin) return;
        pending = true;
        lastRead = { at: Date.now(), coordinate: sample.origin };
        void getRouteInfo(sample.origin, sample.destination).then(info => {
          if (!cancelled) latest.current.onEstimate(new Date(Date.now() + info.duration * 1000));
        }).catch(() => {
          if (cancelled) return;
          const remaining = (100 - Math.min(100, Math.max(0, sample.progress))) / 100;
          latest.current.onEstimate(sample.duration && sample.duration > 0
            ? new Date(Date.now() + sample.duration * remaining * 1000) : null);
        }).finally(() => { pending = false; schedule(); });
      }, delay);
    };
    scheduleRef.current = schedule;
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      scheduleRef.current = () => {};
    };
  }, [enabled, tripId, destination.latitude, destination.longitude]);

  useEffect(() => {
    if (!enabled) onEstimate(null);
    else scheduleRef.current();
  }, [enabled, origin?.latitude, origin?.longitude, duration, onEstimate]);
}
