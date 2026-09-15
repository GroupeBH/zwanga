import type { TripPaymentMode, TripRequestVehicleType, UserGender, VehicleType } from './common';
import type { Location } from './trips';

export type TripRequestStatus = 'pending' | 'offers_received' | 'driver_selected' | 'cancelled' | 'expired';

export interface TripRequest {
  id: string;
  passengerId: string;
  passengerName?: string;
  passengerAvatar?: string;
  passengerGender?: UserGender | null;
  departure: Location;
  arrival: Location;
  departureDateMin: string; // ISO string date - Date/heure de départ minimum souhaitée
  departureDateMax: string; // ISO string date - Date/heure de départ maximum acceptée
  numberOfSeats: number;
  vehicleType: TripRequestVehicleType;
  maxPricePerSeat?: number | null; // Prix maximum par place accepté (optionnel)
  paymentMode?: TripPaymentMode | null;
  description?: string | null;
  status: TripRequestStatus;
  selectedDriverId?: string | null; // Driver sélectionné par le passager
  selectedDriverName?: string; // Nom du driver sélectionné
  selectedDriverAvatar?: string; // Avatar du driver sélectionné
  selectedVehicleId?: string | null; // Véhicule du driver sélectionné
  selectedVehicle?: { // Informations du véhicule sélectionné
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl?: string;
  } | null;
  selectedPricePerSeat?: number | null; // Prix accepté pour le driver sélectionné
  selectedAt?: string | null; // Date de sélection du driver
  tripId?: string | null; // ID du trip créé à partir de cette demande
  selectedDriverRequiresPassengerKyc?: boolean | null;
  driverPickupOverdueNotifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  offers?: DriverOffer[]; // Offres reçues des drivers
}

export type DriverOfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface DriverOffer {
  id: string;
  tripRequestId: string;
  driverId: string;
  driverName?: string;
  driverAvatar?: string;
  driverRating?: number;
  driverIsPremium?: boolean;
  driverPremiumBadge?: boolean;
  vehicleId?: string | null;
  vehicleType?: VehicleType;
  vehicleInfo?: string;
  proposedDepartureDate: string; // ISO string date - Date/heure de départ proposée par le driver
  pricePerSeat: number; // Prix proposé par place
  availableSeats: number; // Nombre de places disponibles
  message?: string | null; // Message optionnel du driver
  departureReference?: string | null;
  departureCoordinates?: [number, number] | null;
  arrivalReference?: string | null;
  arrivalCoordinates?: [number, number] | null;
  requiresPassengerKyc?: boolean;
  status: DriverOfferStatus;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverOfferWithTripRequest extends DriverOffer {
  tripRequest: {
    id: string;
    departureLocation: string;
    departureReference?: string | null;
    arrivalLocation: string;
    arrivalReference?: string | null;
    departureDateMin: string; // ISO string date
    departureDateMax: string; // ISO string date
    numberOfSeats: number;
    maxPricePerSeat: number | null;
    paymentMode?: TripPaymentMode | null;
    status: TripRequestStatus;
    passenger: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      profilePicture: string | null;
    };
  };
}
