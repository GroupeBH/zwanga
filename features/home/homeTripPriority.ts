import type { Trip } from '@/types';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { getTripLocationCoordinate, normalizeTripMapCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';

/** Rank departures locally, without a routing request or mutating the RTK Query cache. */
export function rankHomeTripsByProximity(
  trips: readonly Trip[],
  origin: MapCoordinate | null | undefined,
  bookedTripIds: ReadonlySet<string>,
  now = Date.now(),
) {
  const coordinate = origin ? normalizeTripMapCoordinate(origin.latitude, origin.longitude) : null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;

  // Each distance and date is computed once, not for every comparator invocation.
  return trips.map(trip => {
    const departure = getTripLocationCoordinate(trip.departure);
    const timestamp = Date.parse(trip.departureTime);
    const departureTime = Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
    return {
      trip,
      booked: bookedTripIds.has(trip.id),
      distance: coordinate && departure ? calculateDistanceMeters(coordinate, departure) : null,
      departureTime,
      today: departureTime >= todayStart && departureTime < tomorrowStart,
    };
  }).sort((left, right) => {
    // Existing reservations remain easy to find, ahead of new suggestions.
    if (left.booked !== right.booked) return left.booked ? -1 : 1;
    if (left.booked && right.booked && (left.trip.status === 'ongoing') !== (right.trip.status === 'ongoing')) {
      return left.trip.status === 'ongoing' ? -1 : 1;
    }
    if (left.distance !== null && right.distance === null) return -1;
    if (left.distance === null && right.distance !== null) return 1;
    if (left.distance !== null && right.distance !== null && left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    // Keep the existing chronological fallback when GPS is missing or distances match.
    if (left.today !== right.today) return left.today ? -1 : 1;
    return left.departureTime - right.departureTime || left.trip.id.localeCompare(right.trip.id);
  }).map(({ trip }) => trip);
}
