import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { obtainFcmToken, subscribeToFcmRefresh } from '@/services/pushNotifications';
import { configureDriverNotifications } from '@/services/driverNotifications';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useUpdateFcmTokenMutation } from '@/store/api/userApi';
import { driverDispatchApi } from '@/store/api/driverDispatchApi';
import { useAppDispatch } from '@/store/hooks';
import { getUserIdFromToken } from '@/utils/jwt';

/** Ordinary push and interactive capability have independent success states. */
export function usePushRegistration(hasSession: boolean, accessToken: string | null) {
  const enabled = useDisplayReadsEnabled(useAppIsActive() && hasSession);
  const account = accessToken ? getUserIdFromToken(accessToken) : null;
  const dispatch = useAppDispatch();
  const [updateToken] = useUpdateFcmTokenMutation();
  const state = useRef({ account, tokenKey: '', capabilityKey: '', busy: false, permissionRequested: false });
  if (state.current.account !== account) state.current = { account, tokenKey: '', capabilityKey: '', busy: false, permissionRequested: false };

  useEffect(() => {
    if (!enabled || !account) return;
    let cancelled = false;
    const registration = state.current;
    const sync = async (provided?: string | null) => {
      if (provided && registration.tokenKey !== `${account}:${provided}`) registration.capabilityKey = '';
      if (cancelled || registration.busy) return;
      registration.busy = true;
      const version = getTokenSessionVersion();
      const current = () => !cancelled && state.current === registration && version === getTokenSessionVersion();
      try {
        const requestPermission = !registration.permissionRequested;
        registration.permissionRequested = true;
        const token = provided ?? await obtainFcmToken({ requestPermission });
        if (!token || !current()) return;
        const key = `${account}:${token}`;
        if (registration.tokenKey !== key) {
          await updateToken({ fcmToken: token }).unwrap();
          if (!current()) return;
          registration.tokenKey = key;
          registration.capabilityKey = '';
        }
        if (registration.capabilityKey === key) return;
        await configureDriverNotifications();
        if (!current()) return;
        const backgroundReady = await registerBackgroundNotificationTask();
        // Android data-only delivery needs the headless handler. iOS sound and
        // actions are delivered by APNs/Notifee, even with Background Refresh off.
        if (!current() || (Platform.OS === 'android' && !backgroundReady)) return;
        const request = dispatch(driverDispatchApi.endpoints.registerDriverNotifications.initiate());
        try {
          const result = await request.unwrap();
          if (current() && result.registered) registration.capabilityKey = key;
        } finally { request.reset(); }
      } catch {
        // Login stays usable; retry only while foregrounded and connected.
        console.warn('[Push] Enregistrement incomplet ; nouvelle tentative différée.');
      } finally { registration.busy = false; }
    };
    const initial = setTimeout(() => { void sync(); }, 1200);
    const retry = setInterval(() => { if (!registration.capabilityKey) void sync(); }, 60_000);
    const unsubscribe = subscribeToFcmRefresh(token => sync(token));
    return () => { cancelled = true; clearTimeout(initial); clearInterval(retry); unsubscribe(); };
  }, [enabled, account, accessToken, dispatch, updateToken]);
}
