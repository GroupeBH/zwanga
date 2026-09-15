import type { TripStatus } from '../../../types';

export const cleanObject = <T extends Record<string, unknown>>(value: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(value).filter(([, current]) => current !== undefined && current !== null),
  ) as Partial<T>;
};

export const tripListTag = { type: 'Trip' as const, id: 'LIST' };
export const myTripsListTag = { type: 'MyTrips' as const, id: 'LIST' };
export const recurringTripListTag = { type: 'RecurringTrip' as const, id: 'LIST' };
export const bookingListTag = { type: 'Booking' as const, id: 'LIST' };

/**
 * API trajets
 * Gère la création, recherche, réservation et gestion des trajets
 */
export type TripSearchParams = {
  keywords?: string;
  departureLocation?: string;
  arrivalLocation?: string;
  departureCoordinates?: [number, number];
  arrivalCoordinates?: [number, number];
  departureRadiusKm?: number;
  arrivalRadiusKm?: number;
  departureDate?: string;
  minSeats?: number;
  maxPrice?: number;
  isFree?: boolean;
};

export type TripSearchByPointsPayload = {
  keywords?: string | null;
  departureCoordinates?: [number, number] | null;
  arrivalCoordinates?: [number, number] | null;
  departureRadiusKm?: number | null;
  arrivalRadiusKm?: number | null;
  departureDate?: string | null;
  minSeats?: number | null;
  maxPrice?: number | null;
};

export type CreateTripPayload = {
  departureLocation: string;
  departureReference?: string;
  departureCoordinates?: [number, number];
  arrivalLocation: string;
  arrivalReference?: string;
  arrivalCoordinates?: [number, number];
  departureDate: string;
  totalSeats: number;
  // availableSeats: number | null | undefined;
  pricePerSeat: number;
  isFree?: boolean;
  description?: string;
  vehicleId?: string;
  requiresPassengerKyc?: boolean;
};

export type CreateRecurringTripPayload = {
  departureLocation: string;
  departureReference?: string;
  departureCoordinates?: [number, number];
  arrivalLocation: string;
  arrivalReference?: string;
  arrivalCoordinates?: [number, number];
  startDate: string;
  endDate?: string;
  departureTime: string;
  weekdays: number[];
  totalSeats: number;
  pricePerSeat: number;
  isFree?: boolean;
  description?: string;
  vehicleId: string;
  requiresPassengerKyc?: boolean;
};

export type UpdateTripRequest = Partial<CreateTripPayload> & {
  status?: TripStatus;
};

export type DriverEmergencyContactsResponse = {
  tripId: string;
  emergencyContactIds: string[];
  contacts: { id: string; name: string; phone: string }[];
};
