import type { TripRequestVehicleType, VehicleType } from '@/types';

// Same threshold as bookings/trip-requests in the backend; not a vehicle capacity.
export const MAX_SEATS_WITHOUT_VERIFIED_IDENTITY = 2;
export const EXTRA_SEATS_IDENTITY_MESSAGE =
  'Pour réserver 3 places ou plus, votre identité doit être vérifiée. Aucun véhicule à ajouter pour les passagers.';

export function getPassengerVehicleSeatCapacity(type?: TripRequestVehicleType | VehicleType | null): number | null {
  if (type === 'motorcycle_2_wheels' || type === 'moto') return 2;
  if (type === 'motorcycle_3_wheels' || type === 'tricycle') return 3;
  // Cars have no fixed type-wide limit; bookings use the actual remaining seats.
  return null;
}

export function getPassengerSeatValidation(
  seats: number,
  isIdentityVerified: boolean,
  capacity: number | null = null,
): { reason: 'invalid' | 'capacity' | 'identity'; message: string } | null {
  if (!Number.isSafeInteger(seats) || seats < 1) {
    return { reason: 'invalid', message: 'Indiquez un nombre entier de places, à partir de 1.' };
  }
  if (capacity !== null && (!Number.isFinite(capacity) || seats > capacity)) {
    return { reason: 'capacity', message: `Ce trajet ou ce véhicule permet au maximum ${Math.max(0, Number.isFinite(capacity) ? Math.floor(capacity) : 0)} place(s).` };
  }
  if (!isIdentityVerified && seats > MAX_SEATS_WITHOUT_VERIFIED_IDENTITY) {
    return { reason: 'identity', message: EXTRA_SEATS_IDENTITY_MESSAGE };
  }
  return null;
}
