import type { TripRequest } from '@/types';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { getTripLocationCoordinate, normalizeTripMapCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';

export const HOME_REQUEST_HIGHLIGHT_MS = 10 * 60 * 1000;
export { isRequestUnassigned } from './requestExpiration';

export function compareRequestDepartureTimes(left: TripRequest, right: TripRequest) {
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };
  return timestamp(left.departureDateMin) - timestamp(right.departureDateMin)
    || left.id.localeCompare(right.id);
}

/** Approximate straight-line distance; no routing API request is needed. */
export function getRequestDepartureDistance(request: TripRequest, origin?: MapCoordinate | null) {
  const driver = origin ? normalizeTripMapCoordinate(origin.latitude, origin.longitude) : null;
  const departure = getTripLocationCoordinate(request.departure);
  return driver && departure ? calculateDistanceMeters(driver, departure) : null;
}

export function rankRequestsByProximity(requests: readonly TripRequest[], origin?: MapCoordinate | null) {
  // Compute each distance once, and never mutate the RTK Query cache array.
  return requests
    .map(request => ({ request, distance: getRequestDepartureDistance(request, origin) }))
    .sort((left, right) => {
      if (left.distance !== null && right.distance === null) return -1;
      if (left.distance === null && right.distance !== null) return 1;
      if (left.distance !== null && right.distance !== null && left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return compareRequestDepartureTimes(left.request, right.request);
    })
    .map(({ request }) => request);
}

export function formatRequestDistance(distanceMeters: number | null) {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) return null;
  if (distanceMeters < 100) return 'À moins de 100 m de vous';
  if (distanceMeters < 1000) return `Départ à environ ${Math.round(distanceMeters / 10) * 10} m`;
  return `Départ à environ ${(distanceMeters / 1000).toFixed(1).replace('.', ',')} km`;
}
