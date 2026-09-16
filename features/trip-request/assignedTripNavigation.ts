import type { Trip, TripRequest } from '@/types';
import { getErrorStatus } from '@/utils/errorHelpers';

export function canUseCachedRequestLink(error: unknown): boolean {
  if (!error) return true;
  const status = getErrorStatus(error);
  return status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR' || status === 408 ||
    status === 429 || (typeof status === 'number' && status >= 500 && status < 600);
}

export function getAssignedPassengerTripId(
  requestId: string | undefined,
  request: TripRequest | undefined,
  userId: string | undefined,
  error?: unknown,
): string | null {
  if (!requestId || request?.id !== requestId || !userId ||
    request.passengerId !== userId || !canUseCachedRequestLink(error)) return null;
  // Expiring the request must not remove access to the real trip it created.
  return request.tripId || null;
}

export function hasAssignedTripStarted(tripId: string | null, trip: Trip | undefined): boolean {
  if (!tripId || trip?.id !== tripId) return false;
  return Boolean(trip.startedAt || trip.status === 'ongoing' || trip.status === 'completed' ||
    trip.interruptionRequest);
}
