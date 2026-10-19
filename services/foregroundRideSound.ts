import { NativeModules, Platform, Vibration } from 'react-native';
import notifee from '@notifee/react-native';
import { getDriverAlertChannel } from './driverAlertChannel';
import { isAppActive } from './appActivity';
import type { AudioPlayer } from 'expo-audio';

let player: AudioPlayer | undefined;
let generation = 0;
let starting = false;
let attempted = false;
/** One lazy player for all pending rides. No audio initialization during login. */
export async function startForegroundRideSound() {
  if (player || starting || attempted || Platform.OS === 'web' || !isAppActive()) return;
  starting = true; attempted = true;
  const attempt = ++generation;
  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.authorizationStatus < 1) return;
    if (Platform.OS === 'android') {
      const channel = await notifee.getChannel(await getDriverAlertChannel());
      if (!channel || channel.blocked || !channel.sound || (channel.importance ?? 0) < 3) return;
      if (!await NativeModules.ZwangaDriverAlerts?.canPlayForegroundRingtone?.()) return;
    } else if (settings.ios?.sound === 0) return;
    const audio = await import('expo-audio');
    if (attempt !== generation || !isAppActive()) return;
    await audio.setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
    if (attempt !== generation || !isAppActive()) return;
    const next = audio.createAudioPlayer(require('../assets/sounds/driver_ring.wav'));
    player = next; next.loop = true; next.volume = 1; next.play();
    Vibration.vibrate([0, 500, 300, 500, 1200], true);
  } catch {
    if (attempt === generation) { stopForegroundRideSound(); attempted = true; }
  }
  finally { if (attempt === generation) starting = false; }
}
export function stopForegroundRideSound() {
  ++generation; starting = false; attempted = false;
  const previous = player; player = undefined;
  if (previous) Vibration.cancel();
  try { previous?.pause(); } catch { /* Native audio may already be released. */ }
  try { previous?.remove(); } catch { /* Idempotent cleanup. */ }
}

export const isForegroundRideSoundReady = () => !!player && isAppActive();

/** The alert remains pending. Resume only this player, never one from a later session. */
export function pauseForegroundRideSoundForSpeech(): () => void {
  const paused = player;
  const pausedGeneration = generation;
  try { paused?.pause(); } catch { /* An audio interruption is not a UI error. */ }
  return () => {
    if (paused && player === paused && generation === pausedGeneration && isAppActive()) {
      try { paused.play(); } catch { /* The next alert can recreate the player. */ }
    }
  };
}
