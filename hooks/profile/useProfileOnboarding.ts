import { useDialog } from '@/components/ui/DialogProvider';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import {
  useUpdateUserMutation
} from '@/store/api/userApi';
import {
  getApiErrorMessage
} from '@/utils/errorHelpers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import type { useProfileData } from './useProfileData';
import type { useProfileVehicles } from './useProfileVehicles';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
  | 'hasVehicle'
  | 'isKycApproved'
  | 'kycLoading'
  | 'needsDriverOnboarding'
  | 'refetchKycStatus'
  | 'refetchProfile'
  | 'vehiclesLoading'
> & Pick<ReturnType<typeof useProfileVehicles>,
  | 'openCreateVehicleModal'
>;

export function useProfileOnboarding({
  currentUser,
  hasVehicle,
  isKycApproved,
  kycLoading,
  needsDriverOnboarding,
  openCreateVehicleModal,
  refetchKycStatus,
  refetchProfile,
  vehiclesLoading,
}: Props) {
  const router = useRouter();

  const { openDriverOnboarding } = useLocalSearchParams<{
    openDriverOnboarding?: string;
    openSubscription?: string;
    paymentStatus?: string;
  }>();

  const { showDialog } = useDialog();

  const openedDriverOnboardingParamRef = useRef(false);

  const kycLaunchInFlightRef = useRef(false);

  const [updateUser, { isLoading: isUpdatingUser }] = useUpdateUserMutation();

  const refreshKycAndProfile = useCallback(
    () => Promise.all([refetchKycStatus(), refetchProfile()]),
    [refetchKycStatus, refetchProfile],
  );

  const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
    sourceScreen: 'profile',
    onStatusRefresh: refreshKycAndProfile,
    approvedMessage:
      "Votre identité a été vérifiée avec succès. Vous pouvez maintenant accéder aux fonctionnalités conducteur.",
  });

  const isKycBusy = isStartingDiditKyc;

  const handleOpenKycModal = useCallback(async () => {
    if (isKycBusy || kycLaunchInFlightRef.current) {
      return;
    }

    if (isKycApproved) {
      showDialog({
        variant: 'info',
        title: 'KYC validé',
        message: 'Vos documents sont déjà vérifiés. Contactez notre support si vous devez les modifier.',
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          {
            label: 'Support',
            variant: 'primary',
            onPress: () => router.push('/support'),
          },
        ],
      });
      return;
    }

    kycLaunchInFlightRef.current = true;
    try {
      await startDiditKyc();
    } finally {
      kycLaunchInFlightRef.current = false;
    }
  }, [isKycApproved, isKycBusy, router, showDialog, startDiditKyc]);

  const handleBecomeDriver = useCallback(async () => {
    try {
      const formData = new FormData();
      // Mettre à jour le rôle vers "driver"
      formData.append('role', 'driver');

      await updateUser(formData).unwrap();

      showDialog({
        variant: 'success',
        title: 'Félicitations ! 🎉',
        message:
          "Votre compte conducteur a été activé avec succès. Vous pouvez maintenant publier des trajets et gagner de l'argent.",
        actions: [
          {
            label: 'Publier un trajet',
            variant: 'primary',
            onPress: () => router.push('/publish'),
          },
          {
            label: 'Plus tard',
            variant: 'ghost',
          },
        ],
      });
    } catch (error: any) {
      console.error("Erreur lors de l'activation du compte conducteur:", error);
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(
          error,
          "Impossible d'activer le compte conducteur. Veuillez réessayer.",
        ),
      });
    }
  }, [router, showDialog, updateUser]);

  const handleStartDriverOnboarding = useCallback(() => {
    const hasKyc = isKycApproved;

    if (!hasVehicle && !hasKyc) {
      showDialog({
        variant: 'info',
        title: 'Devenir conducteur',
        message:
          "Pour devenir conducteur, vous devez :\n\n1. Ajouter un véhicule\n2. Compléter la vérification d'identité (KYC)\n\nSouhaitez-vous commencer par ajouter un véhicule ?",
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          {
            label: 'Ajouter un véhicule',
            variant: 'primary',
            onPress: openCreateVehicleModal,
          },
        ],
      });
      return;
    }

    if (!hasVehicle) {
      openCreateVehicleModal();
      return;
    }

    if (!hasKyc) {
      handleOpenKycModal();
      return;
    }

    void handleBecomeDriver();
  }, [handleBecomeDriver, handleOpenKycModal, hasVehicle, isKycApproved, openCreateVehicleModal, showDialog]);

  useEffect(() => {
    if (
      openedDriverOnboardingParamRef.current ||
      !openDriverOnboarding ||
      !currentUser ||
      vehiclesLoading ||
      kycLoading
    ) {
      return;
    }

    openedDriverOnboardingParamRef.current = true;
    if (needsDriverOnboarding) {
      handleStartDriverOnboarding();
    }
  }, [
    currentUser,
    handleStartDriverOnboarding,
    kycLoading,
    needsDriverOnboarding,
    openDriverOnboarding,
    vehiclesLoading,
  ]);
  return {
    handleOpenKycModal,
    handleStartDriverOnboarding,
    isKycBusy,
    isUpdatingUser,
  };
}
