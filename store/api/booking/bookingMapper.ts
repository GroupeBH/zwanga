import {
  ServerUser,
  ServerBooking,
  ServerPassengerTripInterruptionRequest,
  ServerDriverTripInterruptionRequest,
} from './serverTypes';
import type {
  Booking,
  DriverTripInterruptionRequest,
  PassengerTripInterruptionRequest,
  TripInterruptionReason,
  TripInterruptionStatus,
} from '../../../types';
import { mapServerTripToClient } from '../trip/tripMapper';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export const formatPassengerName = (passenger?: ServerUser | null) => {
  if (!passenger) {
    return undefined;
  }
  const fullName = [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
  return fullName || undefined;
};

export const mapBookingCoordinates = (
  point?: { type: string; coordinates: [number, number] } | null,
  coordinates?: { latitude: number; longitude: number } | null,
) => {
  if (point) {
    return normalizeTripMapCoordinate(point.coordinates[1], point.coordinates[0]) ?? undefined;
  }
  if (coordinates) {
    return normalizeTripMapCoordinate(coordinates.latitude, coordinates.longitude) ?? undefined;
  }
  return undefined;
};

export const mapTripInterruptionReason = (reason?: string | null): TripInterruptionReason => {
  const normalizedReason = (reason ?? '').toLowerCase();
  switch (normalizedReason) {
    case 'emergency':
    case 'health':
    case 'safety':
    case 'route_issue':
    case 'personal':
    case 'other':
      return normalizedReason as TripInterruptionReason;
    default:
      return 'other';
  }
};

export const mapTripInterruptionStatus = (status?: string | null): TripInterruptionStatus => {
  switch ((status ?? '').toLowerCase()) {
    case 'confirmed':
    case 'approved':
    case 'accepted':
      return 'confirmed';
    case 'rejected':
    case 'declined':
      return 'rejected';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'completed':
    case 'done':
      return 'completed';
    default:
      return 'pending';
  }
};

export const resolveRequestedAt = (requestedAt?: string | null, createdAt?: string | null) =>
  requestedAt ?? createdAt ?? new Date(0).toISOString();

export const mapPassengerInterruptionRequest = (
  request?: ServerPassengerTripInterruptionRequest | null,
): PassengerTripInterruptionRequest | null => {
  if (!request?.id || !request.tripId || !request.bookingId || !request.passengerId) {
    return null;
  }

  return {
    id: request.id,
    tripId: request.tripId,
    bookingId: request.bookingId,
    passengerId: request.passengerId,
    requestedByRole: 'passenger',
    reason: mapTripInterruptionReason(request.reason),
    note: request.note ?? null,
    status: mapTripInterruptionStatus(request.status),
    requestedAt: resolveRequestedAt(request.requestedAt, request.createdAt),
    confirmedAt: request.confirmedAt ?? null,
    rejectedAt: request.rejectedAt ?? null,
    cancelledAt: request.cancelledAt ?? null,
    completedAt: request.completedAt ?? null,
    confirmedByDriverId: request.confirmedByDriverId ?? null,
    rejectedByDriverId: request.rejectedByDriverId ?? null,
  };
};

export const mapDriverInterruptionRequest = (
  request?: ServerDriverTripInterruptionRequest | null,
): DriverTripInterruptionRequest | null => {
  if (!request?.id || !request.tripId) {
    return null;
  }

  const confirmations = (request.confirmations ?? [])
    .filter((confirmation) => confirmation.bookingId && confirmation.passengerId)
    .map((confirmation) => ({
      id: confirmation.id,
      bookingId: confirmation.bookingId!,
      passengerId: confirmation.passengerId!,
      passengerName: confirmation.passengerName ?? formatPassengerName(confirmation.passenger),
      status:
        mapTripInterruptionStatus(confirmation.status) === 'confirmed'
          ? ('confirmed' as const)
          : mapTripInterruptionStatus(confirmation.status) === 'rejected'
            ? ('rejected' as const)
            : ('pending' as const),
      confirmedAt: confirmation.confirmedAt ?? null,
      rejectedAt: confirmation.rejectedAt ?? null,
      decision: confirmation.decision ?? null,
      decisionAt: confirmation.decisionAt ?? null,
    }));

  return {
    id: request.id,
    tripId: request.tripId,
    requestedByDriverId: request.requestedByDriverId ?? request.driverId ?? '',
    requestedByRole: 'driver',
    reason: mapTripInterruptionReason(request.reason),
    note: request.note ?? null,
    status: mapTripInterruptionStatus(request.status),
    requestedAt: resolveRequestedAt(request.requestedAt, request.createdAt),
    confirmedAt: request.confirmedAt ?? null,
    rejectedAt: request.rejectedAt ?? null,
    cancelledAt: request.cancelledAt ?? null,
    completedAt: request.completedAt ?? null,
    requiredPassengerCount: Number(request.requiredPassengerCount ?? confirmations.length) || confirmations.length,
    confirmedPassengerCount:
      Number(request.confirmedPassengerCount ?? confirmations.filter((item) => item.status === 'confirmed').length) ||
      0,
    rejectedPassengerCount:
      Number(request.rejectedPassengerCount ?? confirmations.filter((item) => item.status === 'rejected').length) || 0,
    confirmations,
  };
};

export const mapServerBookingToClient = (booking: ServerBooking): Booking => ({
  interruptionFareLocked: booking.interruptionFareLocked ?? false,
  id: booking.id,
  tripId: booking.tripId,
  passengerId: booking.passengerId,
  passengerName: formatPassengerName(booking.passenger),
  passengerAvatar: booking.passenger?.profilePicture ?? undefined,
  passengerPhone: booking.passenger?.phone ?? undefined,
  numberOfSeats: booking.numberOfSeats,
  status: booking.status ?? 'pending',
  paymentMode: booking.paymentMode ?? undefined,
  paymentStatus: booking.paymentStatus ?? undefined,
  paymentAmount: booking.paymentAmount ?? undefined,
  paymentCurrency: booking.paymentCurrency ?? undefined,
  paymentReference: booking.paymentReference ?? undefined,
  paymentTransactionId: booking.paymentTransactionId ?? undefined,
  paidAt: booking.paidAt ?? undefined,
  rejectionReason: booking.rejectionReason ?? undefined,
  acceptedAt: booking.acceptedAt ?? undefined,
  cancelledAt: booking.cancelledAt ?? undefined,
  noShowDetectedAt: booking.noShowDetectedAt ?? undefined,
  noShowReason: booking.noShowReason ?? undefined,
  noShowDriverDistanceMeters: booking.noShowDriverDistanceMeters ?? undefined,
  boardingUncertainDetectedAt: booking.boardingUncertainDetectedAt ?? undefined,
  boardingUncertainReason: booking.boardingUncertainReason ?? undefined,
  boardingUncertainDriverDistanceMeters: booking.boardingUncertainDriverDistanceMeters ?? undefined,
  pickupDetectionMethod: booking.pickupDetectionMethod ?? undefined,
  dropoffDetectionMethod: booking.dropoffDetectionMethod ?? undefined,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
  trip: booking.trip ? mapServerTripToClient(booking.trip) : undefined,
  passengerOrigin: booking.passengerOrigin ?? undefined,
  passengerOriginReference: booking.passengerOriginReference ?? undefined,
  passengerOriginCoordinates: mapBookingCoordinates(booking.passengerOriginPoint, booking.passengerOriginCoordinates),
  passengerDestination: booking.passengerDestination ?? undefined,
  passengerDestinationReference: booking.passengerDestinationReference ?? undefined,
  passengerDestinationCoordinates: mapBookingCoordinates(
    booking.passengerDestinationPoint,
    booking.passengerDestinationCoordinates,
  ),
  passengerLocationCoordinates: mapBookingCoordinates(
    booking.passengerCurrentLocation ?? booking.passengerLocationPoint,
    booking.passengerLocationCoordinates,
  ),
  passengerLocationUpdatedAt: booking.passengerLocationUpdatedAt ?? booking.passengerLastLocationUpdateAt ?? undefined,
  pickedUp: booking.pickedUp ?? false,
  pickedUpAt: booking.pickedUpAt ?? undefined,
  pickedUpConfirmedByPassenger: booking.pickedUpConfirmedByPassenger ?? false,
  pickedUpConfirmedAt: booking.pickedUpConfirmedAt ?? undefined,
  driverPickupArrivedAt: booking.driverPickupArrivedAt ?? undefined,
  droppedOff: booking.droppedOff ?? false,
  droppedOffAt: booking.droppedOffAt ?? undefined,
  droppedOffConfirmedByPassenger: booking.droppedOffConfirmedByPassenger ?? false,
  droppedOffConfirmedAt: booking.droppedOffConfirmedAt ?? undefined,
  passengerDestinationApproachNotifiedAt: booking.passengerDestinationApproachNotifiedAt ?? undefined,
  safetyEmergencyContactIds: booking.safetyEmergencyContactIds ?? [],
  interruptionRequest: mapPassengerInterruptionRequest(
    booking.interruptionRequest ?? booking.activeInterruptionRequest ?? booking.currentInterruptionRequest,
  ),
  tripInterruptionRequest: mapDriverInterruptionRequest(
    booking.tripInterruptionRequest ?? booking.activeTripInterruptionRequest,
  ),
});
