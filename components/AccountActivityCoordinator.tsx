import { useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useAppIsActive, useAppIsForeground } from '@/hooks/useAppIsActive';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store';
import { selectIsAuthenticated } from '@/store/selectors';
import { accountActivityApi, useGetAccountActivityQuery, type ActivityCategory } from '@/store/api/accountActivityApi';
import { tripApi, useGetMyActivityTripsQuery } from '@/store/api/tripApi';
import { bookingApi, useGetMyActivityBookingsQuery } from '@/store/api/bookingApi';
import { tripRequestApi, useGetMyActivityRequestsQuery } from '@/store/api/tripRequestApi';
import { createActivityReconciliation } from '@/features/activity/activityReconciliation';
import { beginActivityReadiness, getActivityReadiness } from '@/services/activityReadiness';
import { readEntryQuery, reportEntryFailure } from '@/services/entryRecovery';
import { getAppActiveSince, isAppForeground } from '@/services/appActivity';
import { isEntryReadFresh } from '@/features/navigation/entryFreshness';

const EMPTY_SELECTION = {};
const selectNothing = () => EMPTY_SELECTION;

/** Sole owner of background activity discovery, not of GPS or payment mutations. */
export function AccountActivityCoordinator() {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.user?.id);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const foreground = useAppIsForeground();
  const active = useAppIsActive();
  const since = getAppActiveSince();
  const enabled = Boolean(isAuthenticated && userId && foreground && online);
  const [legacyAccount, setLegacyAccount] = useState<string | null>(null);
  const legacy = legacyAccount === userId;
  const { hasLiveActivity } = accountActivityApi.endpoints.getAccountActivity.useQueryState(userId ?? '', {
    selectFromResult: result => ({ hasLiveActivity: result.data?.hasLiveActivity ?? false }),
  });
  const summary = useGetAccountActivityQuery(userId ?? '', {
    skip: !enabled || legacy,
    pollingInterval: active ? (hasLiveActivity ? 30_000 : 60_000) : 0,
    skipPollingIfUnfocused: true,
    // Re-enable once on foreground/reconnect; other consumers do not also refetch on focus.
    // Even a brief absence can include a trip start on another device. Refresh
    // this small summary once; unchanged revisions still reuse the existing lists.
    refetchOnMountOrArgChange: true,
    refetchOnFocus: false, refetchOnReconnect: false,
  });

  // Rolling deployment safety: only a missing endpoint allows the former three polls.
  // A timeout/503/401/invalid payload never means there is no ride/payment to recover.
  const fallbackOptions = { skip: !enabled || !legacy, pollingInterval: active ? 60_000 : 0,
    refetchOnMountOrArgChange: true, refetchOnFocus: false, refetchOnReconnect: false,
    skipPollingIfUnfocused: true, selectFromResult: selectNothing };
  useGetMyActivityTripsQuery(undefined, fallbackOptions);
  useGetMyActivityBookingsQuery(undefined, { ...fallbackOptions, pollingInterval: active ? 45_000 : 0 });
  useGetMyActivityRequestsQuery(undefined, fallbackOptions);

  // forceRefetch is still deduplicated by RTK against an old in-flight GET.
  // Once that GET settles, replace it once. Never use its stale empty snapshot
  // to close this visit or reconcile lists. Shared GETs are not aborted here.
  const repaired = useRef('');
  const repairWait = useRef<AbortController | null>(null);
  useEffect(() => () => { repairWait.current?.abort(); }, [enabled, since, userId]);
  useEffect(() => {
    if (!enabled || legacy || !userId || summary.isFetching || summary.isError || !summary.currentData ||
      summary.currentData.userId !== userId || isEntryReadFresh(summary, since)) return;
    const key = `${userId}:${since}:${summary.startedTimeStamp}:${summary.fulfilledTimeStamp}`;
    if (repaired.current === key) return;
    repaired.current = key;
    repairWait.current?.abort();
    const controller = new AbortController(); repairWait.current = controller;
    void readEntryQuery({ stage: 'activity', signal: controller.signal,
      current: () => isAppForeground() && reduxStore.getState().auth.user?.id === userId && getAppActiveSince() === since,
      running: () => dispatch(accountActivityApi.util.getRunningQueryThunk('getAccountActivity', userId)),
      reuse: () => {
        const read = accountActivityApi.endpoints.getAccountActivity.select(userId)(reduxStore.getState());
        return read.isSuccess && isEntryReadFresh(read, since) ? read.data : undefined;
      },
      start: () => dispatch(accountActivityApi.endpoints.getAccountActivity.initiate(userId, { subscribe: false, forceRefetch: true })),
    }).catch(() => { /* Shared query exposes the failure and the existing retry action. */ });
    // Query pending/fulfilled rerenders must not cancel their own replacement.
    // The current predicate fences account/foreground changes before queued work.
  }, [dispatch, enabled, legacy, reduxStore, since, summary.currentData, summary.fulfilledTimeStamp,
    summary.isFetching, summary.isError, summary.startedTimeStamp, userId]);

  useEffect(() => {
    if (!isAuthenticated) setLegacyAccount(null);
    const error = summary.error;
    if (enabled && error && !summary.isFetching) reportEntryFailure('activity', 'read', summary.startedTimeStamp ?? Date.now(), error);
    if (enabled && error && 'status' in error && [404, 405].includes(Number(error.status))) {
      setLegacyAccount(userId ?? null);
    }
  }, [enabled, isAuthenticated, summary.error, summary.isFetching, summary.startedTimeStamp, userId]);

  const reconciler = useRef<ReturnType<typeof createActivityReconciliation> | null>(null);
  useEffect(() => {
    if (!enabled || legacy || !userId) return;
    let active = true;
    const controller = new AbortController();
    const readiness = beginActivityReadiness(userId);
    const listState = (category: ActivityCategory) => {
      const state = reduxStore.getState();
      if (category === 'trips') return tripApi.endpoints.getMyActivityTrips.select()(state);
      if (category === 'bookings') return bookingApi.endpoints.getMyActivityBookings.select()(state);
      return tripRequestApi.endpoints.getMyActivityRequests.select()(state);
    };
    const current = createActivityReconciliation({
      hasAppliedRevision(category, revision) {
        const saved = getActivityReadiness();
        const receipt = saved?.userId === userId ? saved.reads[category] : undefined;
        const read = listState(category);
        return Boolean(receipt && receipt.revision === revision && read.isSuccess && !read.isError &&
          read.fulfilledTimeStamp === receipt.fulfilledTimeStamp && Array.isArray(read.data));
      },
      onApplied(category, revision) {
        if (!active || reduxStore.getState().auth.user?.id !== userId) return;
        const read = listState(category);
        if (read.isSuccess && !read.isError) readiness.record(category, revision, read.fulfilledTimeStamp);
      },
      hasFailedRead(category) {
        const state = reduxStore.getState();
        if (category === 'trips') return tripApi.endpoints.getMyActivityTrips.select()(state).isError;
        if (category === 'bookings') return bookingApi.endpoints.getMyActivityBookings.select()(state).isError;
        return tripRequestApi.endpoints.getMyActivityRequests.select()(state).isError;
      },
      hasCachedItems(category) {
        const state = reduxStore.getState();
        if (category === 'trips') return Boolean(tripApi.endpoints.getMyActivityTrips.select()(state).data?.length);
        if (category === 'bookings') return Boolean(bookingApi.endpoints.getMyActivityBookings.select()(state).data?.length);
        return Boolean(tripRequestApi.endpoints.getMyActivityRequests.select()(state).data?.length);
      },
      async load(category: ActivityCategory) {
        const running = () => category === 'trips'
          ? dispatch(tripApi.util.getRunningQueryThunk('getMyActivityTrips', undefined))
          : category === 'bookings'
            ? dispatch(bookingApi.util.getRunningQueryThunk('getMyActivityBookings', undefined))
            : dispatch(tripRequestApi.util.getRunningQueryThunk('getMyActivityRequests', undefined));
        // A read begun BEFORE the snapshot might still return old data. Do not mark
        // the new revision applied merely because RTK deduplicated against that read.
        const options = { subscribe: false, forceRefetch: true };
        await readEntryQuery<unknown>({ stage: category, running, signal: controller.signal,
          current: () => active && reduxStore.getState().auth.user?.id === userId,
          start: () => category === 'trips' ? dispatch(tripApi.endpoints.getMyActivityTrips.initiate(undefined, options))
            : category === 'bookings' ? dispatch(bookingApi.endpoints.getMyActivityBookings.initiate(undefined, options))
              : dispatch(tripRequestApi.endpoints.getMyActivityRequests.initiate(undefined, options)),
        });
      },
    });
    reconciler.current = current;
    return () => { active = false; controller.abort(); current.dispose(); readiness.dispose(); reconciler.current = null; };
  }, [dispatch, enabled, legacy, reduxStore, userId]);

  useEffect(() => {
    // Fulfilled timestamp permits retrying a failed detail read after an identical snapshot.
    if (!enabled || summary.isFetching || summary.isError || !summary.currentData || summary.currentData.userId !== userId ||
      !isEntryReadFresh(summary, since)) return;
    void reconciler.current?.apply(summary.currentData);
  }, [enabled, since, summary.currentData, summary.startedTimeStamp, summary.fulfilledTimeStamp, summary.isFetching, summary.isError, userId]);
  return null;
}
