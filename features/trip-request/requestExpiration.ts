import type { TripRequest } from '@/types';

// Both grace periods start at departureDateMax, never createdAt or selectedAt.
// These affect the request only, not its linked trip/bookings/payments.
export const UNACCEPTED_TRIP_REQUEST_EXPIRATION_MS = 30 * 1000;
export const ACCEPTED_TRIP_REQUEST_EXPIRATION_MS = 2 * 60 * 60 * 1000;

type ExpirableRequest = Pick<TripRequest, 'status' | 'departureDateMax'> &
  Partial<Pick<TripRequest, 'selectedDriverId' | 'tripId' | 'offers'>>;

export function isRequestUnassigned(request: ExpirableRequest) {
  return (request.status === 'pending' || request.status === 'offers_received')
    && !hasAcceptedDriver(request);
}

export function hasAcceptedDriver(request: ExpirableRequest) {
  return request.status === 'driver_selected'
    || Boolean(request.tripId)
    || Boolean(request.selectedDriverId)
    || Boolean(request.offers?.some(offer => offer.status === 'accepted'));
}

export function getTripRequestExpirationAt(request: ExpirableRequest): number | null {
  if (request.status !== 'pending' && request.status !== 'offers_received' && request.status !== 'driver_selected') return null;
  const departure = Date.parse(request.departureDateMax);
  const gracePeriod = hasAcceptedDriver(request)
    ? ACCEPTED_TRIP_REQUEST_EXPIRATION_MS
    : UNACCEPTED_TRIP_REQUEST_EXPIRATION_MS;
  return Number.isFinite(departure) ? departure + gracePeriod : null;
}

export function hasTripRequestExpired(request: ExpirableRequest, now = Date.now()) {
  const deadline = getTripRequestExpirationAt(request);
  return request.status === 'expired' || (deadline !== null && deadline <= now);
}

export function isTripRequestWithinAcceptanceWindow(request: ExpirableRequest, now = Date.now()) {
  if (request.status === 'expired' || request.status === 'cancelled') return false;
  const deadline = getTripRequestExpirationAt(request);
  // A malformed legacy date cannot prove an accepted request has expired.
  if (deadline === null && hasAcceptedDriver(request)) return true;
  return deadline !== null && deadline > now;
}
