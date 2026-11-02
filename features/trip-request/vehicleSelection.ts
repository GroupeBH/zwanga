import type { TripRequestVehicleType } from '@/types';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';

export function acceptedRequestVehicleTypes(request: {
  vehicleType?: TripRequestVehicleType; vehicleTypes?: TripRequestVehicleType[] | null;
}): TripRequestVehicleType[] {
  return request.vehicleTypes?.length ? [...request.vehicleTypes] : [request.vehicleType ?? 'car'];
}

/** Keep at least one choice, retaining the first choice as the pricing reference. */
export function toggleRequestVehicleType(types: TripRequestVehicleType[], type: TripRequestVehicleType) {
  return types.includes(type) ? (types.length === 1 ? types : types.filter(value => value !== type)) : [...types, type];
}

export function requestVehicleSeatCapacity(types: TripRequestVehicleType[]): number | null {
  const capacities = types.map(getPassengerVehicleSeatCapacity).filter((value): value is number => value !== null);
  return capacities.length ? Math.min(...capacities) : null;
}

export function requestVehicleLabel(request: Parameters<typeof acceptedRequestVehicleTypes>[0]): string {
  return acceptedRequestVehicleTypes(request).map(getRegisteredVehicleTypeLabel).join(' / ');
}
