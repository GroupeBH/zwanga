import type { DriverLocationPayload, PassengerLocationPayload } from './trackingSocket.types';
import type { Message } from '@/types';
import { warnThrottled } from '@/utils/throttledWarning';

export const MAX_SOCKET_LOCATION_BATCH = 256;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const date = (value: unknown) => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));

export function isDriverLocation(value: unknown): value is DriverLocationPayload {
  if (!record(value) || !id(value.tripId)) return false;
  const point = value.coordinates;
  return (point === null || (Array.isArray(point) && point.length === 2 &&
    typeof point[0] === 'number' && typeof point[1] === 'number' &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) &&
    (value.updatedAt == null || date(value.updatedAt));
}

export function isPassengerLocation(value: unknown): value is PassengerLocationPayload {
  return isDriverLocation(value) && record(value) && id(value.bookingId) &&
    (value.passengerId === undefined || id(value.passengerId));
}

export function readPassengerLocations(payload: unknown): PassengerLocationPayload[] {
  const values = Array.isArray(payload) ? payload : record(payload) ? payload.locations : undefined;
  if (!Array.isArray(values)) {
    warnThrottled('[TrackingSocket] Lot de positions invalide ignoré.');
    return [];
  }
  const accepted = values.slice(0, MAX_SOCKET_LOCATION_BATCH).filter(isPassengerLocation);
  if (accepted.length !== values.length) warnThrottled('[TrackingSocket] Lot de positions limité ou filtré.');
  return accepted;
}

export function isChatMessage(value: unknown): value is Message {
  return record(value) && id(value.id) && id(value.conversationId) && id(value.senderId) &&
    typeof value.content === 'string' && value.content.length <= 20_000 && date(value.createdAt) &&
    (value.isRead === undefined || typeof value.isRead === 'boolean');
}

/** No payload or exception content in logs: messages/locations may contain personal data. */
export function deliverSocketEvent<T>(listeners: Set<(value: T) => void>, value: T) {
  listeners.forEach(listener => {
    try { listener(value); }
    catch { warnThrottled('[Socket] Un abonné a interrompu le traitement de son événement.'); }
  });
}
