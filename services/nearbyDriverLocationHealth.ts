import { getTokenSessionVersion } from './tokenSession';
import { NEARBY_DRIVER_INTERVAL_MS } from './nearbyDriverLocationPolicy';

type Health = {
  nativeStartedAt: number | null;
  lastFixAt: number | null;
  lastSentAt: number | null;
  lastSentFixAt: number | null;
};
const empty = (): Health => ({ nativeStartedAt: null, lastFixAt: null, lastSentAt: null, lastSentFixAt: null });
let scope = '';
let health = empty();
const listeners = new Set<() => void>();

// Diagnostics contain timestamps only, never coordinates or credentials.
export function getNearbyDriverLocationHealth(userId: string): Health {
  return scope === `${getTokenSessionVersion()}:${userId}` ? { ...health } : empty();
}

export function recordNearbyDriverHealth(userId: string, patch: Partial<Health>,
  version = getTokenSessionVersion()) {
  if (version !== getTokenSessionVersion()) return;
  const key = `${version}:${userId}`;
  if (scope !== key) { scope = key; health = empty(); }
  health = { ...health, ...patch };
  // Native fixes can arrive every second on iOS. Only notify UI on lifecycle
  // changes or acknowledged delivery, not on each position.
  if ('lastSentAt' in patch || 'nativeStartedAt' in patch) {
    for (const listener of listeners) listener();
  }
}

export function subscribeNearbyDriverHealth(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function needsNearbyDriverNativeRecovery(userId: string, now = Date.now()) {
  const state = getNearbyDriverLocationHealth(userId);
  return state.nativeStartedAt !== null &&
    now - Math.max(state.nativeStartedAt, state.lastFixAt ?? 0) >= 2 * NEARBY_DRIVER_INTERVAL_MS;
}
