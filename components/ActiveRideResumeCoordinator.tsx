import { useCallback, useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';
import type { RootState } from '@/store';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { tripApi } from '@/store/api/tripApi';
import { bookingApi } from '@/store/api/bookingApi';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useActiveRideResume } from '@/hooks/navigation/useActiveRideResume';
import { useRideOverlay } from '@/features/navigation/RideOverlayProvider';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { isAppActive } from '@/services/appActivity';

const noSubscribe = () => () => {};
const busyWithoutHost = () => true;

export function ActiveRideResumeCoordinator() {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const authenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.user?.id);
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const active = useAppIsActive();
  const path = usePathname();
  const navigation = useRootNavigationState();
  const router = useRouter();
  const { store: overlays } = useRideOverlay();
  const overlayBusy = useSyncExternalStore(overlays?.subscribe ?? noSubscribe, overlays?.isBusy ?? busyWithoutHost, busyWithoutHost);
  // Observe the shared discovery cache; do not add list subscriptions or a polling loop.
  const trips = tripApi.endpoints.getMyActivityTrips.useQueryState(undefined);
  const bookings = bookingApi.endpoints.getMyActivityBookings.useQueryState(undefined);
  const readTrip = useCallback(async (id: string) => {
    const version = getTokenSessionVersion();
    const pending = dispatch(tripApi.util.getRunningQueryThunk('getTripById', id));
    if (pending) await pending;
    if (version !== getTokenSessionVersion() || !isAppActive() || reduxStore.getState().auth.user?.id !== userId) {
      throw new Error('Stale ride entry');
    }
    return dispatch(tripApi.endpoints.getTripById.initiate(id, { subscribe: false, forceRefetch: true })).unwrap();
  }, [dispatch, reduxStore, userId]);
  const readBooking = useCallback(async (id: string) => {
    const version = getTokenSessionVersion();
    const pending = dispatch(bookingApi.util.getRunningQueryThunk('getBookingById', id));
    if (pending) await pending;
    if (version !== getTokenSessionVersion() || !isAppActive() || reduxStore.getState().auth.user?.id !== userId) {
      throw new Error('Stale ride entry');
    }
    return dispatch(bookingApi.endpoints.getBookingById.initiate(id, { subscribe: false, forceRefetch: true })).unwrap();
  }, [dispatch, reduxStore, userId]);
  useActiveRideResume({ userId: authenticated ? userId : undefined, active, online, path,
    ready: Boolean(navigation?.key), overlayBusy, trips, bookings, readTrip, readBooking,
    replace: router.replace });
  return null;
}
