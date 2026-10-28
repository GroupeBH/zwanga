import { getTokenSessionVersion } from '@/services/tokenSession';

export type TripLocationPermissionOffer = {
  kind: 'request' | 'booking'; id: string; version: number;
};
let pending: TripLocationPermissionOffer | null = null;
let generation = getTokenSessionVersion();
const seen = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) {
    try { listener(); } catch { /* Optional UI must not reject a confirmed reservation. */ }
  }
};

/** Optional, session-bound UI handoff; never delays a successful server operation. */
export function offerTripLocationPermission(kind: TripLocationPermissionOffer['kind'], id: string, version: number) {
  if (!id || version !== getTokenSessionVersion()) return;
  if (generation !== version) { generation = version; seen.clear(); pending = null; }
  const key = kind + ':' + id;
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 128) seen.delete(seen.values().next().value!);
  // Coalesce concurrent successes into one explanation, not a stack of dialogs.
  if (!pending) pending = { kind, id, version };
  notify();
}
export const getTripLocationPermissionOffer = () =>
  pending?.version === getTokenSessionVersion() ? pending : null;
export function subscribeTripLocationPermission(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function finishTripLocationPermission(offer: TripLocationPermissionOffer) {
  if (pending !== offer) return;
  pending = null;
  notify();
}
