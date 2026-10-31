import { ridePlaybackDeadline } from '@/features/notifications/ridePlaybackDeadline';
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
import { reportRideNotificationReceipt } from './rideNotificationReceipt';
import { parseRideAlert } from '@/features/notifications/rideAlert';
import { acknowledgeRideAlerts, beginRideAlertHandoff, completeRideAlertHandoff, pendingRideAlertHandoffs, pendingRideAlerts, rememberRideAlert } from './rideAlertSession';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';
import { shouldLightUpRideAlertScreen, wakeDisplayedRideAlert } from './rideAlertScreenWake';
import { driverNotificationActions, driverNotificationCard } from '@/features/notifications/driverNotificationCard';
import { dismissDriverAlertFallback } from './driverAlertFallback';
import { boundRideAlertPresentation, rideAlertFullScreenAction } from './rideAlertFullScreen';
import { reconcileBackgroundRideRinging } from './backgroundRideRinging';
import { cancelRideNotification, prepareForegroundRideAudio, startBackgroundRideAudio } from './backgroundRideAudio';
import { nearbyRideAlertKey, isNewerMapDriverAlert, type MapDriverAlertGeneration } from '@/features/notifications/mapDriverAlert';

export const DRIVER_CHANNEL = LEGACY_DRIVER_CHANNEL;
const FOREGROUND_BOOKING_CHANNEL = 'driver-bookings-active-v1';
type DriverAlert = DriverInvitation | NearbyPhoneAlert;
const actionKey = (invitation: DriverInvitation) => `driver-action-v1:${invitation.kind}:${invitation.id}`;
export const invitationNotificationId = (invitation: DriverAlert) => `driver-${invitation.kind}-${invitation.id}`;
const invitationAlertKey = (invitation: DriverAlert) => invitation.kind === 'nearby'
  ? nearbyRideAlertKey(invitation.id, invitation.priority) : invitationNotificationId(invitation);
// Foreground delivery and the headless task can receive the same push. Never
// restart its native timeout, including after an action dismissed the card.
type Delivery = { cancelled: boolean; foreground?: boolean; attempt?: object; priority?: MapDriverAlertGeneration };
const deliveries = new Map<string, Delivery>();
const priorityHeads = new Map<string, MapDriverAlertGeneration>();
const deliveryKey = (invitation: DriverAlert) => `${getTokenSessionVersion()}:${invitation.driverId}:${invitationNotificationId(invitation)}`;
function rememberDelivery(key: string, cancelled = false): Delivery {
  const delivery: Delivery = { cancelled };
  deliveries.set(key, delivery);
  if (deliveries.size > 100) deliveries.delete(deliveries.keys().next().value!);
  return delivery;
}
function acknowledgeDelivery(invitation: DriverAlert) {
  const key = deliveryKey(invitation);
  const priority = invitation.kind === 'nearby' ? invitation.priority : undefined;
  if (priority && isNewerMapDriverAlert(priority, priorityHeads.get(key))) {
    priorityHeads.set(key, priority);
    if (priorityHeads.size > 100) priorityHeads.delete(priorityHeads.keys().next().value!);
  }
  const delivery = deliveries.get(key) ?? rememberDelivery(key, true);
  delivery.cancelled = true;
  // A REST recovery may still be fetching an alert not yet in the local map.
  // Record its decision key now, so that late read cannot restart the sound.
  acknowledgeRideAlerts(alert => alert.key === invitationAlertKey(invitation) && alert.recipientId === invitation.driverId,
    { key: invitationAlertKey(invitation), recipientId: invitation.driverId, kind: invitation.kind, id: invitation.id, data: {} });
}

function admitDelivery(invitation: DriverAlert) {
  const key = deliveryKey(invitation), previous = deliveries.get(key);
  const priority = invitation.kind === 'nearby' ? invitation.priority : undefined;
  const head = priorityHeads.get(key);
  if (head?.offerId === priority?.offerId) return true;
  if (!isNewerMapDriverAlert(priority, head)) return false;
  priorityHeads.set(key, priority!);
  if (priorityHeads.size > 100) priorityHeads.delete(priorityHeads.keys().next().value!);
  if (previous) previous.cancelled = true;
  const fresh = rememberDelivery(key); fresh.priority = priority;
  return true;
}

export async function configureDriverNotifications() {
  if (Platform.OS === 'web') return DRIVER_CHANNEL;
  // Android uses Notifee actions, not APNs categories. Do not make a sleeping
  // phone initialize two unrelated Expo categories before displaying its alert.
  if (Platform.OS === 'ios') await boundedRideAudio(Notifications.setNotificationCategoryAsync('driver-offer-v1', [
    { identifier: 'driver-accept', buttonTitle: 'Accepter', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'driver-decline', buttonTitle: 'Refuser', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]));
  if (Platform.OS === 'ios') await boundedRideAudio(Notifications.setNotificationCategoryAsync('driver-offer-v2', [
    { identifier: 'driver-accept', buttonTitle: 'Accepter', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'driver-decline', buttonTitle: 'Refuser', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]));
  if (Platform.OS === 'ios') await boundedRideAudio(Notifications.setNotificationCategoryAsync('driver-nearby-v1', [
    { identifier: 'driver-review-nearby', buttonTitle: 'Voir et accepter', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'driver-ignore-nearby', buttonTitle: 'Refuser', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]));
  // Resolve before creating v2 so a new install does not look like a legacy install.
  const channelId = await getDriverAlertChannel();
  if (Platform.OS === 'android' && channelId === DRIVER_CHANNEL) await boundedRideAudio(notifee.createChannel({ id: DRIVER_CHANNEL,
    name: 'Réservations et commandes acceptées', importance: AndroidImportance.HIGH,
    sound: 'driver_ring', vibration: true, vibrationPattern: [400, 300, 700, 300, 700, 300],
    visibility: AndroidVisibility.PRIVATE }));
  return channelId;
}

export async function displayDriverInvitation(data: Record<string, unknown>): Promise<boolean> {
  const invitation = parseDriverInvitation(data) ?? parseNearbyPhoneAlert(data);
  if (!invitation) return false;
  if (invitation.kind === 'nearby' && invitation.priority) data = { ...data, mapDriverPriority: 'true' };
  void reportRideNotificationReceipt(data, 'received');
  // A quiet banner is paired with the single foreground audio player.
  if (isAppActive()) {
    if (Platform.OS === 'android') {
      await displayForegroundAlert(invitation, data);
    } else {
      const { refreshToken } = await boundedRideAudio(getTokens({ throwOnError: true }));
      if (!refreshToken || isTokenExpired(refreshToken) || getUserIdFromToken(refreshToken) !== invitation.driverId) return true;
      const alert = parseRideAlert(data);
      if (alert) rememberRideAlert(alert);
      return true;
    }
    // If the phone went to sleep during foreground setup, continue with the
    // same event below; do not depend on another push to show/wake its card.
    if (isAppActive()) return true;
    // Once foreground audio owns this event, the existing handoff owns its
    // return to sleep. Do not ring twice via two different notification IDs.
    if (ridePlaybackDeadline(data) > Date.now() &&
        pendingRideAlerts(invitation.driverId).some(alert => alert.key === invitationAlertKey(invitation))) {
      await reconcileBackgroundRideRinging(invitation.driverId); return true;
    }
  }
  if (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()) return true;
  if (Platform.OS !== 'android') return true; // iOS remote alert/category is already displayed by APNs.
  const version = getTokenSessionVersion();
  const { refreshToken } = await boundedRideAudio(getTokens({ throwOnError: true }));
  if (!refreshToken || isTokenExpired(refreshToken) || getUserIdFromToken(refreshToken) !== invitation.driverId) return true;
  if (version !== getTokenSessionVersion()) return true;
  const key = deliveryKey(invitation);
  const previous = deliveries.get(key);
  if (!admitDelivery(invitation) || (previous && deliveries.get(key) === previous)) return true;
  const deadline = driverRingDeadline(invitation);
  if (deadline <= Date.now() && data.alertDelivery !== 'native-backup-v4') { reportRideAudioFailure('DRIVER_ALERT_ARRIVED_TOO_LATE'); return true; }
  const delivery = rememberDelivery(key);
  delivery.priority = invitation.kind === 'nearby' ? invitation.priority : undefined;
  const attempt = {};
  delivery.attempt = attempt;
  let published = false;
  const current = () => deliveries.get(key) === delivery && delivery.attempt === attempt &&
    !delivery.cancelled && version === getTokenSessionVersion();
  try {
    let fresh = deadline > Date.now();
    let channelId = fresh ? await configureDriverNotifications() : await quietChannel();
    const [lightUpScreen, fullScreenAction] = fresh ? await Promise.all([
      shouldLightUpRideAlertScreen(channelId), rideAlertFullScreenAction(invitation.driverId),
    ]) : [false, undefined];
    if (!current()) return true;
    if (deadline <= Date.now()) {
      if (invitation.kind === 'dispatch') return true;
      fresh = false; channelId = await quietChannel();
    }
    if (!current()) return true;
    if (isAppActive()) { await displayForegroundAlert(invitation, data); return true; }
    const safeData = Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const { title, body } = driverNotificationCard(invitation.kind, data);
    const display = notifee.displayNotification({ id: invitationNotificationId(invitation),
      title,
      body, data: safeData,
      android: { channelId, importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE, pressAction: { id: 'default', launchActivity: 'default' },
        onlyAlertOnce: true, autoCancel: false,
        // Android's bundled 60s clip ends without removing a pending booking.
        // iOS keeps its separate 29s notification asset and OS-owned delivery.
        // Only exclusive offers have a short business expiry.
        // Wake after publication through our bounded bridge. Notifee's legacy
        // lightUpScreen acquires unbounded locks before posting the card.
        loopSound: false, lightUpScreen: false,
        ...(fresh && lightUpScreen && fullScreenAction ? { fullScreenAction } : {}),
        ...(fresh ? { sound: 'driver_ring' } : {}),
        style: { type: AndroidStyle.BIGTEXT, text: body },
        ...(invitation.kind === 'dispatch' ? { timeoutAfter: Math.max(1, deadline - Date.now()) } : {}),
        actions: driverNotificationActions(invitation.kind, data),
      },
    }).then(async () => {
      if (!current() && (!deliveries.has(key) || (deliveries.get(key) === delivery && delivery.attempt === attempt))) {
        await boundedRideAudio(cancelRideNotification(invitationNotificationId(invitation)));
      }
    });
    await boundedRideAudio(display);
    if (!current()) return true;
    published = true;
    if (fresh && !isAppActive()) void startBackgroundRideAudio(invitationNotificationId(invitation));
    if (fresh && lightUpScreen && fullScreenAction) void boundRideAlertPresentation(invitationNotificationId(invitation));
    void reportRideNotificationReceipt(data, 'displayed');
    if (fresh && lightUpScreen && !isAppActive()) {
      void wakeDisplayedRideAlert(invitationNotificationId(invitation), channelId, deadline,
        { fullScreen: Boolean(fullScreenAction), current: () => current() && !isAppActive() });
    }
    await dismissDriverAlertFallback(data);
    if (current() && isAppActive()) {
      await displayForegroundAlert(invitation, data);
    }
  } catch (error) {
    if (!delivery.cancelled && deliveries.get(key) === delivery && delivery.attempt === attempt) deliveries.delete(key);
    throw error;
  } finally {
    if (!published && !delivery.cancelled && deliveries.get(key) === delivery && delivery.attempt === attempt) deliveries.delete(key);
  }
  return true;
}

async function displayForegroundAlert(invitation: DriverAlert, data: Record<string, unknown>) {
  const handoffPending = pendingRideAlertHandoffs(invitation.driverId).some(item => item.alert.key === invitationAlertKey(invitation));
  if (invitation.kind === 'nearby' && driverRingDeadline(invitation) <= Date.now() && data.alertDelivery !== 'native-backup-v4' && !handoffPending) return;
  const version = getTokenSessionVersion();
  const { refreshToken } = await boundedRideAudio(getTokens({ throwOnError: true }));
  if (!refreshToken || isTokenExpired(refreshToken) || getUserIdFromToken(refreshToken) !== invitation.driverId ||
    version !== getTokenSessionVersion() || !isAppActive()) return;
  const key = deliveryKey(invitation);
  if (!admitDelivery(invitation)) return;
  if (deliveries.get(key)?.cancelled || deliveries.get(key)?.foreground) return;
  const delivery = deliveries.get(key) ?? rememberDelivery(key);
  delivery.priority = invitation.kind === 'nearby' ? invitation.priority : undefined;
  const attempt = {};
  delivery.attempt = attempt;
  delivery.foreground = true;
  let published = false;
  let registered = false;
  const owned = () => deliveries.get(key) === delivery && delivery.attempt === attempt &&
    !delivery.cancelled && version === getTokenSessionVersion();
  const current = () => owned() && isAppActive();
  try {
    const alert = parseRideAlert(data);
    const handoff = alert ? beginRideAlertHandoff(alert) : undefined;
    if (handoffPending && !handoff) return; // Bounded retry/backoff, not a new delivery.
    // Keep the OS card (and its sound) while preparing its quiet replacement.
    // App audio starts only after that replacement is published, so the source
    // of the ring stays identifiable during unlock, even on a slow bridge.
    await quietChannel();
    if (!current()) return;
    if (!(await prepareForegroundRideAudio(invitationNotificationId(invitation)))) {
      await boundedRideAudio(cancelRideNotification(invitationNotificationId(invitation)));
    }
    if (!owned()) return;
    const register = () => {
      if (!owned() || !alert) return;
      if (handoff) completeRideAlertHandoff(handoff);
      else rememberRideAlert(alert);
      registered = pendingRideAlerts(invitation.driverId).some(item => item.key === alert.key);
    };
    // A second lock transfers to the OS; the foreground player is inactive.
    if (!current()) { register(); return; }
    const { title, body } = driverNotificationCard(invitation.kind, data);
    const display = notifee.displayNotification({ id: invitationNotificationId(invitation), title, body,
      data: Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      android: { channelId: FOREGROUND_BOOKING_CHANNEL, importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE, autoCancel: false, onlyAlertOnce: true,
        pressAction: { id: 'default', launchActivity: 'default' },
        style: { type: AndroidStyle.BIGTEXT, text: body },
        actions: driverNotificationActions(invitation.kind, data),
      },
    }).then(async () => {
      // Late completion must not revive an acknowledged/old-account card.
      // Do not cancel a newer attempt that owns the same stable identifier.
      if (!current() && (!deliveries.has(key) || (deliveries.get(key) === delivery && delivery.attempt === attempt))) {
        await boundedRideAudio(cancelRideNotification(invitationNotificationId(invitation)));
      }
    });
    await boundedRideAudio(display);
    register();
    if (current()) {
      published = true;
      void reportRideNotificationReceipt(data, 'displayed');
      await dismissDriverAlertFallback(data);
    }
  } catch (error) {
    if (!delivery.cancelled && deliveries.get(key) === delivery) deliveries.delete(key);
    throw error;
  } finally {
    // Legacy payloads without a sound deadline cannot use the background
    // handoff. Release their in-flight delivery so the original push can finish.
    const handoffReady = registered && ridePlaybackDeadline(data) > Date.now();
    if (!published && deliveries.get(key) === delivery && delivery.attempt === attempt) {
      delivery.foreground = false;
      if (!handoffReady && !delivery.cancelled) deliveries.delete(key);
    }
  }
}

async function quietChannel() {
  await boundedRideAudio(notifee.createChannel({ id: FOREGROUND_BOOKING_CHANNEL,
    name: 'Réservations et commandes dans l’application',
    importance: AndroidImportance.HIGH, vibration: false, sound: undefined }));
  return FOREGROUND_BOOKING_CHANNEL;
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
  await dismissDriverAlertFallback({ fallbackTag: `ride-backup-${invitation.kind}-${invitation.id}` });
  await cancelRideNotification(invitationNotificationId(invitation));
  if (Platform.OS === 'android') await cancelRideNotification(`ride-handoff-${invitationAlertKey(invitation)}`);
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
      .map(item => cancelRideNotification(item.id, item.notification.android?.tag).catch(() => {})),
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
    ...native.filter(item => matches(item.notification.data)).map(item => cancelRideNotification(item.id, item.notification.android?.tag)),
    ...remote.filter(item => matches(item.request.content.data)).map(item => Notifications.dismissNotificationAsync(item.request.identifier)),
  ]);
}
