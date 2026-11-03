import type { ApproachState } from '@/features/notifications/passengerApproach';
import { getTokenSessionVersion } from './tokenSession';

// Shared across request detail, trip detail and guidance. No coordinates on disk.
const states = new Map<string, ApproachState>();
let session = getTokenSessionVersion();
export function passengerApproachState(key: string): ApproachState {
  if (session !== getTokenSessionVersion()) { states.clear(); session = getTokenSessionVersion(); }
  let state = states.get(key);
  if (!state) {
    state = {}; states.set(key, state);
    if (states.size > 50) states.delete(states.keys().next().value!);
  }
  return state;
}
