import { useEffect, useMemo, useRef, useState } from 'react';
import type { Booking, Trip } from '@/types';
import { canResumeRideFromPath, findRideToResume, isRideNavigationPath, isRideResumeEntryTransition, verifyRideToResume } from '@/features/navigation/activeRideResume';
import { getTokenSessionVersion } from '@/services/tokenSession';
import type { AccountActivity } from '@/store/api/accountActivityApi';

interface ActivityRead<T> { data?: T[]; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number }
interface Options {
  userId?: string; active: boolean; online: boolean; ready: boolean; path: string; overlayBusy: boolean;
  trips: ActivityRead<Trip>; bookings: ActivityRead<Booking>;
  activity?: { data?: AccountActivity; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number };
  readTrip: (id: string) => Promise<Trip>; readBooking: (id: string) => Promise<Booking>;
  replace: (path: `/trip/navigate/${string}` | `/booking/navigate/${string}`) => void;
}

function getEntryActivity(options: Options, since: number) {
  return options.activity?.isSuccess && !options.activity.isFetching &&
    options.activity.data?.userId === options.userId && (options.activity.fulfilledTimeStamp ?? 0) >= since
    ? options.activity.data : undefined;
}

/** At most one successful resume per foreground/account. No polling or persisted route. */
export function useActiveRideResume(options: Options) {
  const { userId, active } = options;
  const [, advance] = useState(0);
  const entry = useMemo(() => ({ userId, active, since: Date.now(), consumed: false, pending: false,
    mounted: true, path: null as string | null, attempt: '',
    rejectedTrips: new Set<string>(), rejectedBookings: new Set<string>() }), [userId, active]);
  const latest = useRef({ entry, options });
  latest.current = { entry, options };
  useEffect(() => {
    entry.mounted = true;
    return () => { entry.mounted = false; };
  }, [entry]);

  useEffect(() => {
    if (!active || !userId || !options.ready || entry.consumed) return;
    if (isRideResumeEntryTransition(options.path)) return;
    if (isRideNavigationPath(options.path) || !canResumeRideFromPath(options.path)) {
      entry.consumed = true; return;
    }
    // Navigating deliberately while discovery is loading cancels this entry's redirection.
    if (entry.path !== null && entry.path !== options.path) { entry.consumed = true; return; }
    entry.path = options.path;
    if (!options.online) { entry.attempt = ''; return; }
    if (options.overlayBusy || entry.pending) return;
    const summary = getEntryActivity(options, entry.since);
    // Empty accounts need no list reads. A fresh summary closes this entry so a
    // trip created later during normal use does not cause an unexpected redirect.
    if (summary && !summary.hasLiveActivity) { entry.consumed = true; return; }
    const candidate = findRideToResume(userId,
      options.trips.data?.filter(trip => !entry.rejectedTrips.has(trip.id)),
      options.bookings.data?.filter(booking => !entry.rejectedBookings.has(booking.id)));
    if (!candidate) {
      // Lists fetched before the live summary may still describe the pre-start
      // state. Wait for reconciliation instead of prematurely declaring no ride.
      const since = summary ? options.activity!.fulfilledTimeStamp! : entry.since;
      const tripsReady = summary?.trips?.count === 0 || (options.trips.isSuccess && !options.trips.isFetching &&
        (options.trips.fulfilledTimeStamp ?? 0) >= since);
      const bookingsReady = summary?.bookings?.count === 0 || (options.bookings.isSuccess && !options.bookings.isFetching &&
        (options.bookings.fulfilledTimeStamp ?? 0) >= since);
      if (tripsReady && bookingsReady) entry.consumed = true;
      return;
    }
    // Shared lists can finish in either order: a driver's older ongoing trip must
    // not win while the server is reporting their current passenger reservation.
    if (candidate.role === 'driver' && summary?.passengerTrackingBookingId &&
      !entry.rejectedBookings.has(summary.passengerTrackingBookingId)) return;
    const attempt = `${candidate.role}:${candidate.tripId}:${candidate.bookingId}:${options.trips.fulfilledTimeStamp}:${options.bookings.fulfilledTimeStamp}:${options.activity?.fulfilledTimeStamp}`;
    if (entry.attempt === attempt) return;
    entry.attempt = attempt;
    entry.pending = true;
    const version = getTokenSessionVersion();
    void verifyRideToResume(candidate, userId, { trip: options.readTrip, booking: options.readBooking }).then(path => {
      const current = latest.current;
      if (!entry.mounted || current.entry !== entry || entry.consumed || version !== getTokenSessionVersion() ||
        !current.options.active || !current.options.online || !current.options.ready || current.options.path !== entry.path) return;
      if (current.options.overlayBusy) { entry.attempt = ''; return; }
      const currentSummary = getEntryActivity(current.options, entry.since);
      if (currentSummary && !currentSummary.hasLiveActivity) { entry.consumed = true; return; }
      if (candidate.role === 'driver' && currentSummary?.passengerTrackingBookingId &&
        !entry.rejectedBookings.has(currentSummary.passengerTrackingBookingId)) return;
      const latestCandidate = findRideToResume(userId,
        current.options.trips.data?.filter(trip => !entry.rejectedTrips.has(trip.id)),
        current.options.bookings.data?.filter(booking => !entry.rejectedBookings.has(booking.id)));
      if (path && (latestCandidate?.role !== candidate.role || latestCandidate.tripId !== candidate.tripId ||
        latestCandidate.bookingId !== candidate.bookingId)) return;
      if (path) {
        entry.consumed = true;
        current.options.replace(path);
      } else if (candidate.bookingId) entry.rejectedBookings.add(candidate.bookingId);
      else entry.rejectedTrips.add(candidate.tripId);
    }).catch(() => {
      // Do not retry on every render. A new discovery snapshot, foreground or reconnect can retry.
    }).finally(() => {
      entry.pending = false;
      // Discovery may have finished while the verification was pending.
      if (entry.mounted && latest.current.entry === entry && version === getTokenSessionVersion()) {
        advance(value => value + 1);
      }
    });
  }, [active, userId, entry, options]);
}
