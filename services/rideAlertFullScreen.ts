import { NativeModules, Platform } from 'react-native';
import { boundedRideAudio } from './rideAudioDiagnostics';

/** Opt-in build + driver's consent + Android special access. Failure is heads-up. */
export async function rideAlertFullScreenAction(driverId: string) {
  if (Platform.OS !== 'android') return undefined;
  try {
    const bridge = NativeModules?.ZwangaDriverAlerts;
    if (typeof bridge?.canPresentFullScreen !== 'function' ||
        !await boundedRideAudio(bridge.canPresentFullScreen(driverId), 1500)) return undefined;
    // Notifee 9.1.8 only attaches the notification Bundle to this intent
    // when mainComponent is set. Use Expo's existing root (MainActivity),
    // not a new/fictitious React component. The target remains native.
    return { id: 'ride-full-screen', launchActivity: 'com.zwanga.notifications.IncomingRideActivity', mainComponent: 'main' };
  } catch { return undefined; }
}

/** Keep the pending card after the audible window, but release the sticky banner. */
export async function boundRideAlertPresentation(id: string) {
  if (Platform.OS !== 'android') return;
  const bridge = NativeModules?.ZwangaDriverAlerts;
  if (typeof bridge?.boundFullScreenPresentation !== 'function') return;
  try { await boundedRideAudio(bridge.boundFullScreenPresentation(id), 1500); }
  catch { /* Presentation cleanup must not cancel a successful delivery. */ }
}
