import type { ImageRequireSource } from 'react-native';
import type { Trip, TripRequest } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { getTripMarkerImage, getTripRequestMarkerImage } from './homeMapAssets';
import { homePriorityKeys } from './homePriorityDismissal';

export const HOME_MAP_MARKER_LIMIT = 10;

export type HomeMapMarker = {
  key: string;
  kind: 'trip' | 'request';
  id: string;
  coordinate: { latitude: number; longitude: number };
  image: ImageRequireSource;
  title: string;
};

const route = (from?: { name?: string; address?: string }, to?: { name?: string; address?: string }) =>
  `${from?.name || from?.address || 'Départ'} → ${to?.name || to?.address || 'Arrivée'}`;

/** Public departure points already loaded by Home, never live driver positions.
 * Passengers see published trips by vehicle type; drivers see nearby clients. */
export function buildHomeMapMarkers({ isDriver, latestTrips, availableDriverRequests, hiddenHomePriorities = {} }: {
  isDriver: boolean;
  latestTrips: Trip[];
  availableDriverRequests: TripRequest[];
  hiddenHomePriorities?: Record<string, boolean>;
}): HomeMapMarker[] {
  const markers: HomeMapMarker[] = [];
  if (isDriver) {
    for (const request of availableDriverRequests) {
      if (markers.length >= HOME_MAP_MARKER_LIMIT) break;
      if (!request?.id || hiddenHomePriorities[homePriorityKeys.nearbyRequest(request)]) continue;
      if (request.departure?.hasCoordinates === false) continue;
      const coordinate = normalizeTripMapCoordinate(request.departure?.lat, request.departure?.lng);
      if (!coordinate) continue;
      markers.push({ key: `request:${request.id}`, kind: 'request', id: request.id, coordinate,
        image: getTripRequestMarkerImage(request.passengerGender), title: route(request.departure, request.arrival) });
    }
    return markers;
  }
  for (const trip of latestTrips) {
    if (markers.length >= HOME_MAP_MARKER_LIMIT) break;
    if (!trip?.id || trip.departure?.hasCoordinates === false) continue;
    const coordinate = normalizeTripMapCoordinate(trip.departure?.lat, trip.departure?.lng);
    if (!coordinate) continue;
    markers.push({ key: `trip:${trip.id}`, kind: 'trip', id: trip.id, coordinate,
      image: getTripMarkerImage(trip, false), title: route(trip.departure, trip.arrival) });
  }
  return markers;
}

export function homeMapMarkerSummary(isDriver: boolean, count: number): string | null {
  if (count <= 0) return null;
  if (isDriver) return `${count} client${count > 1 ? 's' : ''} près de vous`;
  return `${count} départ${count > 1 ? 's' : ''} près de vous`;
}
