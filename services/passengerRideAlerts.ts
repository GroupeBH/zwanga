import * as Notifications from 'expo-notifications';
import notifee from '@notifee/react-native';
import { parseRideAlert, isRideResponseOpen } from '@/features/notifications/rideAlert';
import { getTokenSessionVersion } from './tokenSession';

/** Stop the system-owned response sound as soon as its trip is opened. */
export async function dismissOpenedRideResponses(userId: string, path: string) {
  const version = getTokenSessionVersion();
  const [native, remote] = await Promise.all([
    notifee.getDisplayedNotifications().catch(() => []), Notifications.getPresentedNotificationsAsync().catch(() => []),
  ]);
  if (version !== getTokenSessionVersion()) return;
  const opened = (data: Record<string, unknown> | undefined) => {
    const alert = parseRideAlert(data);
    return alert?.recipientId === userId && isRideResponseOpen(alert, path);
  };
  await Promise.all([
    ...native.filter(item => opened(item.notification.data)).map(item => notifee.cancelNotification(item.id, item.notification.android?.tag)),
    ...remote.filter(item => opened(item.request.content.data)).map(item => Notifications.dismissNotificationAsync(item.request.identifier)),
  ]);
}
