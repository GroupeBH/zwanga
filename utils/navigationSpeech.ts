import * as Device from 'expo-device';
import * as ExpoSpeech from 'expo-speech';
import { getNavigationSpeechRevision, interruptRideSpeechForNavigation } from '@/services/navigationSpeechPriority';

type NavigationSpeechOptions = Parameters<typeof ExpoSpeech.speak>[1];

// The iOS simulator can expose corrupted voice metadata and empty audio
// buffers. Keep speech enabled on real devices and TestFlight builds.
const isNavigationSpeechEnabled = Device.isDevice;

export const NavigationSpeech = {
  async stop(): Promise<void> {
    if (!isNavigationSpeechEnabled) return;

    try {
      const interruption = interruptRideSpeechForNavigation();
      const revision = getNavigationSpeechRevision();
      if (interruption) await interruption;
      // The announcer may still be initializing and own no native utterance.
      // Explicit navigation stop must still stop GPS, but not a newer instruction.
      if (revision === getNavigationSpeechRevision()) await ExpoSpeech.stop();
    } catch {
      // Audio interruptions must never interrupt navigation.
    }
  },

  speak(text: string, options?: NavigationSpeechOptions): void {
    if (!isNavigationSpeechEnabled || !text.trim()) return;

    const interruption = interruptRideSpeechForNavigation();
    const revision = getNavigationSpeechRevision();
    const speak = () => {
      if (revision !== getNavigationSpeechRevision()) return;
      try { ExpoSpeech.speak(text, options); }
      catch { /* Some native speech errors are thrown synchronously. */ }
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
