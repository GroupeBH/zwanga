import { useDialog } from '@/components/ui/DialogProvider';
import { readProfileState } from '@/features/profile/profileStateContract';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useActivateDriverMutation, useRequestDriverOnboardingMutation } from '@/store/api/userApi';
import { useAppDispatch } from '@/store/hooks';
import { updateUser as updateAuthUser } from '@/store/slices/authSlice';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { useProfileData } from './useProfileData';
import type { useProfileVehicles } from './useProfileVehicles';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'currentUser' | 'isScreenActive' | 'isProfileStatusAvailable'
  | 'needsDriverOnboarding' | 'refetchKycStatus' | 'refetchProfile'
> & Pick<ReturnType<typeof useProfileVehicles>, 'openCreateVehicleModal'>;

export function useProfileOnboarding({ currentUser, isScreenActive, isProfileStatusAvailable,
  needsDriverOnboarding, refetchKycStatus, refetchProfile, openCreateVehicleModal }: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const { openDriverOnboarding } = useLocalSearchParams<{ openDriverOnboarding?: string }>();
  const [activateDriver, { isLoading: isActivatingDriver }] = useActivateDriverMutation();
  const [requestOnboarding, { isLoading: isRequestingOnboarding }] = useRequestDriverOnboardingMutation();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const inFlight = useRef(false);
  const openedParam = useRef(false);
  const mounted = useRef(true);
  const presentation = useRef({ id: currentUser?.id, active: isScreenActive });
  presentation.current = { id: currentUser?.id, active: isScreenActive };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const canPresent = useCallback((id: string, session: number) =>
    session === getTokenSessionVersion() && mounted.current && presentation.current.active &&
    presentation.current.id === id && dispatch((_apply, getState) => getState().auth.user?.id === id), [dispatch]);

  const refreshKycAndProfile = useCallback(
    () => Promise.all([refetchKycStatus(), refetchProfile()]), [refetchKycStatus, refetchProfile]);
  const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
    sourceScreen: 'profile', onStatusRefresh: refreshKycAndProfile,
    approvedMessage: 'Votre identité est vérifiée. Votre profil sera actualisé avec la prochaine étape disponible.',
  });

  // Cached status stays visible offline; every action first revalidates /users/me.
  // A failed read (even one retaining cached data) never starts another flow.
  const readLatestState = useCallback(async (id: string, session: number) => {
    const result = await refetchProfile();
    if (!canPresent(id, session)) return undefined;
    if (result.error) throw result.error;
    const state = result.data?.user.id === id ? readProfileState(result.data.profileState, id) : undefined;
    if (!state) throw new Error('Votre statut n’est pas disponible pour le moment. Réessayez dans quelques instants.');
    return state;
  }, [canPresent, refetchProfile]);

  const continueFlow = useCallback(async (driverJourney: boolean) => {
    const id = currentUser?.id;
    const session = getTokenSessionVersion();
    if (!id || !canPresent(id, session) || inFlight.current || isStartingDiditKyc) return;
    inFlight.current = true;
    setCheckingProfile(true);
    try {
      let state = await readLatestState(id, session);
      if (!state || !canPresent(id, session)) return;
      if (state.driver.nextAction === 'contact_support') {
        router.push('/support');
        return;
      }
      if (!driverJourney) {
        if (state.identity.status === 'approved' || state.identity.status === 'pending') {
          showDialog({ variant: 'info',
            title: state.identity.status === 'approved' ? 'Identité vérifiée' : 'Vérification en cours',
            message: state.identity.status === 'approved'
              ? 'Votre identité est déjà vérifiée. Aucun document supplémentaire à envoyer.'
              : 'Vos documents sont en cours de vérification. Vous serez informé du résultat.',
          });
        } else await startDiditKyc();
        return;
      }

      if (state.driver.nextAction === 'start') {
        await requestOnboarding().unwrap();
        if (!canPresent(id, session)) return;
        state = await readLatestState(id, session);
        if (!state || !canPresent(id, session)) return;
      }
      switch (state.driver.nextAction) {
        case 'verify_identity':
          await startDiditKyc();
          break;
        case 'add_vehicle':
          openCreateVehicleModal();
          break;
        case 'activate': {
          const activatedUser = await activateDriver().unwrap();
          if (session !== getTokenSessionVersion()) return;
          // Update navigation from the confirmed response, never another account.
          dispatch((apply, getState) => {
            if (activatedUser?.id !== id || getState().auth.user?.id !== id) return;
            apply(updateAuthUser({ id, role: activatedUser.role,
              driverOnboardingRequestedAt: activatedUser.driverOnboardingRequestedAt,
              driverActivatedAt: activatedUser.driverActivatedAt, updatedAt: activatedUser.updatedAt }));
          });
          if (!canPresent(id, session)) return;
          const confirmed = await readLatestState(id, session);
          if (confirmed?.driver.canPublish && canPresent(id, session)) {
            showDialog({ variant: 'success', title: 'Profil conducteur activé',
              message: 'Votre identité et votre véhicule sont confirmés. Vous pouvez publier un trajet.',
              actions: [{ label: 'Publier un trajet', variant: 'primary', onPress: () => router.push('/publish') },
                { label: 'Plus tard', variant: 'ghost' }],
            });
          }
          break;
        }
        case 'contact_support':
          router.push('/support');
          break;
        // "wait" already refreshed the status; no new verification or mutation.
        // "none" also covers automatic activation during the intent request.
        default:
          break;
      }
    } catch (error) {
      if (canPresent(id, session)) showDialog({ variant: 'danger', title: 'Impossible de continuer',
        message: getApiErrorMessage(error, 'Votre statut n’a pas pu être confirmé. Vérifiez votre connexion puis réessayez. Votre progression est conservée.') });
    } finally {
      inFlight.current = false;
      if (mounted.current) setCheckingProfile(false);
    }
  }, [activateDriver, canPresent, currentUser?.id, dispatch, isStartingDiditKyc, openCreateVehicleModal,
    readLatestState, requestOnboarding, router, showDialog, startDiditKyc]);

  const handleOpenKycModal = useCallback(() => continueFlow(false), [continueFlow]);
  const handleStartDriverOnboarding = useCallback(() => continueFlow(true), [continueFlow]);
  useEffect(() => {
    if (openedParam.current || !isScreenActive || !openDriverOnboarding || !currentUser ||
      !isProfileStatusAvailable || checkingProfile || isStartingDiditKyc) return;
    openedParam.current = true;
    if (needsDriverOnboarding) void handleStartDriverOnboarding();
  }, [checkingProfile, currentUser, handleStartDriverOnboarding, isProfileStatusAvailable,
    isScreenActive, isStartingDiditKyc, needsDriverOnboarding, openDriverOnboarding]);

  return { handleOpenKycModal, handleStartDriverOnboarding, isKycBusy: isStartingDiditKyc,
    isUpdatingUser: checkingProfile || isActivatingDriver || isRequestingOnboarding };
}
