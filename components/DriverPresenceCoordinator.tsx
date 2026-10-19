import * as Location from 'expo-location';
import { useEffect } from 'react';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { isDriverAccount } from '@/utils/accountRole';
import { requestCurrentLocation } from '@/services/currentLocationRequest';
import { AppState } from 'react-native';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { ensureNearbyDriverLocation, hasActiveRideLocationSession, pauseNearbyDriverLocation,
  subscribeNearbyDriverLocation } from '@/services/nearbyDriverLocation';
import { sendNearbyDriverPosition } from '@/services/nearbyDriverPositionDelivery';
import { NEARBY_DRIVER_INTERVAL_MS } from '@/services/nearbyDriverLocationPolicy';
import { getTokenSessionVersion } from '@/services/tokenSession';

/** Automatic discovery, with OS background authorization and a persistent opt-out. */
export function DriverPresenceCoordinator() {
  const authenticated = useAppSelector(selectIsAuthenticated);
  const signingOut = useAppSelector(state => Boolean(state.auth.logoutRequestId));
  const active = useAppIsActive();
  const readsEnabled = useDisplayReadsEnabled(active && authenticated && !signingOut);
  const { data: user } = useGetCurrentUserQuery(undefined, displayReadOptions(readsEnabled));
  const driver = isDriverAccount(user);
  const userId = user?.id;
  const { data: state } = useDriverDispatchStatusQuery(undefined, {
    ...displayReadOptions(readsEnabled && driver),
  });
  const automatic = state?.enabled && state.automatic;
  useEffect(() => {
    if (authenticated && (state?.enabled === false || (user && !driver))) {
      void pauseNearbyDriverLocation().catch(() => undefined);
    }
  }, [authenticated, driver, state?.enabled, user]);
  // Entry routing observes this cache and verifies offers after ongoing rides.
  // Presence/GPS must never navigate independently of that arbitration.
  useEffect(() => {
    if (!readsEnabled || !automatic || !driver || !userId) return;
    const controller = new AbortController();
    const version = getTokenSessionVersion();
    const current = () => !controller.signal.aborted && AppState.currentState === 'active' && version === getTokenSessionVersion();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted || AppState.currentState !== 'active') return;
      busy = true;
      try {
        // The mutation returns the authoritative status; no extra GET before every fix.
        if (await hasActiveRideLocationSession() || !current()) return;
        const nativeRunning = await ensureNearbyDriverLocation(userId).catch(() => false);
        if (nativeRunning || !current()) return;
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted || !current()) return;
        const position = await requestCurrentLocation(true, controller.signal, { maxAge: 15000, requiredAccuracy: 250, fallback: false });
        if (!position || !current() || await hasActiveRideLocationSession()) return;
        await sendNearbyDriverPosition(userId, position, current);
      } catch { /* No optimistic extension. The server lease expires if GPS/network fails. */ }
      finally { busy = false; }
    };
    void refresh();
    const unsubscribe = subscribeNearbyDriverLocation(() => { void refresh(); });
    const timer = setInterval(() => { void refresh(); }, NEARBY_DRIVER_INTERVAL_MS);
    return () => { clearInterval(timer); unsubscribe(); controller.abort(); };
  }, [readsEnabled, automatic, driver, userId]);
  return null;
}
