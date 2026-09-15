import type { BookingStatus, TripPaymentMode, TripPaymentStatus } from '../../../types';
import type { ServerTrip } from '../tripApi';
import type { BookingAutoProgressPayload } from '@/services/trackingSocket';

export type ServerUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string | null;
};

export type ServerBooking = {
  interruptionFareLocked?: boolean;
  id: string;
  tripId: string;
  passengerId: string;
  numberOfSeats: number;
  status: BookingStatus;
  paymentMode?: TripPaymentMode | null;
  paymentStatus?: TripPaymentStatus | null;
  paymentAmount?: number | string | null;
  paymentCurrency?: string | null;
  paymentReference?: string | null;
  paymentTransactionId?: string | null;
  paidAt?: string | null;
  rejectionReason?: string | null;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
  noShowDetectedAt?: string | null;
  noShowReason?: string | null;
  noShowDriverDistanceMeters?: number | null;
  boardingUncertainDetectedAt?: string | null;
  boardingUncertainReason?: string | null;
  boardingUncertainDriverDistanceMeters?: number | null;
  pickupDetectionMethod?: string | null;
  dropoffDetectionMethod?: string | null;
  createdAt: string;
  updatedAt: string;
  passenger?: ServerUser | null;
  trip?: ServerTrip | null;
  passengerOrigin?: string | null;
  passengerOriginReference?: string | null;
  passengerOriginCoordinates?: { latitude: number; longitude: number } | null;
  passengerOriginPoint?: { type: string; coordinates: [number, number] } | null;
  passengerDestination?: string | null;
  passengerDestinationReference?: string | null;
  passengerDestinationCoordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  passengerDestinationPoint?: {
    type: string;
    coordinates: [number, number];
  } | null;
  passengerLocationCoordinates?: { latitude: number; longitude: number } | null;
  passengerLocationPoint?: {
    type: string;
    coordinates: [number, number];
  } | null;
  passengerCurrentLocation?: {
    type: string;
    coordinates: [number, number];
  } | null;
  passengerLocationUpdatedAt?: string | null;
  passengerLastLocationUpdateAt?: string | null;
  pickedUp?: boolean;
  pickedUpAt?: string | null;
  pickedUpConfirmedByPassenger?: boolean;
  pickedUpConfirmedAt?: string | null;
  driverPickupArrivedAt?: string | null;
  droppedOff?: boolean;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean;
  droppedOffConfirmedAt?: string | null;
  passengerDestinationApproachNotifiedAt?: string | null;
  safetyEmergencyContactIds?: string[] | null;
  interruptionRequest?: ServerPassengerTripInterruptionRequest | null;
  activeInterruptionRequest?: ServerPassengerTripInterruptionRequest | null;
  currentInterruptionRequest?: ServerPassengerTripInterruptionRequest | null;
  tripInterruptionRequest?: ServerDriverTripInterruptionRequest | null;
  activeTripInterruptionRequest?: ServerDriverTripInterruptionRequest | null;
};

export type ServerTripInterruptionConfirmation = {
  decision?: 'wait' | 'stop' | null;
  decisionAt?: string | null;
  id?: string;
  bookingId?: string;
  passengerId?: string;
  passengerName?: string | null;
  status?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  passenger?: ServerUser | null;
};

export type ServerPassengerTripInterruptionRequest = {
  id?: string;
  tripId?: string;
  bookingId?: string;
  passengerId?: string;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  requestedAt?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  confirmedByDriverId?: string | null;
  rejectedByDriverId?: string | null;
};

export type ServerDriverTripInterruptionRequest = {
  id?: string;
  tripId?: string;
  requestedByDriverId?: string;
  driverId?: string;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  requestedAt?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  requiredPassengerCount?: number | null;
  confirmedPassengerCount?: number | null;
  rejectedPassengerCount?: number | null;
  confirmations?: ServerTripInterruptionConfirmation[] | null;
};

export type UpdatePassengerLocationResponse = {
  bookingId: string;
  coordinates: [number, number];
  updatedAt: string;
  autoProgress?: BookingAutoProgressPayload;
};
