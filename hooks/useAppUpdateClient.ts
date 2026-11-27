import { useEffect, useMemo, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { getStoredFcmToken } from '@/services/tokenStorage';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { readInstalledApp } from '@/features/app-updates/nativeVersion';
import { useRegisterAppUpdateClientMutation } from '@/store/api/appUpdatesApi';

/** Metadata only, using the permission/token already obtained by AuthGuard. Never prompts. */
export function useAppUpdateClient(userId: string | undefined, active: boolean) {
  const installed = useMemo(readInstalledApp, []);
  const [register] = useRegisterAppUpdateClientMutation();
  const last = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!userId || !active || !installed || __DEV__) return;
    let cancelled = false;
    const session = getTokenSessionVersion();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = async (canRetry: boolean) => {
        let retry = false;
        try {
          const permission = await Notifications.getPermissionsAsync();
          const token = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
            ? await getStoredFcmToken() : null;
          retry = permission.granted && !token;
          if (cancelled || session !== getTokenSessionVersion()) return;
          const key = `${session}:${userId}:${installed.platform}:${installed.version}:${installed.build}:${token ?? ''}`;
          if (last.current?.key === key && Date.now() - last.current.at < 3600000) return;
          const request = register({ ...installed, ...(token ? { pushToken: token } : {}) });
          try {
            const response = await request.unwrap();
            // Disabled rollout is HTTP 200 too; it must not suppress the next
            // registration after activation. A missing authorized token also
            // remains retryable instead of becoming a one-hour false success.
            retry = retry || response?.registered !== true;
            if (!retry && !cancelled && session === getTokenSessionVersion()) last.current = { key, at: Date.now() };
          } finally { request.reset(); }
        } catch { retry = true; /* Optional feature: never blocks authentication. */ }
        finally {
          if (canRetry && retry && !cancelled && session === getTokenSessionVersion()) {
            retryTimer = setTimeout(() => { void sync(false); }, 30000);
          }
        }
    };
    const timer = setTimeout(() => { void sync(true); }, 5000);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(retryTimer); };
  }, [active, installed, register, userId]);
}
