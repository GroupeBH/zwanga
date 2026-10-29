import { isInvitationId } from './driverInvitation';
import { parseRideAlert, type RideAlert } from './rideAlert';

export const RECOVERY_INBOX_LIMIT = 25;
export const RECOVERY_DETAIL_LIMIT = 3;
const RING_WINDOW_MS = 60_000;
export const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const timestamp = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;

/** Inbox rows do not contain the transport-only protocol/deadline fields.
 * Reconstruct the SAME original window, never a new minute from app opening. */
export function driverRecoveryCandidates(rows: unknown[], userId: string, now = Date.now()): RideAlert[] {
  if (!isInvitationId(userId)) return [];
  const candidates = new Map<string, RideAlert>();
  for (const raw of rows.slice(0, RECOVERY_INBOX_LIMIT)) {
    const row = record(raw), original = record(row?.data);
    if (!row || row.userId !== userId || row.isActive === false || !original || original.driverId !== userId) continue;
    const created = timestamp(row.createdAt);
    if (!Number.isFinite(created) || created > now + 5000) continue;
    let until = created + RING_WINDOW_MS;
    for (const field of ['ringUntil', 'expiresAt', 'alertExpiresAt']) {
      if (original[field] !== undefined) until = Math.min(until, timestamp(original[field]));
    }
    if (!Number.isFinite(until) || until <= now) continue;
    const type = original.type;
    if (!['new_booking', 'driver_dispatch_offer', 'trip_request_nearby'].includes(String(type))) continue;
    const data: Record<string, unknown> = { ...original, ringUntil: new Date(until).toISOString() };
    // Device playback timestamps must never extend a REST recovery window.
    delete data.nativeSoundStartedAt; delete data.nativeSoundUntil;
    if (type !== 'trip_request_nearby') {
      if (data.actionProtocol !== undefined && data.actionProtocol !== 'driver-v1') continue;
      data.actionProtocol = 'driver-v1';
    }
    const alert = parseRideAlert(data);
    if (!alert || alert.recipientId !== userId || alert.kind === 'response') continue;
    if (!candidates.has(alert.key)) candidates.set(alert.key, alert);
    if (candidates.size === RECOVERY_DETAIL_LIMIT) break;
  }
  return [...candidates.values()];
}

export function driverRecoveryDetailUrl(alert: RideAlert): string | undefined {
  if (alert.kind === 'booking') return `/bookings/${alert.id}`;
  // Scheduled requests can also belong to a sequential 40-second offer.
  // Its authoritative state, not the request's general visibility, owns ringing.
  if (alert.data.offerId !== undefined) return isInvitationId(alert.data.offerId)
    ? `/driver-dispatch/offers/${alert.data.offerId}` : undefined;
  return alert.kind === 'nearby' ? `/trip-requests/${alert.id}` : undefined;
}

/** Detail reads are fresh, authenticated GETs; unread does NOT mean unanswered. */
export function validateRecoveredDriverAlert(alert: RideAlert, raw: unknown, now = Date.now()): RideAlert | null {
  const detail = record(raw);
  if (!detail || !(timestamp(alert.data.ringUntil) > now)) return null;
  if (alert.kind === 'booking') {
    const trip = record(detail.trip), passenger = record(detail.passenger);
    const driverId = trip?.driverId ?? record(trip?.driver)?.id;
    const passengerId = detail.passengerId ?? passenger?.id;
    if (detail.id !== alert.id || detail.status !== 'pending' || driverId !== alert.recipientId ||
        !isInvitationId(passengerId) || passengerId === alert.recipientId ||
        !['upcoming', 'ongoing'].includes(String(trip?.status))) return null;
  } else if (alert.data.offerId !== undefined) {
    if (detail.id !== alert.data.offerId || detail.driverId !== alert.recipientId ||
        detail.requestId !== alert.data.tripRequestId || detail.status !== 'pending' || detail.actionable !== true) return null;
    // Never keep an old deadline when the server shortened the offer.
    const until = Math.min(timestamp(alert.data.ringUntil), timestamp(detail.expiresAt));
    const serverNow = timestamp(detail.serverNow);
    if (!Number.isFinite(until) || until <= now || !Number.isFinite(serverNow) || timestamp(detail.expiresAt) <= serverNow) return null;
    return { ...alert, expiresAt: new Date(until).toISOString(), data: { ...alert.data, ringUntil: new Date(until).toISOString() } };
  } else if (alert.kind === 'nearby') {
    const passengerId = detail.passengerId ?? record(detail.passenger)?.id;
    if (detail.id !== alert.id || !isInvitationId(passengerId) || passengerId === alert.recipientId ||
        !['pending', 'offers_received'].includes(String(detail.status)) || detail.selectedDriverId || detail.selectedDriver || detail.tripId ||
        detail.targetDriverDeclined === true || (detail.targetDriverId && detail.targetDriverId !== alert.recipientId) ||
        record(detail.responseWindow)?.phase === 'passenger' || record(detail.responseWindow)?.phase === 'accepting') return null;
    // The detail endpoint also rejects a previous refusal, another recipient,
    // an assigned request or a driver outside the allowed area.
  } else return null;
  return alert;
}
