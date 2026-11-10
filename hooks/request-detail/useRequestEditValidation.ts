import { getLocationText } from '../../features/request-detail/requestLocation';
import { missingRequestReference } from '@/features/trip-request/requestReference';
import { getEditScheduleError } from '../../features/request-detail/requestDetailModel';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { usePassengerIdentityVerification } from '@/hooks/usePassengerIdentityVerification';
import { requestVehicleSeatCapacity } from '@/features/trip-request/vehicleSelection';
import { useEditRequestPricing } from '@/hooks/trip-request/useEditRequestPricing';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import type { TripRequestVehicleType, TripRequest } from '@/types';
import React from 'react';

interface Params {
  editAddressInputMode: AddressInputMode;
  editDepartureManualAddress: string;
  editDepartureLocation: MapLocationSelection | null;
  editArrivalManualAddress: string;
  editArrivalLocation: MapLocationSelection | null;
  editNumberOfSeats: string;
  showEditForm: boolean;
  tripRequest: TripRequest | undefined;
  editVehicleType: TripRequestVehicleType;
  editVehicleTypes: TripRequestVehicleType[];
  editDepartureReference: string;
  editArrivalReference: string;
  setShowEditForm: React.Dispatch<React.SetStateAction<boolean>>;
  editDepartureDateMin: Date | null;
  editDepartureDateMax: Date | null;
}

export function useRequestEditValidation({
  editAddressInputMode,
  editDepartureManualAddress,
  editDepartureLocation,
  editArrivalManualAddress,
  editArrivalLocation,
  editNumberOfSeats,
  showEditForm,
  tripRequest,
  editVehicleType,
  editVehicleTypes,
  editDepartureReference,
  editArrivalReference,
  setShowEditForm,
  editDepartureDateMin,
  editDepartureDateMax,
}: Params) {
  const editDepartureAddress =
    editAddressInputMode === 'manual'
      ? editDepartureManualAddress.trim()
      : getLocationText(editDepartureLocation, editDepartureManualAddress);
  const editArrivalAddress =
    editAddressInputMode === 'manual'
      ? editArrivalManualAddress.trim()
      : getLocationText(editArrivalLocation, editArrivalManualAddress);
  const parsedEditNumberOfSeats = Number(editNumberOfSeats);
  const {
    vehicleOptions: editVehicleOptions,
    vehiclePriceMultiplier: editVehiclePriceMultiplier,
    isPriceLoading: isEditVehicleOptionsLoading,
    isVehicleOptionsError: isEditVehicleOptionsError,
    retryVehicleOptions: retryEditVehicleOptions,
    maxPricePerSeat: editMaxPricePerSeat,
    setMaxPricePerSeat: setEditMaxPricePerSeat,
    resetBudget: resetEditBudget,
    isBudgetValid: isEditBudgetValid,
    confirmedPricePerSeat: parsedEditBudget,
  } = useEditRequestPricing({
    enabled: showEditForm && Boolean(tripRequest?.id),
    requestId: tripRequest?.id,
    initialBudget: tripRequest?.maxPricePerSeat,
    vehicleType: editVehicleType,
    departureAddress: editDepartureAddress,
    arrivalAddress: editArrivalAddress,
    departureReference: editDepartureReference,
    arrivalReference: editArrivalReference,
    departureLocation: editAddressInputMode === 'map' ? editDepartureLocation : null,
    arrivalLocation: editAddressInputMode === 'map' ? editArrivalLocation : null,
    numberOfSeats: parsedEditNumberOfSeats,
    hasSpecifiedNumberOfSeats: true,
  });
  const editSeatCapacity = requestVehicleSeatCapacity(editVehicleTypes);
  const openEditIdentityVerification = usePassengerIdentityVerification(
    () => setShowEditForm(false),
    () => setShowEditForm(true),
  );
  const isEditVehicleSelectionValid = editVehicleTypes.length > 0 && editVehicleTypes.every(type => {
    const option = editVehicleOptions.find(option => option.vehicleType === type);
    return option?.availableForRequestedSeats || (!option && isEditVehicleOptionsError && isEditBudgetValid);
  });
  const editScheduleError = getEditScheduleError(
    editDepartureDateMin,
    editDepartureDateMax,
  );
  const isEditFormValid = Boolean(
    editDepartureAddress &&
    editArrivalAddress &&
    !missingRequestReference(editDepartureAddress, editDepartureReference, editAddressInputMode === 'map' ? editDepartureLocation : null) &&
    !missingRequestReference(editArrivalAddress, editArrivalReference, editAddressInputMode === 'map' ? editArrivalLocation : null) &&
    !editScheduleError &&
    Number.isFinite(parsedEditNumberOfSeats) &&
    parsedEditNumberOfSeats >= 1 &&
    !getPassengerSeatValidation(parsedEditNumberOfSeats, true, editSeatCapacity) &&
    isEditVehicleSelectionValid && isEditBudgetValid,
  );

  return {
    resetEditBudget,
    isEditVehicleOptionsLoading,
    editDepartureAddress,
    editArrivalAddress,
    parsedEditNumberOfSeats,
    editSeatCapacity,
    isEditVehicleSelectionValid,
    openEditIdentityVerification,
    parsedEditBudget,
    isEditBudgetValid,
    editScheduleError,
    editVehiclePriceMultiplier,
    editVehicleOptions,
    isEditVehicleOptionsError,
    retryEditVehicleOptions,
    editMaxPricePerSeat,
    setEditMaxPricePerSeat,
    isEditFormValid,
  };
}
