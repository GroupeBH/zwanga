import { useDialog } from '@/components/ui/DialogProvider';
import { hasCompleteLegalIdentity, normalizeLegalName } from '@/utils/legalIdentity';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { AuthStep } from '@/components/auth';

interface Params {
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
  const handleSelectProfilePicture = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showDialog({ variant: 'danger', title: 'Permission requise', message: "L'accès à la galerie est nécessaire." });
        return;
      }
      showDialog({
        variant: 'info',
        title: 'Photo de profil',
        message: 'Choisissez une source',
        actions: [
          {
            label: 'Caméra',
            variant: 'primary',
            onPress: async () => {
              try {
                const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
                if (camStatus !== 'granted') return;
                const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.65, base64: false, exif: false });
                const imageUri = result.assets?.[0]?.uri;
                if (!result.canceled && imageUri) setProfilePicture(imageUri);
              } catch (error) {
                console.warn('[Auth] Profile camera failed:', error);
                showDialog({ variant: 'danger', title: 'Photo impossible', message: "Impossible d'ouvrir la camera pour le moment." });
              }
            }
          },
          {
            label: 'Galerie',
            variant: 'secondary',
            onPress: async () => {
              try {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.65, base64: false, exif: false });
                const imageUri = result.assets?.[0]?.uri;
                if (!result.canceled && imageUri) setProfilePicture(imageUri);
              } catch (error) {
                console.warn('[Auth] Profile gallery failed:', error);
                showDialog({ variant: 'danger', title: 'Photo impossible', message: "Impossible d'ouvrir la galerie pour le moment." });
              }
            }
          },
          { label: 'Annuler', variant: 'ghost' },
        ],
      });
    } catch (e) {
      console.error(e);
    }
  };

  const validateProfileAndContinue = () => {
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
      setStep('kyc');
    } else {
      handleFinalRegister();
    }
  };

  return {
    handleSelectProfilePicture,
    validateProfileAndContinue,
  };
}
import type { TripRequestVehicleType } from '@/types';
