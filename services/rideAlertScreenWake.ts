import { NativeModules, Platform } from 'react-native';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

/** Wakes only the lock screen, never opens an activity or bypasses DND.
 * A failed/older native bridge must not prevent the notification itself. */
export async function shouldLightUpRideAlertScreen(channelId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const bridge = NativeModules?.ZwangaDriverAlerts;
    if (typeof bridge?.canLightUpAlertScreen !== 'function') return false;
    return Boolean(await boundedRideAudio(bridge.canLightUpAlertScreen(channelId), 2000));
  } catch {
    reportRideAudioFailure('RING_SCREEN_WAKE_UNAVAILABLE');
    return false;
  }
}
