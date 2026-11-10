import type { TripRequestVehiclePriceOption } from '@/store/api/trip-request/contracts';
import type { TripRequestVehicleType } from '@/types';
import { getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';
import { formatCdfPrice } from './requestFormModel';

type EstimateState = {
  vehicleOptions: readonly TripRequestVehiclePriceOption[];
  hasDepartureAddress: boolean;
  hasArrivalAddress: boolean;
  numberOfSeats: number;
  isPriceLoading: boolean;
  isVehicleOptionsError: boolean;
};

/** Display only: the server total already includes the requested seats and pricing factors.
 * Never replace it with the passenger's budget or multiply it by seats again. */
export function requestVehicleEstimate(type: TripRequestVehicleType, state: EstimateState): string {
  const capacity = getPassengerVehicleSeatCapacity(type);
  if (!Number.isSafeInteger(state.numberOfSeats) || state.numberOfSeats < 1
    || (capacity !== null && state.numberOfSeats > capacity)) return 'Indisponible';
  if (!state.hasDepartureAddress || !state.hasArrivalAddress) return 'À calculer';
  if (state.isPriceLoading) return 'Calcul…';
  if (state.isVehicleOptionsError) return 'Indisponible';
  const option = state.vehicleOptions.find(value => value.vehicleType === type);
  const total = option?.recommendedTotalPrice;
  if (option?.availableForRequestedSeats !== true || typeof total !== 'number'
    || !Number.isFinite(total) || total < 1 || total > Number.MAX_SAFE_INTEGER) return 'Indisponible';
  return formatCdfPrice(total);
}
