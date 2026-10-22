import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

/** Staged native rollout: old binaries and installations without the flag retain
 * their existing Expo/APNs token. Never load the Android messaging service. */
export function usesIosFirebaseMessaging() {
  return Platform.OS === 'ios' && Constants.expoConfig?.extra?.iosFirebaseMessaging === true &&
    Boolean(NativeModules?.RNFBMessagingModule);
}
function runtime() {
  if (!usesIosFirebaseMessaging()) return null;
  // Lazy by design: importing the module in an older binary throws at startup.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api: typeof import('@react-native-firebase/messaging') = require('@react-native-firebase/messaging');
  return { api, instance: api.getMessaging() };
}
export async function obtainIosFirebaseToken(): Promise<string | undefined> {
  const messaging = runtime();
  if (!messaging) return undefined;
  const { api, instance } = messaging;
  if (!instance.isDeviceRegisteredForRemoteMessages)
    await boundedRideAudio(api.registerDeviceForRemoteMessages(instance), 8000);
  return boundedRideAudio(api.getToken(instance), 8000);
}
export function subscribeIosFirebaseToken(listener: (token: string) => void | Promise<void>) {
  try {
    const messaging = runtime();
    if (messaging) return messaging.api.onTokenRefresh(messaging.instance, token => {
      void Promise.resolve().then(() => listener(token)).catch(() => reportRideAudioFailure('IOS_FCM_TOKEN_CALLBACK_FAILED'));
    });
  } catch { reportRideAudioFailure('IOS_FCM_SUBSCRIBE_FAILED'); }
  return () => {};
}
export function subscribeIosFirebaseMessages(listener: (data: Record<string, unknown>) => void) {
  try {
    const messaging = runtime();
    if (messaging) return messaging.api.onMessage(messaging.instance, message => {
      try { if (message.data) listener(message.data); }
      catch { reportRideAudioFailure('IOS_FCM_MESSAGE_CALLBACK_FAILED'); }
    });
  } catch { reportRideAudioFailure('IOS_FCM_SUBSCRIBE_FAILED'); }
  return () => {};
}
