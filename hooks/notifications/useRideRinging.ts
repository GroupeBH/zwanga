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
import { clearRideAnnouncementSession, reconcileRideAnnouncement, silenceRestoredRideAnnouncement, stopRideAnnouncement } from '@/services/foregroundRideAnnouncement';
import { beginRideSpeechEntry, clearRideSpeechEntry, hasPendingRideSpeechEntry, subscribeRideSpeechEntry } from '@/services/rideEntryAnnouncement';
import { BACKGROUND_RIDE_RING_PREFIX, clearBackgroundRideRinging, reconcileBackgroundRideRinging } from '@/services/backgroundRideRinging';
import { boundedRideAudio, reportRideAudioFailure } from '@/services/rideAudioDiagnostics';
import { isSelfDriverAlert } from '@/features/notifications/requestOwnership';

/** Restores an alert at app entry, then acknowledges passenger responses only
 * on the matching trip. Driver responses are acknowledged by mutation results. */
export function useRideRinging(userId: string | undefined) {
  const pathname = usePathname();
  const path = useRef(pathname); path.current = pathname;
  useEffect(() => {
    if (userId) {
      setRideAlertScreen(userId, pathname);
      void dismissOpenedRideResponses(userId, pathname).catch(() => reportRideAudioFailure('RESPONSE_DISMISS_FAILED'));
    }
  }, [userId, pathname]);
  useEffect(() => {
    if (!userId || Platform.OS === 'web') { clearRideSpeechEntry(); clearRideAnnouncementSession(); clearRideAlertSession(); stopForegroundRideSound(); return; }
    beginRideSpeechEntry(userId);
    let disposed = false;
    const version = getTokenSessionVersion();
    const current = () => !disposed && version === getTokenSessionVersion();
    const reconcile = () => {
      if (!current() || AppState.currentState !== 'active') {
        stopRideAnnouncement(); stopForegroundRideSound();
        if (current()) void reconcileBackgroundRideRinging(userId);
      } else {
        const pending = pendingRideAlerts(userId);
        if (!pending.length) stopForegroundRideSound();
        reconcileRideAnnouncement(userId);
        if (pending.length) void startForegroundRideSound(pending[pending.length - 1].key)
          .then(() => { if (current()) reconcileRideAnnouncement(userId); })
          .catch(() => reportRideAudioFailure('RING_RECONCILE_FAILED'));
      }
    };
    let restoring = false, restoreAgain = false, restoreEpoch = 0;
    const restore = async () => {
      if (!current() || AppState.currentState !== 'active') return;
      if (restoring) { restoreAgain = true; return; }
      restoring = true;
      const epoch = restoreEpoch;
      const canRestore = () => current() && AppState.currentState === 'active' && epoch === restoreEpoch;
      try {
        const [native, remote] = await Promise.all([
          boundedRideAudio(Promise.resolve().then(() => notifee.getDisplayedNotifications())).catch(() => { reportRideAudioFailure('RESTORE_ANDROID_READ_FAILED'); return []; }),
          boundedRideAudio(Promise.resolve().then(() => Notifications.getPresentedNotificationsAsync())).catch(() => { reportRideAudioFailure('RESTORE_EXPO_READ_FAILED'); return []; }),
        ]);
        if (!canRestore()) return;
        for (const item of native) {
          if (!canRestore()) return;
          try {
            if (isSelfDriverAlert(item.notification.data, userId)) {
              await boundedRideAudio(notifee.cancelNotification(item.id, item.notification.android?.tag)); continue;
            }
            const alert = parseRideAlert(item.notification.data);
            if (!alert || alert.recipientId !== userId) continue;
            silenceRestoredRideAnnouncement(alert.key);
            if (item.id.startsWith(BACKGROUND_RIDE_RING_PREFIX)) {
              await boundedRideAudio(notifee.cancelNotification(item.id));
              if (canRestore()) rememberRideAlert(alert, true);
              continue;
            }
            if (isRideResponseOpen(alert, path.current)) {
              await boundedRideAudio(notifee.cancelNotification(item.id, item.notification.android?.tag)); continue;
            }
            if (alert.kind === 'response') {
              await boundedRideAudio(notifee.cancelNotification(item.id, item.notification.android?.tag));
              if (canRestore()) rememberRideAlert(alert, true);
            }
            else if (item.notification.android?.channelId !== 'driver-bookings-active-v1') await boundedRideAudio(displayDriverInvitation(alert.data));
            else rememberRideAlert(alert, true);
          } catch { reportRideAudioFailure('RESTORE_ANDROID_ITEM_FAILED'); }
        }
        for (const item of remote) {
          if (!canRestore()) return;
          try {
            if (isSelfDriverAlert(item.request.content.data, userId)) {
              await boundedRideAudio(Notifications.dismissNotificationAsync(item.request.identifier)); continue;
            }
            const alert = parseRideAlert(item.request.content.data);
            if (!alert || alert.recipientId !== userId) continue;
            silenceRestoredRideAnnouncement(alert.key);
            if (isRideResponseOpen(alert, path.current)) {
              await boundedRideAudio(Notifications.dismissNotificationAsync(item.request.identifier)); continue;
            }
            // End the OS-owned sound before handing it to the foreground player.
            // Driver cards stay available through the trip's inline actions.
            if (alert.kind === 'response') await boundedRideAudio(Notifications.dismissNotificationAsync(item.request.identifier));
            if (canRestore()) rememberRideAlert(alert, true);
          } catch { reportRideAudioFailure('RESTORE_EXPO_ITEM_FAILED'); }
        }
        if (canRestore()) reconcile();
      } finally {
        restoring = false;
        if (restoreAgain) { restoreAgain = false; void restore().catch(() => reportRideAudioFailure('RESTORE_FAILED')); }
      }
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
    let backgrounded = AppState.currentState === 'background';
    const appState = AppState.addEventListener('change', state => {
      if (state === 'background') backgrounded = true;
      if (state !== 'active') restoreEpoch++;
      if (state === 'active' && backgrounded) { backgrounded = false; beginRideSpeechEntry(userId); }
      if (state === 'active') { void reconcileBackgroundRideRinging(userId); void restore().catch(() => reportRideAudioFailure('RESTORE_FAILED')); }
      else { stopRideAnnouncement(); stopForegroundRideSound(); }
      if (state === 'background') void reconcileBackgroundRideRinging(userId);
      updateExpiry();
    });
    // Entry retries are bounded to 30 s, even if role/network resolution is stuck.
    let expiry: ReturnType<typeof setInterval> | undefined;
    const updateExpiry = () => {
      const needed = AppState.currentState === 'active' && (pendingRideAlerts(userId).length > 0 || hasPendingRideSpeechEntry(userId));
      if (needed && !expiry) expiry = setInterval(() => { reconcile(); updateExpiry(); }, 1000);
      if (!needed && expiry) { clearInterval(expiry); expiry = undefined; }
    };
    const unsubscribeExpiry = subscribeRideAlerts(updateExpiry);
    const unsubscribeEntry = subscribeRideSpeechEntry(() => { reconcile(); updateExpiry(); });
    updateExpiry();
    void restore().catch(() => reportRideAudioFailure('RESTORE_FAILED'));
    return () => { disposed = true; clearInterval(expiry); unsubscribeEntry(); unsubscribeExpiry(); unsubscribe(); appState.remove(); foreground.remove();
      clearRideSpeechEntry(); clearRideAnnouncementSession(); clearRideAlertSession(); stopForegroundRideSound(); void clearBackgroundRideRinging(); };
  }, [userId]);
}
