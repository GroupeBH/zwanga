import type {
  BookingStatus,
  RecurringTripStatus,
  TripPaymentMode,
  TripPaymentStatus,
  TripRequestVehicleType,
  TripStatus,
  VehicleType,
} from './common';
import type { TripDriverInfo } from './users';
import type { DriverTripInterruptionRequest, PassengerTripInterruptionRequest } from './interruptions';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface Vehicle {
  id: string;
  ownerId: string;
  type: TripRequestVehicleType;
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  photoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  name: string;
  address: string;
  lat: number;
  lng: number;
  reference?: string | null;
  hasCoordinates?: boolean;
}

export interface Trip {
  id: string;
  driverId: string;
  driverName: string;
  driverAvatar?: string;
  driverRating: number;
  driver?: TripDriverInfo | null;
  vehicleType: VehicleType;
  vehicleInfo: string;
  departure: Location;
  arrival: Location;
  departureTime: string; // ISO string date
  arrivalTime: string; // ISO string date
  price: number;
  isFree?: boolean;
  availableSeats: number;
  totalSeats: number;
  status: TripStatus;
  passengers?: Passenger[];
  progress?: number;
  currentLocation?: GeoPoint | null;
  lastLocationUpdateAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null; // ISO string date - Date de complétion du trajet
  vehicleId?: string | null; // ID du véhicule associé
  description?: string | null; // Description du trajet
  vehicle?: Vehicle; // Informations complètes du véhicule
  driverSafetyEmergencyContactIds?: string[];
  tripRequestId?: string | null;
  recurringTemplateId?: string | null;
  recurringOccurrenceDate?: string | null;
  isFeatured?: boolean;
  requiresPassengerKyc?: boolean;
  interruptionRequest?: DriverTripInterruptionRequest | null;
}

export interface RecurringTripTemplate {
  id: string;
  driverId: string;
  departure: Location;
  arrival: Location;
  departureTime: string;
  weekdays: number[];
  startDate: string;
  endDate?: string | null;
  totalSeats: number;
  pricePerSeat: number;
  isFree: boolean;
  description?: string | null;
  status: RecurringTripStatus;
  vehicleId: string;
  vehicle?: Vehicle | null;
  nextOccurrenceDate?: string | null;
  upcomingGeneratedTripsCount: number;
  requiresPassengerKyc?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Passenger {
  id: string;
  name: string;
  avatar?: string;
  rating: number;
  phone: string;
  bookingId?: string;
  bookingStatus?: BookingStatus;
  seats?: number;
}

export interface Booking {
  interruptionFareLocked?: boolean;
  id: string;
  tripId: string;
  passengerId: string;
  passengerName?: string;
  passengerAvatar?: string;
  passengerPhone?: string;
  numberOfSeats: number;
  status: BookingStatus;
  paymentMode?: TripPaymentMode | null;
  paymentStatus?: TripPaymentStatus | null;
  paymentAmount?: number | string | null;
  paymentCurrency?: string | null;
  paymentReference?: string | null;
  paymentTransactionId?: string | null;
  paidAt?: string | null;
  rejectionReason?: string;
  acceptedAt?: string;
  cancelledAt?: string;
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
  trip?: Trip;
  // Point de récupération personnalisé du passager
  passengerOrigin?: string | null;
  passengerOriginReference?: string | null;
  passengerOriginCoordinates?: { latitude: number; longitude: number } | null;
  // Destination personnalisée du passager
  passengerDestination?: string | null;
  passengerDestinationReference?: string | null;
  passengerDestinationCoordinates?: { latitude: number; longitude: number } | null;
  // Derniere position partagee pendant un trajet en cours
  passengerLocationCoordinates?: { latitude: number; longitude: number } | null;
  passengerLocationUpdatedAt?: string | null;
  // Confirmation de récupération
  pickedUp?: boolean;
  pickedUpAt?: string | null;
  pickedUpConfirmedByPassenger?: boolean;
  pickedUpConfirmedAt?: string | null;
  driverPickupArrivedAt?: string | null;
  // Signalement et confirmation de l'arrivée
  droppedOff?: boolean;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean;
  droppedOffConfirmedAt?: string | null;
  passengerDestinationApproachNotifiedAt?: string | null;
  safetyEmergencyContactIds?: string[];
  interruptionRequest?: PassengerTripInterruptionRequest | null;
  tripInterruptionRequest?: DriverTripInterruptionRequest | null;
}
