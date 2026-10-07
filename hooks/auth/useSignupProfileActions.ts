import { useDialog } from '@/components/ui/DialogProvider';
import type { TripRequestVehicleType } from '@/types';
import { hasCompleteLegalIdentity, normalizeLegalName } from '@/utils/legalIdentity';
import { isValidVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } from '@/utils/vehiclePlate';
import { useProfilePhotoSelection } from '@/hooks/profile/useProfilePhotoSelection';
import React, { useEffect, useRef } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { claimPendingProfileImageUri } from '@/features/profile/profilePhotoRecovery';
import { AuthStep } from '@/components/auth';

interface Params {
  photoEnabled?: boolean;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  setProfilePicture: React.Dispatch<React.SetStateAction<string | null>>;
  firstName: string;
  lastName: string;
  isAppleSignupFlow: boolean;
  setFirstName: React.Dispatch<React.SetStateAction<string>>;
  setLastName: React.Dispatch<React.SetStateAction<string>>;
  role: "driver" | "passenger";
  vehicleType: TripRequestVehicleType | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
  setStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  handleFinalRegister: () => Promise<void>;
}

export function useSignupProfileActions({
  photoEnabled = true,
  showDialog,
  setProfilePicture,
  firstName,
  lastName,
  isAppleSignupFlow,
  setFirstName,
  setLastName,
  role,
  vehicleType,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  vehiclePlate,
  setStep,
  handleFinalRegister,
}: Params) {
  const { choosePhoto, isSelecting } = useProfilePhotoSelection({ enabled: photoEnabled });
  const active = useScreenIsActive();
  const selecting = useRef(false);
  useEffect(() => {
    if (!active || !photoEnabled || isSelecting) return;
    let cancelled = false;
    void (async () => {
      if (selecting.current) return;
      const uri = await claimPendingProfileImageUri();
      if (cancelled || !uri || selecting.current) return;
      selecting.current = true;
      try {
        const selected = await choosePhoto({ uri, source: 'gallery' });
        if (selected) setProfilePicture(selected);
      } finally { selecting.current = false; }
    })();
    return () => { cancelled = true; };
  }, [active, photoEnabled, isSelecting, choosePhoto, setProfilePicture]);
  const handleSelectProfilePicture = async () => {
    const uri = await choosePhoto();
    if (uri) setProfilePicture(uri);
  };

  const validateProfileAndContinue = () => {
    if (isSelecting) return;
    const legalFirstName = normalizeLegalName(firstName);
    const legalLastName = normalizeLegalName(lastName);

    if (!hasCompleteLegalIdentity(legalFirstName, legalLastName)) {
      showDialog({
        variant: 'warning',
        title: isAppleSignupFlow ? 'Nom Apple indisponible' : 'Nom légal requis',
        message: isAppleSignupFlow
          ? 'Apple ne transmet le nom que lors de la première autorisation. Reconnectez votre compte Apple après avoir retiré Zwanga des apps utilisant votre identifiant Apple, ou choisissez une autre méthode d’inscription.'
          : 'Renseignez vos prénom(s) et votre nom exactement comme sur votre pièce d’identité. Le post-nom est facultatif.',
      });
      return;
    }
    setFirstName(legalFirstName);
    setLastName(legalLastName);
    if (role === 'driver') {
      if (!vehicleType) {
        showDialog({ variant: 'warning', title: 'Véhicule', message: 'Veuillez sélectionner un type de véhicule.' });
        return;
      }
      if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehiclePlate.trim()) {
        showDialog({ variant: 'warning', title: 'Véhicule', message: 'Veuillez compléter les informations du véhicule.' });
        return;
      }
      if (!isValidVehiclePlate(vehiclePlate)) {
        showDialog({ variant: 'warning', title: 'Plaque d’immatriculation invalide', message: VEHICLE_PLATE_FORMAT_MESSAGE });
        return;
      }
      setStep('kyc');
    } else {
      handleFinalRegister();
    }
  };

  return {
    isSelectingProfilePhoto: isSelecting,
    handleSelectProfilePicture,
    validateProfileAndContinue,
  };
}
