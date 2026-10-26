import { NativeModules, Platform } from 'react-native';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

/** Eligibility only. Notification publication must precede the wake attempt. */
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

/** Never delay/cancel the card or restart its sound if waking is unsupported.
 * Old binaries keep their notification/full-screen fallback until rebuilt. */
export async function wakeDisplayedRideAlert(id: string, channelId: string, deadline: number): Promise<void> {
  if (Platform.OS !== 'android' || !Number.isFinite(deadline) || deadline <= Date.now()) return;
  try {
    const bridge = NativeModules?.ZwangaDriverAlerts;
    if (typeof bridge?.wakeDisplayedAlert !== 'function') {
      reportRideAudioFailure('RING_SCREEN_WAKE_REBUILD_REQUIRED'); return;
    }
    let result = await boundedRideAudio(bridge.wakeDisplayedAlert(id, channelId, deadline), 2000);
    // Android can acknowledge notify() before its active-notification list is
    // updated. One short retry handles that race; every native check still
    // requires the live card, settings and unexpired deadline.
    if (result === 'not-displayed') {
      await new Promise<void>(resolve => setTimeout(resolve, 150));
      if (deadline <= Date.now()) return;
      result = await boundedRideAudio(bridge.wakeDisplayedAlert(id, channelId, deadline), 2000);
    }
    if (result === 'permission' || result === 'unavailable') reportRideAudioFailure('RING_SCREEN_WAKE_UNAVAILABLE');
  } catch { reportRideAudioFailure('RING_SCREEN_WAKE_UNAVAILABLE'); }
}
