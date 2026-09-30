import type { ProfileState } from '@/types';

/** Unknown versions/partial responses are read-only, never activation advice. */
export function readProfileState(value: unknown, userId?: string): ProfileState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as ProfileState;
  if (state.version !== 1 || !userId || state.userId !== userId ||
    !state.identity || !['not_started', 'pending', 'approved', 'rejected'].includes(state.identity.status) ||
    !(state.identity.rejectionReason === null || typeof state.identity.rejectionReason === 'string') ||
    !state.driver || !['not_requested', 'identity_required', 'identity_pending', 'vehicle_required', 'ready_to_activate', 'active', 'restricted'].includes(state.driver.status) ||
    !['start', 'verify_identity', 'add_vehicle', 'wait', 'activate', 'none', 'contact_support'].includes(state.driver.nextAction) ||
    typeof state.driver.canPublish !== 'boolean' || typeof state.driver.requested !== 'boolean' ||
    !Number.isSafeInteger(state.driver.activeVehicleCount) || state.driver.activeVehicleCount < 0) return undefined;
  return state;
}
