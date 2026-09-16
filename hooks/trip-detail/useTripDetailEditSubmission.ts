import { getLocationText, getLocationCoordinatesTuple } from '../../features/trip-detail/tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetTripByIdQuery, useUpdateTripMutation } from '@/store/api/tripApi';
import { getApiErrorMessage, isPassengerKycRequiredError } from '@/utils/errorHelpers';
import React from 'react';
import type { Trip } from '@/types';

interface Params {
  trip: Trip | undefined;
  editDateTime: Date | null;
  isTripDriver: boolean;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  editVehicleId: string | null;
  editSeats: string;
  editPrice: string;
  editRouteMode: "manual" | "map";
  editDepartureManualAddress: string;
  editDepartureSelection: MapLocationSelection | null;
  editArrivalManualAddress: string;
  editArrivalSelection: MapLocationSelection | null;
  resolveManualAddressSelection: (address: string, label: string) => Promise<MapLocationSelection | null>;
  setEditDepartureSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setEditArrivalSelection: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  editRequiresPassengerKyc: boolean;
  updateTripMutation: ReturnType<typeof useUpdateTripMutation>[0];
  closeEditModal: () => void;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
}

export function useTripDetailEditSubmission({
  trip,
  editDateTime,
  isTripDriver,
  showDialog,
  editVehicleId,
  editSeats,
  editPrice,
  editRouteMode,
  editDepartureManualAddress,
  editDepartureSelection,
  editArrivalManualAddress,
  editArrivalSelection,
  resolveManualAddressSelection,
  setEditDepartureSelection,
  setEditArrivalSelection,
  editRequiresPassengerKyc,
  updateTripMutation,
  closeEditModal,
  refetchTrip,
}: Params) {
  const handleSaveTrip = async () => {
    if (!trip || !editDateTime || !isTripDriver) {
      showDialog({
        variant: 'warning',
        title: 'Action non autorisee',
        message: 'Seul le conducteur de ce trajet peut le modifier.',
      });
      return;
    }

    if (!editVehicleId) {
      showDialog({
        variant: 'warning',
        title: 'Véhicule requis',
        message: 'Sélectionnez le véhicule utilisé pour ce trajet.',
      });
      return;
    }

    const seatsValue = parseInt(editSeats, 10);
    const priceValue = trip.tripRequestId ? trip.price : parseFloat(editPrice);
    if (Number.isNaN(seatsValue) || Number.isNaN(priceValue) || seatsValue <= 0 || priceValue < 0) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: 'Veuillez vérifier le nombre de places et le prix.',
      });
      return;
    }

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
        message: "Indiquez un départ et une arrivée avant d'enregistrer.",
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

    const currentDepartureAddress = (trip.departure?.address || trip.departure?.name || '').trim();
    const currentArrivalAddress = (trip.arrival?.address || trip.arrival?.name || '').trim();
    const departureAddressChanged = departureAddress !== currentDepartureAddress;
    const arrivalAddressChanged = arrivalAddress !== currentArrivalAddress;
    let resolvedDepartureSelection = editDepartureSelection;
    let resolvedArrivalSelection = editArrivalSelection;

    if (editRouteMode === 'manual') {
      if (departureAddressChanged || !getLocationCoordinatesTuple(resolvedDepartureSelection)) {
        const selection = await resolveManualAddressSelection(departureAddress, 'departure');
        if (!selection) {
          showDialog({
            variant: 'warning',
            title: 'Départ introuvable',
            message: 'Impossible de localiser cette adresse de départ. Vérifiez le texte ou choisissez le point sur la carte.',
          });
          return;
        }
        resolvedDepartureSelection = selection;
        setEditDepartureSelection(selection);
      }

      if (arrivalAddressChanged || !getLocationCoordinatesTuple(resolvedArrivalSelection)) {
        const selection = await resolveManualAddressSelection(arrivalAddress, 'arrival');
        if (!selection) {
          showDialog({
            variant: 'warning',
            title: 'Arrivée introuvable',
            message: "Impossible de localiser cette adresse d'arrivée. Vérifiez le texte ou choisissez le point sur la carte.",
          });
          return;
        }
        resolvedArrivalSelection = selection;
        setEditArrivalSelection(selection);
      }
    }

    const updates: {
      totalSeats: number;
      pricePerSeat?: number;
      departureDate: string;
      departureLocation?: string;
      arrivalLocation?: string;
      departureCoordinates?: [number, number];
      arrivalCoordinates?: [number, number];
      vehicleId?: string;
      requiresPassengerKyc?: boolean;
    } = {
      totalSeats: seatsValue,
      ...(trip.tripRequestId ? {} : { pricePerSeat: priceValue }),
      departureDate: editDateTime.toISOString(),
      vehicleId: editVehicleId,
      requiresPassengerKyc: editRequiresPassengerKyc,
    };

    if (departureAddressChanged) {
      updates.departureLocation = departureAddress;
    }
    if (arrivalAddressChanged) {
      updates.arrivalLocation = arrivalAddress;
    }

    const departureTuple = getLocationCoordinatesTuple(resolvedDepartureSelection);
    const arrivalTuple = getLocationCoordinatesTuple(resolvedArrivalSelection);
    const currentDepartureLat = Number(trip.departure?.lat);
    const currentDepartureLng = Number(trip.departure?.lng);
    const currentArrivalLat = Number(trip.arrival?.lat);
    const currentArrivalLng = Number(trip.arrival?.lng);

    if (
      departureTuple &&
      (departureAddressChanged ||
        !Number.isFinite(currentDepartureLat) ||
        !Number.isFinite(currentDepartureLng) ||
        Math.abs(departureTuple[1] - currentDepartureLat) > 0.000001 ||
        Math.abs(departureTuple[0] - currentDepartureLng) > 0.000001)
    ) {
      updates.departureCoordinates = departureTuple;
    }

    if (
      arrivalTuple &&
      (arrivalAddressChanged ||
        !Number.isFinite(currentArrivalLat) ||
        !Number.isFinite(currentArrivalLng) ||
        Math.abs(arrivalTuple[1] - currentArrivalLat) > 0.000001 ||
        Math.abs(arrivalTuple[0] - currentArrivalLng) > 0.000001)
    ) {
      updates.arrivalCoordinates = arrivalTuple;
    }

    try {
      await updateTripMutation({
        id: trip.id,
        updates,
      }).unwrap();
      showDialog({ variant: 'success', title: 'Succès', message: 'Le trajet a été mis à jour.' });
      closeEditModal();
      refetchTrip();
    } catch (error: any) {
      const isPassengerKycError = isPassengerKycRequiredError(error);
      showDialog({
        variant: isPassengerKycError ? 'warning' : 'danger',
        title: isPassengerKycError ? 'Identité des passagers à vérifier' : 'Erreur',
        message: isPassengerKycError
          ? "Certains passagers de ce trajet n'ont pas encore vérifié leur identité. Gardez cette exigence désactivée, ou demandez-leur de terminer leur vérification avant de l'activer."
          : getApiErrorMessage(error, 'Impossible de mettre à jour ce trajet pour le moment.'),
      });
    }
  };

  return {
    handleSaveTrip,
  };
}
