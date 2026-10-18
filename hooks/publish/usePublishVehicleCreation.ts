import { usePublishVehicleState } from './usePublishVehicleState';
import type { TripRequestVehicleType, Vehicle } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { isValidVehiclePlate, normalizeVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } from '@/utils/vehiclePlate';
import React from 'react';
import { Keyboard } from 'react-native';

interface Params {
  vehicleType: TripRequestVehicleType | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleLicensePlate: string;
  setVehicleFormError: React.Dispatch<React.SetStateAction<string | null>>;
  createVehicle: ReturnType<typeof usePublishVehicleState>['createVehicle'];
  setIsFinalizingVehicleCreation: React.Dispatch<React.SetStateAction<boolean>>;
  setCreatedVehicle: React.Dispatch<React.SetStateAction<Vehicle | null>>;
  setSelectedVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  setVehicleCreationMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setShowVehicleForm: React.Dispatch<React.SetStateAction<boolean>>;
  resetVehicleForm: () => void;
  refetchProfile: ReturnType<typeof usePublishVehicleState>['refetchProfile'];
  refetchVehicles: ReturnType<typeof usePublishVehicleState>['refetchVehicles'];
}

export function usePublishVehicleCreation({
  vehicleType,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  vehicleLicensePlate,
  setVehicleFormError,
  createVehicle,
  setIsFinalizingVehicleCreation,
  setCreatedVehicle,
  setSelectedVehicleId,
  setVehicleCreationMessage,
  setShowVehicleForm,
  resetVehicleForm,
  refetchProfile,
  refetchVehicles,
}: Params) {
  const handleCreateVehicle = async () => {
    if (!vehicleType || !vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehicleLicensePlate.trim()) {
      setVehicleFormError('Veuillez choisir le type et remplir tous les champs du véhicule.');
      return;
    }
    if (!isValidVehiclePlate(vehicleLicensePlate)) {
      setVehicleFormError(VEHICLE_PLATE_FORMAT_MESSAGE);
      return;
    }

    setVehicleFormError(null);

    try {
      const newVehicle = await createVehicle({
        type: vehicleType,
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: normalizeVehiclePlate(vehicleLicensePlate),
      }).unwrap();

      Keyboard.dismiss();
      setIsFinalizingVehicleCreation(true);
      setCreatedVehicle(newVehicle);
      setSelectedVehicleId(newVehicle.id);
      setVehicleCreationMessage(
        `${newVehicle.brand} ${newVehicle.model} a été ajouté et sélectionné pour ce trajet.`,
      );
      setShowVehicleForm(false);
      resetVehicleForm();

      // The POST response already updates the form; these calls synchronize the remaining caches.
      void Promise.allSettled([refetchProfile(), refetchVehicles()]);
    } catch (error: any) {
      const message = getApiErrorMessage(
        error,
        'Impossible d\'ajouter le véhicule pour le moment.',
      );
      setVehicleFormError(message);
      setIsFinalizingVehicleCreation(false);
    }
  };

  return {
    handleCreateVehicle,
  };
}
