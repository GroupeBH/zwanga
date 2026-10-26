import { AppState, Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility, AndroidStyle } from '@notifee/react-native';
import { getDriverAlertChannel } from './driverAlertChannel';
import { pendingRideAlerts } from './rideAlertSession';
import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';
import { shouldLightUpRideAlertScreen, wakeDisplayedRideAlert } from './rideAlertScreenWake';
import { rideAlertFullScreenAction } from './rideAlertFullScreen';
import { driverNotificationActions, driverNotificationCard } from '@/features/notifications/driverNotificationCard';

export const BACKGROUND_RIDE_RING_PREFIX = 'ride-handoff-';
let running: Promise<void> | undefined;
let queued: { userId: string; version: number } | undefined;
let generation = 0;
let audible: { id: string; key: string; userId: string; version: number; deadline: number } | undefined;

async function cancel(id: string) {
  try { await boundedRideAudio(notifee.cancelNotification(id), 3000); }
  catch { reportRideAudioFailure('BACKGROUND_RING_CLEANUP_FAILED'); }
}

/** Transfer one still-pending alert, never renew the original server deadline.
 * Android owns the timeout; no background JS timer, speech or foreground service. */
export function reconcileBackgroundRideRinging(userId: string): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (AppState.currentState !== 'background') ++generation;
  queued = { userId, version: getTokenSessionVersion() };
  if (running) return running;
  running = (async () => {
    while (queued) {
      const next = queued; queued = undefined;
      try { await handOff(next.userId, next.version); }
      catch { reportRideAudioFailure('BACKGROUND_RING_HANDOFF_FAILED'); }
    }
  })().finally(() => { running = undefined; });
  return running;
}

async function handOff(userId: string, version: number) {
  const attempt = generation;
  const pending = () => pendingRideAlerts(userId);
  const inBackground = () => attempt === generation && AppState.currentState === 'background' && version === getTokenSessionVersion();
  if (audible && (audible.userId !== userId || audible.version !== version || !inBackground() ||
      audible.deadline <= Date.now() ||
      !pending().some(alert => alert.key === audible!.key))) {
    const previous = audible; audible = undefined;
    await cancel(previous.id);
  }
  if (!inBackground() || audible) return;
  const alert = pending().find(item => Date.parse(String(item.data.ringUntil ?? '')) > Date.now());
  if (!alert) return;
  const deadline = Math.min(Date.parse(String(alert.data.ringUntil)), Date.now() + 30000,
    alert.expiresAt ? Date.parse(alert.expiresAt) : Infinity);
  let cancelled = false;
  const valid = () => !cancelled && inBackground() && deadline > Date.now() && pending().some(item => item.key === alert.key);
  const channelId = await getDriverAlertChannel();
  const driverKind = alert.kind === 'booking' || alert.kind === 'dispatch' || alert.kind === 'nearby' ? alert.kind : null;
  // Same opt-in/build/system checks as a fresh push. Never show a driver's
  // lock-screen activity for a passenger response, or extend the offer.
  const [lightUpScreen, fullScreenAction] = await Promise.all([
    shouldLightUpRideAlertScreen(channelId), driverKind ? rideAlertFullScreenAction(userId) : undefined,
  ]);
  if (!valid()) return;
  const id = `${BACKGROUND_RIDE_RING_PREFIX}${alert.key}`;
  const record = { id, key: alert.key, userId, version, deadline };
  audible = record;
  const actions = driverKind ? driverNotificationActions(driverKind, alert.data) : undefined;
  const card = driverKind ? driverNotificationCard(driverKind, alert.data) : {
    title: 'Une réponse pour votre trajet', body: 'Ouvrez le trajet pour voir les détails.',
  };
  try {
    const display = notifee.displayNotification({ id,
      ...card,
      data: Object.fromEntries(Object.entries(alert.data).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      android: { channelId, importance: AndroidImportance.HIGH, visibility: AndroidVisibility.PRIVATE,
        style: { type: AndroidStyle.BIGTEXT, text: card.body },
        sound: 'driver_ring', loopSound: true, lightUpScreen: false, onlyAlertOnce: true, autoCancel: false,
        ...(lightUpScreen && fullScreenAction ? { fullScreenAction } : {}),
        timeoutAfter: Math.max(1, deadline - Date.now()),
        pressAction: { id: 'default', launchActivity: 'default' }, actions },
    }).then(async () => {
      // Also runs if the native promise resolves after our bounded wait.
      // Never cancel a newer generation that owns the same stable identifier.
      if (!valid() && (!audible || audible === record)) {
        await cancel(id); if (audible === record) audible = undefined;
      }
    });
    await boundedRideAudio(display);
    if (valid() && lightUpScreen) void wakeDisplayedRideAlert(id, channelId, deadline);
  } catch {
    cancelled = true;
    if (audible === record) { audible = undefined; await cancel(id); }
    reportRideAudioFailure('BACKGROUND_RING_HANDOFF_FAILED');
  }
}

export async function clearBackgroundRideRinging() {
  // Logout invalidates the token session before asynchronous cleanup. A pending
  // display checks that generation again and cancels its own late notification.
  ++generation; queued = undefined;
  const previous = audible; audible = undefined;
  if (previous) await cancel(previous.id);
}
