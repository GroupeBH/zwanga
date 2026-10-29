import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type * as ExpoSpeech from 'expo-speech';
import { buildRideAnnouncement } from '@/features/notifications/rideAnnouncement';
import { isAppActive } from './appActivity';
import { canPlayForegroundRideAudio, isForegroundRideSoundReady, pauseForegroundRideSoundForSpeech } from './foregroundRideSound';
import { consumeRideSpeechEntry, isRideSpeechEntryCurrent, readRideSpeechEntry } from './rideEntryAnnouncement';
import { getNavigationSpeechRevision, registerRideSpeechInterruption } from './navigationSpeechPriority';
import { pendingRideAlerts } from './rideAlertSession';
import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';
import { consumePaymentSpeech, paymentSpeechPending, readPaymentSpeech } from './paymentSpeechSource';

type Attempt = {
  key: string; revision: number; spoken: boolean; speech?: typeof ExpoSpeech;
  valid: () => boolean;
  resume?: () => void; unregister?: () => void; timeout?: ReturnType<typeof setTimeout>;
};
let current: Attempt | undefined;
let owner: string | undefined;
let session = getTokenSessionVersion();
let stopping: Promise<void> | undefined;
let voiceEngine: Promise<{ speech: typeof ExpoSpeech; voice: string | undefined }> | undefined;
let nextAllowedAt = 0;
const announced = new Set<string>();
const failures = new Map<string, number>();
function markAnnounced(key: string) {
  announced.add(key);
  while (announced.size > 100) announced.delete(announced.values().next().value!);
}
function release(attempt: Attempt) {
  clearTimeout(attempt.timeout); attempt.unregister?.();
  if (current !== attempt) return;
  current = undefined; nextAllowedAt = Math.max(nextAllowedAt, Date.now() + 2000);
  attempt.resume?.();
}
function cancelCurrent(): Promise<void> {
  const attempt = current;
  if (!attempt) return stopping ?? Promise.resolve();
  release(attempt);
  if (!attempt.spoken || !attempt.speech) return Promise.resolve();
  // Ownership is relinquished synchronously, before a navigation instruction
  // can start. A later background event must never stop that instruction.
  const done = boundedRideAudio(attempt.speech.stop(), 3000).catch(() => {
    reportRideAudioFailure('SPEECH_STOP_FAILED');
  }).finally(() => { if (stopping === done) stopping = undefined; });
  stopping = done;
  return done;
}
function loadVoice() {
  // getAvailableVoicesAsync waits for Android TTS initialization. Do not put an
  // utterance in Expo's native delayed queue, which stop() cannot clear before init.
  if (voiceEngine) return voiceEngine;
  const loading = boundedRideAudio(import('expo-speech').then(async speech => {
    const voices = await speech.getAvailableVoicesAsync();
    const voice = voices.find(item => /^fr[-_]FR$/i.test(item.language)) ?? voices.find(item => /^fr([-_]|$)/i.test(item.language));
    if (!voice) throw new Error('FRENCH_VOICE_UNAVAILABLE');
    return { speech, voice: voice.identifier };
  }));
  voiceEngine = loading;
  void loading.catch(() => { if (voiceEngine === loading) voiceEngine = undefined; });
  return loading;
}

function screenSpeech(userId: string, version: number) {
  const source = readPaymentSpeech(userId, version);
  // A wallet explanation is secondary to a driver opportunity. Do not pause
  // its ringtone to describe balances while a response is still expected.
  if (source?.kind === 'wallet' && pendingRideAlerts(userId).some(item => item.kind !== 'response')) return undefined;
  return source;
}

/** Called only by the foreground notification coordinator, never by a headless task. */
export function reconcileRideAnnouncement(userId?: string) {
  if (session !== getTokenSessionVersion() || owner !== userId) {
    void cancelCurrent(); announced.clear(); failures.clear(); nextAllowedAt = 0;
    session = getTokenSessionVersion(); owner = userId;
  }
  const pending = userId ? pendingRideAlerts(userId) : [];
  const payment = userId ? screenSpeech(userId, session) : undefined;
  if (current && (!isAppActive() || !current.valid())) void cancelCurrent();
  if (!userId || !Device.isDevice || Platform.OS === 'web' || !isAppActive() ||
      current || stopping || Date.now() < nextAllowedAt) return;
  const entry = readRideSpeechEntry(userId);
  // Expiring the entry summary must not disable future live notifications.
  // Restored notifications are already suppressed separately.
  if (!payment && entry.status === 'waiting') {
    // This backlog belongs to the entry summary, not to future live events.
    pending.forEach(item => markAnnounced(item.key));
    return;
  }
  if (!payment && entry.status !== 'unmanaged' && entry.blocked) return;
  if (payment && announced.has(payment.message.key) && paymentSpeechPending(payment)) consumePaymentSpeech(payment);
  if (payment && (!paymentSpeechPending(payment) || announced.has(payment.message.key))) return;
  const atEntry = !payment && entry.status === 'ready';
  const consumeEntry = () => {
    consumeRideSpeechEntry(entry);
    // Do not read the notification backlog after describing the screen priority.
    pendingRideAlerts(userId).forEach(item => markAnnounced(item.key));
  };
  if (atEntry && !entry.message) { consumeEntry(); return; }
  // During navigation, the route's instructions remain the only live voice source.
  if (!payment && !atEntry && /^\/(trip|booking)\/navigate\//.test(entry.path)) return;
  const alert = atEntry || payment ? undefined : pending.find(item => item.kind !== 'response' && !announced.has(item.key));
  if (!payment && !atEntry && (!alert || !isForegroundRideSoundReady())) return;
  const text = payment ? payment.message.text : atEntry ? entry.message?.text : buildRideAnnouncement(alert!);
  if (!text) return;
  const attempt: Attempt = { key: payment ? payment.message.key : atEntry ? entry.message!.key : alert!.key, revision: getNavigationSpeechRevision(), spoken: false,
    valid: () => payment ? screenSpeech(userId, session) === payment :
      !screenSpeech(userId, session) && (atEntry ? isRideSpeechEntryCurrent(entry) :
        isForegroundRideSoundReady() && pendingRideAlerts(userId).some(item => item.key === alert!.key)) };
  current = attempt;
  const valid = () => current === attempt && isAppActive() && session === getTokenSessionVersion() &&
    owner === userId && attempt.valid() && attempt.revision === getNavigationSpeechRevision();
  const handled = () => {
    if (payment) { markAnnounced(attempt.key); consumePaymentSpeech(payment); }
    else if (atEntry) consumeEntry(); else markAnnounced(attempt.key);
  };
  const failed = () => {
    const count = (failures.get(attempt.key) ?? 0) + 1;
    failures.set(attempt.key, count);
    if (failures.size > 100) failures.delete(failures.keys().next().value!);
    nextAllowedAt = Date.now() + (count === 1 ? 5000 : 15000);
    if (count >= 3) handled();
    reportRideAudioFailure('ANNOUNCEMENT_UNAVAILABLE');
  };
  attempt.unregister = registerRideSpeechInterruption(cancelCurrent);
  attempt.timeout = setTimeout(() => {
    if (current === attempt) { handled(); void cancelCurrent(); }
  }, payment?.kind === 'wallet' ? 45000 : 25000);
  void (async () => {
    try {
      // An in-app payment explanation is not a push alert: passengers may have
      // disabled notifications or have no driver channel. TTS keeps OS volume
      // and interruption rules; never request permission or force the volume here.
      if (atEntry && !await boundedRideAudio(canPlayForegroundRideAudio())) { if (valid()) handled(); return; }
      if (!valid()) return;
      const { speech, voice } = await loadVoice();
      if (!valid()) return;
      if (!voice) { handled(); return; }
      // Do not flush or queue behind another voice (notably active GPS guidance).
      if (await boundedRideAudio(speech.isSpeakingAsync()) || !valid()) return;
      attempt.speech = speech;
      attempt.resume = pauseForegroundRideSoundForSpeech();
      attempt.spoken = true; handled();
      const finished = () => release(attempt);
      speech.speak(text, { language: 'fr-FR', voice, rate: 0.95, pitch: 1,
        useApplicationAudioSession: (!atEntry && !payment) || isForegroundRideSoundReady(),
        onDone: finished, onStopped: finished, onError: finished });
    } catch {
      // Missing engine/voice must never prevent accepting a ride or cause a retry loop.
      if (current === attempt) { failed(); void cancelCurrent(); }
    } finally {
      if (!attempt.spoken) release(attempt);
    }
  })();
}

export function stopRideAnnouncement() { void cancelCurrent(); }
/** Restored cards are described by the resolved entry priority, not read as a queue. */
export function silenceRestoredRideAnnouncement(key: string) { markAnnounced(key); }
export function clearRideAnnouncementSession() {
  void cancelCurrent(); announced.clear(); failures.clear(); owner = undefined; nextAllowedAt = 0;
}
