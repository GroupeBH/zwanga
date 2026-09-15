import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export let pendingResultRecoveryInFlight = false;
export const claimedProfileImageUris = new Map<string, number>();
export const DUPLICATE_IMAGE_CLAIM_WINDOW_MS = 30_000;

export type ProfilePhotoSource = 'camera' | 'gallery';

export interface ProfilePhotoSelection {
  uri: string;
  source: ProfilePhotoSource;
}

export type ProfilePhotoConfirmationResult = 'confirm' | 'retry' | 'cancel';

export function claimProfileImageUri(uri: string) {
  const now = Date.now();
  claimedProfileImageUris.forEach((claimedAt, claimedUri) => {
    if (now - claimedAt >= DUPLICATE_IMAGE_CLAIM_WINDOW_MS) {
      claimedProfileImageUris.delete(claimedUri);
    }
  });

  const claimedAt = claimedProfileImageUris.get(uri);
  if (claimedAt && now - claimedAt < DUPLICATE_IMAGE_CLAIM_WINDOW_MS) {
    return false;
  }

  claimedProfileImageUris.set(uri, now);
  return true;
}

export function releaseProfileImageUri(uri: string) {
  claimedProfileImageUris.delete(uri);
}

export async function claimPendingProfileImageUri() {
  if (Platform.OS !== 'android' || pendingResultRecoveryInFlight) {
    return null;
  }

  pendingResultRecoveryInFlight = true;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    if (!result) {
      return null;
    }

    if ('code' in result) {
      console.error('[ProfilePhoto] Pending image picker error:', result.message);
      return null;
    }

    if (result.canceled) {
      return null;
    }

    return result.assets?.[0]?.uri ?? null;
  } catch (error) {
    console.warn('[ProfilePhoto] Pending image recovery failed:', error);
    return null;
  } finally {
    pendingResultRecoveryInFlight = false;
  }
}
