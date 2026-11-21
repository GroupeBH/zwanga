import { useSyncExternalStore } from 'react';
import { getLocationAccessRevision, subscribeLocationAccess } from '@/services/locationAccessSignal';

export function useLocationAccessRevision() {
  return useSyncExternalStore(subscribeLocationAccess, getLocationAccessRevision, getLocationAccessRevision);
}
