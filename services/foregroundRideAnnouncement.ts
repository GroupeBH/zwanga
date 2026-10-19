import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type * as ExpoSpeech from 'expo-speech';
import { buildRideAnnouncement } from '@/features/notifications/rideAnnouncement';
import { isAppActive } from './appActivity';
import { isForegroundRideSoundReady, pauseForegroundRideSoundForSpeech } from './foregroundRideSound';
import { getNavigationSpeechRevision, registerRideSpeechInterruption } from './navigationSpeechPriority';
import { pendingRideAlerts } from './rideAlertSession';
import { getTokenSessionVersion } from './tokenSession';

type Attempt = {
  key: string; revision: number; spoken: boolean; speech?: typeof ExpoSpeech;
  resume?: () => void; unregister?: () => void; timeout?: ReturnType<typeof setTimeout>;
};
let current: Attempt | undefined;
let owner: string | undefined;
let session = getTokenSessionVersion();
let stopping: Promise<void> | undefined;
let voiceEngine: Promise<{ speech: typeof ExpoSpeech; voice: string | undefined }> | undefined;
let nextAllowedAt = 0;
const announced = new Set<string>();
function markAnnounced(key: string) {
  announced.add(key);
  while (announced.size > 100) announced.delete(announced.values().next().value!);
}
function release(attempt: Attempt) {
  clearTimeout(attempt.timeout); attempt.unregister?.();
  if (current !== attempt) return;
  current = undefined; nextAllowedAt = Date.now() + 2000;
  attempt.resume?.();
}
function cancelCurrent(): Promise<void> {
  const attempt = current;
  if (!attempt) return stopping ?? Promise.resolve();
  release(attempt);
  if (!attempt.spoken || !attempt.speech) return Promise.resolve();
  // Ownership is relinquished synchronously, before a navigation instruction
  // can start. A later background event must never stop that instruction.
  const done = attempt.speech.stop().catch(() => {}).finally(() => { if (stopping === done) stopping = undefined; });
  stopping = done;
  return done;
}
function loadVoice() {
  // getAvailableVoicesAsync waits for Android TTS initialization. Do not put an
  // utterance in Expo's native delayed queue, which stop() cannot clear before init.
  return voiceEngine ??= import('expo-speech').then(async speech => {
    const voices = await speech.getAvailableVoicesAsync();
    const voice = voices.find(item => /^fr[-_]FR$/i.test(item.language)) ?? voices.find(item => /^fr([-_]|$)/i.test(item.language));
    return { speech, voice: voice?.identifier };
  });
}

/** Called only by the foreground notification coordinator, never by a headless task. */
export function reconcileRideAnnouncement(userId?: string) {
  if (session !== getTokenSessionVersion() || owner !== userId) {
    void cancelCurrent(); announced.clear(); nextAllowedAt = 0;
    session = getTokenSessionVersion(); owner = userId;
  }
  const pending = userId ? pendingRideAlerts(userId) : [];
  if (current && (!isAppActive() || !pending.some(alert => alert.key === current!.key))) void cancelCurrent();
  if (!userId || !Device.isDevice || Platform.OS === 'web' || !isAppActive() ||
      !isForegroundRideSoundReady() || current || stopping || Date.now() < nextAllowedAt) return;
  const alert = pending.find(item => item.kind !== 'response' && !announced.has(item.key));
  if (!alert) return;
  const text = buildRideAnnouncement(alert);
  if (!text) return;
  const attempt: Attempt = { key: alert.key, revision: getNavigationSpeechRevision(), spoken: false };
  current = attempt;
  const valid = () => current === attempt && isAppActive() && session === getTokenSessionVersion() &&
    owner === userId && isForegroundRideSoundReady() && attempt.revision === getNavigationSpeechRevision() &&
    pendingRideAlerts(userId).some(item => item.key === attempt.key);
  attempt.unregister = registerRideSpeechInterruption(cancelCurrent);
  attempt.timeout = setTimeout(() => {
    if (current === attempt) { markAnnounced(attempt.key); void cancelCurrent(); }
  }, 25000);
  void (async () => {
    try {
      const { speech, voice } = await loadVoice();
      if (!valid()) return;
      if (!voice) { markAnnounced(attempt.key); return; }
      // Do not flush or queue behind another voice (notably active GPS guidance).
      if (await speech.isSpeakingAsync() || !valid()) return;
      attempt.speech = speech;
      attempt.resume = pauseForegroundRideSoundForSpeech();
      attempt.spoken = true; markAnnounced(attempt.key);
      const finished = () => release(attempt);
      speech.speak(text, { language: 'fr-FR', voice, rate: 0.95, pitch: 1,
        useApplicationAudioSession: true, onDone: finished, onStopped: finished, onError: finished });
    } catch {
      // Missing engine/voice must never prevent accepting a ride or cause a retry loop.
      if (current === attempt) { markAnnounced(attempt.key); void cancelCurrent(); }
    } finally {
      if (!attempt.spoken) release(attempt);
    }
  })();
}

export function stopRideAnnouncement() { void cancelCurrent(); }
export function clearRideAnnouncementSession() {
  void cancelCurrent(); announced.clear(); owner = undefined; nextAllowedAt = 0;
}
