import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchTripsByCoordinatesMutation, type TripSearchByPointsPayload } from '@/store/api/tripApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { trackEvent } from '@/services/analytics';
import type { Trip } from '@/types';

export function useLatestTripSearch(enabled: boolean) {
  const [search] = useSearchTripsByCoordinatesMutation();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const active = useRef(enabled);
  active.current = enabled;
  const request = useRef<ReturnType<typeof search> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    request.current?.abort();
    request.current = null;
  }, []);
  const clear = useCallback(() => { cancel(); setTrips(null); setError(null); setLoading(false); }, [cancel]);
  useEffect(() => {
    if (!enabled) { cancel(); setLoading(false); }
    return cancel;
  }, [enabled, cancel]);
  const run = useCallback((payload: TripSearchByPointsPayload, delay = 350) => {
    cancel();
    if (!active.current) return;
    const runId = generation.current;
    setError(null); setLoading(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!active.current || generation.current !== runId) return;
      const pending = search(payload);
      request.current = pending;
      void pending.unwrap().then(results => {
        if (!active.current || generation.current !== runId) return;
        setTrips(results);
        void trackEvent('search_results_viewed', { search_mode: 'coordinates', results_count: results.length,
          departure_radius_km: payload.departureRadiusKm, arrival_radius_km: payload.arrivalRadiusKm });
      }).catch(failure => {
        if (active.current && generation.current === runId) setError(getApiErrorMessage(failure,
          'Impossible de filtrer par carte pour le moment. Réessayez dans un instant.'));
      }).finally(() => {
        if (generation.current === runId) { request.current = null; setLoading(false); }
      });
    }, delay);
  }, [cancel, search]);
  return { trips, error, loading, run, clear };
}
