import { NativeModules, Platform } from 'react-native';
import notifee from '@notifee/react-native';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

/** Optional on older builds. Android may deny FGS startup; keep the OS notification. */
export async function startBackgroundRideAudio(id: string) {
  if (Platform.OS !== 'android') return;
  const bridge = NativeModules?.ZwangaDriverAlerts;
  if (typeof bridge?.startBackgroundAlertSound !== 'function') return;
  try {
    await boundedRideAudio(bridge.startBackgroundAlertSound(id), 1500);
  } catch { reportRideAudioFailure('BACKGROUND_AUDIO_START_UNAVAILABLE'); }
}

/** Updating a service-owned card must not cancel its player before JS is ready. */
export async function prepareForegroundRideAudio(id: string): Promise<boolean> {
  const bridge = NativeModules?.ZwangaDriverAlerts;
  if (Platform.OS !== 'android' || typeof bridge?.prepareForegroundAlert !== 'function') return false;
  try { return (await boundedRideAudio(bridge.prepareForegroundAlert(id), 1500)) === true; }
  catch { return false; }
}

/** Android ignores cancelNotification while its foreground service still owns the card. */
export async function cancelRideNotification(id: string, tag?: string) {
  const bridge = NativeModules?.ZwangaDriverAlerts;
  if (!tag && Platform.OS === 'android' && typeof bridge?.stopBackgroundAlertSound === 'function') {
    try { await boundedRideAudio(bridge.stopBackgroundAlertSound(id), 1500); }
    catch { reportRideAudioFailure('BACKGROUND_AUDIO_STOP_UNAVAILABLE'); }
  }
  await notifee.cancelNotification(id, tag);
}
