import { useDialog } from '@/components/ui/DialogProvider';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import {
  useActivateDriverMutation, useRequestDriverOnboardingMutation
} from '@/store/api/userApi';
import {
  getApiErrorMessage
} from '@/utils/errorHelpers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppDispatch } from '@/store/hooks';
import { updateUser as updateAuthUser } from '@/store/slices/authSlice';
import { isDriverAccount } from '@/utils/accountRole';
import { getTokenSessionVersion } from '@/services/tokenSession';
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
  const dispatch = useAppDispatch();

  const { openDriverOnboarding } = useLocalSearchParams<{
    openDriverOnboarding?: string;
    openSubscription?: string;
    paymentStatus?: string;
  }>();

  const { showDialog } = useDialog();

  const openedDriverOnboardingParamRef = useRef(false);

  const kycLaunchInFlightRef = useRef(false);

  const [activateDriver, { isLoading: isActivatingDriver }] = useActivateDriverMutation();
  const [requestOnboarding, { isLoading: isRequestingOnboarding }] = useRequestDriverOnboardingMutation();
  const isUpdatingUser = isActivatingDriver || isRequestingOnboarding;
  const onboardingInFlight = useRef(false);
  const mounted = useRef(true);
  const presentation = useRef({ id: currentUser?.id, active: isScreenActive });
  presentation.current = { id: currentUser?.id, active: isScreenActive };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const canPresent = useCallback((id?: string) => mounted.current && presentation.current.active &&
    presentation.current.id === id && dispatch((_apply, getState) => getState().auth.user?.id === id), [dispatch]);

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
    const session = getTokenSessionVersion();
    try {
      const activatedUser = await activateDriver().unwrap();
      if (session !== getTokenSessionVersion()) return;
      // Update navigation only from the confirmed response, and never another account.
      dispatch((apply, getState) => {
        if (!activatedUser?.id || activatedUser.id !== currentUser?.id ||
          activatedUser.id !== getState().auth.user?.id) return;
        apply(updateAuthUser({ id: activatedUser.id, role: activatedUser.role,
          driverOnboardingRequestedAt: activatedUser.driverOnboardingRequestedAt,
          driverActivatedAt: activatedUser.driverActivatedAt, updatedAt: activatedUser.updatedAt }));
      });

      if (!canPresent(currentUser?.id)) return;
      if (!isDriverAccount(activatedUser)) {
        showDialog({ variant: 'info', title: 'Activation en attente',
          message: 'La vérification de votre identité et l’ajout d’un véhicule doivent être confirmés avant l’activation.' });
        return;
      }

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
      if (session !== getTokenSessionVersion() || !canPresent(currentUser?.id)) return;
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
  }, [activateDriver, canPresent, currentUser?.id, dispatch, router, showDialog]);

  const handleStartDriverOnboarding = useCallback(async () => {
    if (!currentUser?.id || vehiclesLoading || kycLoading || isUpdatingUser || isKycBusy || onboardingInFlight.current) return;
    onboardingInFlight.current = true;
    const session = getTokenSessionVersion();
    try {
      if (!currentUser.driverOnboardingRequestedAt) await requestOnboarding().unwrap();
      if (session !== getTokenSessionVersion() || !canPresent(currentUser.id)) return;
      if (!isKycApproved) await handleOpenKycModal();
      else if (!hasVehicle) openCreateVehicleModal();
      else await handleBecomeDriver();
    } catch (error) {
      if (session === getTokenSessionVersion() && canPresent(currentUser.id)) showDialog({ variant: 'danger', title: 'Demande non confirmée',
        message: getApiErrorMessage(error, 'Impossible de démarrer le parcours conducteur. Veuillez réessayer.') });
    } finally { onboardingInFlight.current = false; }
  }, [canPresent, currentUser?.id, currentUser?.driverOnboardingRequestedAt, requestOnboarding, handleBecomeDriver,
    handleOpenKycModal, hasVehicle, isKycApproved, isKycBusy, isUpdatingUser, kycLoading, vehiclesLoading, openCreateVehicleModal, showDialog]);

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
