import { useCallback, useEffect, useRef, useState } from 'react';
import { getPaidRequestCompletionKey } from '@/features/driver-navigation/paidRequestCompletion';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking, Trip } from '@/types';

type Params = {
  trip: Trip | undefined;
  bookings: Booking[] | undefined;
  driverId: string | undefined;
  active: boolean;
  blocked: boolean;
  completingRef: { current: boolean };
  completeTrip: (id: string) => { unwrap: () => Promise<Trip> };
  reconcileTripStatus: (error: unknown, statuses: Trip['status'][]) => Promise<Trip | null | undefined>;
  onCompleted: (trip: Trip) => unknown;
  refresh: () => void;
};

/** Uses existing socket/REST booking data, with no additional polling or GPS work. */
export function usePaidRequestCompletion(params: Params) {
  const key = getPaidRequestCompletionKey(params.trip, params.bookings, params.driverId);
  const version = getTokenSessionVersion();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const dismissedRef = useRef<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const mounted = useRef(true);
  const live = useRef({ params, key, version });
  live.current = { params, key, version };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const identity = key ? `${version}:${key}` : null;
  const visible = Boolean(identity && dismissed !== identity && params.active && !params.blocked);
  const dismiss = useCallback(() => {
    if (!live.current.params.completingRef.current && identity) {
      dismissedRef.current = identity;
      setDismissed(identity);
    }
  }, [identity]);

  const confirm = useCallback(async () => {
    const current = live.current;
    if (!visible || !key || dismissedRef.current === identity || current.key !== key || version !== getTokenSessionVersion() ||
      !current.params.active || current.params.blocked || current.params.completingRef.current || !mounted.current) return;
    const source = current.params;
    const tripId = source.trip!.id;
    const isCurrent = () => mounted.current && live.current.version === version && getTokenSessionVersion() === version &&
      live.current.params.trip?.id === tripId && live.current.params.driverId === source.driverId;
    source.completingRef.current = true;
    setPending(identity);
    setFailure(null);
    try {
      let completed: Trip | null | undefined;
      try { completed = await source.completeTrip(tripId).unwrap(); }
      catch (error) {
        if (!isCurrent()) return;
        completed = await source.reconcileTripStatus(error, ['completed']);
        if (!completed) throw error;
      }
      if (!isCurrent()) return;
      if (completed?.id !== tripId || completed.status !== 'completed') throw new Error('La fin du trajet n’a pas été confirmée. Réessayez.');
      setDismissed(identity);
      dismissedRef.current = identity;
      if (live.current.params.active) source.onCompleted(completed);
      source.refresh();
    } catch (error) {
      if (isCurrent() && key) setFailure({ key, message: getApiErrorMessage(error, 'Impossible de terminer le trajet. Vérifiez votre connexion puis réessayez.') });
    } finally {
      source.completingRef.current = false;
      if (isCurrent()) setPending(null);
    }
  }, [identity, key, version, visible]);

  return { visible, busy: Boolean(identity && pending === identity),
    error: failure?.key === key ? failure?.message : undefined, dismiss, confirm };
}
