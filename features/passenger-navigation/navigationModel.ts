import { type BookingAutoProgressPayload } from '@/services/trackingSocket';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Platform } from 'react-native';
import { PROVIDER_GOOGLE } from 'react-native-maps';

export const MAX_PASSENGER_ROUTE_POINTS = Platform.OS === 'ios' ? 180 : 250;
export const IS_ANDROID = Platform.OS === 'android';
export const PASSENGER_NAVIGATION_MAP_PROVIDER = IS_ANDROID ? PROVIDER_GOOGLE : undefined;

export type BookingAutoProgressEvent = BookingAutoProgressPayload['events'][number];
export type PassengerPickupNoticeType = 'driver_near_pickup' | 'driver_arrived_pickup' | 'parties_nearby';
export type RouteSegmentFocus = 'route' | 'pickup';
export type PassengerRouteInfo = {
  distance: string;
  distanceMeters: number;
  duration: string;
  durationSeconds: number;
};
export const PASSENGER_PICKUP_NOTICE_PRIORITY: Record<PassengerPickupNoticeType, number> = {
  driver_near_pickup: 0,
  driver_arrived_pickup: 1,
  parties_nearby: 2,
};

export interface PassengerPickupNotice {
  type: PassengerPickupNoticeType;
  distanceMeters?: number;
  detectedAt?: string;
  expiresAt?: string;
  pickupWaitSeconds?: number;
}

// Fonction pour decoder les polylines Google
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    const latitude = lat / 1e5;
    const longitude = lng / 1e5;
    const coordinate = normalizeTripMapCoordinate(latitude, longitude);
    if (!coordinate) {
      return [];
    }

    points.push(coordinate);
  }

  // Limiter le nombre de points pour les performances
  if (points.length > MAX_PASSENGER_ROUTE_POINTS) {
    const step = Math.ceil(points.length / MAX_PASSENGER_ROUTE_POINTS);
    const simplified: { latitude: number; longitude: number }[] = [];
    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i]);
    }
    if (simplified[simplified.length - 1] !== points[points.length - 1]) {
      simplified.push(points[points.length - 1]);
    }
    return simplified;
  }

  return points;
}

export function formatDistanceMeters(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters)) {
    return null;
  }

  const safeDistance = Math.max(0, Math.round(distanceMeters));
  if (safeDistance >= 1000) {
    return `${(safeDistance / 1000).toFixed(1)} km`;
  }

  return `${safeDistance} m`;
}

export function formatDurationSeconds(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds)) {
    return '-';
  }

  if (durationSeconds <= 0) {
    return '0 min';
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.max(1, Math.ceil((durationSeconds % 3600) / 60));
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;
}
