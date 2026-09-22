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
  | 'isKycPending'
  | 'isScreenActive'
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
  isKycPending,
  isScreenActive,
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
      'Votre identité est vérifiée. Vous pouvez réserver 3 places ou plus et accéder aux trajets réservés aux passagers vérifiés.',
  });

  const isKycBusy = isStartingDiditKyc;

  const handleOpenKycModal = useCallback(async () => {
    if (kycLoading || isKycBusy || kycLaunchInFlightRef.current) {
      return;
    }

    if (isKycApproved) {
      showDialog({
        variant: 'info',
        title: 'Identité vérifiée',
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

    if (isKycPending) {
      showDialog({ variant: 'info', title: 'Vérification en cours', message: 'Vos documents sont en cours de vérification. Vous serez informé du résultat. Aucun véhicule à ajouter pour vérifier votre identité.' });
      return;
    }

    kycLaunchInFlightRef.current = true;
    try {
      await startDiditKyc();
    } finally {
      kycLaunchInFlightRef.current = false;
    }
  }, [isKycApproved, isKycPending, isKycBusy, kycLoading, router, showDialog, startDiditKyc]);

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
    if (vehiclesLoading || kycLoading || isUpdatingUser || isKycBusy) return;
    const hasKyc = isKycApproved;

    if (!hasVehicle && !hasKyc) {
      showDialog({
        variant: 'info',
        title: 'Devenir conducteur',
        message:
          "Pour devenir conducteur, vous devez :\n\n1. Ajouter un véhicule\n2. Vérifier votre identité\n\nSouhaitez-vous commencer par ajouter un véhicule ?",
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
  }, [handleBecomeDriver, handleOpenKycModal, hasVehicle, isKycApproved, isKycBusy, isUpdatingUser, kycLoading, vehiclesLoading, openCreateVehicleModal, showDialog]);

  useEffect(() => {
    if (
      openedDriverOnboardingParamRef.current ||
      !isScreenActive ||
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
    isScreenActive,
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
