import notifee, { EventType } from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { invitationHref, notificationDecision, parseDriverInvitation, parseDriverResponseResult, readDriverPushData } from '@/features/notifications/driverInvitation';
import { configureDriverNotifications, displayDriverInvitation, silenceDriverInvitations } from '@/services/driverNotifications';
import { respondToDriverNotification } from '@/services/driverNotificationResponse';
import { takePendingDriverOpen } from '@/features/notifications/pendingDriverOpen';

export function useDriverNotifications(userId: string | undefined) {
  const router = useRouter();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    seen.current.clear();
    if (!userId || Platform.OS === 'web') return;
    let disposed = false;
    const open = async (raw: Record<string, unknown> | undefined, action?: string, pressed = false, initial = false) => {
      if (pressed && !initial) takePendingDriverOpen(userId);
      const result = parseDriverResponseResult(raw);
      if (result) {
        if (pressed && result.driverId === userId && !disposed) router.navigate(invitationHref(result));
        return;
      }
      const invitation = parseDriverInvitation(raw);
      if (!invitation || invitation.driverId !== userId || disposed) return;
      // A past background tap is never replayed just because the app is opened later.
      if (initial && notificationDecision(action)) return;
      if (!pressed && (AppState.currentState !== 'active' || (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()))) return;
      const key = `${invitation.kind}:${invitation.id}:${action ?? 'received'}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value!);
      if (notificationDecision(action)) {
        await respondToDriverNotification(invitation, action);
        return;
      }
      if (!disposed) {
        const href = invitationHref(invitation);
        router.navigate({ ...href, params: { ...href.params, ...(pressed ? { actionEvent: String(Date.now()) } : {}) } });
      }
    };
    void configureDriverNotifications().catch(() => {});
    const silenceOnOpen = () => { void silenceDriverInvitations(userId).catch(() => {}); };
    if (AppState.currentState === 'active') silenceOnOpen();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') silenceOnOpen(); });
    const pendingOpen = takePendingDriverOpen(userId);
    if (pendingOpen) void open(pendingOpen, 'default', true).catch(() => {});
    const foreground = Notifications.addNotificationReceivedListener(notification => {
      const data = readDriverPushData(notification);
      if (!data || !parseDriverInvitation(data)) return;
      void displayDriverInvitation(data).catch(() => {});
      void open(data).catch(() => {});
    });
    const response = Notifications.addNotificationResponseReceivedListener(event => {
      void open(event.notification.request.content.data, event.actionIdentifier, true).catch(() => {});
    });
    const native = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED) void open(detail.notification?.data).catch(() => {});
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS)
        void open(detail.notification?.data, detail.pressAction?.id, true).catch(() => {});
    });
    void Notifications.getLastNotificationResponseAsync().then(async event => {
      if (event && parseDriverInvitation(event.notification.request.content.data)) {
        await open(event.notification.request.content.data, event.actionIdentifier, true, true);
        if (!disposed) await Notifications.clearLastNotificationResponseAsync();
      }
    }).catch(() => {});
    if (Platform.OS === 'android') void notifee.getInitialNotification().then(event => {
      if (event) return open(event.notification.data, event.pressAction.id, true, true);
    }).catch(() => {});
    return () => { disposed = true; appState.remove(); foreground.remove(); response.remove(); native(); };
  }, [router, userId]);
}
