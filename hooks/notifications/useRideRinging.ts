import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import notifee from '@notifee/react-native';
import { parseRideAlert, isRideResponseOpen } from '@/features/notifications/rideAlert';
import { readDriverPushData } from '@/features/notifications/driverInvitation';
import { parseNearbyPhoneAlert } from '@/features/notifications/rideSound';
import { clearRideAlertSession, pendingRideAlerts, rememberRideAlert, setRideAlertScreen, subscribeRideAlerts } from '@/services/rideAlertSession';
import { startForegroundRideSound, stopForegroundRideSound } from '@/services/foregroundRideSound';
import { displayDriverInvitation } from '@/services/driverNotifications';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { dismissOpenedRideResponses } from '@/services/passengerRideAlerts';
import { clearRideAnnouncementSession, reconcileRideAnnouncement, stopRideAnnouncement } from '@/services/foregroundRideAnnouncement';

/** Restores an alert at app entry, then acknowledges passenger responses only
 * on the matching trip. Driver responses are acknowledged by mutation results. */
export function useRideRinging(userId: string | undefined) {
  const pathname = usePathname();
  const path = useRef(pathname); path.current = pathname;
  useEffect(() => {
    if (userId) {
      setRideAlertScreen(userId, pathname);
      void dismissOpenedRideResponses(userId, pathname).catch(() => {});
    }
  }, [userId, pathname]);
  useEffect(() => {
    if (!userId || Platform.OS === 'web') { clearRideAnnouncementSession(); clearRideAlertSession(); stopForegroundRideSound(); return; }
    let disposed = false;
    const version = getTokenSessionVersion();
    const current = () => !disposed && version === getTokenSessionVersion();
    const reconcile = () => {
      if (!current() || AppState.currentState !== 'active' || !pendingRideAlerts(userId).length) {
        stopRideAnnouncement(); stopForegroundRideSound();
      } else {
        reconcileRideAnnouncement(userId);
        void startForegroundRideSound().then(() => { if (current()) reconcileRideAnnouncement(userId); });
      }
    };
    const restore = async () => {
      if (!current() || AppState.currentState !== 'active') return;
      const [native, remote] = await Promise.all([
        notifee.getDisplayedNotifications().catch(() => []), Notifications.getPresentedNotificationsAsync().catch(() => []),
      ]);
      if (!current() || AppState.currentState !== 'active') return;
      for (const item of native) {
        if (!current() || AppState.currentState !== 'active') return;
        const alert = parseRideAlert(item.notification.data);
        if (!alert || alert.recipientId !== userId) continue;
        if (isRideResponseOpen(alert, path.current)) {
          await notifee.cancelNotification(item.id, item.notification.android?.tag); continue;
        }
        if (alert.kind === 'response') {
          await notifee.cancelNotification(item.id, item.notification.android?.tag);
          if (current()) rememberRideAlert(alert, true);
        }
        else if (item.notification.android?.channelId !== 'driver-bookings-active-v1') await displayDriverInvitation(alert.data);
        else rememberRideAlert(alert, true);
      }
      for (const item of remote) {
        if (!current() || AppState.currentState !== 'active') return;
        const alert = parseRideAlert(item.request.content.data);
        if (!alert || alert.recipientId !== userId) continue;
        if (isRideResponseOpen(alert, path.current)) {
          await Notifications.dismissNotificationAsync(item.request.identifier); continue;
        }
        // End the OS-owned sound before handing it to the foreground player.
        // Driver cards stay available through the trip's inline actions.
        if (alert.kind === 'response') await Notifications.dismissNotificationAsync(item.request.identifier);
        if (current()) rememberRideAlert(alert, true);
      }
      reconcile();
    };
    const unsubscribe = subscribeRideAlerts(reconcile);
    const foreground = Notifications.addNotificationReceivedListener(notification => {
      const alert = parseRideAlert(readDriverPushData(notification));
      if (!current() || alert?.recipientId !== userId || AppState.currentState !== 'active') return;
      // Android driver handoff is owned by displayDriverInvitation (stops the
      // OS sound first). iOS and passenger responses use this foreground player.
      if (Platform.OS !== 'android' || alert.kind === 'response' ||
          (alert.kind === 'nearby' && !parseNearbyPhoneAlert(alert.data))) rememberRideAlert(alert);
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void restore().catch(() => {});
      else { stopRideAnnouncement(); stopForegroundRideSound(); }
      updateExpiry();
    });
    // Timer exists only while an alert is pending; no background GPS/network work.
    let expiry: ReturnType<typeof setInterval> | undefined;
    const updateExpiry = () => {
      const needed = AppState.currentState === 'active' && pendingRideAlerts(userId).length > 0;
      if (needed && !expiry) expiry = setInterval(() => { reconcile(); updateExpiry(); }, 1000);
      if (!needed && expiry) { clearInterval(expiry); expiry = undefined; }
    };
    const unsubscribeExpiry = subscribeRideAlerts(updateExpiry);
    void restore().catch(() => {});
    return () => { disposed = true; clearInterval(expiry); unsubscribeExpiry(); unsubscribe(); appState.remove(); foreground.remove();
      clearRideAnnouncementSession(); clearRideAlertSession(); stopForegroundRideSound(); };
  }, [userId]);
}
