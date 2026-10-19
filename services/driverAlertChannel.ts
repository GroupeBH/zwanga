import { Linking, NativeModules, Platform } from 'react-native';

export const LEGACY_DRIVER_CHANNEL = 'booking-ring-v2';
export const PHONE_DRIVER_CHANNEL = 'driver-phone-ring-v3';
export const BUNDLED_DRIVER_CHANNEL = 'zwanga-ride-ring-v4';

/** Use Zwanga's bundled sound; old binaries fall back to the bundled v2 channel. */
export async function getDriverAlertChannel(): Promise<string> {
  if (Platform.OS !== 'android') return LEGACY_DRIVER_CHANNEL;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const bridge = NativeModules?.ZwangaDriverAlerts;
    if (typeof bridge?.ensureBundledChannel !== 'function') return LEGACY_DRIVER_CHANNEL;
    const channel = await Promise.race([
      bridge.ensureBundledChannel(),
      new Promise(resolve => { timeout = setTimeout(() => resolve(LEGACY_DRIVER_CHANNEL), 5000); }),
    ]);
    // The bridge may retain an explicitly customized/muted previous channel.
    return channel === BUNDLED_DRIVER_CHANNEL || channel === PHONE_DRIVER_CHANNEL ? channel : LEGACY_DRIVER_CHANNEL;
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
