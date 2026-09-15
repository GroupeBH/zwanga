import {
  EDIT_SCHEDULE_SUGGESTION_LEAD_MS,
  isValidDate,
  getScheduleWindowDuration,
} from '../../features/request-detail/requestDetailModel';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { type TripRequestVehiclePriceOption } from '@/store/api/tripRequestApi';
import type { TripRequestVehicleType } from '@/types';
import React, { useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { User, TripRequest } from '@/types';

interface Params {
  setEditVehicleType: React.Dispatch<React.SetStateAction<TripRequestVehicleType>>;
  resetEditBudget: () => void;
  tripRequest: TripRequest | undefined;
  setEditAddressInputMode: React.Dispatch<React.SetStateAction<AddressInputMode>>;
  setEditDepartureLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditDepartureReference: React.Dispatch<React.SetStateAction<string>>;
  setEditArrivalLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditArrivalReference: React.Dispatch<React.SetStateAction<string>>;
  setEditDepartureDateMin: React.Dispatch<React.SetStateAction<Date | null>>;
  setEditDepartureDateMax: React.Dispatch<React.SetStateAction<Date | null>>;
  setEditNumberOfSeats: React.Dispatch<React.SetStateAction<string>>;
  requestedVehicleType: TripRequestVehicleType;
  setEditDescription: React.Dispatch<React.SetStateAction<string>>;
  setShowEditForm: React.Dispatch<React.SetStateAction<boolean>>;
  shouldOpenScheduleEditor: boolean;
  overdueScheduleEditorOpenedRef: React.RefObject<boolean>;
  currentUser: User | undefined;
  editPickerRestorePendingRef: React.RefObject<boolean>;
  editPickerTransitionTimerRef: React.RefObject<NodeJS.Timeout | null>;
  setEditLocationPickerType: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  setEditActivePicker: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
}

export function useRequestEditInitialization({
  setEditVehicleType,
  resetEditBudget,
  tripRequest,
  setEditAddressInputMode,
  setEditDepartureLocation,
  setEditDepartureManualAddress,
  setEditDepartureReference,
  setEditArrivalLocation,
  setEditArrivalManualAddress,
  setEditArrivalReference,
  setEditDepartureDateMin,
  setEditDepartureDateMax,
  setEditNumberOfSeats,
  requestedVehicleType,
  setEditDescription,
  setShowEditForm,
  shouldOpenScheduleEditor,
  overdueScheduleEditorOpenedRef,
  currentUser,
  editPickerRestorePendingRef,
  editPickerTransitionTimerRef,
  setEditLocationPickerType,
  setEditActivePicker,
}: Params) {
  const handleSelectEditVehicle = (option: TripRequestVehiclePriceOption) => {
    if (!option.availableForRequestedSeats) return;
    setEditVehicleType(option.vehicleType);
    resetEditBudget();
  };

  // Initialiser le formulaire de modification avec les valeurs actuelles
  const initializeEditForm = (suggestUpdatedSchedule = false) => {
    if (!tripRequest) return;
    const hasMapCoordinates = tripRequest.departure.hasCoordinates && tripRequest.arrival.hasCoordinates;
    setEditAddressInputMode(hasMapCoordinates ? 'map' : 'manual');
    
    setEditDepartureLocation(
      tripRequest.departure.hasCoordinates
        ? {
            title: tripRequest.departure.name,
            address: tripRequest.departure.address || '',
            latitude: tripRequest.departure.lat,
            longitude: tripRequest.departure.lng,
          }
        : null,
    );
    setEditDepartureManualAddress(tripRequest.departure.name || tripRequest.departure.address || '');
    setEditDepartureReference(tripRequest.departure.reference || '');
    
    setEditArrivalLocation(
      tripRequest.arrival.hasCoordinates
        ? {
            title: tripRequest.arrival.name,
            address: tripRequest.arrival.address || '',
            latitude: tripRequest.arrival.lat,
            longitude: tripRequest.arrival.lng,
          }
        : null,
    );
    setEditArrivalManualAddress(tripRequest.arrival.name || tripRequest.arrival.address || '');
    setEditArrivalReference(tripRequest.arrival.reference || '');
    
    const currentDepartureDateMin = new Date(tripRequest.departureDateMin);
    const currentDepartureDateMax = new Date(tripRequest.departureDateMax);
    const currentScheduleIsInvalid =
      !isValidDate(currentDepartureDateMin) ||
      !isValidDate(currentDepartureDateMax) ||
      currentDepartureDateMin.getTime() <= Date.now() ||
      currentDepartureDateMax.getTime() <= currentDepartureDateMin.getTime();
    if (
      suggestUpdatedSchedule ||
      currentScheduleIsInvalid
    ) {
      const suggestedMin = new Date(
        Date.now() + EDIT_SCHEDULE_SUGGESTION_LEAD_MS,
      );
      suggestedMin.setSeconds(0, 0);
      const previousWindowDuration = getScheduleWindowDuration(
        currentDepartureDateMin,
        currentDepartureDateMax,
      );
      setEditDepartureDateMin(suggestedMin);
      setEditDepartureDateMax(
        new Date(suggestedMin.getTime() + previousWindowDuration),
      );
    } else {
      setEditDepartureDateMin(currentDepartureDateMin);
      setEditDepartureDateMax(currentDepartureDateMax);
    }
    setEditNumberOfSeats(tripRequest.numberOfSeats.toString());
    setEditVehicleType(requestedVehicleType);
    resetEditBudget();
    setEditDescription(tripRequest.description || '');
  };

  const handleOpenEditForm = () => {
    initializeEditForm();
    setShowEditForm(true);
  };

  useEffect(() => {
    if (
      !shouldOpenScheduleEditor ||
      overdueScheduleEditorOpenedRef.current ||
      !tripRequest ||
      currentUser?.id !== tripRequest.passengerId ||
      !['pending', 'offers_received'].includes(tripRequest.status)
    ) {
      return;
    }

    overdueScheduleEditorOpenedRef.current = true;
    initializeEditForm(true);
    setShowEditForm(true);
    // The initializer intentionally runs once for this navigation intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentUser?.id,
    shouldOpenScheduleEditor,
    tripRequest?.id,
    tripRequest?.passengerId,
    tripRequest?.status,
  ]);

  const openEditLocationPicker = (target: 'departure' | 'arrival') => {
    Keyboard.dismiss();
    editPickerRestorePendingRef.current = false;
    setShowEditForm(false);
    editPickerTransitionTimerRef.current = setTimeout(() => {
      setEditLocationPickerType(target);
      setEditActivePicker(target);
      editPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const restoreEditFormAfterLocationPicker = () => {
    if (editPickerRestorePendingRef.current) return;
    editPickerRestorePendingRef.current = true;
    setEditActivePicker(null);
    setEditLocationPickerType(null);
    editPickerTransitionTimerRef.current = setTimeout(() => {
      setShowEditForm(true);
      editPickerRestorePendingRef.current = false;
      editPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  return {
    handleOpenEditForm,
    openEditLocationPicker,
    handleSelectEditVehicle,
    restoreEditFormAfterLocationPicker,
  };
}
