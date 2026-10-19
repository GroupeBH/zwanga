import { NativeModules, Platform, Vibration } from 'react-native';
import notifee from '@notifee/react-native';
import { getDriverAlertChannel } from './driverAlertChannel';
import { isAppActive } from './appActivity';
import { holdRideAudio, isRideAudioHeld, subscribeRideAudioFocus } from './rideAudioFocus';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';

type RidePlayer = { play(): void; pause(): void; remove(): void };
let player: RidePlayer | undefined;
let generation = 0;
let starting = false;
let failures = 0;
let retryAt = 0;
let vibratesInJS = false;
function syncSpeechPause() {
  if (!player || !isAppActive()) return;
  try { if (isRideAudioHeld()) player.pause(); else player.play(); }
  catch { reportRideAudioFailure('RING_PLAYBACK_FAILED'); }
}
subscribeRideAudioFocus(syncSpeechPause);
/** Same permission / silent-mode policy for an entry voice without a push. */
export async function canPlayForegroundRideAudio() {
  if (Platform.OS === 'web' || !isAppActive()) return false;
  const settings = await notifee.getNotificationSettings();
  if (settings.authorizationStatus < 1) return false;
  if (Platform.OS === 'android') {
    const channel = await notifee.getChannel(await getDriverAlertChannel());
    if (!channel || channel.blocked || !channel.sound || (channel.importance ?? 0) < 3) return false;
    return Boolean(await NativeModules.ZwangaDriverAlerts?.canPlayForegroundRingtone?.());
  }
  return settings.ios?.sound !== 0;
}
/** One lazy player for all pending rides. No audio initialization during login. */
export async function startForegroundRideSound() {
  if (player || starting || failures >= 3 || Date.now() < retryAt || Platform.OS === 'web' || !isAppActive()) return;
  starting = true;
  const attempt = ++generation;
  const bridge = NativeModules?.ZwangaDriverAlerts;
  const nativeToken = `${Date.now()}:${attempt}`;
  try {
    const allowed = await boundedRideAudio(canPlayForegroundRideAudio());
    if (attempt !== generation || !isAppActive()) return;
    if (!allowed) { retryAt = Date.now() + 30000; return; }
    if (Platform.OS === 'android' && typeof bridge?.startForegroundSound === 'function') {
      const channel = await getDriverAlertChannel();
      if (attempt !== generation || !isAppActive()) return;
      player = { play: () => bridge.pauseForegroundSound(nativeToken, false),
        pause: () => bridge.pauseForegroundSound(nativeToken, true), remove: () => bridge.stopForegroundSound(nativeToken) };
      const ready = await boundedRideAudio(bridge.startForegroundSound(nativeToken, channel, isRideAudioHeld()));
      if (attempt !== generation || !isAppActive()) { bridge.stopForegroundSound(nativeToken); return; }
      if (!ready) throw new Error('NATIVE_RING_UNAVAILABLE');
    } else {
      // iOS and older Android binaries retain their existing compatible player.
      const audio = await boundedRideAudio(import('expo-audio'));
      if (attempt !== generation || !isAppActive()) return;
      await boundedRideAudio(audio.setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'duckOthers' }));
      if (attempt !== generation || !isAppActive()) return;
      const next = audio.createAudioPlayer(require('../assets/sounds/driver_ring.wav'));
      player = next; next.loop = true; next.volume = 1;
      if (!isRideAudioHeld()) next.play();
      vibratesInJS = true; Vibration.vibrate([0, 500, 300, 500, 1200], true);
    }
    failures = 0;
  } catch {
    // Token-scoped stop cannot stop a newer native player after a late timeout.
    try { if (Platform.OS === 'android') bridge?.stopForegroundSound?.(nativeToken); }
    catch { /* A detached bridge must not reject the notification handler. */ }
    if (attempt === generation) {
      const count = failures + 1;
      stopForegroundRideSound(); failures = count; retryAt = Date.now() + (count === 1 ? 5000 : 15000);
      reportRideAudioFailure('RING_INITIALIZATION_FAILED');
    }
  }
  finally { if (attempt === generation) starting = false; }
}
export function stopForegroundRideSound() {
  ++generation; starting = false; failures = 0; retryAt = 0;
  const previous = player; player = undefined;
  if (vibratesInJS) Vibration.cancel();
  vibratesInJS = false;
  try { previous?.pause(); } catch { /* Native audio may already be released. */ }
  try { previous?.remove(); } catch { /* Idempotent cleanup. */ }
}

export const isForegroundRideSoundReady = () => !!player && !starting && isAppActive();

/** Independent leases cover both a player still initializing and GPS handover. */
export function pauseForegroundRideSoundForSpeech(): () => void {
  return holdRideAudio();
}
