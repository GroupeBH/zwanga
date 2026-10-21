import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { obtainFcmToken, subscribeToFcmRefresh } from '@/services/pushNotifications';
import { configureDriverNotifications } from '@/services/driverNotifications';
import { configureDriverAlertFallback } from '@/services/driverAlertFallback';
import { BUNDLED_DRIVER_CHANNEL, PHONE_DRIVER_CHANNEL } from '@/services/driverAlertChannel';
import { registerBackgroundNotificationTask } from '@/services/backgroundNotificationTask';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useUpdateFcmTokenMutation } from '@/store/api/userApi';
import { driverDispatchApi } from '@/store/api/driverDispatchApi';
import { useAppDispatch } from '@/store/hooks';
import { getUserIdFromToken } from '@/utils/jwt';
import { createPushRegistrationAttempt } from '@/services/pushRegistrationAttempt';

/** Ordinary push and interactive capability have independent success states. */
export function usePushRegistration(hasSession: boolean, accessToken: string | null) {
  const enabled = useDisplayReadsEnabled(useAppIsActive() && hasSession);
  const account = accessToken ? getUserIdFromToken(accessToken) : null;
  const dispatch = useAppDispatch();
  const [updateToken] = useUpdateFcmTokenMutation();
  const state = useRef({ account, tokenKey: '', capabilityKey: '', pendingToken: null as string | null });
  if (state.current.account !== account) state.current = { account, tokenKey: '', capabilityKey: '', pendingToken: null };

  useEffect(() => {
    if (!enabled || !account) return;
    let cancelled = false;
    let running: ReturnType<typeof createPushRegistrationAttempt> | null = null;
    const registration = state.current;
    const sync = async (provided?: string | null) => {
      if (cancelled) return;
      if (provided) registration.pendingToken = provided;
      if (running) return;
      const attempt = createPushRegistrationAttempt();
      running = attempt;
      const pending = registration.pendingToken;
      registration.pendingToken = null;
      const version = getTokenSessionVersion();
      const current = () => !cancelled && attempt.current() && state.current === registration && version === getTokenSessionVersion();
      try {
        // The permission service coalesces prompts and remembers completed
        // choices, but leaves transient native failures eligible for a retry.
        const token = pending ?? await attempt.wait(() => obtainFcmToken());
        if (!token || !current()) return;
        const key = `${account}:${token}`;
        if (registration.tokenKey !== key) {
          // A failed rotation must not inherit the old token's successful state.
          registration.capabilityKey = '';
          const request = updateToken({ fcmToken: token });
          try { await attempt.wait(() => request.unwrap(), () => request.abort()); }
          finally { request.reset(); }
          if (!current()) return;
          registration.tokenKey = key;
          registration.capabilityKey = '';
        }
        if (registration.capabilityKey === key) return;
        const channelId = await attempt.wait(() => configureDriverNotifications());
        if (!current()) return;
        const backgroundReady = await attempt.wait(() => registerBackgroundNotificationTask());
        // Android data-only delivery needs the headless handler. iOS sound and
        // actions are delivered by APNs/Notifee, even with Background Refresh off.
        if (!current() || (Platform.OS === 'android' && !backgroundReady)) return;
        const capability = Platform.OS === 'android' && [BUNDLED_DRIVER_CHANNEL, PHONE_DRIVER_CHANNEL].includes(channelId) ? 4 : 2;
        if (capability === 4) await attempt.wait(() => configureDriverAlertFallback());
        if (!current()) return;
        const register = async (target: 2 | 3 | 4) => {
          const request = dispatch(driverDispatchApi.endpoints.registerDriverNotifications.initiate(target));
          try { return await attempt.wait(() => request.unwrap(), () => request.abort()); }
          finally { request.reset(); }
        };
        try {
          const result = await register(capability);
          if (current() && result.registered) registration.capabilityKey = key;
        } catch (error) {
          // A staged rollout against a v2 backend must retain ordinary/actionable push.
          if (capability !== 4 || (error as { status?: unknown })?.status !== 400 || !current()) throw error;
          let result;
          try { result = await register(3); }
          catch (fallbackError) {
            if ((fallbackError as { status?: unknown })?.status !== 400 || !current()) throw fallbackError;
            result = await register(2);
          }
          if (current() && result.registered) registration.capabilityKey = key;
        }
      } catch {
        // Login stays usable; retry only while foregrounded and connected.
        if (!cancelled) console.warn('[Push] Enregistrement incomplet ; nouvelle tentative différée.');
      } finally {
        attempt.finish();
        if (running === attempt) running = null;
        // Coalesce rotations while busy; never discard the newest device token.
        if (!cancelled && state.current === registration && version === getTokenSessionVersion() && registration.pendingToken)
          void sync();
      }
    };
    const initial = setTimeout(() => { void sync(); }, 1200);
    const retry = setInterval(() => { if (registration.pendingToken || !registration.capabilityKey) void sync(); }, 60_000);
    const unsubscribe = subscribeToFcmRefresh(token => sync(token));
    return () => { cancelled = true; running?.cancel(); clearTimeout(initial); clearInterval(retry); unsubscribe(); };
  }, [enabled, account, accessToken, dispatch, updateToken]);
}
