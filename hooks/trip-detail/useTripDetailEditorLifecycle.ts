import { EditTripStep } from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import React, { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import type { Trip } from '@/types';

interface Params {
  trip: Trip | undefined;
  isTripDriver: boolean;
  setEditSeats: React.Dispatch<React.SetStateAction<string>>;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  setEditRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  setEditDateTime: React.Dispatch<React.SetStateAction<Date | null>>;
  getDefaultFutureDate: () => Date;
  setEditDepartureSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditArrivalSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditRouteMode: React.Dispatch<React.SetStateAction<"manual" | "map">>;
  setEditRoutePickerTarget: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  setEditVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditStep: React.Dispatch<React.SetStateAction<EditTripStep>>;
  setEditTripModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setIosPickerMode: React.Dispatch<React.SetStateAction<"date" | "time" | null>>;
  openEditModalRef: React.RefObject<() => void>;
  shouldOpenEditFromParams: boolean;
  handledOpenEditParamKeyRef: React.RefObject<string | null>;
  isFocused: boolean;
  editTripModalVisible: boolean;
  openEditParamKey: string;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function useTripDetailEditorLifecycle({
  trip,
  isTripDriver,
  setEditSeats,
  setEditPrice,
  setEditRequiresPassengerKyc,
  setEditDateTime,
  getDefaultFutureDate,
  setEditDepartureSelection,
  setEditArrivalSelection,
  setEditDepartureManualAddress,
  setEditArrivalManualAddress,
  setEditRouteMode,
  setEditRoutePickerTarget,
  setEditVehicleId,
  setEditStep,
  setEditTripModalVisible,
  setIosPickerMode,
  openEditModalRef,
  shouldOpenEditFromParams,
  handledOpenEditParamKeyRef,
  isFocused,
  editTripModalVisible,
  openEditParamKey,
  showDialog,
}: Params) {
  const openEditModal = () => {
    if (!trip || !isTripDriver) return;

    const departureLat = Number(trip.departure?.lat);
    const departureLng = Number(trip.departure?.lng);
    const arrivalLat = Number(trip.arrival?.lat);
    const arrivalLng = Number(trip.arrival?.lng);

    const departureSelection =
      Number.isFinite(departureLat) && Number.isFinite(departureLng)
        ? {
            title: trip.departure?.name || 'Départ',
            address:
              trip.departure?.address || `${departureLat.toFixed(5)}, ${departureLng.toFixed(5)}`,
            latitude: departureLat,
            longitude: departureLng,
          }
        : null;
    const arrivalSelection =
      Number.isFinite(arrivalLat) && Number.isFinite(arrivalLng)
        ? {
            title: trip.arrival?.name || 'Arrivée',
            address: trip.arrival?.address || `${arrivalLat.toFixed(5)}, ${arrivalLng.toFixed(5)}`,
            latitude: arrivalLat,
            longitude: arrivalLng,
          }
        : null;

    setEditSeats(String(trip.availableSeats));
    setEditPrice(String(trip.price));
    setEditRequiresPassengerKyc(Boolean(trip.requiresPassengerKyc));
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
    setEditTripModalVisible(true);
  };

  const closeEditModal = () => {
    setEditTripModalVisible(false);
    setEditStep(1);
    setEditSeats('');
    setEditPrice('');
    setEditRequiresPassengerKyc(false);
    setEditDateTime(null);
    setIosPickerMode(null);
    setEditRouteMode('map');
    setEditDepartureSelection(null);
    setEditArrivalSelection(null);
    setEditDepartureManualAddress('');
    setEditArrivalManualAddress('');
    setEditRoutePickerTarget(null);
    setEditVehicleId(null);
  };

  useEffect(() => {
    openEditModalRef.current = openEditModal;
  });

  useEffect(() => {
    if (!shouldOpenEditFromParams) {
      handledOpenEditParamKeyRef.current = null;
      return;
    }

    if (
      !isFocused ||
      !trip ||
      !isTripDriver ||
      editTripModalVisible ||
      handledOpenEditParamKeyRef.current === openEditParamKey
    ) {
      return;
    }

    handledOpenEditParamKeyRef.current = openEditParamKey;

    if (trip.status !== 'upcoming' && trip.status !== 'ongoing') {
      showDialog({
        variant: 'warning',
        title: 'Modification indisponible',
        message: 'Ce trajet ne peut plus être modifié.',
      });
      return;
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      openEditModalRef.current();
    });

    return () => {
      interaction.cancel?.();
    };
  }, [
    editTripModalVisible,
    isFocused,
    isTripDriver,
    openEditParamKey,
    shouldOpenEditFromParams,
    showDialog,
    trip,
  ]);

  return {
    closeEditModal,
    openEditModal,
  };
}
