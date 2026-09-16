import { getLocationText } from '../../features/request-detail/requestLocation';
import { getEditScheduleError } from '../../features/request-detail/requestDetailModel';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { usePassengerIdentityVerification } from '@/hooks/usePassengerIdentityVerification';
import { useEditRequestPricing } from '@/hooks/trip-request/useEditRequestPricing';
import { getPassengerSeatValidation, getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';
import type { TripRequestVehicleType } from '@/types';
import React from 'react';
import type { TripRequest } from '@/types';

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
  const editSeatCapacity = getPassengerVehicleSeatCapacity(editVehicleType);
  const openEditIdentityVerification = usePassengerIdentityVerification(
    () => setShowEditForm(false),
    () => setShowEditForm(true),
  );
  const selectedEditVehicleOption = editVehicleOptions.find(
    (option) => option.vehicleType === editVehicleType,
  );
  const isEditVehicleSelectionValid = Boolean(
    selectedEditVehicleOption?.availableForRequestedSeats
    || (!selectedEditVehicleOption && isEditVehicleOptionsError && isEditBudgetValid),
  );
  const editScheduleError = getEditScheduleError(
    editDepartureDateMin,
    editDepartureDateMax,
  );
  const isEditFormValid = Boolean(
    editDepartureAddress &&
    editArrivalAddress &&
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
