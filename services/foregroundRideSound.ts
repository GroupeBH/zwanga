import { NativeModules, Platform, Vibration } from 'react-native';
import notifee from '@notifee/react-native';
import { getDriverAlertChannel } from './driverAlertChannel';
import { isAppActive } from './appActivity';
import { holdRideAudio, isRideAudioHeld, subscribeRideAudioFocus } from './rideAudioFocus';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';
import { legacyRideSound } from './legacyRideSound';

type RidePlayer = { play(): void; pause(): void; remove(): void; state?(): Promise<string> };
let player: RidePlayer | undefined;
let generation = 0;
let starting = false;
let failures = 0;
let retryAt = 0;
let vibratesInJS = false;
let nextHealthCheckAt = 0;
let checking: RidePlayer | undefined;
// Bounded by alert identity, not by every render or a change in queue order.
const episodes = new Set<string>();
function releasePlayer() {
  ++generation; starting = false; nextHealthCheckAt = 0; checking = undefined;
  const previous = player; player = undefined;
  if (vibratesInJS) Vibration.cancel();
  vibratesInJS = false;
  try { previous?.pause(); } catch { /* Native audio may already be released. */ }
  try { previous?.remove(); } catch { /* Idempotent cleanup. */ }
}
function failed(code: string) {
  releasePlayer(); failures++;
  // A temporary native failure must not silence the same pending request for
  // the rest of the session. After three failures, cool down before trying again.
  retryAt = Date.now() + (failures >= 3 ? 60000 : failures === 1 ? 5000 : 15000);
  reportRideAudioFailure(code);
}
async function checkPlayer() {
  const previous = player;
  if (!previous?.state || starting || checking || Date.now() < nextHealthCheckAt) return;
  checking = previous; nextHealthCheckAt = Date.now() + 5000;
  try {
    const state = await boundedRideAudio(previous.state(), 3000);
    if (player !== previous || !isAppActive()) return;
    if (state !== 'playing' && !(state === 'paused' && isRideAudioHeld())) failed('RING_PLAYBACK_LOST');
  } catch {
    if (player === previous && isAppActive()) failed('RING_HEALTH_CHECK_FAILED');
  } finally {
    if (checking === previous) checking = undefined;
  }
}
function syncSpeechPause() {
  if (!player || !isAppActive()) return;
  try { if (isRideAudioHeld()) player.pause(); else player.play(); }
  catch { failed('RING_PLAYBACK_FAILED'); }
}
subscribeRideAudioFocus(syncSpeechPause);
/** Same permission / silent-mode policy for an entry voice without a push. */
export async function canPlayForegroundRideAudio(allowSystemNotification = false) {
  if (Platform.OS === 'web' || !isAppActive()) return false;
  const settings = await notifee.getNotificationSettings();
  if (settings.authorizationStatus < 1) { reportRideAudioFailure('RING_NOTIFICATIONS_DISABLED'); return false; }
  if (Platform.OS === 'android') {
    const channel = await notifee.getChannel(await getDriverAlertChannel());
    if (!channel || channel.blocked || !channel.sound || (channel.importance ?? 0) < 3) {
      reportRideAudioFailure('RING_CHANNEL_DISABLED'); return false;
    }
    const policy = NativeModules.ZwangaDriverAlerts?.canPlayForegroundRingtone;
    // Only the OS notification fallback is safe without a native audio-policy probe.
    if (typeof policy !== 'function') return allowSystemNotification;
    const allowed = Boolean(await policy());
    if (!allowed) reportRideAudioFailure('RING_SYSTEM_AUDIO_UNAVAILABLE');
    return allowed;
  }
  return settings.ios?.sound !== 0;
}
/** One lazy player for all pending rides. No audio initialization during login. */
export async function startForegroundRideSound(episodeKey?: string) {
  if (Platform.OS === 'web' || !isAppActive()) return;
  if (episodeKey && !episodes.has(episodeKey)) {
    episodes.add(episodeKey);
    if (episodes.size > 100) episodes.delete(episodes.values().next().value!);
    failures = 0; // A previous failing invitation must not silence a NEW request.
    // Keep the existing backoff, including across a burst of different requests.
  }
  if (player && !starting) { await checkPlayer(); return; }
  if (starting || Date.now() < retryAt) return;
  if (failures >= 3) failures = 0;
  starting = true;
  const attempt = ++generation;
  const bridge = NativeModules?.ZwangaDriverAlerts;
  const nativeToken = `${Date.now()}:${attempt}`;
  try {
    const allowed = await boundedRideAudio(canPlayForegroundRideAudio(true));
    if (attempt !== generation || !isAppActive()) return;
    if (!allowed) { retryAt = Date.now() + 5000; return; }
    if (Platform.OS === 'android' && (typeof bridge?.startForegroundSound !== 'function' ||
        typeof bridge?.canPlayForegroundRingtone !== 'function')) {
      const fallback = await boundedRideAudio(legacyRideSound(episodeKey, () => attempt === generation));
      if (attempt !== generation || !isAppActive()) return;
      player = fallback;
      if (!isRideAudioHeld()) player.play();
    } else if (Platform.OS === 'android') {
      const channel = await getDriverAlertChannel();
      if (attempt !== generation || !isAppActive()) return;
      player = { play: () => bridge.pauseForegroundSound(nativeToken, false),
        pause: () => bridge.pauseForegroundSound(nativeToken, true), remove: () => bridge.stopForegroundSound(nativeToken),
        ...(typeof bridge.getForegroundSoundState === 'function'
          ? { state: () => bridge.getForegroundSoundState(nativeToken) } : {}) };
      const ready = await boundedRideAudio(bridge.startForegroundSound(nativeToken, channel, isRideAudioHeld()));
      if (attempt !== generation || !isAppActive()) { bridge.stopForegroundSound(nativeToken); return; }
      if (!ready) throw new Error('NATIVE_RING_UNAVAILABLE');
    } else {
      // iOS uses its compatible foreground player and respects silent mode.
      const audio = await boundedRideAudio(import('expo-audio'));
      if (attempt !== generation || !isAppActive()) return;
      await boundedRideAudio(audio.setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'duckOthers' }));
      if (attempt !== generation || !isAppActive()) return;
      const next = audio.createAudioPlayer(require('../assets/sounds/driver_ring.wav'));
      // Expo playback can stop asynchronously (interruption/media reset).
      // Keep a health probe just like the Android bridge, not a stale handle
      // that makes every later start look successful while nothing plays.
      player = { play: () => next.play(), pause: () => next.pause(), remove: () => next.remove(),
        state: async () => next.isLoaded === false ? 'stopped' : next.playing ? 'playing' : 'paused' };
      next.loop = true; next.volume = 1;
      if (!isRideAudioHeld()) next.play();
      vibratesInJS = true; Vibration.vibrate([0, 500, 300, 500, 1200], true);
    }
    // Retain the episode's failure budget even if playback briefly recovered.
    nextHealthCheckAt = Date.now() + 5000;
  } catch {
    // Token-scoped stop cannot stop a newer native player after a late timeout.
    try { if (Platform.OS === 'android') bridge?.stopForegroundSound?.(nativeToken); }
    catch { /* A detached bridge must not reject the notification handler. */ }
    if (attempt === generation) {
      failed('RING_INITIALIZATION_FAILED');
    }
  }
  finally { if (attempt === generation) starting = false; }
}
export function stopForegroundRideSound() {
  releasePlayer(); failures = 0; retryAt = 0; episodes.clear();
}

export const isForegroundRideSoundReady = () => !!player && !starting && isAppActive();

/** Independent leases cover both a player still initializing and GPS handover. */
export function pauseForegroundRideSoundForSpeech(): () => void {
  return holdRideAudio();
}
