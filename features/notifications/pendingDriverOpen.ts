import { parseDriverInvitation, parseDriverResponseResult } from './driverInvitation';

// iOS can emit PRESS before authentication/profile hydration mounts the navigation hook.
// Keep only a read-only destination in memory; never a decision or a deferred mutation.
let pending: Record<string, unknown> | undefined;
export function rememberPendingDriverOpen(data: Record<string, unknown> | undefined) {
  if (parseDriverInvitation(data) || parseDriverResponseResult(data)) pending = data;
}
export function takePendingDriverOpen(userId: string): Record<string, unknown> | undefined {
  const data = pending;
  pending = undefined;
  return data?.driverId === userId ? data : undefined;
}
