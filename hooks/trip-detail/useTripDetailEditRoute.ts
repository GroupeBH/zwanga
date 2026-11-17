import {
  LOCATION_PICKER_OPEN_DELAY_MS,
  getLocationText,
  EditTripStep,
} from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { buildManualGeocodeQuery, mapGeocodeResponseToSelection } from '@/utils/manualAddressGeocode';
import React, { useCallback } from 'react';
import { Keyboard } from 'react-native';
import type { TripEditReferences } from '@/hooks/trips/useTripEditReferences';
import { getTripEditReferenceError } from '@/features/trips/tripEditReferences';

interface Params {
  editReferences: TripEditReferences;
  setEditDepartureSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  editArrivalSelection: MapLocationSelection | null;
  setEditArrivalSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  editDepartureSelection: MapLocationSelection | null;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  editArrivalManualAddress: string;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  editDepartureManualAddress: string;
  setEditTripModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEditRoutePickerTarget: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  geocodeManualAddress: ReturnType<typeof useGeocodeMutation>[0];
  editRouteMode: "manual" | "map";
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  setIosPickerMode: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  setEditStep: React.Dispatch<React.SetStateAction<EditTripStep>>;
}

export function useTripDetailEditRoute({
  editReferences,
  setEditDepartureSelection,
  editArrivalSelection,
  setEditArrivalSelection,
  editDepartureSelection,
  setEditDepartureManualAddress,
  editArrivalManualAddress,
  setEditArrivalManualAddress,
  editDepartureManualAddress,
  setEditTripModalVisible,
  setEditRoutePickerTarget,
  geocodeManualAddress,
  editRouteMode,
  showDialog,
  setIosPickerMode,
  setEditStep,
}: Params) {
  const swapEditRoutePoints = () => {
    editReferences.swap();
    setEditDepartureSelection(editArrivalSelection);
    setEditArrivalSelection(editDepartureSelection);
    setEditDepartureManualAddress(editArrivalManualAddress);
    setEditArrivalManualAddress(editDepartureManualAddress);
  };

  const openEditRoutePicker = (target: 'departure' | 'arrival') => {
    Keyboard.dismiss();
    setEditTripModalVisible(false);
    setTimeout(() => {
      setEditRoutePickerTarget(target);
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  const restoreEditModalAfterRoutePicker = () => {
    setEditRoutePickerTarget(null);
    setTimeout(() => {
      setEditTripModalVisible(true);
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  const resolveManualAddressSelection = useCallback(
    async (address: string, label: string) => {
      const trimmedAddress = address.trim();
      if (!trimmedAddress) {
        return null;
      }

      try {
        const response = await geocodeManualAddress({
          address: buildManualGeocodeQuery(trimmedAddress),
          region: 'cd',
        }).unwrap();
        return mapGeocodeResponseToSelection(trimmedAddress, response);
      } catch (error) {
        console.warn(`Manual ${label} geocode failed`, error);
        return null;
      }
    },
    [geocodeManualAddress],
  );

  const handleContinueEditTrip = () => {
    const departureAddress =
      editRouteMode === 'manual'
        ? editDepartureManualAddress.trim()
        : getLocationText(editDepartureSelection, '');
    const arrivalAddress =
      editRouteMode === 'manual'
        ? editArrivalManualAddress.trim()
        : getLocationText(editArrivalSelection, '');

    if (!departureAddress || !arrivalAddress) {
      showDialog({
        variant: 'warning',
        title: 'Adresses requises',
        message: 'Indiquez un départ et une arrivée avant de continuer.',
      });
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showDialog({
        variant: 'warning',
        title: 'Trajet invalide',
        message: "Le départ et l'arrivée doivent être différents.",
      });
      return;
    }

    const referenceError = getTripEditReferenceError(editReferences, departureAddress, arrivalAddress,
      editDepartureSelection, editArrivalSelection);
    if (referenceError) {
      showDialog({ variant: 'warning', title: 'Repère requis', message: referenceError });
      return;
    }
    Keyboard.dismiss();
    setIosPickerMode(null);
    setEditStep(2);
  };

  const handleBackToEditRoute = () => {
    Keyboard.dismiss();
    setIosPickerMode(null);
    setEditStep(1);
  };

  return {
    resolveManualAddressSelection,
    swapEditRoutePoints,
    handleContinueEditTrip,
    openEditRoutePicker,
    handleBackToEditRoute,
    restoreEditModalAfterRoutePicker,
  };
}
