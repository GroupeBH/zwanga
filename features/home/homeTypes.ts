import {
  type PassengerTrackingMarkerStatus
} from '@/components/TrackingMapMarkers';
import {
  type BookingAutoProgressPayload
} from '@/services/trackingSocket';
import type { Booking, Trip, TripRequest } from '@/types';
export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type TripPreviewCardProps = {
  cardWidth: number;
  isBooked: boolean;
  isSelected: boolean;
  onOpen: (tripId: string) => void;
  trip: Trip;
};

export type TripRequestPreviewCardProps = {
  cardWidth: number;
  onOpen: (requestId: string) => void;
  request: TripRequest;
};

export type TripVehicleMapMarkerProps = {
  isSelected: boolean;
  onReady?: () => void;
  trip: Trip;
};

export type HomeSheetMode = 'trips' | 'requests';

export type UserLocationMarkerState = {
  address: string;
  coordinate: MapCoordinate;
  title: string;
};

export type DriverPassengerMarker = {
  bookingId: string;
  coordinate: MapCoordinate;
  isLive: boolean;
  isVisible: boolean;
  passengerId: string;
  passengerName: string;
  status: PassengerTrackingMarkerStatus;
};

export type HomeAutoProgressEvent = BookingAutoProgressPayload['events'][number];

export type LivePassengerLocation = {
  coordinate: MapCoordinate;
  updatedAt?: string | null;
};

export type FeaturedDriverReservation = {
  booking: Booking;
  trip: Trip;
};
