import notifee, { EventType } from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { invitationHref, notificationDecision, parseDriverInvitation, parseDriverResponseResult, readDriverPushData } from '@/features/notifications/driverInvitation';
import { configureDriverNotifications, displayDriverInvitation } from '@/services/driverNotifications';
import { respondToDriverNotification } from '@/services/driverNotificationResponse';
import { takePendingDriverOpen, subscribePendingDriverOpen } from '@/features/notifications/pendingDriverOpen';
import { handleNearbyNotificationAction, isNearbyNotificationAction } from '@/services/nearbyNotificationAction';
import { canShowRequestNotification } from '@/features/notifications/requestVisibility';
import { parseNearbyPhoneAlert } from '@/features/notifications/rideSound';
import { parseRideAlert } from '@/features/notifications/rideAlert';
import { rememberRideAlert } from '@/services/rideAlertSession';
import { reportRideAudioFailure } from '@/services/rideAudioDiagnostics';
import { useRideRealtime } from './useRideRealtime';
import { subscribeIosFirebaseMessages } from '@/services/iosFirebaseMessaging';
import { getTokenSessionVersion } from '@/services/tokenSession';

export function useDriverNotifications(userId: string | undefined, driverAccount: boolean) {
  useRideRealtime(userId, driverAccount);
  const router = useRouter();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    seen.current.clear();
    if (!userId || Platform.OS === 'web') return;
    let disposed = false;
    const sessionVersion = getTokenSessionVersion();
    const allowed = (data: Record<string, unknown> | undefined) => canShowRequestNotification(data, {
      id: userId, role: driverAccount ? 'driver' : 'passenger',
    });
    const open = async (raw: Record<string, unknown> | undefined, action?: string, pressed = false, initial = false, automatic = false) => {
      if (!allowed(raw)) return;
      if (pressed && !initial) takePendingDriverOpen(userId);
      const result = parseDriverResponseResult(raw);
      if (result) {
        const key = `result:${result.kind}:${result.id}`;
        if (pressed && result.driverId === userId && !disposed && (!automatic || !seen.current.has(key))) {
          seen.current.add(key);
          if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value!);
          router.navigate(invitationHref(result));
        }
        return;
      }
      const invitation = parseDriverInvitation(raw);
      const nearby = parseNearbyPhoneAlert(raw);
      const rideAlert = parseRideAlert(raw);
      // Remote iOS alerts and Android local cards share the same read-only route.
      // Only the v3 parser above authorizes native nearby action handling.
      const nearbyTarget = rideAlert?.kind === 'nearby'
        ? { kind: 'nearby' as const, id: rideAlert.id, driverId: rideAlert.recipientId } : null;
      // Native background callbacks own the mutation. Initial notifications are
      // read-only: open their details without replaying a past accept/refuse.
      const target = invitation ?? nearbyTarget;
      if (initial && target?.driverId === userId && (notificationDecision(action) || isNearbyNotificationAction(action))) {
        await open({ type: 'driver_action_result', kind: target.kind, id: target.id, driverId: userId }, 'default', true, false, true);
        return;
      }
      // A body tap can remove the OS card before foreground restoration reads it.
      // Preserve only a fresh pending alert; never replay an acceptance/refusal.
      if (pressed && !disposed && !notificationDecision(action) && !isNearbyNotificationAction(action) &&
          rideAlert && rideAlert.kind !== 'response' && rideAlert.recipientId === userId) {
        if (Platform.OS === 'android' && AppState.currentState === 'active' && (invitation || nearby)) {
          void displayDriverInvitation(raw!).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISPLAY_FAILED'));
        } else rememberRideAlert(rideAlert, true);
      }
      if (nearby?.driverId === userId && isNearbyNotificationAction(action)) {
        seen.current.delete(`result:nearby:${nearby.id}`);
        await handleNearbyNotificationAction(raw, action); return;
      }
      if (nearbyTarget?.driverId === userId && pressed && !disposed) {
        const key = `nearby:${nearbyTarget.id}:open`;
        if ((initial || automatic) && seen.current.has(key)) return;
        seen.current.add(key);
        if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value!);
        router.navigate(invitationHref(nearbyTarget));
        return;
      }
      if (!invitation || invitation.driverId !== userId || disposed) return;
      if (!pressed && (AppState.currentState !== 'active' || (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()))) return;
      if (notificationDecision(action)) {
        // The response service coalesces concurrent native events. Do not make
        // a failed attempt impossible to retry with a new deliberate tap.
        seen.current.delete(`result:${invitation.kind}:${invitation.id}`);
        await respondToDriverNotification(invitation, action);
        return;
      }
      const key = `${invitation.kind}:${invitation.id}:${action ?? 'received'}`;
      // Replayed startup events are coalesced; a new deliberate tap must always
      // reopen the request, even after the driver previously went back Home.
      if ((!pressed || initial || automatic) && seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value!);
      // A new reservation must not replace the driver's current screen. Its
      // notification and the existing passenger cards already expose the actions.
      // Entry routing owns automatic presentation after checking ongoing rides.
      // A delivery alone must not steal a payment, chat or navigation screen.
      if (!pressed) return;
      if (!disposed) {
        const href = invitationHref(invitation);
        router.navigate({ ...href, params: { ...href.params, ...(pressed ? { actionEvent: String(Date.now()) } : {}) } });
      }
    };
    void configureDriverNotifications().catch(() => reportRideAudioFailure('DRIVER_ALERT_CONFIGURATION_FAILED'));
    const flushPendingOpen = () => {
      if (disposed || AppState.currentState !== 'active') return;
      const pendingOpen = takePendingDriverOpen(userId);
      if (pendingOpen) void open(pendingOpen, 'default', true, false, true).catch(() => reportRideAudioFailure('DRIVER_ALERT_OPEN_FAILED'));
    };
    const pendingSubscription = subscribePendingDriverOpen(flushPendingOpen);
    const resume = AppState.addEventListener('change', state => { if (state === 'active') flushPendingOpen(); });
    flushPendingOpen();
    const foreground = Notifications.addNotificationReceivedListener(notification => {
      const data = readDriverPushData(notification);
      if (!data || !allowed(data) || (parseDriverInvitation(data) ?? parseNearbyPhoneAlert(data))?.driverId !== userId) return;
      void displayDriverInvitation(data).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISPLAY_FAILED'));
      void open(data).catch(() => reportRideAudioFailure('DRIVER_ALERT_OPEN_FAILED'));
    });
    const firebase = subscribeIosFirebaseMessages(data => {
      if (disposed || sessionVersion !== getTokenSessionVersion() || AppState.currentState !== 'active' || !allowed(data)) return;
      const alert = parseRideAlert(data);
      if (alert?.recipientId !== userId) return;
      // Share the same acknowledgement/deduplication as Expo foreground delivery.
      if (alert.kind === 'response') { rememberRideAlert(alert); return; }
      void displayDriverInvitation(data).catch(() => reportRideAudioFailure('DRIVER_ALERT_DISPLAY_FAILED'));
    });
    const response = Notifications.addNotificationResponseReceivedListener(event => {
      void open(event.notification.request.content.data, event.actionIdentifier, true).catch(() => reportRideAudioFailure('DRIVER_ALERT_ACTION_FAILED'));
    });
    const native = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED) void open(detail.notification?.data).catch(() => reportRideAudioFailure('DRIVER_ALERT_OPEN_FAILED'));
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS)
        void open(detail.notification?.data, detail.pressAction?.id, true).catch(() => reportRideAudioFailure('DRIVER_ALERT_ACTION_FAILED'));
    });
    void Notifications.getLastNotificationResponseAsync().then(async event => {
      const alert = event && parseRideAlert(event.notification.request.content.data);
      if (event && alert && alert.kind !== 'response') {
        await open(event.notification.request.content.data, event.actionIdentifier, true, true);
        if (!disposed) await Notifications.clearLastNotificationResponseAsync();
      }
    }).catch(() => reportRideAudioFailure('DRIVER_ALERT_INITIAL_OPEN_FAILED'));
    if (Platform.OS === 'android') void notifee.getInitialNotification().then(event => {
      if (event) return open(event.notification.data, event.pressAction.id, true, true);
    }).catch(() => reportRideAudioFailure('DRIVER_ALERT_INITIAL_OPEN_FAILED'));
    return () => { disposed = true; firebase(); foreground.remove(); response.remove(); native(); pendingSubscription(); resume.remove(); };
  }, [router, userId, driverAccount]);
}
