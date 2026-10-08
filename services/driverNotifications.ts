import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, AndroidVisibility, AndroidStyle } from '@notifee/react-native';
import { Platform } from 'react-native';
import { isAppActive } from './appActivity';
import { getTokens } from './tokenStorage';
import { getTokenSessionVersion } from './tokenSession';
import { getUserIdFromToken, isTokenExpired } from '@/utils/jwt';
import { notificationDecision, parseDriverInvitation, type DriverDecision, type DriverInvitation } from '@/features/notifications/driverInvitation';
import { driverRingDeadline } from '@/features/notifications/driverRinging';

export const DRIVER_CHANNEL = 'booking-ring-v2';
const actionKey = (invitation: DriverInvitation) => `driver-action-v1:${invitation.kind}:${invitation.id}`;
export const invitationNotificationId = (invitation: DriverInvitation) => `driver-${invitation.kind}-${invitation.id}`;
// Foreground delivery and the headless task can receive the same push. Never
// restart its native timeout, including after an action dismissed the card.
const deliveries = new Map<string, { cancelled: boolean }>();
const deliveryKey = (invitation: DriverInvitation) => `${getTokenSessionVersion()}:${invitation.driverId}:${invitationNotificationId(invitation)}`;
function rememberDelivery(key: string, cancelled = false) {
  const delivery = { cancelled };
  deliveries.set(key, delivery);
  if (deliveries.size > 100) deliveries.delete(deliveries.keys().next().value!);
  return delivery;
}
function acknowledgeDelivery(invitation: DriverInvitation) {
  const key = deliveryKey(invitation);
  const delivery = deliveries.get(key) ?? rememberDelivery(key, true);
  delivery.cancelled = true;
}

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
    name: 'Réservations et demandes acceptées', importance: AndroidImportance.HIGH,
    sound: 'driver_ring', vibration: true, vibrationPattern: [400, 300, 700, 300, 700, 300],
    visibility: AndroidVisibility.PRIVATE });
}

export async function displayDriverInvitation(data: Record<string, unknown>): Promise<boolean> {
  const invitation = parseDriverInvitation(data);
  if (!invitation) return false;
  // The foreground screen owns the invitation. Never start a second sound there.
  if (isAppActive()) { acknowledgeDelivery(invitation); return true; }
  if (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()) return true;
  if (Platform.OS !== 'android') return true; // iOS remote alert/category is already displayed by APNs.
  const version = getTokenSessionVersion();
  const { refreshToken } = await getTokens();
  if (!refreshToken || isTokenExpired(refreshToken) || getUserIdFromToken(refreshToken) !== invitation.driverId) return true;
  if (version !== getTokenSessionVersion()) return true;
  const key = deliveryKey(invitation);
  if (deliveries.has(key)) return true;
  const deadline = driverRingDeadline(invitation);
  if (deadline <= Date.now()) return true;
  const delivery = rememberDelivery(key);
  try {
    await configureDriverNotifications();
    if (delivery.cancelled || isAppActive() || version !== getTokenSessionVersion() || deadline <= Date.now()) return true;
    const safeData = Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const body = typeof data.invitationText === 'string' ? data.invitationText.slice(0, 800) : 'Une proposition vous attend. Accepter ou refuser ?';
    await notifee.displayNotification({ id: invitationNotificationId(invitation),
      title: invitation.kind === 'booking' ? 'Nouvelle réservation' : 'Demande à proximité',
      body, data: safeData,
      android: { channelId: DRIVER_CHANNEL, importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE, pressAction: { id: 'default', launchActivity: 'default' },
        onlyAlertOnce: true, autoCancel: true, ongoing: true,
        loopSound: true, lightUpScreen: true,
        sound: 'driver_ring', style: { type: AndroidStyle.BIGTEXT, text: body },
        // Native timeout: works without a living JS timer while the phone sleeps.
        timeoutAfter: Math.max(1, deadline - Date.now()),
        actions: [{ title: 'Refuser', pressAction: { id: 'driver-decline' } },
          { title: 'Accepter', pressAction: { id: 'driver-accept' } }],
      },
    });
    if (delivery.cancelled || isAppActive() || version !== getTokenSessionVersion()) {
      await notifee.cancelNotification(invitationNotificationId(invitation));
    }
  } catch (error) {
    if (!delivery.cancelled) deliveries.delete(key);
    throw error;
  }
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
  acknowledgeDelivery(invitation);
  await notifee.cancelNotification(invitationNotificationId(invitation));
  // iOS remote identifiers differ from the Notifee local id.
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(presented.filter(item => {
    const presentedInvitation = parseDriverInvitation(item.request.content.data);
    return presentedInvitation?.id === invitation.id && presentedInvitation.kind === invitation.kind && presentedInvitation.driverId === invitation.driverId;
  })
    .map(item => Notifications.dismissNotificationAsync(item.request.identifier)));
}

/** Opening from the launcher also acknowledges the sound, without answering.
 * Only incoming driver alerts are removed; chat and all other pushes stay intact. */
export async function silenceDriverInvitations(userId: string): Promise<void> {
  if (!isAppActive()) return;
  const version = getTokenSessionVersion();
  const [native, remote] = await Promise.all([
    notifee.getDisplayedNotifications().catch(() => []),
    Notifications.getPresentedNotificationsAsync().catch(() => []),
  ]);
  if (version !== getTokenSessionVersion()) return;
  const invitations = new Map<string, DriverInvitation>();
  for (const data of [...native.map(item => item.notification.data), ...remote.map(item => item.request.content.data)]) {
    const invitation = parseDriverInvitation(data);
    if (invitation?.driverId === userId) invitations.set(invitationNotificationId(invitation), invitation);
  }
  await Promise.all([...invitations.values()].map(invitation => dismissDriverInvitation(invitation).catch(() => {})));
}
