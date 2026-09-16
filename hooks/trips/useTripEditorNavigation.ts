import { EditTripStep, getLocationText, getDefaultFutureDate } from '../../features/trips/tripsModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import type { Trip } from '@/types';
import { getTripLocationCoordinate } from '@/utils/tripCoordinates';
import React, { useCallback } from 'react';
import { Keyboard } from 'react-native';

interface Params {
  setEditingTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  setEditSeats: React.Dispatch<React.SetStateAction<string>>;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  setEditDateTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setEditDepartureSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditArrivalSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditRouteMode: React.Dispatch<React.SetStateAction<"map" | "manual">>;
  setEditRoutePickerTarget: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  setEditVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditStep: React.Dispatch<React.SetStateAction<EditTripStep>>;
  setIosPickerMode: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  setEditModalSuspended: React.Dispatch<React.SetStateAction<boolean>>;
  editArrivalSelection: MapLocationSelection | null;
  editDepartureSelection: MapLocationSelection | null;
  editArrivalManualAddress: string;
  editDepartureManualAddress: string;
  editRouteMode: "map" | "manual";
  showFeedback: (type: "success" | "error", message: string | string[]) => void;
}

export function useTripEditorNavigation({
  setEditingTrip,
  setEditSeats,
  setEditPrice,
  setEditDateTime,
  setEditDepartureSelection,
  setEditArrivalSelection,
  setEditDepartureManualAddress,
  setEditArrivalManualAddress,
  setEditRouteMode,
  setEditRoutePickerTarget,
  setEditVehicleId,
  setEditStep,
  setIosPickerMode,
  setEditModalSuspended,
  editArrivalSelection,
  editDepartureSelection,
  editArrivalManualAddress,
  editDepartureManualAddress,
  editRouteMode,
  showFeedback,
}: Params) {
  const openEditModal = useCallback((trip: Trip) => {
    const departureCoordinate = getTripLocationCoordinate(trip.departure);
    const arrivalCoordinate = getTripLocationCoordinate(trip.arrival);

    const departureSelection =
      departureCoordinate
        ? {
            title: trip.departure?.name || 'Départ',
            address:
              trip.departure?.address ||
              `${departureCoordinate.latitude.toFixed(5)}, ${departureCoordinate.longitude.toFixed(5)}`,
            latitude: departureCoordinate.latitude,
            longitude: departureCoordinate.longitude,
          }
        : null;
    const arrivalSelection =
      arrivalCoordinate
        ? {
            title: trip.arrival?.name || 'Arrivée',
            address:
              trip.arrival?.address ||
              `${arrivalCoordinate.latitude.toFixed(5)}, ${arrivalCoordinate.longitude.toFixed(5)}`,
            latitude: arrivalCoordinate.latitude,
            longitude: arrivalCoordinate.longitude,
          }
        : null;

    setEditingTrip(trip);
    setEditSeats(String(trip.availableSeats));
    setEditPrice(String(trip.price));
    const parsedDate = trip.departureTime ? new Date(trip.departureTime) : null;
    setEditDateTime(parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : getDefaultFutureDate());
    setEditDepartureSelection(departureSelection);
    setEditArrivalSelection(arrivalSelection);
    setEditDepartureManualAddress((trip.departure?.address || trip.departure?.name || '').trim());
    setEditArrivalManualAddress((trip.arrival?.address || trip.arrival?.name || '').trim());
    setEditRouteMode(departureSelection && arrivalSelection ? 'map' : 'manual');
    setEditRoutePickerTarget(null);
    setEditVehicleId(trip.vehicle?.id ?? trip.vehicleId ?? null);
    setEditStep(1);
  }, []);

  const closeEditModal = () => {
    setEditingTrip(null);
    setEditStep(1);
    setEditSeats('');
    setEditPrice('');
    setEditDateTime(null);
    setIosPickerMode(null);
    setEditRouteMode('map');
    setEditDepartureSelection(null);
    setEditArrivalSelection(null);
    setEditDepartureManualAddress('');
    setEditArrivalManualAddress('');
    setEditRoutePickerTarget(null);
    setEditVehicleId(null);
    setEditModalSuspended(false);
  };

  const swapEditRoutePoints = () => {
    setEditDepartureSelection(editArrivalSelection);
    setEditArrivalSelection(editDepartureSelection);
    setEditDepartureManualAddress(editArrivalManualAddress);
    setEditArrivalManualAddress(editDepartureManualAddress);
  };

  const openEditRoutePicker = (target: 'departure' | 'arrival') => {
    Keyboard.dismiss();
    setEditModalSuspended(true);
    setTimeout(() => setEditRoutePickerTarget(target), 320);
  };

  const restoreEditModalAfterPicker = () => {
    setEditRoutePickerTarget(null);
    setTimeout(() => setEditModalSuspended(false), 320);
  };

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
      showFeedback('error', 'Indiquez un départ et une arrivée avant de continuer.');
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showFeedback('error', "Le départ et l'arrivée doivent être différents.");
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
    closeEditModal,
    openEditModal,
    swapEditRoutePoints,
    handleContinueEditTrip,
    openEditRoutePicker,
    handleBackToEditRoute,
    restoreEditModalAfterPicker,
  };
}
