import type { Trip, TripRequest } from '@/types';
import { isAcceptedRequestTrip } from '@/features/navigation/acceptedRequestEntry';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export interface HomeAcceptedDriverCourse { trip: Trip; request: TripRequest | null }

/** A publication alone is not an accepted course. The live assignment must still belong to this driver. */
export function resolveHomeAcceptedDriverCourse(candidate: Trip | undefined, userId: string | undefined,
  request?: TripRequest, refreshedTrip?: Trip): HomeAcceptedDriverCourse | null {
  if (!candidate || !userId || !isAcceptedRequestTrip(candidate, userId)) return null;
  const trip = refreshedTrip ?? candidate;
  if (trip.id !== candidate.id || trip.tripRequestId !== candidate.tripRequestId || !isAcceptedRequestTrip(trip, userId)) return null;
  if (request && (request.id !== trip.tripRequestId || request.tripId !== trip.id
    || request.status !== 'driver_selected' || request.selectedDriverId !== userId || request.passengerId === userId)) return null;
  // Departure time alone never cancels an assignment: rely on the server's request/trip state.
  return { trip, request: request ?? null };
}

export function acceptedCoursePoints(course?: HomeAcceptedDriverCourse | null) {
  const location = course?.request ?? course?.trip;
  const point = (place: Trip['departure'] | undefined) => place?.hasCoordinates === false ? null
    : normalizeTripMapCoordinate(place?.lat, place?.lng);
  return { departure: point(location?.departure), arrival: point(location?.arrival) };
}
