import type { Trip } from '@/types';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { getTripLocationCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';

/** Offline/cache fallback only. API pages retain the server's global ordering. */
export function sortSearchTrips(trips: readonly Trip[], cheap: boolean, origin?: MapCoordinate | null) {
  return trips.map(trip => {
    const point = getTripLocationCoordinate(trip.departure);
    const date = Date.parse(trip.departureTime);
    return { trip, date: Number.isFinite(date) ? date : Number.MAX_SAFE_INTEGER,
      distance: origin && point ? calculateDistanceMeters(origin, point) : Number.MAX_SAFE_INTEGER };
  }).sort((a, b) => (cheap ? Number(a.trip.price ?? 0) - Number(b.trip.price ?? 0) : 0)
    || a.date - b.date || a.distance - b.distance || a.trip.id.localeCompare(b.trip.id))
    .map(({ trip }) => trip);
}
