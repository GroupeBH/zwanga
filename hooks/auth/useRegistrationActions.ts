import {
  notifeeInstance,
  androidImportanceEnum,
  SocialAuthProvider,
  getAuthErrorMessage,
  ensureAuthNotifeeLoaded,
} from '../../features/auth/authModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { useAppleMobileMutation, useGoogleMobileMutation, useRegisterMutation } from '@/store/api/zwangaApi';
import { useAppDispatch } from '@/store/hooks';
import { saveTokensAndUpdateState } from '@/store/slices/authSlice';
import type { TripRequestVehicleType, UserGender } from '@/types';
import { hasCompleteLegalIdentity, normalizeLegalName } from '@/utils/legalIdentity';
import { isValidVehiclePlate, normalizeVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } from '@/utils/vehiclePlate';
import { consumePendingReferralAttribution, getPendingReferralAttribution } from '@/utils/referralAttribution';
import React from 'react';
import { Platform } from 'react-native';
import { AuthStep } from '@/components/auth';
import type { Router } from 'expo-router';
import type { StartDiditKycOptions, DiditKycFlowOutcome } from '@/features/identity/diditFlowTypes';
import type { AuthResponse } from '@/store/api/authApi';

interface Params {
  firstName: string;
  lastName: string;
  setStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  isAppleSignupFlow: boolean;
  legacyReferralCode: string;
  role: "driver" | "passenger";
  vehicleType: TripRequestVehicleType | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
  googleIdToken: string | null;
  isGooglePhoneVerified: boolean;
  socialProvider: SocialAuthProvider | null;
  appleMobile: ReturnType<typeof useAppleMobileMutation>[0];
  phone: string;
  appleNonce: string | null;
  gender: UserGender | null;
  googleMobile: ReturnType<typeof useGoogleMobileMutation>[0];
  dispatch: ReturnType<typeof useAppDispatch>;
  startDiditKyc: ({ showResultDialog, skipLegalIdentityConfirmation, }?: StartDiditKycOptions) => Promise<DiditKycFlowOutcome | null>;
  googleProfileName: string | null;
  router: Router;
  pin: string;
  email: string;
  profilePicture: string | null;
  register: ReturnType<typeof useRegisterMutation>[0];
}

export function useRegistrationActions({
  firstName,
  lastName,
  setStep,
  showDialog,
  isAppleSignupFlow,
  legacyReferralCode,
  role,
  vehicleType,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  vehiclePlate,
  googleIdToken,
  isGooglePhoneVerified,
  socialProvider,
  appleMobile,
  phone,
  appleNonce,
  gender,
  googleMobile,
  dispatch,
  startDiditKyc,
  googleProfileName,
  router,
  pin,
  email,
  profilePicture,
  register,
}: Params) {
  const [isRegistrationPending, setIsRegistrationPending] = React.useState(false);
  const [hasCreatedAccount, setHasCreatedAccount] = React.useState(false);
  const inFlight = React.useRef(false);
  const awaitingRedirect = React.useRef(false);
  const mounted = React.useRef(true);
  // If local finalization fails after account creation, retry it, never the POST.
  const resumeFinalization = React.useRef<(() => Promise<void>) | null>(null);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const triggerSignupSuccessNotification = async (userName?: string) => {
    try {
      ensureAuthNotifeeLoaded();
      if (!notifeeInstance) return;
      await notifeeInstance.requestPermission();
      let channelId: string | undefined;
      if (Platform.OS === 'android' && androidImportanceEnum) {
        channelId = await notifeeInstance.createChannel({ id: 'zwanga-signup', name: 'Confirmations Zwanga', importance: androidImportanceEnum.HIGH, vibration: true });
      }
      await notifeeInstance.displayNotification({
        title: '🎉 Inscription réussie',
        body: `${userName ? `${userName}, ` : ''}bienvenue sur Zwanga !`,
        android: channelId ? { channelId, pressAction: { id: 'default' } } : undefined,
        ios: { sound: 'default' },
      });
    } catch {
      console.warn('[Auth] Signup notification unavailable');
    }
  };

  const completeRegistration = async (result: AuthResponse, method: 'phone' | SocialAuthProvider, referralToken: string | undefined, userName: string) => {
    if (mounted.current) setHasCreatedAccount(true);
    resumeFinalization.current = async () => {
      const saved = await dispatch(saveTokensAndUpdateState({ accessToken: result.accessToken, refreshToken: result.refreshToken })).unwrap();
      if (!saved) throw new Error('La session n’a pas pu être confirmée.');
      // Optional side effects must not turn a created account into a failed signup.
      if (referralToken) await consumePendingReferralAttribution(referralToken).catch(() => undefined);
      if (role === 'driver' && mounted.current) {
        try {
          await startDiditKyc({ skipLegalIdentityConfirmation: true });
        } catch {
          showDialog({ variant: 'warning', title: 'Compte créé', message: 'Votre compte est créé. Vous pourrez reprendre la vérification d’identité depuis votre profil.' });
        }
      }
      await triggerSignupSuccessNotification(userName);
      void trackEvent('signup_completed', { method, role, is_driver: role === 'driver' }).catch(() => undefined);
      if (mounted.current) router.replace('/(tabs)');
      awaitingRedirect.current = true;
      // Leave the form intact until unmount: clearing it here flashes an idle step.
    };
    await resumeFinalization.current();
  };

  // Final Registration
  const handleFinalRegister = async () => {
    if (!mounted.current || inFlight.current) return;
    inFlight.current = true;
    setIsRegistrationPending(true);
    try {
      if (resumeFinalization.current) {
        await resumeFinalization.current();
        return;
      }
      const legalFirstName = normalizeLegalName(firstName);
      const legalLastName = normalizeLegalName(lastName);
      if (!hasCompleteLegalIdentity(legalFirstName, legalLastName)) {
        setStep('profile');
        showDialog({
          variant: 'warning',
          title: isAppleSignupFlow ? 'Nom Apple indisponible' : 'Nom légal requis',
          message: isAppleSignupFlow
            ? 'Apple n’a pas transmis votre nom. Reconnectez votre compte Apple après avoir retiré Zwanga des apps utilisant votre identifiant Apple, ou choisissez une autre méthode d’inscription.'
            : 'Renseignez vos prénom(s) et votre nom exactement comme sur votre pièce d’identité. Le post-nom est facultatif.',
        });
        return;
      }

      const pendingAttribution = await getPendingReferralAttribution();
      const referralSignupPayload = pendingAttribution
        ? {
            referralToken: pendingAttribution.token,
            referralProvider: pendingAttribution.provider,
            referralReferringLink: pendingAttribution.referringLink,
            referralCapturedAt: pendingAttribution.capturedAt,
          }
        : legacyReferralCode
          ? { referralCode: legacyReferralCode }
          : {};
      const requiresVehicle = role === 'driver';
      if (requiresVehicle && !vehicleType) {
        showDialog({
          variant: 'warning',
          title: 'Véhicule',
          message: 'Veuillez sélectionner un type de véhicule.',
        });
        return;
      }
      if (requiresVehicle && !isValidVehiclePlate(vehiclePlate)) {
        showDialog({ variant: 'warning', title: 'Plaque d’immatriculation invalide', message: VEHICLE_PLATE_FORMAT_MESSAGE });
        return;
      }

      const signupVehicle = requiresVehicle
        ? {
            type: vehicleType!,
            brand: vehicleBrand.trim(),
            model: vehicleModel.trim(),
            color: vehicleColor.trim(),
            licensePlate: normalizeVehiclePlate(vehiclePlate),
          }
        : undefined;
      
      if (googleIdToken && isGooglePhoneVerified) {
        const authMethod = socialProvider ?? 'google';
        const result = authMethod === 'apple'
          ? await appleMobile({
              idToken: googleIdToken,
              phone,
              nonce: appleNonce ?? undefined,
              firstName: legalFirstName,
              lastName: legalLastName,
              gender: gender ?? undefined,
              role,
              vehicle: signupVehicle,
              ...referralSignupPayload,
            }).unwrap()
          : await googleMobile({
              idToken: googleIdToken,
              phone,
              firstName: legalFirstName,
              lastName: legalLastName,
              gender: gender ?? undefined,
              role,
              vehicle: signupVehicle,
              ...referralSignupPayload,
            }).unwrap();
        await completeRegistration(result, authMethod, pendingAttribution?.token, legalFirstName || googleProfileName || '');
        return;
      }
      
      const formData = new FormData();
      formData.append('phone', phone);
      formData.append('pin', pin);
      formData.append('firstName', legalFirstName);
      formData.append('lastName', legalLastName);
      if (gender) formData.append('gender', gender);
      formData.append('role', role);
      Object.entries(referralSignupPayload).forEach(([key, value]) => {
        if (value) formData.append(key, value);
      });

      if (requiresVehicle) {
        formData.append('vehicle[type]', vehicleType!);
        formData.append('vehicle[brand]', vehicleBrand.trim());
        formData.append('vehicle[model]', vehicleModel.trim());
        formData.append('vehicle[color]', vehicleColor.trim());
        formData.append('vehicle[licensePlate]', normalizeVehiclePlate(vehiclePlate));
      }
      if (email) formData.append('email', email.trim());

      if (profilePicture) {
        formData.append('profilePicture', { uri: profilePicture, name: `pp-${Date.now()}.jpg`, type: 'image/jpeg' } as any);
      }

      const result = await register(formData).unwrap();
      await completeRegistration(result, 'phone', pendingAttribution?.token, legalFirstName);
    } catch (error: any) {
      if (!mounted.current) return;
      showDialog(resumeFinalization.current
        ? { variant: 'warning', title: 'Connexion à finaliser', message: 'Votre compte est déjà créé. Réessayez pour finaliser la connexion, sans recréer de compte.' }
        : { variant: 'danger', title: 'Erreur', message: getAuthErrorMessage(error, "Impossible de terminer l'inscription pour le moment.") });
    } finally {
      if (!awaitingRedirect.current) {
        inFlight.current = false;
        if (mounted.current) setIsRegistrationPending(false);
      }
    }
  };

  return {
    handleFinalRegister,
    isRegistrationPending,
    hasCreatedAccount,
    isRegistrationInFlight: () => inFlight.current,
    isRegistrationLocked: () => inFlight.current || resumeFinalization.current !== null,
  };
}
