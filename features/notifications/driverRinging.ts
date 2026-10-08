import type { DriverInvitation } from './driverInvitation';

export const DRIVER_RING_DURATION_MS = 30_000;

/** Sound lifetime is separate from the server-side reservation lifetime. */
export function driverRingDeadline(invitation: DriverInvitation, now = Date.now()): number {
  let deadline = now + DRIVER_RING_DURATION_MS;
  for (const value of [invitation.ringUntil, invitation.expiresAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return now;
    deadline = Math.min(deadline, parsed);
  }
  return deadline;
}
