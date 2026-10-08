import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useDriverDispatchStatusQuery, useRecordDriverPositionMutation } from '@/store/api/driverDispatchApi';
import { isDriverAccount } from '@/utils/accountRole';
import { requestCurrentLocation } from '@/services/currentLocationRequest';
import { AppState } from 'react-native';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';

/** Automatic discovery from fresh, already-authorized GPS. No idle background GPS service. */
export function DriverPresenceCoordinator() {
  const router = useRouter();
  const shownOffer = useRef<string | null>(null);
  const authenticated = useAppSelector(selectIsAuthenticated);
  const active = useAppIsActive();
  const readsEnabled = useDisplayReadsEnabled(active && authenticated);
  const { data: user } = useGetCurrentUserQuery(undefined, displayReadOptions(readsEnabled));
  const driver = isDriverAccount(user);
  const userId = user?.id;
  const { data: state, refetch } = useDriverDispatchStatusQuery(undefined, {
    ...displayReadOptions(readsEnabled && driver),
  });
  const [renew] = useRecordDriverPositionMutation();
  const automatic = state?.enabled && state.automatic;
  useEffect(() => {
    const id = state?.pendingOfferId;
    if (!active || !authenticated || !user?.id || !id || shownOffer.current === id) return;
    shownOffer.current = id;
    router.navigate({ pathname: '/incoming-driver', params: { kind: 'dispatch', id, driverId: user.id } });
  }, [active, authenticated, router, state?.pendingOfferId, user?.id]);
  useEffect(() => {
    if (!readsEnabled || !automatic || !driver) return;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const current = await refetch().unwrap();
        if (!current.enabled || !current.automatic || controller.signal.aborted) return;
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted || controller.signal.aborted) return;
        const position = await requestCurrentLocation(true, controller.signal, { maxAge: 15000, requiredAccuracy: 250, fallback: false });
        if (!position || controller.signal.aborted || AppState.currentState !== 'active' ||
            Date.now() - position.timestamp > 30000 || (position.coords.accuracy ?? Infinity) > 250) return;
        await renew({ latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy!, recordedAt: new Date(position.timestamp).toISOString() }).unwrap();
      } catch { /* No optimistic extension. The server lease expires if GPS/network fails. */ }
      finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 45000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [readsEnabled, automatic, refetch, renew, driver, userId]);
  return null;
}
