import type { Trip, TripRequest } from '@/types';
import { isOwnWaitingRequest } from './priorityRequestEntry';

export function isLiveRequestTrip(request: TripRequest, trip: Trip) {
  return trip.id === request.tripId && trip.driverId === request.selectedDriverId && trip.driverId !== request.passengerId &&
    (!trip.driver?.id || trip.driver.id === trip.driverId) && !trip.completedAt &&
    (trip.status === 'ongoing' || (trip.status === 'upcoming' && !trip.startedAt && !trip.isExpired));
}

/** A confirmed order may already have a trip. Never resume it from that ID alone. */
export async function verifyOwnRequestEntry(request: TripRequest, userId: string,
  readTrip: (id: string) => Promise<Trip>) {
  if (!isOwnWaitingRequest(request, userId)) return false;
  if (!request.tripId) return true;
  const trip = await readTrip(request.tripId);
  return isLiveRequestTrip(request, trip);
}
