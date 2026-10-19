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
import { isRemoteNearbyRequestAlert, parseNearbyPhoneAlert, type NearbyPhoneAlert } from '@/features/notifications/rideSound';
import { getDriverAlertChannel, LEGACY_DRIVER_CHANNEL } from './driverAlertChannel';
import { parseRideAlert } from '@/features/notifications/rideAlert';
import { acknowledgeRideAlerts, rememberRideAlert } from './rideAlertSession';

export const DRIVER_CHANNEL = LEGACY_DRIVER_CHANNEL;
const FOREGROUND_BOOKING_CHANNEL = 'driver-bookings-active-v1';
type DriverAlert = DriverInvitation | NearbyPhoneAlert;
const actionKey = (invitation: DriverInvitation) => `driver-action-v1:${invitation.kind}:${invitation.id}`;
export const invitationNotificationId = (invitation: DriverAlert) => `driver-${invitation.kind}-${invitation.id}`;
// Foreground delivery and the headless task can receive the same push. Never
// restart its native timeout, including after an action dismissed the card.
type Delivery = { cancelled: boolean; foreground?: boolean };
const deliveries = new Map<string, Delivery>();
const deliveryKey = (invitation: DriverAlert) => `${getTokenSessionVersion()}:${invitation.driverId}:${invitationNotificationId(invitation)}`;
function rememberDelivery(key: string, cancelled = false): Delivery {
  const delivery: Delivery = { cancelled };
  deliveries.set(key, delivery);
  if (deliveries.size > 100) deliveries.delete(deliveries.keys().next().value!);
  return delivery;
}
function acknowledgeDelivery(invitation: DriverAlert) {
  const key = deliveryKey(invitation);
  const delivery = deliveries.get(key) ?? rememberDelivery(key, true);
  delivery.cancelled = true;
  acknowledgeRideAlerts(alert => alert.key === invitationNotificationId(invitation) && alert.recipientId === invitation.driverId);
}

export async function configureDriverNotifications() {
  if (Platform.OS === 'web') return DRIVER_CHANNEL;
  await Notifications.setNotificationCategoryAsync('driver-offer-v1', [
    { identifier: 'driver-accept', buttonTitle: 'Accepter', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'driver-decline', buttonTitle: 'Refuser', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]);
  await Notifications.setNotificationCategoryAsync('driver-offer-v2', [
    { identifier: 'driver-accept', buttonTitle: 'Accepter', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'driver-decline', buttonTitle: 'Refuser', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]);
  // Resolve before creating v2 so a new install does not look like a legacy install.
  const channelId = await getDriverAlertChannel();
  if (Platform.OS === 'android') await notifee.createChannel({ id: DRIVER_CHANNEL,
    name: 'Réservations et commandes acceptées', importance: AndroidImportance.HIGH,
    sound: 'driver_ring', vibration: true, vibrationPattern: [400, 300, 700, 300, 700, 300],
    visibility: AndroidVisibility.PRIVATE });
  return channelId;
}

export async function displayDriverInvitation(data: Record<string, unknown>): Promise<boolean> {
  const invitation = parseDriverInvitation(data) ?? parseNearbyPhoneAlert(data);
  if (!invitation) return false;
  // A quiet banner is paired with the single foreground audio player.
  if (isAppActive()) {
    if (Platform.OS === 'android') {
      await displayForegroundAlert(invitation, data);
    } else {
      const { refreshToken } = await getTokens();
      if (!refreshToken || isTokenExpired(refreshToken) || getUserIdFromToken(refreshToken) !== invitation.driverId) return true;
      const alert = parseRideAlert(data);
      if (alert) rememberRideAlert(alert);
    }
    return true;
  }
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
    const channelId = await configureDriverNotifications();
    if (delivery.cancelled || version !== getTokenSessionVersion() || deadline <= Date.now()) return true;
    if (isAppActive()) { await displayForegroundAlert(invitation, data); return true; }
    const safeData = Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const body = typeof data.invitationText === 'string' ? data.invitationText.slice(0, 800) : 'Une proposition vous attend. Accepter ou refuser ?';
    await notifee.displayNotification({ id: invitationNotificationId(invitation),
      title: invitation.kind === 'booking' ? 'Nouvelle réservation' : 'Commande à proximité',
      body, data: safeData,
      android: { channelId, importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE, pressAction: { id: 'default', launchActivity: 'default' },
        onlyAlertOnce: true, autoCancel: false, ongoing: true,
        loopSound: true, lightUpScreen: true,
        sound: 'driver_ring', style: { type: AndroidStyle.BIGTEXT, text: body },
        // Native timeout: works without a living JS timer while the phone sleeps.
        timeoutAfter: Math.max(1, deadline - Date.now()),
        actions: invitation.kind === 'nearby' ? [{ title: 'Ignorer', pressAction: { id: 'driver-ignore-nearby', launchActivity: 'default' } }]
          : [{ title: 'Refuser', pressAction: { id: 'driver-decline', launchActivity: 'default' } },
          { title: 'Accepter', pressAction: { id: 'driver-accept', launchActivity: 'default' } }],
      },
    });
    if (delivery.cancelled || version !== getTokenSessionVersion()) {
      await notifee.cancelNotification(invitationNotificationId(invitation));
    } else if (isAppActive()) {
      await displayForegroundAlert(invitation, data);
    }
  } catch (error) {
    if (!delivery.cancelled) deliveries.delete(key);
    throw error;
  }
  return true;
}

async function displayForegroundAlert(invitation: DriverAlert, data: Record<string, unknown>) {
  if (invitation.kind === 'nearby' && driverRingDeadline(invitation) <= Date.now()) return;
  const version = getTokenSessionVersion();
  const { refreshToken } = await getTokens();
  if (!refreshToken || isTokenExpired(refreshToken) || getUserIdFromToken(refreshToken) !== invitation.driverId ||
    version !== getTokenSessionVersion() || !isAppActive()) return;
  const key = deliveryKey(invitation);
  if (deliveries.get(key)?.cancelled || deliveries.get(key)?.foreground) return;
  const delivery = deliveries.get(key) ?? rememberDelivery(key);
  delivery.foreground = true;
  try {
    await notifee.createChannel({ id: FOREGROUND_BOOKING_CHANNEL, name: 'Réservations et commandes dans l’application',
      importance: AndroidImportance.HIGH, vibration: false, sound: undefined });
    if (delivery.cancelled || version !== getTokenSessionVersion() || !isAppActive()) { delivery.foreground = false; return; }
    await notifee.cancelNotification(invitationNotificationId(invitation));
    if (delivery.cancelled || version !== getTokenSessionVersion() || !isAppActive()) { delivery.foreground = false; return; }
    await notifee.displayNotification({ id: invitationNotificationId(invitation),
      title: invitation.kind === 'nearby' ? 'Commande à proximité' : 'Nouvelle réservation',
      body: typeof data.invitationText === 'string' ? data.invitationText.slice(0, 800)
        : invitation.kind === 'nearby' ? 'Un client cherche un véhicule près de vous.' : 'Un passager souhaite vous rejoindre.',
      data: Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      android: { channelId: FOREGROUND_BOOKING_CHANNEL, importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE, autoCancel: false, onlyAlertOnce: true,
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: invitation.kind === 'nearby' ? [{ title: 'Ignorer', pressAction: { id: 'driver-ignore-nearby' } }] : [{ title: 'Refuser', pressAction: { id: 'driver-decline' } },
          { title: 'Accepter', pressAction: { id: 'driver-accept' } }],
      },
    });
    if (delivery.cancelled || version !== getTokenSessionVersion()) {
      await notifee.cancelNotification(invitationNotificationId(invitation));
    } else {
      const alert = parseRideAlert(data);
      if (alert) rememberRideAlert(alert);
    }
  } catch (error) {
    if (!delivery.cancelled) deliveries.delete(key);
    throw error;
  }
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

export async function dismissDriverInvitation(invitation: DriverAlert) {
  acknowledgeDelivery(invitation);
  await notifee.cancelNotification(invitationNotificationId(invitation));
  if (Platform.OS === 'android') await notifee.cancelNotification(`ride-handoff-${invitationNotificationId(invitation)}`);
  // iOS remote identifiers differ from the Notifee local id.
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(presented.filter(item => {
    const presentedInvitation = parseDriverInvitation(item.request.content.data) ?? parseNearbyPhoneAlert(item.request.content.data);
    return presentedInvitation?.id === invitation.id && presentedInvitation.kind === invitation.kind && presentedInvitation.driverId === invitation.driverId;
  })
    .map(item => Notifications.dismissNotificationAsync(item.request.identifier)));
}

/** A decision only stops the matching alert; opening Home is not a decision. */
export async function dismissDriverDecision(userId: string, kind: DriverAlert['kind'], id: string): Promise<void> {
  acknowledgeDelivery({ kind, id, driverId: userId, ringUntil: new Date().toISOString() });
  acknowledgeRideAlerts(alert => alert.recipientId === userId && alert.kind === kind && alert.id === id);
  const version = getTokenSessionVersion();
  const [native, remote] = await Promise.all([
    notifee.getDisplayedNotifications().catch(() => []),
    Notifications.getPresentedNotificationsAsync().catch(() => []),
  ]);
  if (version !== getTokenSessionVersion()) return;
  const invitations = new Map<string, DriverAlert>();
  for (const data of [...native.map(item => item.notification.data), ...remote.map(item => item.request.content.data)]) {
    const invitation = parseDriverInvitation(data) ?? parseNearbyPhoneAlert(data);
    if (invitation?.driverId === userId && invitation.kind === kind && invitation.id === id)
      invitations.set(invitationNotificationId(invitation), invitation);
  }
  await Promise.all([...invitations.values()].map(invitation => dismissDriverInvitation(invitation).catch(() => {})));
  if (version !== getTokenSessionVersion()) return;
  await Promise.all([
    ...native.filter(item => kind === 'nearby' && typeof item.id === 'string' && isRemoteNearbyRequestAlert(item.notification.data) && item.notification.data?.driverId === userId && item.notification.data.tripRequestId === id)
      .map(item => notifee.cancelNotification(item.id, item.notification.android?.tag).catch(() => {})),
    ...remote.filter(item => kind === 'nearby' && isRemoteNearbyRequestAlert(item.request.content.data) && item.request.content.data.driverId === userId && item.request.content.data.tripRequestId === id)
      .map(item => Notifications.dismissNotificationAsync(item.request.identifier).catch(() => {})),
  ]);
}

/** Reconciliation reads notifications once for the whole booking list. */
export async function dismissResolvedDriverBookings(userId: string, ids: string[]) {
  const resolved = new Set(ids);
  acknowledgeRideAlerts(alert => alert.recipientId === userId && alert.kind === 'booking' && resolved.has(alert.id));
  const version = getTokenSessionVersion();
  const [native, remote] = await Promise.all([
    notifee.getDisplayedNotifications().catch(() => []), Notifications.getPresentedNotificationsAsync().catch(() => []),
  ]);
  if (version !== getTokenSessionVersion()) return;
  const matches = (data: Record<string, unknown> | undefined) => {
    const invitation = parseDriverInvitation(data);
    if (invitation?.driverId !== userId || invitation.kind !== 'booking' || !resolved.has(invitation.id)) return false;
    acknowledgeDelivery(invitation); return true;
  };
  await Promise.all([
    ...native.filter(item => matches(item.notification.data)).map(item => notifee.cancelNotification(item.id, item.notification.android?.tag)),
    ...remote.filter(item => matches(item.request.content.data)).map(item => Notifications.dismissNotificationAsync(item.request.identifier)),
  ]);
}
