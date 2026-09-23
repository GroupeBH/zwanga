import { useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store';
import { selectIsAuthenticated } from '@/store/selectors';
import { accountActivityApi, useGetAccountActivityQuery, type ActivityCategory } from '@/store/api/accountActivityApi';
import { tripApi, useGetMyActivityTripsQuery } from '@/store/api/tripApi';
import { bookingApi, useGetMyActivityBookingsQuery } from '@/store/api/bookingApi';
import { tripRequestApi, useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import { createActivityReconciliation } from '@/features/activity/activityReconciliation';

const EMPTY_SELECTION = {};
const selectNothing = () => EMPTY_SELECTION;

/** Sole owner of background activity discovery, not of GPS or payment mutations. */
export function AccountActivityCoordinator() {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.user?.id);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const foreground = useAppIsActive();
  const enabled = Boolean(isAuthenticated && userId && foreground && online);
  const [legacyAccount, setLegacyAccount] = useState<string | null>(null);
  const legacy = legacyAccount === userId;
  const { hasLiveActivity } = accountActivityApi.endpoints.getAccountActivity.useQueryState(userId ?? '', {
    selectFromResult: result => ({ hasLiveActivity: result.data?.hasLiveActivity ?? false }),
  });
  const summary = useGetAccountActivityQuery(userId ?? '', {
    skip: !enabled || legacy,
    pollingInterval: hasLiveActivity ? 30_000 : 60_000,
    skipPollingIfUnfocused: true,
    // Re-enable once on foreground/reconnect; other consumers do not also refetch on focus.
    refetchOnMountOrArgChange: true,
    refetchOnFocus: false, refetchOnReconnect: false,
  });

  // Rolling deployment safety: only a missing endpoint allows the former three polls.
  // A timeout/503/401/invalid payload never means there is no ride/payment to recover.
  const fallbackOptions = { skip: !enabled || !legacy, pollingInterval: 60_000,
    refetchOnMountOrArgChange: true, refetchOnFocus: false, refetchOnReconnect: false,
    skipPollingIfUnfocused: true, selectFromResult: selectNothing };
  useGetMyActivityTripsQuery(undefined, fallbackOptions);
  useGetMyActivityBookingsQuery(undefined, { ...fallbackOptions, pollingInterval: 45_000 });
  useGetMyTripRequestsQuery(undefined, fallbackOptions);

  useEffect(() => {
    if (!isAuthenticated) setLegacyAccount(null);
    const error = summary.error;
    if (enabled && error && 'status' in error && [404, 405].includes(Number(error.status))) {
      setLegacyAccount(userId ?? null);
    }
  }, [enabled, isAuthenticated, summary.error, userId]);

  const reconciler = useRef<ReturnType<typeof createActivityReconciliation> | null>(null);
  useEffect(() => {
    if (!enabled || legacy || !userId) return;
    let active = true;
    const current = createActivityReconciliation({
      hasFailedRead(category) {
        const state = reduxStore.getState();
        if (category === 'trips') return tripApi.endpoints.getMyActivityTrips.select()(state).isError;
        if (category === 'bookings') return bookingApi.endpoints.getMyActivityBookings.select()(state).isError;
        return tripRequestApi.endpoints.getMyTripRequests.select()(state).isError;
      },
      hasCachedItems(category) {
        const state = reduxStore.getState();
        if (category === 'trips') return Boolean(tripApi.endpoints.getMyActivityTrips.select()(state).data?.length);
        if (category === 'bookings') return Boolean(bookingApi.endpoints.getMyActivityBookings.select()(state).data?.length);
        return Boolean(tripRequestApi.endpoints.getMyTripRequests.select()(state).data?.length);
      },
      async load(category: ActivityCategory) {
        const pending = category === 'trips'
          ? dispatch(tripApi.util.getRunningQueryThunk('getMyActivityTrips', undefined))
          : category === 'bookings'
            ? dispatch(bookingApi.util.getRunningQueryThunk('getMyActivityBookings', undefined))
            : dispatch(tripRequestApi.util.getRunningQueryThunk('getMyTripRequests', undefined));
        // A read begun BEFORE the snapshot might still return old data. Do not mark
        // the new revision applied merely because RTK deduplicated against that read.
        if (pending) await pending;
        if (!active || reduxStore.getState().auth.user?.id !== userId) return;
        const options = { subscribe: false, forceRefetch: true };
        if (category === 'trips') await dispatch(tripApi.endpoints.getMyActivityTrips.initiate(undefined, options)).unwrap();
        else if (category === 'bookings') await dispatch(bookingApi.endpoints.getMyActivityBookings.initiate(undefined, options)).unwrap();
        else await dispatch(tripRequestApi.endpoints.getMyTripRequests.initiate(undefined, options)).unwrap();
      },
    });
    reconciler.current = current;
    return () => { active = false; current.dispose(); reconciler.current = null; };
  }, [dispatch, enabled, legacy, reduxStore, userId]);

  useEffect(() => {
    // Fulfilled timestamp permits retrying a failed detail read after an identical snapshot.
    if (!enabled || summary.isFetching || summary.isError || !summary.currentData || summary.currentData.userId !== userId) return;
    void reconciler.current?.apply(summary.currentData);
  }, [enabled, summary.currentData, summary.fulfilledTimeStamp, summary.isFetching, summary.isError, userId]);
  return null;
}
