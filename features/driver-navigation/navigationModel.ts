import { type PassengerTrackingMarkerStatus } from '@/components/TrackingMapMarkers';
import { type BookingAutoProgressPayload } from '@/services/trackingSocket';
import type { Booking, DriverTripRevenueSummary } from '@/types';
import {
  LOCATION_FRESHNESS_MS,
  ROUTE_DEVIATION_THRESHOLD_METERS,
  type NavigationCoordinate,
} from '@/utils/navigation/routeProgress';
import { Platform } from 'react-native';

export interface RouteStep {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  end_location: { lat: number; lng: number };
  html_instructions: string;
  maneuver?: string;
  polyline: { points: string };
  start_location: { lat: number; lng: number };
  travel_mode: string;
}

export interface Waypoint {
  id: string;
  type: 'pickup' | 'dropoff';
  location: { lat: number; lng: number };
  address: string;
  passenger: {
    id: string;
    name: string;
    phone?: string;
  };
  booking: Booking;
  completed: boolean;
}

export type RouteCoordinate = NavigationCoordinate;

export type MapEdgePadding = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export interface PassengerMapLocation {
  bookingId: string;
  coordinate: RouteCoordinate;
  isLive: boolean;
  passengerId: string;
  passengerName: string;
  status: PassengerTrackingMarkerStatus;
}

export type RouteSectionFocus = 'next' | 'remaining';

export type FetchRouteOptions = {
  originOverride?: RouteCoordinate;
  announceReroute?: boolean;
  fitToRoute?: boolean;
};

export type PickupNoticeEventType =
  | 'driver_near_pickup'
  | 'driver_arrived_pickup'
  | 'parties_nearby'
  | 'passenger_ready_pickup';

export type BookingAutoProgressEvent = BookingAutoProgressPayload['events'][number];

export interface PickupNotice {
  type: PickupNoticeEventType;
  waypoint: Waypoint;
  distanceMeters?: number;
  detectedAt?: string;
  expiresAt?: string;
  pickupWaitSeconds?: number;
}

export interface PickupBypassConfirmation {
  waypoint: Waypoint;
  distanceMeters: number;
  closestDistanceMeters: number;
  hasPassedPickupOnRoute: boolean;
  isPickupBehindDriver: boolean;
  detectedAt: string;
}

export interface TripEndNotice {
  tripId: string;
  completedWhileAppInactive?: boolean;
  distanceMeters?: number;
  detectedAt?: string;
  revenueSummary?: DriverTripRevenueSummary;
  revenueSummaryUnavailable?: boolean;
}

export type LivePassengerLocation = {
  coordinate: RouteCoordinate;
  updatedAt?: string | null;
};

export const SPEECH_LANGUAGE = 'fr-FR';
export const SPEECH_RATE = 0.95;
export const SPEECH_MIN_INTERVAL_MS = 2500;
export const MAX_LIVE_PASSENGER_MARKERS = Platform.OS === 'ios' ? 10 : 16;
export const USE_ANDROID_NAVIGATION_MARKER_IMAGES = Platform.OS === 'android';
export const ANDROID_PIN_MARKER_ANCHOR = { x: 0.5, y: 0.88 };
export const DRIVER_DROPOFF_APPROACH_DISTANCE_KM = 0.04;
export const DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS = 5000;
export const FRESH_DRIVER_LOCATION_MAX_AGE_MS = LOCATION_FRESHNESS_MS;
export const OFF_ROUTE_DISTANCE_KM = ROUTE_DEVIATION_THRESHOLD_METERS / 1000;
export const DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS = 55;
export const DRIVER_REROUTE_CONFIRMATION_COUNT = 2;
export const DRIVER_REROUTE_MIN_INTERVAL_MS = 12_000;
export const PICKUP_BYPASS_OBSERVED_DISTANCE_METERS = 90;
export const PICKUP_BYPASS_MIN_AHEAD_METERS = 120;
export const PICKUP_BYPASS_MIN_DISTANCE_METERS = 160;
export const PICKUP_BYPASS_BEHIND_HEADING_DEGREES = 125;
export const DIRECT_NEAR_WAYPOINT_ROUTE_DISTANCE_METERS = 120;
export const DIRECT_NEAR_WAYPOINT_REACHED_DISTANCE_METERS = 30;
export const DIRECT_NEAR_WAYPOINT_MAX_TURN_DEGREES = 35;
export const DIRECT_NEAR_WAYPOINT_MAX_ROUTE_RATIO = 1.35;
export const ROUTE_TURN_SEGMENT_MIN_METERS = 8;
export const MAP_FIT_MIN_COORDINATE_DISTANCE_METERS = 2;
export const MAP_POLYLINE_MIN_COORDINATE_DISTANCE_METERS = 0.5;
export const DEFAULT_MAP_FOCUS_DELTA = 0.01;
export const KINSHASA_FALLBACK_MAP_COORDINATE: RouteCoordinate = {
  latitude: -4.4419,
  longitude: 15.2663,
};
