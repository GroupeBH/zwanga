import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Booking, Trip } from '@/types';
import { canResumeRideFromPath, findRideToResume, isRideNavigationPath, isRideResumeEntryTransition, verifyRideToResume } from '@/features/navigation/activeRideResume';
import { getTokenSessionVersion } from '@/services/tokenSession';
import type { AccountActivity } from '@/store/api/accountActivityApi';
import type { ReconciledActivity } from '@/services/activityReadiness';
import { isEntryActivityListReady } from '@/features/navigation/entryActivityReadiness';
import { isEntryReadFresh } from '@/features/navigation/entryFreshness';
import { ENTRY_LOAD_TIMEOUT_MS, reportEntryFailure, type EntryStage } from '@/services/entryRecovery';

interface ActivityRead<T> { data?: T[]; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number }
interface Options {
  userId?: string; active: boolean; online: boolean; ready: boolean; path: string; overlayBusy: boolean;
  since?: number;
  trips: ActivityRead<Trip>; bookings: ActivityRead<Booking>;
  activity?: { data?: AccountActivity; isSuccess: boolean; isFetching?: boolean; isError?: boolean; startedTimeStamp?: number; fulfilledTimeStamp?: number };
  reconciled?: ReconciledActivity | null;
  readTrip: (id: string, signal?: AbortSignal) => Promise<Trip>; readBooking: (id: string, signal?: AbortSignal) => Promise<Booking>;
  replace: (path: `/trip/navigate/${string}` | `/booking/navigate/${string}`) => void | boolean;
  refreshActivity?: () => Promise<unknown>;
  homeRole?: { ready: boolean; failed: boolean; retry: () => Promise<unknown> };
}

function getEntryActivity(options: Options, since: number) {
  return options.activity?.isSuccess && !options.activity.isFetching && !options.activity.isError &&
    options.activity.data?.userId === options.userId && isEntryReadFresh(options.activity, since)
    ? options.activity.data : undefined;
}

/** At most one successful resume per foreground/account. No polling or persisted route. */
export function useActiveRideResume(options: Options) {
  const { userId, active } = options;
  const [, advance] = useState(0);
  const entryBoundary = options.since ?? active;
  const entry = useMemo(() => ({ userId, since: options.since ?? Date.now(), consumed: false, pending: false,
    mounted: true, path: null as string | null, attempt: '', failed: false, redirecting: false,
    controller: undefined as AbortController | undefined, generation: 0, stage: 'activity' as EntryStage,
    // An inactive iOS interruption pauses verification without creating a visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    rejectedTrips: new Set<string>(), rejectedBookings: new Set<string>() }), [userId, entryBoundary]);
  const latest = useRef({ entry, options });
  latest.current = { entry, options };
  const finishEntry = useCallback(() => {
    if (entry.consumed) return;
    entry.consumed = true;
    advance(value => value + 1);
  }, [entry]);

  useEffect(() => {
    if (active || entry.consumed) return;
    // The native foreground guard can reject before React receives inactive.
    // Clear that attempt too, even if its promise has already settled.
    entry.generation++; entry.controller?.abort(); entry.pending = false; entry.attempt = ''; entry.failed = false;
  }, [active, entry]);
  useEffect(() => {
    entry.mounted = true;
    return () => { entry.mounted = false; entry.controller?.abort(); };
  }, [entry]);

  useEffect(() => {
    if (entry.redirecting && options.path !== entry.path) {
      entry.redirecting = false;
      advance(value => value + 1);
    }
    if (!active || !userId || !options.ready || entry.consumed) return;
    if (isRideResumeEntryTransition(options.path)) return;
    if (isRideNavigationPath(options.path) || !canResumeRideFromPath(options.path)) {
      finishEntry(); return;
    }
    // Navigating deliberately while discovery is loading cancels this entry's redirection.
    if (entry.path !== null && entry.path !== options.path) { finishEntry(); return; }
    entry.path = options.path;
    if (!options.online) { entry.attempt = ''; return; }
    if (options.overlayBusy || entry.pending) return;
    const summary = getEntryActivity(options, entry.since);
    // Empty accounts need no list reads. A fresh summary closes this entry so a
    // trip created later during normal use does not cause an unexpected redirect.
    if (summary && !summary.hasLiveActivity) { finishEntry(); return; }
    const candidate = findRideToResume(userId,
      options.trips.data?.filter(trip => !entry.rejectedTrips.has(trip.id)),
      options.bookings.data?.filter(booking => !entry.rejectedBookings.has(booking.id)));
    if (!candidate) {
      // Do not settle from old empty lists while this foreground's summary is
      // still pending. An ongoing ride may have started on the other phone.
      if (options.activity?.isFetching || (options.activity?.data && !options.activity.isError && !summary)) return;
      // Lists fetched before the live summary may still describe the pre-start
      // state. Wait for reconciliation instead of prematurely declaring no ride.
      const discovery = { userId, since: entry.since, summary, summaryTime: options.activity?.fulfilledTimeStamp, reconciled: options.reconciled };
      const tripsReady = isEntryActivityListReady('trips', options.trips, discovery);
      const bookingsReady = isEntryActivityListReady('bookings', options.bookings, discovery);
      if (tripsReady && bookingsReady) finishEntry();
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
    entry.failed = false;
    const generation = ++entry.generation;
    const controller = new AbortController(); entry.controller = controller;
    const startedAt = Date.now();
    entry.stage = candidate.role === 'driver' ? 'trip-detail' : 'booking-detail';
    advance(value => value + 1);
    const version = getTokenSessionVersion();
    void verifyRideToResume(candidate, userId, { trip: id => options.readTrip(id, controller.signal),
      booking: id => options.readBooking(id, controller.signal) }).then(path => {
      const current = latest.current;
      if (!entry.mounted || current.entry !== entry || entry.consumed || generation !== entry.generation || controller.signal.aborted || version !== getTokenSessionVersion() ||
        !current.options.active || !current.options.online || !current.options.ready || current.options.path !== entry.path) return;
      if (current.options.overlayBusy) { entry.attempt = ''; return; }
      const currentSummary = getEntryActivity(current.options, entry.since);
      if (currentSummary && !currentSummary.hasLiveActivity) { finishEntry(); return; }
      if (candidate.role === 'driver' && currentSummary?.passengerTrackingBookingId &&
        !entry.rejectedBookings.has(currentSummary.passengerTrackingBookingId)) return;
      const latestCandidate = findRideToResume(userId,
        current.options.trips.data?.filter(trip => !entry.rejectedTrips.has(trip.id)),
        current.options.bookings.data?.filter(booking => !entry.rejectedBookings.has(booking.id)));
      if (path && (latestCandidate?.role !== candidate.role || latestCandidate.tripId !== candidate.tripId ||
        latestCandidate.bookingId !== candidate.bookingId)) return;
      if (path) {
        entry.stage = 'navigation';
        entry.redirecting = true;
        if (current.options.replace(path) === false) entry.redirecting = false;
        entry.consumed = true;
      } else if (candidate.bookingId) entry.rejectedBookings.add(candidate.bookingId);
      else entry.rejectedTrips.add(candidate.tripId);
    }).catch(error => {
      // Do not retry on every render. A new discovery snapshot, foreground or reconnect can retry.
      if (entry.mounted && latest.current.entry === entry && generation === entry.generation &&
        !controller.signal.aborted && version === getTokenSessionVersion() && !entry.consumed) {
        entry.redirecting = false; entry.failed = true;
        reportEntryFailure(entry.stage, entry.stage === 'navigation' ? 'navigation' : 'read', startedAt, error);
      }
    }).finally(() => {
      if (generation !== entry.generation) return;
      entry.pending = false;
      // Discovery may have finished while the verification was pending.
      if (entry.mounted && latest.current.entry === entry && version === getTokenSessionVersion()) {
        advance(value => value + 1);
      }
    });
  }, [active, userId, entry, options, finishEntry]);

  const waitingForHomeRole = (options.path === '/' || options.path === '/(tabs)') && options.homeRole?.ready === false;
  if (!entry.pending && !entry.redirecting) entry.stage = waitingForHomeRole ? 'profile' : 'activity';
  // Cover Home from its first render, even before the router key is available;
  // the effect above still waits for navigation readiness before replacing it.
  const pending = Boolean(userId &&
    !isRideResumeEntryTransition(options.path) && canResumeRideFromPath(options.path) &&
    (!entry.consumed || entry.redirecting || waitingForHomeRole));
  const visible = pending && active && !options.overlayBusy;
  const failed = entry.failed || !options.online || Boolean(entry.consumed && !entry.redirecting && waitingForHomeRole && options.homeRole?.failed);
  useEffect(() => {
    if (!visible || failed) return;
    // A missing/slow discovery response must not leave an unescapable splash.
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      if (!entry.mounted || latest.current.entry !== entry) return;
      reportEntryFailure(entry.stage, 'timeout', startedAt);
      entry.generation++; entry.controller?.abort(); entry.pending = false;
      entry.failed = true;
      advance(value => value + 1);
    }, ENTRY_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [visible, failed, entry]);

  const retry = useCallback(() => {
    if (!entry.mounted || latest.current.entry !== entry || !latest.current.options.active || !latest.current.options.online) return;
    entry.generation++; entry.controller?.abort(); entry.pending = false;
    if (entry.redirecting) { entry.redirecting = false; entry.consumed = false; }
    entry.failed = false;
    entry.attempt = '';
    entry.rejectedTrips.clear(); entry.rejectedBookings.clear();
    advance(value => value + 1);
    void Promise.resolve().then(() => {
      if (entry.mounted && latest.current.entry === entry && latest.current.options.active && latest.current.options.online) {
        const current = latest.current.options;
        return Promise.all([
          !entry.consumed ? current.refreshActivity?.() : undefined,
          (current.path === '/' || current.path === '/(tabs)') && current.homeRole?.ready === false ? current.homeRole.retry() : undefined,
        ]);
      }
    }).catch(() => {
      if (entry.mounted && latest.current.entry === entry && (!entry.consumed || latest.current.options.homeRole?.ready === false)) {
        entry.failed = true; advance(value => value + 1);
      }
    });
  }, [entry]);
  const dismiss = useCallback(() => {
    entry.generation++; entry.controller?.abort(); entry.pending = false;
    entry.redirecting = false;
    entry.consumed = true;
    advance(value => value + 1);
  }, [entry]);
  // Secondary entry may still be verifying a reservation after our initial
  // discovery settled. Recheck only at that handoff, never on settled Home.
  const verifyPriority = useCallback(async (signal: AbortSignal) => {
    const version = getTokenSessionVersion();
    const valid = () => entry.mounted && latest.current.entry === entry && !signal.aborted &&
      version === getTokenSessionVersion() && latest.current.options.active && latest.current.options.online &&
      latest.current.options.ready && !latest.current.options.overlayBusy && latest.current.options.path === entry.path;
    const select = () => findRideToResume(userId!,
      latest.current.options.trips.data?.filter(trip => !entry.rejectedTrips.has(trip.id)),
      latest.current.options.bookings.data?.filter(booking => !entry.rejectedBookings.has(booking.id)));
    while (userId && valid()) {
      const candidate = select();
      if (!candidate) return null;
      const reads = latest.current.options;
      const destination = await verifyRideToResume(candidate, userId, {
        trip: id => reads.readTrip(id, signal), booking: id => reads.readBooking(id, signal),
      });
      if (!valid()) throw new Error('STALE_ENTRY_PRIORITY');
      if (!destination) {
        if (candidate.bookingId) entry.rejectedBookings.add(candidate.bookingId);
        else entry.rejectedTrips.add(candidate.tripId);
        continue;
      }
      const current = select();
      if (current?.role === candidate.role && current.tripId === candidate.tripId && current.bookingId === candidate.bookingId)
        return destination;
    }
    throw new Error('STALE_ENTRY_PRIORITY');
  }, [entry, userId]);
  return { pending, visible, failed, retry, dismiss, verifyPriority };
}
