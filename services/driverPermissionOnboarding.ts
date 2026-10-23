import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDriverPermissionRepository } from '@/features/permissions/driverPermissionRepository';
import { boundedRideAudio } from '@/services/rideAudioDiagnostics';
import { getAppActiveSince } from '@/services/appActivity';

export const driverPermissionRepository = createDriverPermissionRepository(AsyncStorage, boundedRideAudio);
let publicationRevision = 0;
const listeners = new Set<() => void>();
export const getDriverPublicationRevision = () => publicationRevision;
export const subscribeDriverPublication = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Called only after successful creation/reconciliation. Never fails publication. */
export async function recordDriverPublication(userId: string | undefined) {
  if (!userId) return;
  try {
    if (await driverPermissionRepository.published(userId, getAppActiveSince())) {
      publicationRevision++;
      listeners.forEach(listener => listener());
    }
  } catch { /* Optional onboarding must not block a successful trip. */ }
}
