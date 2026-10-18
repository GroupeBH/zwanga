export type DriverInvitation = {
  kind: 'booking' | 'dispatch'; id: string; driverId: string; expiresAt?: string; ringUntil?: string;
};
export type DriverDecision = 'accept' | 'decline';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isInvitationId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function parseDriverInvitation(data: Record<string, unknown> | undefined): DriverInvitation | null {
  if (!data || data.actionProtocol !== 'driver-v1' || !isInvitationId(data.driverId)) return null;
  const kind = data.type === 'new_booking' ? 'booking' : data.type === 'driver_dispatch_offer' ? 'dispatch' : null;
  const id = kind === 'booking' ? data.bookingId : data.offerId;
  if (!kind || !isInvitationId(id)) return null;
  if (kind === 'dispatch' && (typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)))) return null;
  return { kind, id, driverId: data.driverId,
    ...(typeof data.expiresAt === 'string' ? { expiresAt: data.expiresAt } : {}),
    ...(typeof data.ringUntil === 'string' ? { ringUntil: data.ringUntil } : {}) };
}

export function notificationDecision(actionId: string | undefined): DriverDecision | null {
  return actionId === 'driver-accept' ? 'accept' : actionId === 'driver-decline' ? 'decline' : null;
}

/** Read-only result navigation must never be parsed as another incoming invitation. */
export function parseDriverResponseResult(data: Record<string, unknown> | undefined): DriverInvitation | null {
  if (data?.type !== 'driver_action_result' || !isInvitationId(data.id) || !isInvitationId(data.driverId) ||
      (data.kind !== 'booking' && data.kind !== 'dispatch')) return null;
  return { kind: data.kind, id: data.id, driverId: data.driverId };
}

export function invitationHref(invitation: DriverInvitation) {
  return { pathname: '/incoming-driver' as const, params: { kind: invitation.kind, id: invitation.id, driverId: invitation.driverId } };
}

/** Expo SDK 54 headless delivery wraps FCM strings in data/dataString. */
export function readDriverPushData(payload: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object' || depth > 5) return undefined;
  const raw = payload as Record<string, unknown>;
  if (raw.actionProtocol || raw.ringAlert) return raw;
  const data = raw.data;
  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    if (nested.actionProtocol) return nested;
    if (typeof nested.dataString === 'string') {
      try { return readDriverPushData(JSON.parse(nested.dataString), depth + 1); } catch { return undefined; }
    }
    return nested;
  }
  if (raw.notification) return readDriverPushData(raw.notification, depth + 1);
  if (raw.request) return readDriverPushData(raw.request, depth + 1);
  if (raw.content) return readDriverPushData(raw.content, depth + 1);
  return undefined;
}
