import type { TripRequestVehicleType } from '@/types';
import { getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';

export const MIN_PUBLISH_SEATS = 1;
export const DEFAULT_CAR_PUBLISH_SEATS = 4;

export function getDefaultPublishSeats(vehicleType: TripRequestVehicleType | null | undefined): string {
  return String(getPassengerVehicleSeatCapacity(vehicleType) ?? DEFAULT_CAR_PUBLISH_SEATS);
}

export function getPublishSeats(
  requestedSeats: string,
  vehicleType: TripRequestVehicleType | null | undefined,
): string {
  const count = Number(requestedSeats);
  if (!requestedSeats.trim() || !Number.isSafeInteger(count)) return getDefaultPublishSeats(vehicleType);
  const maximum = getPassengerVehicleSeatCapacity(vehicleType) ?? Number.MAX_SAFE_INTEGER;
  return String(Math.min(maximum, Math.max(MIN_PUBLISH_SEATS, count)));
}
