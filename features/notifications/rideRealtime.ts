import { isInvitationId } from './driverInvitation';
import { parseRideAlert } from './rideAlert';

export type RideRealtimeEvent =
  | { kind: 'incoming'; recipientId: string; eventId: string; data: Record<string, unknown> }
  | { kind: 'changed'; recipientId: string; requestId?: string; bookingId?: string; terminal: boolean }
  | { kind: 'reconnected' };

export function parseRideRealtimeEvent(raw: unknown): Exclude<RideRealtimeEvent, { kind: 'reconnected' }> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!isInvitationId(value.recipientId)) return null;
  if (value.kind === 'incoming' && isInvitationId(value.eventId) && value.data && typeof value.data === 'object' && !Array.isArray(value.data)) {
    const data = value.data as Record<string, unknown>;
    const alert = parseRideAlert(data);
    if (!alert || alert.recipientId !== value.recipientId || alert.kind === 'response') return null;
    return { kind: 'incoming', recipientId: value.recipientId, eventId: value.eventId, data };
  }
  if (value.kind === 'changed' && typeof value.terminal === 'boolean' &&
      (isInvitationId(value.requestId) || isInvitationId(value.bookingId))) {
    return { kind: 'changed', recipientId: value.recipientId, terminal: value.terminal,
      ...(isInvitationId(value.requestId) ? { requestId: value.requestId } : {}),
      ...(isInvitationId(value.bookingId) ? { bookingId: value.bookingId } : {}) };
  }
  return null;
}
