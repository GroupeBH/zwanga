import type { DriverTripRevenueSummary } from '@/types';

export type LocationUpdateAcknowledgement = {
  success?: boolean;
  ok?: boolean;
  message?: string;
  error?: string;
};

export interface DriverLocationPayload {
  tripId: string;
  coordinates: [number, number] | null;
  updatedAt?: string | null;
}

export interface PassengerLocationPayload {
  tripId: string;
  bookingId: string;
  passengerId?: string;
  coordinates: [number, number] | null;
  updatedAt?: string | null;
}

export interface TrackingLocationMetadata {
  accuracy?: number;
  speed?: number;
  heading?: number;
  recordedAt?: string;
}

export type BoardingDetectionState =
  | 'DRIVER_APPROACHING'
  | 'BOARDING_CANDIDATE'
  | 'SHARED_MOVEMENT_DETECTED'
  | 'BOARDING_CONFIRMED'
  | 'BOARDING_CANDIDATE_EXPIRED'
  | 'BOARDING_REJECTED';

export type BoardingRejectionReason =
  | 'LOCATION_MISSING'
  | 'LOCATION_STALE'
  | 'GPS_ACCURACY_TOO_LOW'
  | 'TIMESTAMPS_TOO_FAR_APART'
  | 'NOT_CLOSE_ENOUGH'
  | 'NOT_ENOUGH_DRIVER_MOVEMENT'
  | 'NOT_ENOUGH_PASSENGER_MOVEMENT'
  | 'DIRECTION_UNAVAILABLE'
  | 'DIRECTION_MISMATCH'
  | 'SPEED_MISMATCH'
  | 'PROXIMITY_NOT_STABLE'
  | 'SHARED_MOVEMENT_TOO_SHORT'
  | 'SHARED_DISTANCE_TOO_SHORT'
  | 'PASSENGER_LOCATION_INACTIVE'
  | 'INVALID_STATE_TRANSITION'
  | 'IMPOSSIBLE_GPS_JUMP';

export interface BookingAutoProgressEvent {
  type:
    | 'driver_near_pickup'
    | 'driver_arrived_pickup'
    | 'parties_nearby'
    | 'passenger_ready_pickup'
    | 'pickup_confirmed'
    | 'passenger_no_show'
    | 'passenger_boarding_uncertain'
    | 'passenger_near_destination'
    | 'dropoff_confirmed'
    | 'driver_near_destination'
    | 'driver_arrived_destination';
  bookingId?: string;
  tripId: string;
  passengerId?: string;
  distanceMeters?: number;
  detectedAt?: string;
  expiresAt?: string;
  pickupWaitSeconds?: number;
  boardingState?: BoardingDetectionState;
  confidenceScore?: number;
  decision?: 'CONFIRM' | 'OBSERVE' | 'REJECT';
  rejectionReason?: BoardingRejectionReason | null;
  noShowReason?: string;
  boardingUncertainReason?: string;
  detectionMethod?: string;
  revenueSummary?: DriverTripRevenueSummary;
}

export interface BookingAutoProgressPayload {
  tripId: string;
  events: BookingAutoProgressEvent[];
}

export type LocationListener = (payload: DriverLocationPayload) => void;
export type PassengerLocationListener = (payload: PassengerLocationPayload) => void;
export type BookingAutoProgressListener = (payload: BookingAutoProgressPayload) => void;
export type ErrorListener = (message: string) => void;
