import type { TripRequestVehicleType } from '@/types';

export const MIN_CAR_PUBLISH_SEATS = 4;

export function getPublishSeats(
  requestedSeats: string,
  vehicleType: TripRequestVehicleType | null | undefined,
): string {
  if (vehicleType === 'motorcycle_2_wheels') return '2';
  if (vehicleType === 'motorcycle_3_wheels') return '3';

  const count = Number(requestedSeats);
  return String(Number.isSafeInteger(count) ? Math.max(MIN_CAR_PUBLISH_SEATS, count) : MIN_CAR_PUBLISH_SEATS);
}
