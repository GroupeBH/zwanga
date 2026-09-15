import { getLocationCoordinates } from '../../features/request-detail/requestLocation';
import { TRIP_REQUEST_VEHICLE_LABELS, isValidDate } from '../../features/request-detail/requestDetailModel';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import {
  useCancelTripRequestMutation,
  useGetTripRequestByIdQuery,
  useUpdateTripRequestMutation,
} from '@/store/api/tripRequestApi';
import type { TripRequestVehicleType } from '@/types';
import { getApiErrorMessage, isPassengerKycRequiredError, isExtraSeatsIdentityError } from '@/utils/errorHelpers';
import React from 'react';
import { Platform } from 'react-native';
import type { TripRequest } from '@/types';

interface Params {
  isUpdating: boolean;
  isEditVehicleOptionsLoading: boolean;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  id: string | undefined;
  editDepartureAddress: string;
  editArrivalAddress: string;
  editDepartureDateMin: Date | null;
  editDepartureDateMax: Date | null;
  parsedEditNumberOfSeats: number;
  editSeatCapacity: number | null;
  isEditVehicleSelectionValid: boolean;
  isIdentityVerified: boolean;
  openEditIdentityVerification: (source?: "extra_seats" | "book" | "request") => void;
  parsedEditBudget: number | undefined;
  isEditBudgetValid: boolean;
  updateTripRequest: ReturnType<typeof useUpdateTripRequestMutation>[0];
  editDepartureReference: string;
  editAddressInputMode: AddressInputMode;
  editDepartureLocation: MapLocationSelection | null;
  editArrivalReference: string;
  editArrivalLocation: MapLocationSelection | null;
  editVehicleType: TripRequestVehicleType;
  editDescription: string;
  setShowEditForm: React.Dispatch<React.SetStateAction<boolean>>;
  refetch: ReturnType<typeof useGetTripRequestByIdQuery>['refetch'];
  tripRequest: TripRequest | undefined;
  cancelRequest: ReturnType<typeof useCancelTripRequestMutation>[0];
  goHome: () => void;
}

export function useRequestPassengerActions({
  isUpdating,
  isEditVehicleOptionsLoading,
  showDialog,
  id,
  editDepartureAddress,
  editArrivalAddress,
  editDepartureDateMin,
  editDepartureDateMax,
  parsedEditNumberOfSeats,
  editSeatCapacity,
  isEditVehicleSelectionValid,
  isIdentityVerified,
  openEditIdentityVerification,
  parsedEditBudget,
  isEditBudgetValid,
  updateTripRequest,
  editDepartureReference,
  editAddressInputMode,
  editDepartureLocation,
  editArrivalReference,
  editArrivalLocation,
  editVehicleType,
  editDescription,
  setShowEditForm,
  refetch,
  tripRequest,
  cancelRequest,
  goHome,
}: Params) {
  const handleUpdateRequest = async () => {
    if (isUpdating) return;
    if (isEditVehicleOptionsLoading) {
      showDialog({
        title: 'Calcul du prix en cours',
        message: 'Patientez un instant pour vérifier le nouveau prix avant de confirmer.',
        variant: 'info',
      });
      return;
    }
    if (!id || !editDepartureAddress || !editArrivalAddress) {
      showDialog({
        title: 'Adresse requise',
        message: 'Indiquez une adresse de départ et une adresse d’arrivée, ou choisissez-les sur la carte.',
        variant: 'warning',
      });
      return;
    }
    const updatedDepartureDateMin = editDepartureDateMin;
    const updatedDepartureDateMax = editDepartureDateMax;
    if (
      !isValidDate(updatedDepartureDateMin) ||
      !isValidDate(updatedDepartureDateMax)
    ) {
      showDialog({
        title: 'Date invalide',
        message: 'Choisissez une date et une heure de d\u00e9part valides.',
        variant: 'warning',
      });
      return;
    }
    if (updatedDepartureDateMin.getTime() <= Date.now()) {
      showDialog({
        title: 'Heure pass\u00e9e',
        message: 'Choisissez une heure de d\u00e9part dans le futur.',
        variant: 'warning',
      });
      return;
    }
    if (
      updatedDepartureDateMax.getTime() <= updatedDepartureDateMin.getTime()
    ) {
      showDialog({
        title: 'Cr\u00e9neau invalide',
        message: 'L\u2019heure de fin doit suivre l\u2019heure de d\u00e9part.',
        variant: 'warning',
      });
      return;
    }
    if (
      !Number.isFinite(parsedEditNumberOfSeats) ||
      parsedEditNumberOfSeats < 1 ||
      getPassengerSeatValidation(parsedEditNumberOfSeats, true, editSeatCapacity)
    ) {
      showDialog({
        title: 'Nombre de places invalide',
        message: getPassengerSeatValidation(parsedEditNumberOfSeats, true, editSeatCapacity)?.message || 'Indiquez un nombre entier de places à partir de 1.',
        variant: 'warning',
      });
      return;
    }
    if (!isEditVehicleSelectionValid) {
      showDialog({
        title: 'Véhicule requis',
        message: 'Choisissez un type de véhicule disponible avant d\'enregistrer.',
        variant: 'warning',
      });
      return;
    }
    const editSeatError = getPassengerSeatValidation(parsedEditNumberOfSeats, isIdentityVerified, editSeatCapacity);
    if (editSeatError?.reason === 'identity') {
      openEditIdentityVerification();
      return;
    }

    if (
      parsedEditBudget === undefined || !isEditBudgetValid
    ) {
      showDialog({
        title: 'Budget invalide',
        message: 'Le prix maximum par place doit être un montant positif.',
        variant: 'warning',
      });
      return;
    }

    try {
      await updateTripRequest({
        id,
        payload: {
          departureLocation: editDepartureAddress,
          departureReference: editDepartureReference.trim() || undefined,
          departureCoordinates:
            editAddressInputMode === 'map' ? getLocationCoordinates(editDepartureLocation) : undefined,
          arrivalLocation: editArrivalAddress,
          arrivalReference: editArrivalReference.trim() || undefined,
          arrivalCoordinates:
            editAddressInputMode === 'map' ? getLocationCoordinates(editArrivalLocation) : undefined,
          departureDateMin: updatedDepartureDateMin.toISOString(),
          departureDateMax: updatedDepartureDateMax.toISOString(),
          numberOfSeats: parsedEditNumberOfSeats,
          vehicleType: editVehicleType,
          maxPricePerSeat: parsedEditBudget,
          description: editDescription.trim() || undefined,
        },
      }).unwrap();

      setShowEditForm(false);
      refetch();

      setTimeout(() => {
        showDialog({
          title: 'Demande modifiée',
          message: `Votre demande utilise maintenant : ${TRIP_REQUEST_VEHICLE_LABELS[editVehicleType]}.`,
          variant: 'success',
        });
      }, Platform.OS === 'ios' ? 350 : 0);
    } catch (error: any) {
      if (isPassengerKycRequiredError(error)) {
        openEditIdentityVerification(isExtraSeatsIdentityError(error) ? 'extra_seats' : 'request');
        return;
      }
      showDialog({
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de modifier la demande.'),
        variant: 'danger',
      });
    }
  };

  const handleCancelRequest = async () => {
    if (!id) return;

    showDialog({
      title: 'Annuler la demande',
      message:
        tripRequest?.status === 'driver_selected'
          ? 'Un conducteur a déjà accepté cette demande. Voulez-vous vraiment annuler la demande, la réservation et le trajet associé ?'
          : 'Êtes-vous sûr de vouloir annuler cette demande ?',
      variant: 'danger',
      actions: [
        { label: 'Non', variant: 'secondary' },
        {
          label: 'Oui, annuler',
          variant: 'secondary',
          onPress: async () => {
            try {
              await cancelRequest(id).unwrap();
              showDialog({
                title: 'Demande annulée',
                message: 'Votre demande a été annulée avec succès',
                variant: 'success',
                actions: [{ label: 'OK', onPress: goHome }],
              });
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: getApiErrorMessage(error, 'Impossible d\'annuler la demande.'),
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  return {
    handleCancelRequest,
    handleUpdateRequest,
  };
}
