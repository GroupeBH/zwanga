import { type ReactNode, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';
import type { RootState } from '@/store';
import { usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { tripApi } from '@/store/api/tripApi';
import { bookingApi } from '@/store/api/bookingApi';
import { accountActivityApi } from '@/store/api/accountActivityApi';
import { userApi } from '@/store/api/userApi';
import { isHomeProfileReady } from '@/features/home/homeRolePolicy';
import { AppEntryContext } from '@/features/navigation/appEntryContext';
import { STARTUP_ROUTES } from '@/features/navigation/homeBackPolicy';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useActiveRideResume } from '@/hooks/navigation/useActiveRideResume';
import { useRideOverlay } from '@/features/navigation/RideOverlayProvider';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getAppActiveSince, isAppActive } from '@/services/appActivity';
import { HomeRoleLoader } from '@/components/home/HomeRoleLoader';
import { StyleSheet, View } from 'react-native';
import { setRideSpeechEntryGate } from '@/services/rideEntryAnnouncement';
import { findRideToResume, isRideNavigationPath, isRideResumeEntryTransition } from '@/features/navigation/activeRideResume';
import { tripRequestApi } from '@/store/api/tripRequestApi';
import { driverDispatchApi } from '@/store/api/driverDispatchApi';
import { useRequestEntryResume } from '@/hooks/navigation/useRequestEntryResume';
import { getRideAlertsRevision, pendingRideAlerts, subscribeRideAlerts } from '@/services/rideAlertSession';
import { isDriverAccount } from '@/utils/accountRole';
import { getActivityReadiness, subscribeActivityReadiness } from '@/services/activityReadiness';
import { readEntryQuery, reportEntryFailure } from '@/services/entryRecovery';
import { freshEntryData } from '@/features/navigation/entryFreshness';
import { useEntryPresentation } from '@/hooks/navigation/useEntryPresentation';
import { HomeEntryStatusContext } from '@/features/navigation/homeEntryStatusContext';
import { primePendingBookingTrip } from '@/store/api/booking/entrySnapshot';

const noSubscribe = () => () => {};
const busyWithoutHost = () => true;
const selectEntryUserId = (state: RootState) => state.auth.tokenPayload?.sub ?? state.auth.tokenPayload?.userId ?? state.auth.user?.id;

export function ActiveRideResumeCoordinator({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const authenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(selectEntryUserId);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const active = useAppIsActive();
  const sessionVersion = getTokenSessionVersion();
  // Shared native timestamp, not the mount time of each child: a summary may
  // already have finished when profile hydration lets entry render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => getAppActiveSince(), [active, userId, sessionVersion]);
  const path = usePathname();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const router = useRouter();
  const { store: overlays } = useRideOverlay();
  const overlayBusy = useSyncExternalStore(overlays?.subscribe ?? noSubscribe, overlays?.isBusy ?? busyWithoutHost, busyWithoutHost);
  // Observe the shared discovery cache; do not add list subscriptions or a polling loop.
  const trips = tripApi.endpoints.getMyActivityTrips.useQueryState(undefined);
  const bookings = bookingApi.endpoints.getMyActivityBookings.useQueryState(undefined);
  const requests = tripRequestApi.endpoints.getMyTripRequests.useQueryState(undefined);
  const activity = accountActivityApi.endpoints.getAccountActivity.useQueryState(userId ?? '');
  const reconciled = useSyncExternalStore(subscribeActivityReadiness, getActivityReadiness, getActivityReadiness);
  // Home owns the existing profile subscription. Observe it without a second fetch.
  const profile = userApi.endpoints.getCurrentUser.useQueryState(undefined);
  const dispatchStatus = driverDispatchApi.endpoints.driverDispatchStatus.useQueryState(undefined);
  const homeRoleReady = isHomeProfileReady(profile.data?.id === userId ? profile.data : undefined);
  useEffect(() => {
    if (active && authenticated && profile.isError && !profile.isFetching)
      reportEntryFailure('profile', 'read', profile.startedTimeStamp ?? Date.now(), profile.error);
  }, [active, authenticated, profile.isError, profile.isFetching, profile.error, profile.startedTimeStamp]);
  const alertRevision = useSyncExternalStore(subscribeRideAlerts, getRideAlertsRevision, getRideAlertsRevision);
  // Revision/focus invalidates the snapshot even when its owner is unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => userId ? pendingRideAlerts(userId) : [], [userId, alertRevision, active]);
  const currentRead = useCallback(() => {
    const version = getTokenSessionVersion();
    return () => Boolean(userId && version === getTokenSessionVersion() && isAppActive() && selectEntryUserId(reduxStore.getState()) === userId);
  }, [reduxStore, userId]);
  const readRequest = useCallback((id: string, signal?: AbortSignal) => readEntryQuery({
    stage: 'request-detail', signal, current: currentRead(),
    reuse: () => freshEntryData(tripRequestApi.endpoints.getTripRequestById.select(id)(reduxStore.getState()), Date.now(), since),
    running: () => dispatch(tripRequestApi.util.getRunningQueryThunk('getTripRequestById', id)),
    start: () => dispatch(tripRequestApi.endpoints.getTripRequestById.initiate(id, { subscribe: false, forceRefetch: true })),
  }), [dispatch, currentRead, reduxStore, since]);
  const readDispatch = useCallback((id: string, signal?: AbortSignal) => readEntryQuery({
    stage: 'dispatch-detail', signal, current: currentRead(),
    start: () => dispatch(driverDispatchApi.endpoints.getDispatchOffer.initiate(id, { subscribe: false, forceRefetch: true })),
  }), [dispatch, currentRead]);
  const readTrip = useCallback((id: string, signal?: AbortSignal) => readEntryQuery({
    stage: 'trip-detail', signal, current: currentRead(),
    reuse: () => freshEntryData(tripApi.endpoints.getTripById.select(id)(reduxStore.getState()), Date.now(), since),
    running: () => dispatch(tripApi.util.getRunningQueryThunk('getTripById', id)),
    start: () => dispatch(tripApi.endpoints.getTripById.initiate(id, { subscribe: false, forceRefetch: true })),
  }), [dispatch, currentRead, reduxStore, since]);
  const readBooking = useCallback((id: string, signal?: AbortSignal) => readEntryQuery({
    stage: 'booking-detail', signal, current: currentRead(),
    reuse: () => freshEntryData(bookingApi.endpoints.getBookingById.select(id)(reduxStore.getState()), Date.now(), since),
    running: () => dispatch(bookingApi.util.getRunningQueryThunk('getBookingById', id)),
    start: () => dispatch(bookingApi.endpoints.getBookingById.initiate(id, { subscribe: false, forceRefetch: true })),
  }), [dispatch, currentRead, reduxStore, since]);
  const refreshActivity = useCallback(async () => {
    if (!userId || !isAppActive() || selectEntryUserId(reduxStore.getState()) !== userId) return;
    await readEntryQuery({ stage: 'activity', current: currentRead(),
      running: () => dispatch(accountActivityApi.util.getRunningQueryThunk('getAccountActivity', userId)),
      start: () => dispatch(accountActivityApi.endpoints.getAccountActivity.initiate(userId, { subscribe: false, forceRefetch: true })) });
  }, [dispatch, reduxStore, userId, currentRead]);
  const retryProfile = useCallback(async () => {
    if (!userId || !isAppActive() || selectEntryUserId(reduxStore.getState()) !== userId) return;
    await readEntryQuery({ stage: 'profile', current: currentRead(),
      start: () => dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { subscribe: false, forceRefetch: true })) });
  }, [dispatch, reduxStore, userId, currentRead]);
  const entryNavigationReady = Boolean(navigation?.key && segments[0] && !STARTUP_ROUTES.has(segments[0]));
  const freshActivity = freshEntryData(activity, Date.now(), since);
  const presentation = useEntryPresentation({ userId: authenticated ? userId : undefined, active, path, since,
    ready: entryNavigationReady && !isRideResumeEntryTransition(path), replace: router.replace,
    fastHome: Boolean(homeRoleReady && freshActivity && freshActivity.userId === userId && !freshActivity.hasLiveActivity &&
      !alerts.length && !dispatchStatus.data?.pendingOfferId),
  });
  const resume = useActiveRideResume({ userId: authenticated ? userId : undefined, active, online, path, since,
    // '/' can still be the startup Redirect. Let it finish before replacing the route,
    // otherwise its own Home redirect can overwrite a successful ride resume.
    ready: entryNavigationReady,
    overlayBusy, trips, bookings, activity, reconciled, readTrip, readBooking,
    replace: presentation.replace, refreshActivity,
    homeRole: { ready: homeRoleReady, failed: !profile.isFetching && (profile.isError || profile.isSuccess), retry: retryProfile } });
  const requestResume = useRequestEntryResume({ userId: authenticated ? userId : undefined, active, online, path, since,
    ready: entryNavigationReady, overlayBusy, ridePending: resume.pending,
    hasOngoingRide: Boolean((typeof presentation.proposal === 'string' && isRideNavigationPath(presentation.proposal)) ||
      (resume.pending && userId && findRideToResume(userId, trips.data, bookings.data))),
    driver: homeRoleReady && isDriverAccount(profile.data), profileReady: homeRoleReady,
    pendingDispatchId: dispatchStatus.isSuccess && !dispatchStatus.isFetching && !dispatchStatus.isError && dispatchStatus.data?.enabled
      ? dispatchStatus.data.pendingOfferId : null,
    requests, trips, activity, reconciled, alerts, readRequest, readTrip, readBooking, readDispatch,
    verifyPriority: resume.verifyPriority,
    prepareBookingEntry: snapshot => { if (userId) dispatch(primePendingBookingTrip(snapshot, userId)); },
    replace: presentation.replaceRequest, refresh: refreshActivity });
  const entryPending = resume.pending || requestResume.pending;
  const failed = resume.pending ? resume.failed : requestResume.failed;
  const blocking = entryPending && !presentation.released && !failed && online;
  const { reveal } = presentation;
  useEffect(() => {
    if (entryNavigationReady && !isRideResumeEntryTransition(path) && (!entryPending || failed || !online)) reveal();
  }, [entryNavigationReady, path, entryPending, failed, online, reveal]);
  const retry = () => { if (resume.pending) resume.retry(); else requestResume.retry(); };
  const onHome = path === '/' || path === '/(tabs)';
  const proposal = presentation.proposal;
  const actionLabel = proposal ? typeof proposal === 'string' && /\/(trip|booking)\/navigate\//.test(proposal)
    ? 'Reprendre mon trajet' : typeof proposal === 'object' && proposal.pathname === '/trip/manage/[id]'
      ? 'Voir la réservation' : 'Voir la demande' : undefined;
  useEffect(() => {
    if (authenticated && userId) setRideSpeechEntryGate({ userId, path,
      blocked: !active || !entryNavigationReady || isRideResumeEntryTransition(path) || entryPending || overlayBusy });
  }, [authenticated, userId, path, active, entryNavigationReady, entryPending, overlayBusy]);
  // A sibling above the mounted navigator, not a native modal or a replacement
  // navigator: route changes can complete without revealing the Home in between.
  return <AppEntryContext.Provider value={blocking}>
    <HomeEntryStatusContext.Provider value={!blocking && active && authenticated && homeRoleReady && onHome && !overlayBusy && (entryPending || proposal)
      ? { failed, offline: !online, actionLabel, onAction: proposal ? presentation.open : retry } : null}>
      {children}
    </HomeEntryStatusContext.Provider>
    {blocking && active && !overlayBusy && <View style={styles.cover} accessibilityViewIsModal testID="active-ride-entry">
      <HomeRoleLoader failed={false} retrying={false} active={active}
        onRetry={retry}
        loadingLabel="Ouverture de Zwanga" />
    </View>}
  </AppEntryContext.Provider>;
}

const styles = StyleSheet.create({ cover: { ...StyleSheet.absoluteFillObject, zIndex: 10000, elevation: 100 } });
