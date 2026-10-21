import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Href } from 'expo-router';
import type { Booking, Trip, TripRequest } from '@/types';
import type { AccountActivity } from '@/store/api/accountActivityApi';
import type { RideAlert } from '@/features/notifications/rideAlert';
import { isRideResumeEntryTransition } from '@/features/navigation/activeRideResume';
import { canResumeRequestFromPath, isOwnWaitingRequest, selectRequestAlert, selectWaitingRequest } from '@/features/navigation/priorityRequestEntry';
import { isRequestUnassigned, isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { acceptedRequestEntryKey, canResumeAcceptedRequest, isAcceptedRequestTrip, selectAcceptedRequestTrip } from '@/features/navigation/acceptedRequestEntry';
import type { ReconciledActivity } from '@/services/activityReadiness';
import { isEntryActivityListReady } from '@/features/navigation/entryActivityReadiness';
import { isEntryReadFresh } from '@/features/navigation/entryFreshness';
import { ENTRY_LOAD_TIMEOUT_MS, reportEntryFailure, type EntryStage } from '@/services/entryRecovery';
import { isPendingBookingEntryListed, selectBookingEntryAlert, selectPendingBookingEntry, verifyPendingBookingEntry, type VerifiedBookingEntry } from '@/features/navigation/pendingBookingEntry';

interface Options {
  userId?: string; active: boolean; online: boolean; ready: boolean; path: string; overlayBusy: boolean;
  since?: number;
  ridePending: boolean; hasOngoingRide: boolean; driver: boolean; profileReady: boolean;
  requests: { data?: TripRequest[]; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number };
  trips: { data?: Trip[]; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number };
  activity: { data?: AccountActivity; isSuccess: boolean; isFetching?: boolean; isError?: boolean; startedTimeStamp?: number; fulfilledTimeStamp?: number };
  reconciled?: ReconciledActivity | null;
  alerts: RideAlert[];
  pendingDispatchId?: string | null;
  readRequest: (id: string, signal?: AbortSignal) => Promise<TripRequest>;
  readTrip: (id: string, signal?: AbortSignal) => Promise<Trip>;
  readBooking: (id: string, signal?: AbortSignal) => Promise<Booking>;
  readDispatch: (id: string, signal?: AbortSignal) => Promise<{ id: string; driverId: string; actionable: boolean; expiresAt: string; serverNow: string }>;
  replace: (path: Href) => void | boolean;
  refresh: () => Promise<unknown>;
  verifyPriority?: (signal: AbortSignal) => Promise<`/trip/navigate/${string}` | `/booking/navigate/${string}` | null>;
  prepareBookingEntry?: (snapshot: VerifiedBookingEntry) => void;
}

function entrySummary(options: Options, since: number) {
  return options.activity.isSuccess && !options.activity.isFetching && !options.activity.isError && options.activity.data?.userId === options.userId &&
    isEntryReadFresh(options.activity, since) ? options.activity.data : undefined;
}

function driverEntryTrips(options: Options, entry: { since: number }): readonly Trip[] | undefined {
  const summary = entrySummary(options, entry.since);
  if (!options.driver || summary?.hasLiveActivity === false || summary?.trips?.count === 0) return [];
  if (options.activity.isFetching) return undefined;
  return isEntryActivityListReady('trips', options.trips, { userId: options.userId!, since: entry.since, summary,
    summaryTime: options.activity.fulfilledTimeStamp, reconciled: options.reconciled }) ? options.trips.data ?? [] : undefined;
}

/** Secondary entry only: ongoing rides are resolved first by useActiveRideResume.
 * Reuses shared discovery, verifies one selected reservation/request/trip, never polls. */
export function useRequestEntryResume(options: Options) {
  const [, advance] = useState(0);
  const entryBoundary = options.since ?? options.active;
  const entry = useMemo(() => ({ userId: options.userId, active: options.active, since: options.since ?? Date.now(), path: null as string | null, mounted: true,
    done: false, checked: false, pending: false, redirecting: false, failed: false, attempt: '',
    controller: undefined as AbortController | undefined, generation: 0, deadline: 0, stage: 'activity' as EntryStage,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    rejected: new Set<string>() }), [options.userId, entryBoundary]);
  const latest = useRef({ entry, options }); latest.current = { entry, options };
  useEffect(() => { entry.mounted = true; return () => { entry.mounted = false; entry.controller?.abort(); }; }, [entry]);
  const touch = useCallback(() => advance(value => value + 1), []);
  useEffect(() => {
    if (options.active || entry.done) return;
    entry.generation++; entry.controller?.abort(); entry.pending = false; entry.attempt = ''; entry.deadline = 0; entry.failed = false;
  }, [options.active, entry]);
  useEffect(() => {
    if (entry.redirecting && options.path !== entry.path) { entry.redirecting = false; touch(); }
    if (!options.active || !options.userId || !options.ready || entry.done) return;
    if (isRideResumeEntryTransition(options.path)) return;
    if (!canResumeRequestFromPath(options.path) || (entry.path !== null && entry.path !== options.path)) {
      entry.done = true; touch(); return;
    }
    entry.path = options.path;
    if (!options.online) { entry.attempt = ''; return; }
    if (options.ridePending || options.hasOngoingRide || options.overlayBusy || !options.profileReady) return;
    const userId = options.userId;
    // Reservations on a published trip need an answer before other requests.
    // Ongoing navigation above still has absolute priority; reuse discovery.
    const bookingAlert = options.driver ? selectBookingEntryAlert(options.alerts, userId, entry.rejected) : undefined;
    const driverTrips = driverEntryTrips(options, entry);
    const booking = bookingAlert ?? (options.driver && !entry.checked && driverTrips
      ? selectPendingBookingEntry(driverTrips, userId, entry.rejected) : undefined);
    const alert = !booking && options.driver ? selectRequestAlert(options.alerts, userId, entry.rejected) : undefined;
    const dispatchId = alert?.kind === 'dispatch' ? alert.id : !alert && options.driver &&
      !booking && options.pendingDispatchId && !entry.rejected.has(`dispatch:${options.pendingDispatchId}`) ? options.pendingDispatchId : undefined;
    const incomingKey = booking?.key ?? alert?.key ?? (dispatchId ? `dispatch:${dispatchId}` : undefined);
    if (entry.pending) {
      if (!incomingKey || entry.attempt === incomingKey || (entry.attempt.startsWith('booking:') && !booking)) return;
      // Do not keep a ringing offer behind a slow lower-priority detail read.
      entry.generation++; entry.controller?.abort(); entry.pending = false; entry.attempt = '';
    }
    const summary = entrySummary(options, entry.since);
    if (!bookingAlert && !alert && !dispatchId && (options.activity.isFetching || (options.activity.data && !options.activity.isError && !summary))) return;
    // Wait for fresh publications before deciding that none starts earlier.
    // Once this entry has settled, later normal activity must not hijack Home.
    if (!booking && !alert && !dispatchId && !entry.checked && driverTrips === undefined) return;
    const accepted = !booking && !alert && !dispatchId && options.driver && !entry.checked
      ? selectAcceptedRequestTrip(driverTrips ?? [], userId, entry.rejected) : undefined;
    const requestsReady = summary?.hasLiveActivity === false || isEntryActivityListReady('requests', options.requests, {
      userId, since: entry.since, summary, summaryTime: options.activity.fulfilledTimeStamp, reconciled: options.reconciled,
    });
    if (!booking && !accepted && !alert && !dispatchId && !requestsReady) return;
    const request = !booking && !accepted && !alert && !dispatchId && summary?.requests?.count !== 0 && summary?.hasLiveActivity !== false
      ? selectWaitingRequest(options.requests.data ?? [], userId, entry.rejected) : undefined;
    if (!booking && !accepted && !alert && !dispatchId && !request) {
      // A native alert can finish restoring after the account summary. Keep listening
      // only on this entry's original screen, never after a deliberate navigation.
      if (!entry.checked) { entry.checked = true; touch(); }
      return;
    }
    const key = booking?.key ?? (accepted ? acceptedRequestEntryKey(accepted) : alert?.key ?? (dispatchId ? `dispatch:${dispatchId}` : request!.id));
    if (entry.attempt === key) return;
    entry.attempt = key; entry.pending = true; entry.failed = false; touch();
    const generation = ++entry.generation;
    const controller = new AbortController(); entry.controller = controller;
    const startedAt = Date.now();
    entry.deadline = startedAt + ENTRY_LOAD_TIMEOUT_MS;
    entry.stage = booking ? 'booking-detail' : accepted ? 'trip-detail' : dispatchId ? 'dispatch-detail' : 'request-detail';
    const version = getTokenSessionVersion();
    const current = () => {
      const next = latest.current;
      return entry.mounted && next.entry === entry && generation === entry.generation && !controller.signal.aborted &&
        !entry.done && version === getTokenSessionVersion() &&
        next.options.userId === userId && next.options.active && next.options.online && next.options.ready &&
        next.options.profileReady && (!(booking || alert || dispatchId || accepted) || next.options.driver) &&
        next.options.path === entry.path && !next.options.ridePending && !next.options.hasOngoingRide && !next.options.overlayBusy;
    };
    const releaseAttempt = () => { if (generation === entry.generation) entry.attempt = ''; };
    const navigate = (destination: Href) => {
      entry.stage = 'navigation'; entry.redirecting = true;
      if (latest.current.options.replace(destination) === false) entry.redirecting = false;
      entry.done = true;
    };
    void (async () => {
      let destination: Href | null = null;
      let verifiedBooking: VerifiedBookingEntry | undefined;
      if (booking) {
        destination = await verifyPendingBookingEntry(booking, userId,
          id => options.readBooking(id, controller.signal), id => {
            if (!current()) throw new Error('STALE_BOOKING_ENTRY');
            entry.stage = 'trip-detail'; return options.readTrip(id, controller.signal);
          }, snapshot => { verifiedBooking = snapshot; });
      } else if (accepted) {
        const trip = await options.readTrip(accepted.id, controller.signal);
        if (!current()) { releaseAttempt(); return; }
        if (trip.id !== accepted.id || trip.tripRequestId !== accepted.tripRequestId || !ownsTrip(trip, userId)) {
          entry.rejected.add(key); return;
        }
        // It may have started on another device since the activity snapshot.
        if (trip.status === 'ongoing') destination = `/trip/navigate/${trip.id}`;
        else if (isAcceptedRequestTrip(trip, userId)) {
          entry.stage = 'request-detail';
          const detail = await options.readRequest(trip.tripRequestId!, controller.signal);
          if (!current()) { releaseAttempt(); return; }
          const liveTrips = driverEntryTrips(latest.current.options, entry);
          if (!liveTrips) { entry.attempt = ''; return; }
          const listed = liveTrips.find(item => item.id === trip.id);
          if (listed && isAcceptedRequestTrip(listed, userId) && listed.tripRequestId === trip.tripRequestId &&
            canResumeAcceptedRequest(detail, trip, userId, liveTrips)) destination = `/request-details/${detail.id}`;
        }
      } else if (dispatchId) {
        const offer = await options.readDispatch(dispatchId, controller.signal);
        if (offer.id === dispatchId && offer.driverId === userId && offer.actionable && Date.parse(offer.expiresAt) > Date.parse(offer.serverNow))
          destination = { pathname: '/incoming-driver', params: { id: dispatchId, kind: 'dispatch', driverId: userId } };
      } else {
        const detail = await options.readRequest(alert?.id ?? request!.id, controller.signal);
        if (detail.id === (alert?.id ?? request!.id) && (alert
          ? detail.passengerId !== userId && !detail.immediateDispatch && isRequestUnassigned(detail) && isTripRequestWithinAcceptanceWindow(detail)
          : isOwnWaitingRequest(detail, userId))) destination = `/request-details/${detail.id}`;
      }
      if (!current()) { releaseAttempt(); return; }
      // Recheck at the handoff, not on settled Home. Validate all reservation
      // and alert guards below AGAIN after this potentially asynchronous read.
      if (destination && options.verifyPriority) {
        const priority = await options.verifyPriority(controller.signal);
        if (!current()) { releaseAttempt(); return; }
        if (priority) { navigate(priority); return; }
      }
      if (!booking && latest.current.options.driver && selectBookingEntryAlert(latest.current.options.alerts, userId, entry.rejected)) {
        releaseAttempt(); return;
      }
      if (!booking && !alert && !dispatchId && latest.current.options.driver &&
        (selectRequestAlert(latest.current.options.alerts, userId, entry.rejected) ||
          (latest.current.options.pendingDispatchId && !entry.rejected.has(`dispatch:${latest.current.options.pendingDispatchId}`)))) {
        releaseAttempt(); return;
      }
      if (dispatchId && !alert && latest.current.options.pendingDispatchId !== dispatchId) { entry.rejected.add(key); return; }
      if (alert && !latest.current.options.alerts.some(item => item.key === key &&
        (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))) { entry.rejected.add(key); return; }
      if (booking?.alertKey && !latest.current.options.alerts.some(item => item.key === booking.alertKey &&
        (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))) { entry.rejected.add(key); return; }
      if (booking && !booking.alertKey) {
        const liveTrips = driverEntryTrips(latest.current.options, entry);
        if (!liveTrips) { releaseAttempt(); return; }
        if (!isPendingBookingEntryListed(booking, liveTrips, userId) &&
          !(typeof destination === 'string' && destination.startsWith('/trip/navigate/'))) {
          entry.rejected.add(key); return;
        }
      }
      if (!bookingAlert && !alert && !dispatchId && entrySummary(latest.current.options, entry.since)?.hasLiveActivity === false) {
        entry.rejected.add(key); return;
      }
      if (destination) {
        if (verifiedBooking) options.prepareBookingEntry?.(verifiedBooking);
        navigate(destination);
      }
      else entry.rejected.add(key);
    })().catch(error => {
      if (!current()) return;
      // A deleted/now-private order is not a network failure and must not trap entry.
      if ([403, 404, 410].includes(Number(error?.status))) entry.rejected.add(key);
      else {
        entry.redirecting = false; entry.failed = true;
        reportEntryFailure(entry.stage, entry.stage === 'navigation' ? 'navigation' : 'read', startedAt, error);
      }
    }).finally(() => {
      if (generation !== entry.generation) return;
      entry.pending = false;
      if (entry.mounted && latest.current.entry === entry) touch();
    });
  }, [entry, options, touch]);
  const pending = Boolean(options.userId && !isRideResumeEntryTransition(options.path) && canResumeRequestFromPath(options.path) &&
    !options.hasOngoingRide && (entry.redirecting || (!entry.done && (!entry.checked || entry.pending || entry.failed))));
  const failed = entry.failed || !options.online;
  const attemptGeneration = entry.generation;
  useEffect(() => {
    if (!pending || !options.active || options.ridePending || options.overlayBusy || failed) return;
    const startedAt = Date.now();
    entry.deadline ||= startedAt + ENTRY_LOAD_TIMEOUT_MS;
    const generation = entry.generation;
    const timer = setTimeout(() => {
      if (!entry.mounted || latest.current.entry !== entry || entry.generation !== generation) return;
      reportEntryFailure(entry.stage, 'timeout', startedAt);
      entry.generation++; entry.controller?.abort(); entry.pending = false;
      entry.failed = true; touch();
    }, Math.max(0, entry.deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [entry, attemptGeneration, pending, options.active, options.ridePending, options.overlayBusy, failed, touch]);
  const retry = useCallback(() => {
    if (!entry.mounted || latest.current.entry !== entry || !latest.current.options.active || !latest.current.options.online ||
      (entry.done && !entry.redirecting)) return;
    entry.generation++; entry.controller?.abort(); entry.pending = false;
    if (entry.redirecting) { entry.done = false; entry.redirecting = false; }
    entry.failed = false; entry.attempt = ''; entry.deadline = 0; entry.rejected.clear(); touch();
    const version = getTokenSessionVersion();
    void Promise.resolve().then(() => {
      if (entry.mounted && latest.current.entry === entry && latest.current.options.active &&
        latest.current.options.online && version === getTokenSessionVersion() && !entry.done) return latest.current.options.refresh();
    }).catch(() => {
      if (entry.mounted && latest.current.entry === entry && version === getTokenSessionVersion() && !entry.done) {
        entry.failed = true; touch();
      }
    });
  }, [entry, touch]);
  const dismiss = useCallback(() => { entry.generation++; entry.controller?.abort(); entry.pending = false;
    entry.done = true; entry.redirecting = false; touch(); }, [entry, touch]);
  return { pending, failed, retry, dismiss };
}
