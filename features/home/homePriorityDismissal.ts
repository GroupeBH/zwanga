import type { Booking, Trip, TripRequest } from '@/types';

export type HiddenHomePriorities = Readonly<Record<string, true>>;
export const EMPTY_HIDDEN_HOME_PRIORITIES: HiddenHomePriorities = Object.freeze({});

// Do not use updatedAt: background location/refetches must not revive dismissed cards.
export const homePriorityKeys = {
  booking: (booking: Pick<Booking, 'id'>) => `booking:${booking.id}`,
  upcomingTrip: (trip: Pick<Trip, 'id' | 'departureTime'>) => `trip:${trip.id}:${trip.departureTime}`,
  nearbyRequest: (request: Pick<TripRequest, 'id' | 'departureDateMax'>) => `nearby:${request.id}:${request.departureDateMax}`,
  ownRequest: (request: Pick<TripRequest, 'id' | 'status' | 'departureDateMin' | 'offers'>) =>
    `request:${request.id}:${request.status}:${request.departureDateMin}:${request.offers?.length ?? 0}`,
};

export function shouldDismissHomePriority(translationX: number, velocityX: number, width: number) {
  'worklet';
  if (!Number.isFinite(translationX) || !Number.isFinite(velocityX) || !Number.isFinite(width) || width <= 0) return false;
  // Ignore taps, small drags, and a fast reversal toward the starting point.
  return Math.abs(translationX) >= Math.max(72, width * 0.28) ||
    (Math.abs(translationX) >= 32 && Math.abs(velocityX) >= 800 && translationX * velocityX > 0);
}
