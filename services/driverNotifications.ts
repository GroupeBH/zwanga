import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, AndroidVisibility, AndroidStyle } from '@notifee/react-native';
import { Platform } from 'react-native';
import { notificationDecision, parseDriverInvitation, type DriverDecision, type DriverInvitation } from '@/features/notifications/driverInvitation';

export const DRIVER_CHANNEL = 'booking-ring-v2';
const actionKey = (invitation: DriverInvitation) => `driver-action-v1:${invitation.kind}:${invitation.id}`;
export const invitationNotificationId = (invitation: DriverInvitation) => `driver-${invitation.kind}-${invitation.id}`;

export async function configureDriverNotifications() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync('driver-offer-v1', [
    { identifier: 'driver-accept', buttonTitle: 'Accepter', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'driver-decline', buttonTitle: 'Refuser', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]);
  await Notifications.setNotificationCategoryAsync('driver-offer-v2', [
    { identifier: 'driver-accept', buttonTitle: 'Accepter', options: { opensAppToForeground: false, isAuthenticationRequired: true } },
    { identifier: 'driver-decline', buttonTitle: 'Refuser', options: { opensAppToForeground: false, isAuthenticationRequired: true } },
  ]);
  if (Platform.OS === 'android') await notifee.createChannel({ id: DRIVER_CHANNEL,
    name: 'Réservations et propositions de trajet', importance: AndroidImportance.HIGH,
    sound: 'driver_ring', vibration: true, vibrationPattern: [400, 300, 700, 300, 700, 300],
    visibility: AndroidVisibility.PRIVATE });
}

export async function displayDriverInvitation(data: Record<string, unknown>): Promise<boolean> {
  const invitation = parseDriverInvitation(data);
  if (!invitation) return false;
  if (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()) return true;
  if (Platform.OS !== 'android') return true; // iOS remote alert/category is already displayed by APNs.
  await configureDriverNotifications();
  const safeData = Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const body = typeof data.invitationText === 'string' ? data.invitationText.slice(0, 800) : 'Une proposition vous attend. Accepter ou refuser ?';
  await notifee.displayNotification({ id: invitationNotificationId(invitation),
    title: invitation.kind === 'booking' ? 'Nouvelle réservation' : 'Demande à proximité',
    body, data: safeData,
    android: { channelId: DRIVER_CHANNEL, importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PRIVATE, pressAction: { id: 'default', launchActivity: 'default' },
      onlyAlertOnce: true, autoCancel: false,
      sound: 'driver_ring', style: { type: AndroidStyle.BIGTEXT, text: body },
      ...(invitation.expiresAt ? { timeoutAfter: Math.max(1, Date.parse(invitation.expiresAt) - Date.now()) } : {}),
      actions: [{ title: 'Refuser', pressAction: { id: 'driver-decline' } },
        { title: 'Accepter', pressAction: { id: 'driver-accept' } }],
    },
  });
  return true;
}

// Only native notification actions write this intent. A deep link never authorizes a mutation.
export async function rememberDriverAction(invitation: DriverInvitation, actionId?: string) {
  const decision = notificationDecision(actionId);
  if (decision) await AsyncStorage.setItem(actionKey(invitation), JSON.stringify({ decision, driverId: invitation.driverId, at: Date.now() }));
}

export async function consumeDriverAction(invitation: DriverInvitation, userId: string): Promise<DriverDecision | null> {
  const key = actionKey(invitation);
  const raw = await AsyncStorage.getItem(key);
  await AsyncStorage.removeItem(key);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const intent = value as { driverId?: unknown; decision?: unknown; at?: unknown };
    if (invitation.driverId !== userId || intent.driverId !== userId || typeof intent.at !== 'number' ||
        Date.now() - intent.at > 60000 || intent.at > Date.now() ||
        (intent.decision !== 'accept' && intent.decision !== 'decline')) return null;
    return intent.decision;
  } catch { return null; }
}

export async function dismissDriverInvitation(invitation: DriverInvitation) {
  await notifee.cancelNotification(invitationNotificationId(invitation));
  // iOS remote identifiers differ from the Notifee local id.
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(presented.filter(item => parseDriverInvitation(item.request.content.data)?.id === invitation.id)
    .map(item => Notifications.dismissNotificationAsync(item.request.identifier)));
}
