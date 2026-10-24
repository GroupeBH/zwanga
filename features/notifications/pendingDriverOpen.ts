import { parseDriverInvitation, parseDriverResponseResult } from './driverInvitation';
import { isRemoteNearbyRequestAlert } from './rideSound';

// iOS can emit PRESS before authentication/profile hydration mounts the navigation hook.
// Keep only a read-only destination in memory; never a decision or a deferred mutation.
let pending: Record<string, unknown> | undefined;
const listeners = new Set<() => void>();
export function rememberPendingDriverOpen(data: Record<string, unknown> | undefined) {
  if (!parseDriverInvitation(data) && !parseDriverResponseResult(data) && !isRemoteNearbyRequestAlert(data)) return;
  pending = data;
  if (parseDriverResponseResult(data)) for (const listener of listeners) listener();
  else void Promise.resolve().then(() => {
    // A lock-screen PRESS can arrive after AppState has already become active.
    // Give the mounted foreground handler first chance to consume it, then
    // flush a background-only event without waiting for a second app opening.
    if (pending === data) for (const listener of listeners) listener();
  });
}
export function subscribePendingDriverOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function takePendingDriverOpen(userId: string): Record<string, unknown> | undefined {
  const data = pending;
  pending = undefined;
  return data?.driverId === userId ? data : undefined;
}
