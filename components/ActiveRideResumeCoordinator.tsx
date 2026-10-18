import { type ReactNode, useCallback, useSyncExternalStore } from 'react';
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
import { isAppActive } from '@/services/appActivity';
import { HomeRoleLoader } from '@/components/home/HomeRoleLoader';
import { StyleSheet, View } from 'react-native';

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
  const path = usePathname();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const router = useRouter();
  const { store: overlays } = useRideOverlay();
  const overlayBusy = useSyncExternalStore(overlays?.subscribe ?? noSubscribe, overlays?.isBusy ?? busyWithoutHost, busyWithoutHost);
  // Observe the shared discovery cache; do not add list subscriptions or a polling loop.
  const trips = tripApi.endpoints.getMyActivityTrips.useQueryState(undefined);
  const bookings = bookingApi.endpoints.getMyActivityBookings.useQueryState(undefined);
  const activity = accountActivityApi.endpoints.getAccountActivity.useQueryState(userId ?? '');
  // Home owns the existing profile subscription. Observe it without a second fetch.
  const profile = userApi.endpoints.getCurrentUser.useQueryState(undefined);
  const homeRoleReady = isHomeProfileReady(profile.data?.id === userId ? profile.data : undefined);
  const readTrip = useCallback(async (id: string) => {
    const version = getTokenSessionVersion();
    const pending = dispatch(tripApi.util.getRunningQueryThunk('getTripById', id));
    if (pending) await pending;
    if (version !== getTokenSessionVersion() || !isAppActive() || selectEntryUserId(reduxStore.getState()) !== userId) {
      throw new Error('Stale ride entry');
    }
    return dispatch(tripApi.endpoints.getTripById.initiate(id, { subscribe: false, forceRefetch: true })).unwrap();
  }, [dispatch, reduxStore, userId]);
  const readBooking = useCallback(async (id: string) => {
    const version = getTokenSessionVersion();
    const pending = dispatch(bookingApi.util.getRunningQueryThunk('getBookingById', id));
    if (pending) await pending;
    if (version !== getTokenSessionVersion() || !isAppActive() || selectEntryUserId(reduxStore.getState()) !== userId) {
      throw new Error('Stale ride entry');
    }
    return dispatch(bookingApi.endpoints.getBookingById.initiate(id, { subscribe: false, forceRefetch: true })).unwrap();
  }, [dispatch, reduxStore, userId]);
  const refreshActivity = useCallback(async () => {
    if (!userId || !isAppActive() || selectEntryUserId(reduxStore.getState()) !== userId) return;
    await dispatch(accountActivityApi.endpoints.getAccountActivity.initiate(userId, { subscribe: false, forceRefetch: true })).unwrap();
  }, [dispatch, reduxStore, userId]);
  const retryProfile = useCallback(async () => {
    if (!userId || !isAppActive() || selectEntryUserId(reduxStore.getState()) !== userId) return;
    await dispatch(userApi.endpoints.getCurrentUser.initiate(undefined, { subscribe: false, forceRefetch: true })).unwrap();
  }, [dispatch, reduxStore, userId]);
  const resume = useActiveRideResume({ userId: authenticated ? userId : undefined, active, online, path,
    // '/' can still be the startup Redirect. Let it finish before replacing the route,
    // otherwise its own Home redirect can overwrite a successful ride resume.
    ready: Boolean(navigation?.key && segments[0] && !STARTUP_ROUTES.has(segments[0])),
    overlayBusy, trips, bookings, activity, readTrip, readBooking,
    replace: router.replace, refreshActivity,
    homeRole: { ready: homeRoleReady, failed: !profile.isFetching && (profile.isError || profile.isSuccess), retry: retryProfile } });
  // A sibling above the mounted navigator, not a native modal or a replacement
  // navigator: route changes can complete without revealing the Home in between.
  return <AppEntryContext.Provider value={resume.pending}>
    {children}
    {resume.visible && <View style={styles.cover} accessibilityViewIsModal testID="active-ride-entry">
      <HomeRoleLoader failed={resume.failed} retrying={false} active={active} onRetry={resume.retry}
        loadingLabel="Ouverture de Zwanga"
        errorLabel="Impossible d’ouvrir votre espace"
        errorHint="Vérifiez votre connexion, puis réessayez."
        onContinue={homeRoleReady ? () => { resume.dismiss(); router.replace('/(tabs)'); } : undefined} />
    </View>}
  </AppEntryContext.Provider>;
}

const styles = StyleSheet.create({ cover: { ...StyleSheet.absoluteFillObject, zIndex: 10000, elevation: 100 } });
