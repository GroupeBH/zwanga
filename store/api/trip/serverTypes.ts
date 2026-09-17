import type { GeoPoint, TripRequestVehicleType, VehicleType } from '../../../types';

export type CoordinatesTuple = [number, number] | null | undefined;

export type ServerUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string | null;
  rating?: number | null;
  averageRating?: number | null;
  totalRatings?: number;
  role?: string;
  status?: string;
  isDriver?: boolean;
  isPremium?: boolean;
  premiumBadge?: boolean;
};

export type ServerBooking = {
  id: string;
  seats?: number;
  status?: string;
  passenger: ServerUser | null;
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

export type ServerVehicle = {
  id: string;
  ownerId: string;
  type?: TripRequestVehicleType;
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  photoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServerTrip = {
  id: string;
  driverId: string;
  driver?: ServerUser | null;
  departureLocation: string;
  arrivalLocation: string;
  departureReference?: string | null;
  arrivalReference?: string | null;
  departureCoordinates?: CoordinatesTuple;
  arrivalCoordinates?: CoordinatesTuple;
  departureDate: string;
  previewArrivalDate?: string | null;
  estimatedDurationSeconds?: number | null;
  arrivalEstimateSource?: 'trip_start' | 'route' | 'approximate' | 'unavailable';
  availableSeats: number;
  totalSeats?: number; // Nombre total de places (ajouté par le backend)
  pricePerSeat: number | string;
  isFree?: boolean;
  description?: string;
  status?: string;
  vehicleType?: TripRequestVehicleType | VehicleType;
  vehicleId?: string | null;
  vehicle?: ServerVehicle | null;
  bookings?: ServerBooking[];
  currentLocation?: GeoPoint | null;
  lastLocationUpdateAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  driverSafetyEmergencyContactIds?: string[];
  tripRequestId?: string | null;
  recurringTemplateId?: string | null;
  recurringOccurrenceDate?: string | null;
  isFeatured?: boolean;
  requiresPassengerKyc?: boolean | null;
  interruptionRequest?: ServerDriverTripInterruptionRequest | null;
  activeInterruptionRequest?: ServerDriverTripInterruptionRequest | null;
  currentInterruptionRequest?: ServerDriverTripInterruptionRequest | null;
};
