import { useEffect, useMemo, useRef } from 'react';
import type { Booking, Trip } from '@/types';
import { canResumeRideFromPath, findRideToResume, isRideNavigationPath, verifyRideToResume } from '@/features/navigation/activeRideResume';
import { getTokenSessionVersion } from '@/services/tokenSession';

interface ActivityRead<T> { data?: T[]; isSuccess: boolean; fulfilledTimeStamp?: number }
interface Options {
  userId?: string; active: boolean; online: boolean; ready: boolean; path: string; overlayBusy: boolean;
  trips: ActivityRead<Trip>; bookings: ActivityRead<Booking>;
  readTrip: (id: string) => Promise<Trip>; readBooking: (id: string) => Promise<Booking>;
  replace: (path: `/trip/navigate/${string}` | `/booking/navigate/${string}`) => void;
}

/** At most one successful resume per foreground/account. No polling or persisted route. */
export function useActiveRideResume(options: Options) {
  const { userId, active } = options;
  const entry = useMemo(() => ({ userId, active, since: Date.now(), consumed: false, pending: false,
    mounted: true, path: null as string | null, attempt: '' }), [userId, active]);
  const latest = useRef({ entry, options });
  latest.current = { entry, options };
  useEffect(() => {
    entry.mounted = true;
    return () => { entry.mounted = false; };
  }, [entry]);

  useEffect(() => {
    if (!active || !userId || !options.ready || entry.consumed) return;
    if (isRideNavigationPath(options.path) || !canResumeRideFromPath(options.path)) {
      entry.consumed = true; return;
    }
    // Navigating deliberately while discovery is loading cancels this entry's redirection.
    if (entry.path !== null && entry.path !== options.path) { entry.consumed = true; return; }
    entry.path = options.path;
    if (!options.online) { entry.attempt = ''; return; }
    if (options.overlayBusy || entry.pending) return;
    const candidate = findRideToResume(userId, options.trips.data, options.bookings.data);
    if (!candidate) {
      if (options.trips.isSuccess && options.bookings.isSuccess &&
        (options.trips.fulfilledTimeStamp ?? 0) >= entry.since &&
        (options.bookings.fulfilledTimeStamp ?? 0) >= entry.since) entry.consumed = true;
      return;
    }
    const attempt = `${candidate.role}:${candidate.tripId}:${candidate.bookingId}:${options.trips.fulfilledTimeStamp}:${options.bookings.fulfilledTimeStamp}`;
    if (entry.attempt === attempt) return;
    entry.attempt = attempt;
    entry.pending = true;
    const version = getTokenSessionVersion();
    void verifyRideToResume(candidate, userId, { trip: options.readTrip, booking: options.readBooking }).then(path => {
      const current = latest.current;
      if (!entry.mounted || current.entry !== entry || entry.consumed || version !== getTokenSessionVersion() ||
        !current.options.active || !current.options.online || current.options.path !== entry.path) return;
      if (current.options.overlayBusy) { entry.attempt = ''; return; }
      entry.consumed = true;
      if (path) current.options.replace(path);
    }).catch(() => {
      // Do not retry on every render. A new discovery snapshot, foreground or reconnect can retry.
    }).finally(() => { entry.pending = false; });
  }, [active, userId, entry, options]);
}
