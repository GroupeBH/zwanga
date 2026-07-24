import * as Device from 'expo-device';
import * as ExpoSpeech from 'expo-speech';

type NavigationSpeechOptions = Parameters<typeof ExpoSpeech.speak>[1];

// The iOS simulator can expose corrupted voice metadata and empty audio
// buffers. Keep speech enabled on real devices and TestFlight builds.
const isNavigationSpeechEnabled = Device.isDevice;

export const NavigationSpeech = {
  async stop(): Promise<void> {
    if (!isNavigationSpeechEnabled) return;

    try {
      await ExpoSpeech.stop();
    } catch {
      // Audio interruptions must never interrupt navigation.
    }
  },

  speak(text: string, options?: NavigationSpeechOptions): void {
    if (!isNavigationSpeechEnabled || !text.trim()) return;

    try {
      ExpoSpeech.speak(text, options);
    } catch {
      // Some native speech errors are thrown synchronously.
    }
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
