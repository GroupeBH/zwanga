import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import type { Trip } from '@/types';
import { getLocalRouteInfo, getRouteInfo } from '@/utils/routeApi';
import { TaskQueue } from '@/utils/taskQueue';
import { getTripLocationCoordinate } from '@/utils/tripCoordinates';

const previewQueue = new TaskQueue(2);

/** Cache-first previews; precise ETA is retained without a burst of per-card requests. */
export function useTripArrivalTime(trip: Trip | null | undefined): Date | null {
  const active = useScreenIsActive();
  const [resolved, setResolved] = useState<{ key: string; date: Date } | null>(null);
  const departureTime = trip?.departureTime;
  const arrivalTime = trip?.arrivalTime;
  const departure = trip?.departure;
  const arrival = trip?.arrival;
  const origin = getTripLocationCoordinate(departure);
  const destination = getTripLocationCoordinate(arrival);
  const key = `${departureTime}:${origin?.latitude}:${origin?.longitude}:${destination?.latitude}:${destination?.longitude}`;
  useEffect(() => {
    const departureMs = Date.parse(departureTime ?? '');
    const arrivalMs = Date.parse(arrivalTime ?? '');
    if (!active || !origin || !destination || !Number.isFinite(departureMs) || arrivalMs > departureMs) return;
    const controller = new AbortController();
    const interaction = InteractionManager.runAfterInteractions(() => {
      void previewQueue.run(() => getRouteInfo(origin, destination), controller.signal).then(({ duration }) => {
        if (!controller.signal.aborted && duration > 0) {
          setResolved({ key, date: new Date(departureMs + duration * 1000) });
        }
      }).catch(() => undefined);
    });
    return () => { controller.abort(); interaction.cancel(); };
    // Coordinate values form the key; address object identity must not restart reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, departureTime, arrivalTime]);

  return useMemo(() => {
    const departureMs = Date.parse(departureTime ?? '');
    if (!Number.isFinite(departureMs)) return null;
    const arrivalMs = Date.parse(arrivalTime ?? '');
    // The legacy mapper uses departureTime as a placeholder arrivalTime.
    if (Number.isFinite(arrivalMs) && arrivalMs > departureMs) return new Date(arrivalMs);
    if (resolved?.key === key) return resolved.date;
    const origin = getTripLocationCoordinate(departure);
    const destination = getTripLocationCoordinate(arrival);
    if (!origin || !destination) return null;
    const { duration } = getLocalRouteInfo(origin, destination);
    return duration > 0 ? new Date(departureMs + duration * 1000) : null;
  }, [departureTime, arrivalTime, departure, arrival, resolved, key]);
}

