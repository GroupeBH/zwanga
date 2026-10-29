import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { readDriverAlertRecovery } from '@/services/driverAlertRecovery';
import { rememberRideAlert } from '@/services/rideAlertSession';
import { reportRideAudioFailure } from '@/services/rideAudioDiagnostics';

/** Missing iOS cards must not make app entry depend on a new push/socket event.
 * Foreground only, no permanent polling, no permission or navigation side effect. */
export function useIosRideAlertRecovery(userId: string | undefined, driver: boolean) {
  const active = useAppIsActive();
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const session = getTokenSessionVersion();
  const scope = `${userId}:${session}`;
  const pacing = useRef({ scope, nextAt: 0 });
  if (pacing.current.scope !== scope) pacing.current = { scope, nextAt: 0 };
  const gate = pacing.current;
  useEffect(() => {
    if (Platform.OS !== 'ios' || !driver || !userId || !active || !online) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && getTokenSessionVersion() === session && AppState.currentState === 'active';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const schedule = () => {
      if (!current() || attempts >= 2) return;
      const wait = gate.nextAt - Date.now();
      if (wait > 0) timer = setTimeout(() => { timer = undefined; void recover(); }, wait);
      else void recover();
    };
    const recover = async () => {
      if (!current()) return;
      attempts++; gate.nextAt = Date.now() + 10_000;
      let retry = false;
      try {
        const result = await readDriverAlertRecovery(userId, controller.signal);
        if (!current()) return;
        for (const alert of result.alerts) rememberRideAlert(alert, true);
        retry = result.retry;
      } catch {
        if (!current()) return;
        retry = true; reportRideAudioFailure('RESTORE_IOS_SERVER_FAILED');
      }
      if (retry) schedule();
    };
    schedule();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, driver, gate, online, session, userId]);
}
