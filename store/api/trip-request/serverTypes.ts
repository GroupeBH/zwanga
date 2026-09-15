import type { TripPaymentMode, TripRequestVehicleType, UserGender } from '@/types';

export type ServerTripRequest = {
  id: string;
  passenger: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
    gender?: UserGender | null;
  };
  departureLocation: string;
  arrivalLocation: string;
  departureReference?: string | null;
  arrivalReference?: string | null;
  departureCoordinates: [number, number] | null;
  arrivalCoordinates: [number, number] | null;
  departureDateMin: string;
  departureDateMax: string;
  numberOfSeats: number;
  vehicleType?: TripRequestVehicleType;
  maxPricePerSeat: number | null;
  paymentMode?: TripPaymentMode | null;
  description: string | null;
  status: string;
  selectedDriver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
  } | null;
  selectedVehicle: {
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl: string | null;
  } | null;
  selectedPricePerSeat: number | null;
  selectedDriverRequiresPassengerKyc?: boolean | null;
  selectedAt: string | null;
  tripId: string | null;
  driverPickupOverdueNotifiedAt: string | null;
  driverOffers?: ServerDriverOffer[];
  createdAt: string;
  updatedAt: string;
};

export type ServerDriverOffer = {
  id: string;
  tripRequestId: string;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
    isPremium?: boolean;
    premiumBadge?: boolean;
  };
  vehicle: {
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl: string | null;
  } | null;
  proposedDepartureDate: string;
  pricePerSeat: number | string;
  availableSeats: number;
  message: string | null;
  departureReference?: string | null;
  departureCoordinates?: [number, number] | null;
  arrivalReference?: string | null;
  arrivalCoordinates?: [number, number] | null;
  requiresPassengerKyc?: boolean | null;
  status: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerDriverOfferWithTripRequest = {
  id: string;
  tripRequestId: string;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    profilePicture: string | null;
    isPremium?: boolean;
    premiumBadge?: boolean;
  };
  vehicle: {
    id: string;
    brand: string;
    model: string;
    color: string;
    licensePlate: string;
    photoUrl: string | null;
  } | null;
  proposedDepartureDate: string;
  pricePerSeat: number | string;
  availableSeats: number;
  message: string | null;
  departureReference?: string | null;
  departureCoordinates?: [number, number] | null;
  arrivalReference?: string | null;
  arrivalCoordinates?: [number, number] | null;
  requiresPassengerKyc?: boolean | null;
  status: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  tripRequest: {
    id: string;
    departureLocation: string;
    departureReference?: string | null;
    arrivalLocation: string;
    arrivalReference?: string | null;
    departureDateMin: string;
    departureDateMax: string;
    numberOfSeats: number;
    maxPricePerSeat: number | string | null;
    paymentMode?: TripPaymentMode | null;
    status: string;
    passenger: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      profilePicture: string | null;
    };
  };
};
