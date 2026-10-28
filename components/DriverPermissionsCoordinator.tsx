import { useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { userApi } from '@/store/api/userApi';
import { accountActivityApi } from '@/store/api/accountActivityApi';
import { tripApi } from '@/store/api/tripApi';
import { bookingApi } from '@/store/api/bookingApi';
import { driverDispatchApi } from '@/store/api/driverDispatchApi';
import { isHomeProfileReady } from '@/features/home/homeRolePolicy';
import { isDriverAccount } from '@/utils/accountRole';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppEntryPending } from '@/features/navigation/appEntryContext';
import { RideOverlayContext } from '@/features/navigation/rideOverlayContext';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { getAppActiveSince } from '@/services/appActivity';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getRideAlertsRevision, pendingRideAlerts, subscribeRideAlerts } from '@/services/rideAlertSession';
import { useNearbyLocationPermission } from '@/hooks/profile/useNearbyLocationPermission';
import { useDriverFullScreenPermission } from '@/hooks/notifications/useDriverFullScreenPermission';
import { useDriverPermissionPrompt } from '@/hooks/notifications/useDriverPermissionPrompt';
import { BackgroundLocationApproval } from '@/components/location/BackgroundLocationApproval';
import { DriverFullScreenApproval } from '@/components/permissions/DriverFullScreenApproval';

const noSubscribe = () => () => {};
const busyWithoutHost = () => true;
const quietRoutes = new Set(['/', '/(tabs)', '/trips', '/recurring-trips']);

export function DriverPermissionsCoordinator() {
  const authenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.tokenPayload?.sub ?? state.auth.tokenPayload?.userId ?? state.auth.user?.id);
  const profile = userApi.endpoints.getCurrentUser.useQueryState(undefined);
  const driver = isHomeProfileReady(profile.data) && profile.data?.id === userId && isDriverAccount(profile.data);
  return authenticated && userId && driver && Platform.OS !== 'web'
    ? <DriverPermissionSession key={`${userId}:${getTokenSessionVersion()}`} userId={userId} /> : null;
}

export function DriverPermissionSession({ userId }: { userId: string }) {
  const active = useAppIsActive();
  const path = usePathname();
  const entryPending = useAppEntryPending();
  const overlay = useContext(RideOverlayContext);
  const overlayBusy = useSyncExternalStore(overlay?.subscribe ?? noSubscribe, overlay?.isBusy ?? busyWithoutHost, busyWithoutHost);
  // Only inspect shared query caches: no new HTTP reads or foreground/background polling.
  const activity = accountActivityApi.endpoints.getAccountActivity.useQueryState(userId);
  const trips = tripApi.endpoints.getMyActivityTrips.useQueryState(undefined);
  const bookings = bookingApi.endpoints.getMyActivityBookings.useQueryState(undefined);
  const dispatch = driverDispatchApi.endpoints.driverDispatchStatus.useQueryState(undefined);
  const revision = useSyncExternalStore(subscribeRideAlerts, getRideAlertsRevision, getRideAlertsRevision);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => pendingRideAlerts(userId), [userId, revision, active]);
  const live = activity.data?.hasLiveActivity ||
    trips.data?.some(trip => trip.driverId === userId && trip.status === 'ongoing') ||
    bookings.data?.some(booking => booking.passengerId === userId && booking.status === 'accepted' && booking.trip?.status === 'ongoing');
  const fresh = activity.data?.userId === userId && !activity.isError && !activity.isFetching &&
    (activity.fulfilledTimeStamp ?? 0) >= getAppActiveSince();
  const safe = Boolean(active && fresh && !live && !entryPending && quietRoutes.has(path) &&
    !alerts.length && !dispatch.data?.pendingOfferId && !Keyboard.isVisible());
  const safeRef = useRef(safe); safeRef.current = safe;
  // These hooks remain mounted through OS settings; the location hook completes consent on return.
  const location = useNearbyLocationPermission({ userId, driver: true, active, available: true, deferTrackingToCoordinator: true });
  const fullScreen = useDriverFullScreenPermission(userId, active);
  const prompt = useDriverPermissionPrompt({ userId, active, safe, overlayBusy,
    locationReady: location.loaded || location.loadError,
    // Do not reactivate discovery deliberately disabled in Profile when OS access already exists.
    locationNeeded: !location.permission,
    fullScreenNeeded: Platform.OS === 'android' && (fullScreen.error || Boolean(fullScreen.permission &&
      (!fullScreen.permission.notificationsAllowed || !fullScreen.permission.optIn || !fullScreen.permission.allowed ||
        fullScreen.permission.channelReady === false))) });
  const { selected, close } = prompt;
  const { setConsent } = location;
  useEffect(() => {
    if (selected === 'location') setConsent(true);
    // Exactly once per selected step, not on every hook state refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  useEffect(() => {
    if (!active) return;
    if (selected === 'location' && location.loaded && location.permission && location.enabled && !location.consent && !location.busy) close();
    if (selected === 'fullScreen' && fullScreen.permission?.optIn && fullScreen.permission.allowed &&
        fullScreen.permission.notificationsAllowed && fullScreen.permission.channelReady !== false) close();
  }, [active, selected, location.loaded, location.permission, location.enabled, location.consent, location.busy,
    fullScreen.permission, close]);
  const dismiss = () => { if (selected === 'location') location.defer(); close(); };
  return <>
    <BackgroundLocationApproval {...location} visible={selected === 'location' && safe}
      onShow={() => prompt.onShown('location')}
      priority={RIDE_OVERLAY_PRIORITY.information} onClose={dismiss} onConfirm={() => {
        if (!safeRef.current) return;
        if (location.loadError) location.retry();
        else { location.setConsent(true); void (location.settingsRequired ? location.openSettings() : location.authorize()); }
      }} />
    <DriverFullScreenApproval visible={selected === 'fullScreen' && safe} busy={fullScreen.busy} error={fullScreen.error}
      notificationsAllowed={fullScreen.permission?.notificationsAllowed}
      allowed={fullScreen.permission?.allowed}
      channelReady={fullScreen.permission?.channelReady}
      settingsReviewAvailable={fullScreen.settingsReviewAvailable}
      onShow={() => prompt.onShown('fullScreen')}
      onClose={dismiss} onConfirm={() => {
        if (!safeRef.current) return;
        if (fullScreen.error) fullScreen.retry();
        else if (fullScreen.permission?.notificationsAllowed === false) void fullScreen.openNotifications();
        else if (fullScreen.permission?.allowed && fullScreen.permission.channelReady === false) void fullScreen.openNotifications(false);
        else void fullScreen.setOptIn(true);
      }} />
  </>;
}
