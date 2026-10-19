import * as Device from 'expo-device';
import * as ExpoSpeech from 'expo-speech';
import { getNavigationSpeechRevision, interruptRideSpeechForNavigation } from '@/services/navigationSpeechPriority';
import { holdRideAudio } from '@/services/rideAudioFocus';
import { boundedRideAudio } from '@/services/rideAudioDiagnostics';

type NavigationSpeechOptions = Parameters<typeof ExpoSpeech.speak>[1];

// The iOS simulator can expose corrupted voice metadata and empty audio
// buffers. Keep speech enabled on real devices and TestFlight builds.
const isNavigationSpeechEnabled = Device.isDevice;
const activeVoices = new Set<() => void>();

export const NavigationSpeech = {
  async stop(): Promise<void> {
    if (!isNavigationSpeechEnabled) return;

    try {
      const interruption = interruptRideSpeechForNavigation();
      const revision = getNavigationSpeechRevision();
      if (interruption) await interruption;
      // The announcer may still be initializing and own no native utterance.
      // Explicit navigation stop must still stop GPS, but not a newer instruction.
      if (revision === getNavigationSpeechRevision()) {
        try { await boundedRideAudio(ExpoSpeech.stop(), 3000); }
        finally { if (revision === getNavigationSpeechRevision()) for (const finish of [...activeVoices]) finish(); }
      }
    } catch {
      // Audio interruptions must never interrupt navigation.
    }
  },

  speak(text: string, options?: NavigationSpeechOptions): void {
    if (!isNavigationSpeechEnabled || !text.trim()) return;

    // Acquire BEFORE interrupting the entry voice: its cleanup must not resume
    // the ringtone in the gap before this GPS instruction starts.
    const resume = holdRideAudio();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true; clearTimeout(timer); activeVoices.delete(finish); resume();
    };
    activeVoices.add(finish);
    const interruption = interruptRideSpeechForNavigation();
    const revision = getNavigationSpeechRevision();
    const speak = () => {
      if (revision !== getNavigationSpeechRevision()) { finish(); return; }
      // iOS keeps this flag on the shared synthesizer. Restore navigation's
      // normal session after an entry announcement used an independent session.
      timer = setTimeout(finish, 60000);
      // Avoid keeping Node test processes alive; native timers have no unref.
      (timer as unknown as { unref?: () => void }).unref?.();
      try { ExpoSpeech.speak(text, { useApplicationAudioSession: true, ...options,
        onDone: () => { finish(); options?.onDone?.(); },
        onStopped: () => { finish(); options?.onStopped?.(); },
        onError: error => { finish(); options?.onError?.(error); },
      }); }
      catch { finish(); }
    };
    if (interruption) void interruption.then(speak, speak);
    else speak();
  },

  async isSpeakingAsync(): Promise<boolean> {
    if (!isNavigationSpeechEnabled) return false;

    try {
      return await ExpoSpeech.isSpeakingAsync();
    } catch {
      return false;
    }
  },
};
