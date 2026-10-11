import { decodeSafePolyline } from '@/utils/routes/safePolyline';
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
  routeSignature?: string;
  fetchedAt?: number;
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

// Bound decoding before allocating map coordinates; preserve platform and regional limits.
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  return decodeSafePolyline(encoded, MAX_PASSENGER_ROUTE_POINTS,
    point => normalizeTripMapCoordinate(point.latitude, point.longitude));
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
