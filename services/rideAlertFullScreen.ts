import { NativeModules, Platform } from 'react-native';
import { boundedRideAudio } from './rideAudioDiagnostics';

/** Opt-in build + driver's consent + Android special access. Failure is heads-up. */
export async function rideAlertFullScreenAction(driverId: string) {
  if (Platform.OS !== 'android') return undefined;
  try {
    const bridge = NativeModules?.ZwangaDriverAlerts;
    if (typeof bridge?.canPresentFullScreen !== 'function' ||
        !await boundedRideAudio(bridge.canPresentFullScreen(driverId), 1500)) return undefined;
    return { id: 'ride-full-screen', launchActivity: 'com.zwanga.notifications.IncomingRideActivity' };
  } catch { return undefined; }
}
