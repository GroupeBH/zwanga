import type { TripInterruptionConfirmationStatus, TripInterruptionReason, TripInterruptionStatus } from './common';

export interface PassengerTripInterruptionRequest {
  id: string;
  tripId: string;
  bookingId: string;
  passengerId: string;
  requestedByRole: 'passenger';
  reason: TripInterruptionReason;
  note?: string | null;
  status: TripInterruptionStatus;
  requestedAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  confirmedByDriverId?: string | null;
  rejectedByDriverId?: string | null;
}

export interface DriverTripInterruptionConfirmation {
  id?: string;
  bookingId: string;
  passengerId: string;
  passengerName?: string | null;
  status: TripInterruptionConfirmationStatus;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  decision?: 'wait' | 'stop' | null;
  decisionAt?: string | null;
}

export interface InterruptionFareQuote {
  id: string;
  requestId: string;
  bookingId: string;
  currency: 'CDF';
  originalPassengerAmount: number;
  prepaidAmount: number;
  passengerAmount: number;
  minimumAmount: number;
  minimumApplied: boolean;
  plannedDistanceMeters: number;
  travelledDistanceMeters: number;
  travelledPercentage: number;
}

export interface DriverTripInterruptionRequest {
  id: string;
  tripId: string;
  requestedByDriverId: string;
  requestedByRole: 'driver';
  reason: TripInterruptionReason;
  note?: string | null;
  status: TripInterruptionStatus;
  requestedAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  requiredPassengerCount: number;
  confirmedPassengerCount: number;
  rejectedPassengerCount: number;
  confirmations: DriverTripInterruptionConfirmation[];
}
