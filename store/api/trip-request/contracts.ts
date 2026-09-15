import type { TripPaymentMode, TripRequestVehicleType } from '@/types';

export type CreateTripRequestPayload = {
  departureLocation: string;
  departureReference?: string;
  departureCoordinates?: [number, number];
  arrivalLocation: string;
  arrivalReference?: string;
  arrivalCoordinates?: [number, number];
  departureDateMin: string; // ISO string date
  departureDateMax: string; // ISO string date
  numberOfSeats?: number;
  vehicleType: TripRequestVehicleType;
  maxPricePerSeat?: number;
  paymentMode?: TripPaymentMode;
  description?: string;
};

export type RecommendTripRequestPricePayload = {
  departureLocation?: string;
  departureReference?: string;
  departureCoordinates?: [number, number];
  arrivalLocation?: string;
  arrivalReference?: string;
  arrivalCoordinates?: [number, number];
  numberOfSeats?: number;
};

export type TripRequestPriceRecommendation = {
  currency: 'CDF';
  distanceMeters: number | null;
  numberOfSeats: number;
  pricePerKmPerPassenger: number;
  recommendedPricePerSeat: number | null;
  recommendedTotalPrice: number | null;
};

export type TripRequestVehiclePriceOption = {
  vehicleType: TripRequestVehicleType;
  displayName: string;
  maximumSeats: number | null;
  availableForRequestedSeats: boolean;
  pricePerKmPerPassenger: number;
  recommendedPricePerSeat: number | null;
  recommendedTotalPrice: number | null;
};

export type TripRequestVehicleOptions = {
  currency: 'CDF';
  pricingModel: 'distance_per_vehicle_type';
  distanceMeters: number | null;
  numberOfSeats: number;
  weatherImpact: {
    priceMultiplier: number;
    [key: string]: unknown;
  };
  options: TripRequestVehiclePriceOption[];
};

export const tripRequestListTag = { type: 'TripRequest' as const, id: 'LIST' };
export const myTripRequestsListTag = { type: 'MyTripRequests' as const, id: 'LIST' };
export const driverOfferListTag = { type: 'DriverOffer' as const, id: 'LIST' };
export const myDriverOffersListTag = { type: 'MyDriverOffers' as const, id: 'LIST' };
export const tripListTag = { type: 'Trip' as const, id: 'LIST' };
export const myTripsListTag = { type: 'MyTrips' as const, id: 'LIST' };
export const bookingListTag = { type: 'Booking' as const, id: 'LIST' };

export type CreateDriverOfferPayload = {
  proposedDepartureDate: string; // ISO string date
  pricePerSeat: number;
  availableSeats: number;
  vehicleId?: string;
  message?: string;
  departureReference?: string;
  departureCoordinates?: [number, number];
  arrivalReference?: string;
  arrivalCoordinates?: [number, number];
  requiresPassengerKyc?: boolean;
};

export type AcceptDriverOfferPayload = {
  offerId: string;
};

export type AcceptTripRequestPayload = {
  vehicleId: string;
  departureDate?: string; // ISO string date
  message?: string;
  departureReference?: string;
  departureCoordinates?: [number, number];
  arrivalReference?: string;
  arrivalCoordinates?: [number, number];
  requiresPassengerKyc?: boolean;
};
