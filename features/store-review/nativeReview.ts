import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { NativeReview } from './reviewRepository';

// Shared by automatic prompts and the profile button, including across remounts.
// This guards the native promise only: iOS provides no reliable dismissal event.
let pendingRequest: Promise<void> | null = null;
function requestOnce(request: NativeReview['requestReview']): Promise<void> {
  if (pendingRequest) return pendingRequest;
  const task = request();
  pendingRequest = task;
  const clear = () => { if (pendingRequest === task) pendingRequest = null; };
  void task.then(clear, clear);
  return task;
}

export async function loadNativeReview(): Promise<NativeReview | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    // Old installed binaries may receive JS without this newly added native module.
    // Forbid Expo's store-URL fallback for both automatic and explicit requests.
    const native = requireOptionalNativeModule<NativeReview>('ExpoStoreReview');
    if (typeof native?.requestReview !== 'function' || typeof native?.isAvailableAsync !== 'function') return null;
    const review = await import('expo-store-review');
    return { isAvailableAsync: review.isAvailableAsync, requestReview: () => requestOnce(review.requestReview) };
  } catch { return null; }
}
