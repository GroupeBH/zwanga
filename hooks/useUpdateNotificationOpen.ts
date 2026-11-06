import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import notifee, { EventType } from '@notifee/react-native';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { baseApi } from '@/store/api/baseApi';

/** Public update destination; never consumes a ride notification or requires login. */
export function useUpdateNotificationOpen() {
  const router = useRouter(), ready = useRootNavigationState()?.key;
  const pathname = usePathname(), dispatch = useAppDispatch();
  const path = useRef(pathname); path.current = pathname;
  const last = useRef({ key: '', at: 0 });
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const open = (value: unknown) => {
      const data = value as Record<string, unknown> | undefined;
      if (disposed || data?.type !== 'app_update') return false;
      const key = `${String(data.releaseId)}:${String(data.campaignId ?? '')}`;
      if (key === last.current.key && Date.now() - last.current.at < 10_000) return true;
      dispatch(baseApi.util.invalidateTags(['AppUpdate']));
      if (path.current !== '/app-update') router.push('/app-update');
      last.current = { key, at: Date.now() };
      return true;
    };
    const safeOpen = (value: unknown) => { try { return open(value); } catch { return false; } };
    // A received push is only a hint: re-read the current release before showing
    // the Home modal. Never navigate or trust the push's version/URL on receipt.
    const refresh = (value: unknown) => {
      if (!disposed && (value as Record<string, unknown> | undefined)?.type === 'app_update')
        dispatch(baseApi.util.invalidateTags(['AppUpdate']));
    };
    const received = Notifications.addNotificationReceivedListener(event => { refresh(event.request.content.data); });
    const expo = Notifications.addNotificationResponseReceivedListener(event => { safeOpen(event.notification.request.content.data); });
    const native = notifee.onForegroundEvent(event => {
      if (event.type === EventType.PRESS || event.type === EventType.ACTION_PRESS) safeOpen(event.detail.notification?.data);
      if (event.type === EventType.DELIVERED) refresh(event.detail.notification?.data);
    });
    void Notifications.getLastNotificationResponseAsync().then(async event => {
      if (event && safeOpen(event.notification.request.content.data)) await Notifications.clearLastNotificationResponseAsync();
    }).catch(() => {});
    // Ordinary remote update pushes use Expo's launch response. Do not consume
    // Notifee's single initial-notification slot, which belongs to ride alerts.
    return () => { disposed = true; received.remove(); expo.remove(); native(); };
  }, [ready, router, dispatch]);
}
