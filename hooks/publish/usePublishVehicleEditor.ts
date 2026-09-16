import type { TripRequestVehicleType } from '@/types';
import React from 'react';

interface Params {
  setVehicleType: React.Dispatch<React.SetStateAction<TripRequestVehicleType | null>>;
  setVehicleBrand: React.Dispatch<React.SetStateAction<string>>;
  setVehicleModel: React.Dispatch<React.SetStateAction<string>>;
  setVehicleColor: React.Dispatch<React.SetStateAction<string>>;
  setVehicleLicensePlate: React.Dispatch<React.SetStateAction<string>>;
  setShowVehicleForm: React.Dispatch<React.SetStateAction<boolean>>;
  setVehicleFormError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsFinalizingVehicleCreation: React.Dispatch<React.SetStateAction<boolean>>;
  setVehicleCreationMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

export function usePublishVehicleEditor({
  setVehicleType,
  setVehicleBrand,
  setVehicleModel,
  setVehicleColor,
  setVehicleLicensePlate,
  setShowVehicleForm,
  setVehicleFormError,
  setIsFinalizingVehicleCreation,
  setVehicleCreationMessage,
}: Params) {
  const resetVehicleForm = () => {
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehicleLicensePlate('');
  };

  const closeVehicleForm = () => {
    setShowVehicleForm(false);
    resetVehicleForm();
    setVehicleFormError(null);
    setIsFinalizingVehicleCreation(false);
  };

  const openVehicleForm = () => {
    resetVehicleForm();
    setVehicleFormError(null);
    setVehicleCreationMessage(null);
    setIsFinalizingVehicleCreation(false);
    setShowVehicleForm(true);
  };

  const vehicleModalCopy = {
    title: 'Nouveau v\u00e9hicule',
    subtitle:
      'Ajoutez votre v\u00e9hicule maintenant pour continuer la publication sans perdre votre progression.',
  };

  return {
    resetVehicleForm,
    openVehicleForm,
    vehicleModalCopy,
    closeVehicleForm,
  };
}
