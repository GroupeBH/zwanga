import { Linking, NativeModules, Platform } from 'react-native';

export const LEGACY_DRIVER_CHANNEL = 'booking-ring-v2';
export const PHONE_DRIVER_CHANNEL = 'driver-phone-ring-v3';

/** Older binaries/Expo Go keep the working v2 channel and never advertise v3. */
export async function getDriverAlertChannel(): Promise<string> {
  if (Platform.OS !== 'android') return LEGACY_DRIVER_CHANNEL;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const bridge = NativeModules?.ZwangaDriverAlerts;
    if (typeof bridge?.ensureChannel !== 'function') return LEGACY_DRIVER_CHANNEL;
    const channel = await Promise.race([
      bridge.ensureChannel(),
      new Promise(resolve => { timeout = setTimeout(() => resolve(LEGACY_DRIVER_CHANNEL), 5000); }),
    ]);
    return channel === PHONE_DRIVER_CHANNEL ? PHONE_DRIVER_CHANNEL : LEGACY_DRIVER_CHANNEL;
  } catch { return LEGACY_DRIVER_CHANNEL; }
  finally { if (timeout) clearTimeout(timeout); }
}

/** Let the user change volume/sound/permissions in the OS; never force them. */
export async function openDriverAlertSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const { default: notifee } = await import('@notifee/react-native');
      await notifee.openNotificationSettings(await getDriverAlertChannel());
      return;
    } catch { /* Older/OEM settings screens fall back to the application's settings. */ }
  }
  await Linking.openSettings();
}
