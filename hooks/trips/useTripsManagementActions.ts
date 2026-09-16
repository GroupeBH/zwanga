import { getLocationText, getLocationCoordinatesTuple } from '../../features/trips/tripsModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useDeleteTripMutation, useGetMyTripsQuery, useUpdateTripMutation } from '@/store/api/tripApi';
import type { Trip } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { reconcileAmbiguousMutation } from '@/utils/mutationReconciliation';

interface Params {
  showFeedback: (type: 'success' | 'error', message: string | string[]) => void;
  editingTrip: Trip | null;
  editDateTime: Date | null;
  editVehicleId: string | null;
  editSeats: string;
  editPrice: string;
  editRouteMode: "map" | "manual";
  editDepartureManualAddress: string;
  editDepartureSelection: MapLocationSelection | null;
  editArrivalManualAddress: string;
  editArrivalSelection: MapLocationSelection | null;
  updateTripMutation: ReturnType<typeof useUpdateTripMutation>[0];
  closeEditModal: () => void;
  deleteTarget: Trip | null;
  deleteTripMutation: ReturnType<typeof useDeleteTripMutation>[0];
  closeDeleteModal: () => void;
  refetchTrips: ReturnType<typeof useGetMyTripsQuery>['refetch'];
}

export function useTripsManagementActions({
  showFeedback,
  editingTrip,
  editDateTime,
  editVehicleId,
  editSeats,
  editPrice,
  editRouteMode,
  editDepartureManualAddress,
  editDepartureSelection,
  editArrivalManualAddress,
  editArrivalSelection,
  updateTripMutation,
  closeEditModal,
  deleteTarget,
  deleteTripMutation,
  closeDeleteModal,
  refetchTrips,
}: Params) {
  const handleSaveTrip = async () => {
    if (!editingTrip || !editDateTime) {
      return;
    }

    if (!editVehicleId) {
      showFeedback('error', 'Sélectionnez le véhicule utilisé pour ce trajet.');
      return;
    }

    const seatsValue = parseInt(editSeats, 10);
    const priceValue = parseFloat(editPrice);
    if (Number.isNaN(seatsValue) || Number.isNaN(priceValue) || seatsValue <= 0 || priceValue < 0) {
      showFeedback('error', 'Veuillez vérifier le nombre de places et le prix.');
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
      showFeedback('error', 'Indiquez un départ et une arrivée avant d’enregistrer.');
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showFeedback('error', "Le départ et l'arrivée doivent être différents.");
      return;
    }

    const currentDepartureAddress = (editingTrip.departure?.address || editingTrip.departure?.name || '').trim();
    const currentArrivalAddress = (editingTrip.arrival?.address || editingTrip.arrival?.name || '').trim();
    const updates: {
      totalSeats: number;
      pricePerSeat: number;
      departureDate: string;
      departureLocation?: string;
      arrivalLocation?: string;
      departureCoordinates?: [number, number];
      arrivalCoordinates?: [number, number];
      vehicleId?: string;
    } = {
      totalSeats: seatsValue,
      pricePerSeat: priceValue,
      departureDate: editDateTime.toISOString(),
      vehicleId: editVehicleId,
    };

    if (departureAddress !== currentDepartureAddress) {
      updates.departureLocation = departureAddress;
    }
    if (arrivalAddress !== currentArrivalAddress) {
      updates.arrivalLocation = arrivalAddress;
    }

    if (editRouteMode === 'map') {
      const departureTuple = getLocationCoordinatesTuple(editDepartureSelection);
      const arrivalTuple = getLocationCoordinatesTuple(editArrivalSelection);
      const currentDepartureLat = Number(editingTrip.departure?.lat);
      const currentDepartureLng = Number(editingTrip.departure?.lng);
      const currentArrivalLat = Number(editingTrip.arrival?.lat);
      const currentArrivalLng = Number(editingTrip.arrival?.lng);

      if (
        departureTuple &&
        (!Number.isFinite(currentDepartureLat) ||
          !Number.isFinite(currentDepartureLng) ||
          Math.abs(departureTuple[1] - currentDepartureLat) > 0.000001 ||
          Math.abs(departureTuple[0] - currentDepartureLng) > 0.000001)
      ) {
        updates.departureCoordinates = departureTuple;
      }

      if (
        arrivalTuple &&
        (!Number.isFinite(currentArrivalLat) ||
          !Number.isFinite(currentArrivalLng) ||
          Math.abs(arrivalTuple[1] - currentArrivalLat) > 0.000001 ||
          Math.abs(arrivalTuple[0] - currentArrivalLng) > 0.000001)
      ) {
        updates.arrivalCoordinates = arrivalTuple;
      }
    }

    try {
      await updateTripMutation({
        id: editingTrip.id,
        updates,
      }).unwrap();
      showFeedback('success', 'Le trajet a été mis à jour.');
      closeEditModal();
    } catch (error: any) {
      showFeedback(
        'error',
        getApiErrorMessage(error, 'Impossible de mettre à jour ce trajet pour le moment.'),
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteTripMutation(deleteTarget.id).unwrap();
      showFeedback('success', 'Le trajet a été supprimé.');
      closeDeleteModal();
    } catch (error: any) {
      const deletedTripId = deleteTarget.id;
      const reconciledTrips = await reconcileAmbiguousMutation({
        error,
        loadSnapshot: async () => (await refetchTrips()).data ?? null,
        isApplied: (latestTrips) => !latestTrips.some((trip) => trip.id === deletedTripId),
      });
      if (reconciledTrips) {
        showFeedback('success', 'Le trajet a bien été supprimé malgré la connexion lente.');
        closeDeleteModal();
        return;
      }
      showFeedback(
        'error',
        getApiErrorMessage(error, 'Impossible de supprimer ce trajet pour le moment.'),
      );
    }
  };

  return {
    showFeedback,
    handleSaveTrip,
    handleConfirmDelete,
  };
}
