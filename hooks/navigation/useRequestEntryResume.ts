import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Href } from 'expo-router';
import type { Trip, TripRequest } from '@/types';
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
import { ENTRY_LOAD_TIMEOUT_MS, reportEntryFailure, type EntryStage } from '@/services/entryRecovery';
import { ENTRY_CACHE_MAX_AGE_MS } from '@/features/navigation/entryFreshness';

interface Options {
  userId?: string; active: boolean; online: boolean; ready: boolean; path: string; overlayBusy: boolean;
  ridePending: boolean; hasOngoingRide: boolean; driver: boolean; profileReady: boolean;
  requests: { data?: TripRequest[]; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number };
  trips: { data?: Trip[]; isSuccess: boolean; isFetching?: boolean; fulfilledTimeStamp?: number };
  activity: { data?: AccountActivity; isSuccess: boolean; isFetching?: boolean; isError?: boolean; fulfilledTimeStamp?: number };
  reconciled?: ReconciledActivity | null;
  alerts: RideAlert[];
  pendingDispatchId?: string | null;
  readRequest: (id: string, signal?: AbortSignal) => Promise<TripRequest>;
  readTrip: (id: string, signal?: AbortSignal) => Promise<Trip>;
  readDispatch: (id: string, signal?: AbortSignal) => Promise<{ id: string; driverId: string; actionable: boolean; expiresAt: string; serverNow: string }>;
  replace: (path: Href) => void | boolean;
  refresh: () => Promise<unknown>;
}

function entrySummary(options: Options, since: number) {
  return options.activity.isSuccess && !options.activity.isFetching && !options.activity.isError && options.activity.data?.userId === options.userId &&
    (options.activity.fulfilledTimeStamp ?? 0) >= since ? options.activity.data : undefined;
}

function driverEntryTrips(options: Options, entry: { since: number }): readonly Trip[] | undefined {
  const summary = entrySummary(options, entry.since);
  if (!options.driver || summary?.hasLiveActivity === false || summary?.trips?.count === 0) return [];
  if (options.activity.isFetching) return undefined;
  return isEntryActivityListReady('trips', options.trips, { userId: options.userId!, since: entry.since, summary,
    summaryTime: options.activity.fulfilledTimeStamp, reconciled: options.reconciled }) ? options.trips.data ?? [] : undefined;
}

/** Secondary entry only: ongoing rides are resolved first by useActiveRideResume.
 * Reuses shared discovery, verifies the selected request/trip, never persists a route or starts polling. */
export function useRequestEntryResume(options: Options) {
  const [, advance] = useState(0);
  const entry = useMemo(() => ({ userId: options.userId, active: options.active, since: Date.now() - ENTRY_CACHE_MAX_AGE_MS, path: null as string | null, mounted: true,
    done: false, checked: false, pending: false, redirecting: false, failed: false, attempt: '',
    controller: undefined as AbortController | undefined, generation: 0, deadline: 0, stage: 'activity' as EntryStage,
    rejected: new Set<string>() }), [options.userId, options.active]);
  const latest = useRef({ entry, options }); latest.current = { entry, options };
  useEffect(() => { entry.mounted = true; return () => { entry.mounted = false; entry.controller?.abort(); }; }, [entry]);
  const touch = useCallback(() => advance(value => value + 1), []);
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
    // A ringing request needs an answer before a confirmed but unstarted course.
    // Ongoing navigation above still has absolute priority.
    const alert = options.driver ? selectRequestAlert(options.alerts, userId, entry.rejected) : undefined;
    const dispatchId = alert?.kind === 'dispatch' ? alert.id : !alert && options.driver &&
      options.pendingDispatchId && !entry.rejected.has(`dispatch:${options.pendingDispatchId}`) ? options.pendingDispatchId : undefined;
    const incomingKey = alert?.key ?? (dispatchId ? `dispatch:${dispatchId}` : undefined);
    if (entry.pending) {
      if (!incomingKey || entry.attempt === incomingKey) return;
      // Do not keep a ringing offer behind a slow lower-priority detail read.
      entry.generation++; entry.controller?.abort(); entry.pending = false; entry.attempt = '';
    }
    const summary = entrySummary(options, entry.since);
    const driverTrips = driverEntryTrips(options, entry);
    // Wait for fresh publications before deciding that none starts earlier.
    // Once this entry has settled, later normal activity must not hijack Home.
    if (!alert && !dispatchId && !entry.checked && driverTrips === undefined) return;
    const accepted = !alert && !dispatchId && options.driver && !entry.checked
      ? selectAcceptedRequestTrip(driverTrips ?? [], userId, entry.rejected) : undefined;
    const requestsReady = summary?.hasLiveActivity === false || isEntryActivityListReady('requests', options.requests, {
      userId, since: entry.since, summary, summaryTime: options.activity.fulfilledTimeStamp, reconciled: options.reconciled,
    });
    if (!accepted && !alert && !dispatchId && !requestsReady) return;
    const request = !accepted && !alert && !dispatchId && summary?.requests?.count !== 0 && summary?.hasLiveActivity !== false
      ? selectWaitingRequest(options.requests.data ?? [], userId, entry.rejected) : undefined;
    if (!accepted && !alert && !dispatchId && !request) {
      // A native alert can finish restoring after the account summary. Keep listening
      // only on this entry's original screen, never after a deliberate navigation.
      if (!entry.checked) { entry.checked = true; touch(); }
      return;
    }
    const key = accepted ? acceptedRequestEntryKey(accepted) : alert?.key ?? (dispatchId ? `dispatch:${dispatchId}` : request!.id);
    if (entry.attempt === key) return;
    entry.attempt = key; entry.pending = true; entry.failed = false; touch();
    const generation = ++entry.generation;
    const controller = new AbortController(); entry.controller = controller;
    const startedAt = Date.now();
    entry.deadline = startedAt + ENTRY_LOAD_TIMEOUT_MS;
    entry.stage = accepted ? 'trip-detail' : dispatchId ? 'dispatch-detail' : 'request-detail';
    const version = getTokenSessionVersion();
    const current = () => {
      const next = latest.current;
      return entry.mounted && next.entry === entry && generation === entry.generation && !controller.signal.aborted &&
        !entry.done && version === getTokenSessionVersion() &&
        next.options.userId === userId && next.options.active && next.options.online && next.options.ready &&
        next.options.profileReady && (!(alert || dispatchId || accepted) || next.options.driver) &&
        next.options.path === entry.path && !next.options.ridePending && !next.options.hasOngoingRide && !next.options.overlayBusy;
    };
    const releaseAttempt = () => { if (generation === entry.generation) entry.attempt = ''; };
    void (async () => {
      let destination: Href | null = null;
      if (accepted) {
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
      if (!alert && !dispatchId && latest.current.options.driver &&
        (selectRequestAlert(latest.current.options.alerts, userId, entry.rejected) ||
          (latest.current.options.pendingDispatchId && !entry.rejected.has(`dispatch:${latest.current.options.pendingDispatchId}`)))) {
        releaseAttempt(); return;
      }
      if (dispatchId && !alert && latest.current.options.pendingDispatchId !== dispatchId) { entry.rejected.add(key); return; }
      if (alert && !latest.current.options.alerts.some(item => item.key === key &&
        (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))) { entry.rejected.add(key); return; }
      if (!alert && !dispatchId && latest.current.options.activity.data?.userId === userId &&
        latest.current.options.activity.data.hasLiveActivity === false) { entry.rejected.add(key); return; }
      if (destination) {
        entry.stage = 'navigation'; entry.redirecting = true;
        if (latest.current.options.replace(destination) === false) entry.redirecting = false;
        entry.done = true;
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
