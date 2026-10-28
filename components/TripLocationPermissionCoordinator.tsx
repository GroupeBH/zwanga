import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useNearbyLocationPermission } from '@/hooks/profile/useNearbyLocationPermission';
import { useAppEntryPending } from '@/features/navigation/appEntryContext';
import { RideOverlayContext } from '@/features/navigation/rideOverlayContext';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { BackgroundLocationApproval } from '@/components/location/BackgroundLocationApproval';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getRideAlertsRevision, pendingRideAlerts, subscribeRideAlerts } from '@/services/rideAlertSession';
import { finishTripLocationPermission, getTripLocationPermissionOffer, subscribeTripLocationPermission,
  type TripLocationPermissionOffer } from '@/services/tripLocationPermission';

const noSubscribe = () => () => {};
const busyWithoutHost = () => true;
export function TripLocationPermissionCoordinator() {
  const authenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(state => state.auth.tokenPayload?.sub ?? state.auth.tokenPayload?.userId ?? state.auth.user?.id);
  const offer = useSyncExternalStore(subscribeTripLocationPermission, getTripLocationPermissionOffer, getTripLocationPermissionOffer);
  return authenticated && userId && offer && Platform.OS !== 'web'
    ? <TripLocationPermissionSession key={offer.version + ':' + offer.kind + ':' + offer.id} userId={userId} offer={offer} /> : null;
}

/** Survives navigation and OS Settings; priority ride/payment dialogs keep precedence. */
export function TripLocationPermissionSession({ userId, offer }: { userId: string; offer: TripLocationPermissionOffer }) {
  const active = useAppIsActive();
  const path = usePathname();
  const entryPending = useAppEntryPending();
  const overlay = useContext(RideOverlayContext);
  const busy = useSyncExternalStore(overlay?.subscribe ?? noSubscribe, overlay?.isBusy ?? busyWithoutHost, busyWithoutHost);
  const revision = useSyncExternalStore(subscribeRideAlerts, getRideAlertsRevision, getRideAlertsRevision);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => pendingRideAlerts(userId), [userId, revision, active]);
  const [selected, setSelected] = useState(false);
  const location = useNearbyLocationPermission({
    userId, driver: false, purpose: 'passenger-trip', active, available: true, deferTrackingToCoordinator: true,
  });
  const safe = active && !entryPending && !alerts.length && !Keyboard.isVisible() &&
    !/\/(?:navigate|payment|kyc|auth)(?:\/|$)/.test(path) && offer.version === getTokenSessionVersion();
  const latest = useRef({ safe, location }); latest.current = { safe, location };
  useEffect(() => {
    if (!active || offer.version !== getTokenSessionVersion()) return;
    if (location.loaded && location.permission && !location.busy) { finishTripLocationPermission(offer); return; }
    if (!selected && safe && !busy && (location.loaded || location.loadError)) setSelected(true);
  }, [active, offer, location.loaded, location.permission, location.busy, location.loadError, selected, safe, busy]);
  return <BackgroundLocationApproval {...location} audience="passenger"
    visible={selected && safe} priority={RIDE_OVERLAY_PRIORITY.information}
    onClose={() => { location.defer(); finishTripLocationPermission(offer); }}
    onConfirm={() => {
      const now = latest.current;
      if (!now.safe || offer.version !== getTokenSessionVersion()) return;
      if (now.location.loadError) now.location.retry();
      else {
        now.location.setConsent(true);
        void (now.location.settingsRequired ? now.location.openSettings() : now.location.authorize());
      }
    }} />;
}
