import { MapLocationSelection } from '@/components/LocationPickerModal';
import {
  formatCdfPrice,
  formatDistanceKm,
  getLocationText,
  getRequestBudgetState,
} from '@/features/trip-request/requestFormModel';
import { useMemo } from 'react';
import { useRequestVehicleOptions } from './useRequestVehicleOptions';

interface Params {
  departureLocation: MapLocationSelection | null;
  departureManualAddress: string;
  arrivalLocation: MapLocationSelection | null;
  arrivalManualAddress: string;
  departureReference: string;
  arrivalReference: string;
  numberOfSeats: number;
  hasSpecifiedNumberOfSeats: boolean;
  selectedVehicleType: TripRequestVehicleType;
  maxPricePerSeat: string;
  hasEditedBudget: boolean;
}

export function useRequestBudgetSummary({
  departureLocation,
  departureManualAddress,
  arrivalLocation,
  arrivalManualAddress,
  departureReference,
  arrivalReference,
  numberOfSeats,
  hasSpecifiedNumberOfSeats,
  selectedVehicleType,
  maxPricePerSeat,
  hasEditedBudget,
}: Params) {
  const departureAddress = getLocationText(departureLocation, departureManualAddress);

  const arrivalAddress = getLocationText(arrivalLocation, arrivalManualAddress);

  const hasDepartureAddress = departureAddress.length > 0;

  const hasArrivalAddress = arrivalAddress.length > 0;

  const { vehicleOptions, routeDistanceMeters, isPriceLoading, isVehicleOptionsError, retryVehicleOptions } = useRequestVehicleOptions({
    departureAddress, arrivalAddress, departureReference, arrivalReference, departureLocation, arrivalLocation,
    numberOfSeats, hasSpecifiedNumberOfSeats,
  });

  const selectedVehicleOption = useMemo(
    () => vehicleOptions.find((option) => option.vehicleType === selectedVehicleType),
    [selectedVehicleType, vehicleOptions],
  );

  const {
    recommendedPricePerSeat,
    selectedVehicleOptionUnavailable,
    canSubmitRequestDetails,
    budgetValue,
  } = getRequestBudgetState(maxPricePerSeat, hasEditedBudget, selectedVehicleOption);

  const budgetLabel = budgetValue > 0
    ? formatCdfPrice(budgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'Prix à calculer';

  const requestSeatsLabel = `${numberOfSeats} place${numberOfSeats > 1 ? 's' : ''}`;

  const totalBudgetValue = budgetValue > 0 ? budgetValue * numberOfSeats : 0;

  const totalBudgetLabel = totalBudgetValue > 0
    ? formatCdfPrice(totalBudgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'À définir';

  const budgetHintLabel = hasEditedBudget
    ? 'Votre budget maximum par place'
    : isVehicleOptionsError && vehicleOptions.length === 0
      ? 'Fixez votre budget pour continuer'
      : 'Prix recommandé par place';

  const routeDistanceLabel = formatDistanceKm(routeDistanceMeters);

  return {
    vehicleOptions,
    recommendedPricePerSeat,
    hasDepartureAddress,
    hasArrivalAddress,
    departureAddress,
    arrivalAddress,
    canSubmitRequestDetails,
    budgetValue,
    selectedVehicleOptionUnavailable,
    budgetHintLabel,
    budgetLabel,
    isPriceLoading,
    isVehicleOptionsError,
    requestSeatsLabel,
    routeDistanceLabel,
    retryVehicleOptions,
    totalBudgetLabel,
  };
}
import type { TripRequestVehicleType } from '@/types';
