import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { Platform } from 'react-native';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

// The v4 FCM data payload is presented by Expo's Android native delegate even
// when its JS task cannot run. This channel must exist BEFORE advertising v4.
export const DRIVER_FALLBACK_CHANNEL = 'driver-alert-backup-v1';
export async function configureDriverAlertFallback() {
  if (Platform.OS !== 'android') return;
  await boundedRideAudio(notifee.createChannel({
    id: DRIVER_FALLBACK_CHANNEL, name: 'Demandes à consulter',
    importance: AndroidImportance.DEFAULT, sound: undefined, vibration: false,
    visibility: AndroidVisibility.PRIVATE,
  }));
}

/** Only remove the native safety card once the richer Notifee card exists,
 * or after a matching decision. Never remove a backup on display failure. */
export async function dismissDriverAlertFallback(data: Record<string, unknown>) {
  const tag = data.fallbackTag;
  if (Platform.OS !== 'android' || typeof tag !== 'string' ||
      !/^ride-backup-(booking|dispatch|nearby)-[0-9a-f-]{36}$/.test(tag)) return;
  try { await boundedRideAudio(Notifications.dismissNotificationAsync(tag), 3000); }
  catch { reportRideAudioFailure('DRIVER_BACKUP_CLEANUP_FAILED'); }
}
