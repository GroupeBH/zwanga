import type { Trip, TripRequest } from '@/types';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';

const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kinshasa', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The service day is Kinshasa's calendar day, not UTC or the phone's timezone. */
export function isDepartureToday(departure: string, now = Date.now()) {
  const time = Date.parse(departure);
  return Number.isFinite(time) && Number.isFinite(now) && localDay.format(time) === localDay.format(now);
}

function isUnstartedDriverTrip(trip: Trip, userId: string) {
  return ownsTrip(trip, userId) && trip.status === 'upcoming' && !trip.startedAt && !trip.completedAt && !trip.isExpired;
}

export const acceptedRequestEntryKey = (trip: Trip) => `accepted-request:${trip.id}`;

export function isAcceptedRequestTrip(trip: Trip, userId: string, now = Date.now()) {
  return isUnstartedDriverTrip(trip, userId) && Boolean(trip.tripRequestId) && isDepartureToday(trip.departureTime, now);
}

/** Discovery uses the shared driver's activity list, never the passenger-only my-requests list. */
export function selectAcceptedRequestTrip(trips: readonly Trip[], userId: string, excluded: Set<string>, now = Date.now()) {
  return trips.filter(trip => !excluded.has(acceptedRequestEntryKey(trip)) && isAcceptedRequestTrip(trip, userId, now))
    .sort((a, b) => Date.parse(a.departureTime) - Date.parse(b.departureTime) || a.id.localeCompare(b.id))[0];
}

export function canResumeAcceptedRequest(request: TripRequest, trip: Trip, userId: string, trips: readonly Trip[], now = Date.now()) {
  if (!isAcceptedRequestTrip(trip, userId, now) || request.id !== trip.tripRequestId || request.tripId !== trip.id ||
    request.selectedDriverId !== userId || request.passengerId === userId || request.status !== 'driver_selected' ||
    !isDepartureToday(request.departureDateMin, now) || !isTripRequestWithinAcceptanceWindow(request, now)) return false;
  const desiredDeparture = Date.parse(request.departureDateMin);
  // Completed/cancelled rides, old days and the trip created from this request
  // are not competing publications. Equal departure times do not count as earlier.
  return !trips.some(other => other.id !== trip.id && !other.tripRequestId && isUnstartedDriverTrip(other, userId) &&
    isDepartureToday(other.departureTime, now) && Date.parse(other.departureTime) < desiredDeparture);
}
