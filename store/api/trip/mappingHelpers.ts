import { CoordinatesTuple, ServerUser, ServerDriverTripInterruptionRequest, ServerVehicle } from './serverTypes';
import type {
  BookingStatus,
  DriverTripInterruptionRequest,
  RecurringTripStatus,
  TripInterruptionReason,
  TripInterruptionStatus,
  TripRequestVehicleType,
  TripStatus,
  VehicleType,
} from '../../../types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export const mapServerVehicleTypeToClient = (
  vehicleType?: TripRequestVehicleType | VehicleType | null,
): VehicleType => {
  switch (vehicleType) {
    case 'motorcycle_2_wheels':
    case 'moto':
      return 'moto';
    case 'motorcycle_3_wheels':
    case 'tricycle':
      return 'tricycle';
    case 'car':
    default:
      return 'car';
  }
};

export type ServerRecurringTripTemplate = {
  id: string;
  driverId: string;
  departureLocation: string;
  arrivalLocation: string;
  departureReference?: string | null;
  arrivalReference?: string | null;
  departureCoordinates?: CoordinatesTuple;
  arrivalCoordinates?: CoordinatesTuple;
  departureTime: string;
  weekdays: number[];
  startDate: string;
  endDate?: string | null;
  totalSeats: number;
  pricePerSeat: number | string;
  isFree: boolean;
  description?: string | null;
  status: string;
  vehicleId: string;
  vehicle?: ServerVehicle | null;
  nextOccurrenceDate?: string | null;
  upcomingGeneratedTripsCount?: number;
  requiresPassengerKyc?: boolean | null;
  createdAt: string;
  updatedAt: string;
};

export const fallbackCoordinate = (coords?: CoordinatesTuple): { lat: number; lng: number } | null => {
  if (!coords || coords.length < 2) {
    return null;
  }
  const [lng, lat] = coords;
  const coordinate = normalizeTripMapCoordinate(lat, lng);

  if (!coordinate) {
    return null;
  }

  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };
};

export const formatFullName = (user?: ServerUser | null) => {
  if (!user) return 'Conducteur';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Conducteur';
};

export const resolveUserAverageRating = (user?: ServerUser | null): number => {
  const parsed = Number(user?.averageRating ?? user?.rating);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const mapTripStatus = (status?: string): TripStatus => {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'planned':
      return 'upcoming';
    case 'ongoing':
    case 'in_progress':
    case 'running':
      return 'ongoing';
    case 'completed':
    case 'done':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'upcoming';
  }
};

export const mapRecurringTripStatus = (status?: string): RecurringTripStatus => {
  return (status ?? '').toLowerCase() === 'paused' ? 'paused' : 'active';
};

export const mapBookingStatus = (status?: string): BookingStatus | undefined => {
  const normalizedStatus = (status ?? '').toLowerCase();

  switch (normalizedStatus) {
    case 'pending':
    case 'accepted':
    case 'rejected':
    case 'cancelled':
    case 'no_show':
    case 'boarding_uncertain':
    case 'completed':
    case 'expired':
      return normalizedStatus as BookingStatus;
    default:
      return undefined;
  }
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

export const mapDriverInterruptionRequest = (
  request?: ServerDriverTripInterruptionRequest | null,
): DriverTripInterruptionRequest | null => {
  if (!request?.id || !request.tripId) {
    return null;
  }

  const confirmations = (request.confirmations ?? [])
    .filter((confirmation) => confirmation.bookingId && confirmation.passengerId)
    .map((confirmation) => {
      const confirmationStatus = mapTripInterruptionStatus(confirmation.status);
      return {
        id: confirmation.id,
        bookingId: confirmation.bookingId!,
        passengerId: confirmation.passengerId!,
        passengerName: confirmation.passengerName ?? formatFullName(confirmation.passenger),
        status:
          confirmationStatus === 'confirmed'
            ? 'confirmed' as const
            : confirmationStatus === 'rejected'
              ? 'rejected' as const
              : 'pending' as const,
        confirmedAt: confirmation.confirmedAt ?? null,
        rejectedAt: confirmation.rejectedAt ?? null,
        decision: confirmation.decision ?? null,
        decisionAt: confirmation.decisionAt ?? null,
      };
    });

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
    requiredPassengerCount:
      Number(request.requiredPassengerCount ?? confirmations.length) || confirmations.length,
    confirmedPassengerCount:
      Number(request.confirmedPassengerCount ?? confirmations.filter((item) => item.status === 'confirmed').length) || 0,
    rejectedPassengerCount:
      Number(request.rejectedPassengerCount ?? confirmations.filter((item) => item.status === 'rejected').length) || 0,
    confirmations,
  };
};
