import { SocialAuthProvider } from '../../features/auth/authModel';
import type { UserGender } from '@/types';
import { getPendingReferralAttribution, type PendingReferralAttribution } from '@/utils/referralAttribution';
import React, { useCallback, useEffect } from 'react';
import { InteractionManager, Platform, TextInput } from 'react-native';
import { AuthMode, AuthStep } from '@/components/auth';
import type { Router } from 'expo-router';

interface Params {
  focusInteractionRef: React.RefObject<{ cancel: () => void; } | null>;
  focusTimeoutRef: React.RefObject<NodeJS.Timeout | null>;
  setReferralAttribution: React.Dispatch<React.SetStateAction<PendingReferralAttribution | null>>;
  setMode: React.Dispatch<React.SetStateAction<AuthMode>>;
  initialReferralToken: string | undefined;
  step: AuthStep;
  smsInputRefs: React.RefObject<(TextInput | null)[]>;
  pinInputRef: React.RefObject<TextInput | null>;
  googleSignupStep: "phone" | "profile" | "otp";
  googleIdToken: string | null;
  googleOtpRefs: React.RefObject<(TextInput | null)[]>;
  isAuthenticated: boolean;
  router: Router;
  setStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  setResetPinStep: React.Dispatch<React.SetStateAction<"otp" | "newPin">>;
  setResetOtpCode: React.Dispatch<React.SetStateAction<string[]>>;
  setResetNewPin: React.Dispatch<React.SetStateAction<string>>;
  setResetNewPinConfirm: React.Dispatch<React.SetStateAction<string>>;
  currentStepIndex: number;
  stepSequence: string[];
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  setSmsCode: React.Dispatch<React.SetStateAction<string[]>>;
  setPin: React.Dispatch<React.SetStateAction<string>>;
  setPinConfirm: React.Dispatch<React.SetStateAction<string>>;
  setFirstName: React.Dispatch<React.SetStateAction<string>>;
  setLastName: React.Dispatch<React.SetStateAction<string>>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setGender: React.Dispatch<React.SetStateAction<UserGender | null>>;
  setRole: React.Dispatch<React.SetStateAction<"driver" | "passenger">>;
  setProfilePicture: React.Dispatch<React.SetStateAction<string | null>>;
  setVehicleType: React.Dispatch<React.SetStateAction<TripRequestVehicleType | null>>;
  setVehicleBrand: React.Dispatch<React.SetStateAction<string>>;
  setVehicleModel: React.Dispatch<React.SetStateAction<string>>;
  setVehicleColor: React.Dispatch<React.SetStateAction<string>>;
  setVehiclePlate: React.Dispatch<React.SetStateAction<string>>;
  setVehicleModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSendingOtp: React.Dispatch<React.SetStateAction<boolean>>;
  setGoogleIdToken: React.Dispatch<React.SetStateAction<string | null>>;
  setGoogleProfileName: React.Dispatch<React.SetStateAction<string | null>>;
  setGoogleFirstName: React.Dispatch<React.SetStateAction<string | null>>;
  setGoogleLastName: React.Dispatch<React.SetStateAction<string | null>>;
  setGoogleEmail: React.Dispatch<React.SetStateAction<string | null>>;
  setGooglePhone: React.Dispatch<React.SetStateAction<string>>;
  setGoogleOtp: React.Dispatch<React.SetStateAction<string[]>>;
  setGoogleFlow: React.Dispatch<React.SetStateAction<"login" | "signup" | null>>;
  setGoogleSignupStep: React.Dispatch<React.SetStateAction<"phone" | "profile" | "otp">>;
  setIsGooglePhoneVerified: React.Dispatch<React.SetStateAction<boolean>>;
  setSocialProvider: React.Dispatch<React.SetStateAction<SocialAuthProvider | null>>;
  setAppleNonce: React.Dispatch<React.SetStateAction<string | null>>;
  setIsAppleLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useAuthFormNavigation({
  focusInteractionRef,
  focusTimeoutRef,
  setReferralAttribution,
  setMode,
  initialReferralToken,
  step,
  smsInputRefs,
  pinInputRef,
  googleSignupStep,
  googleIdToken,
  googleOtpRefs,
  isAuthenticated,
  router,
  setStep,
  setResetPinStep,
  setResetOtpCode,
  setResetNewPin,
  setResetNewPinConfirm,
  currentStepIndex,
  stepSequence,
  setPhone,
  setSmsCode,
  setPin,
  setPinConfirm,
  setFirstName,
  setLastName,
  setEmail,
  setGender,
  setRole,
  setProfilePicture,
  setVehicleType,
  setVehicleBrand,
  setVehicleModel,
  setVehicleColor,
  setVehiclePlate,
  setVehicleModalVisible,
  setIsSendingOtp,
  setGoogleIdToken,
  setGoogleProfileName,
  setGoogleFirstName,
  setGoogleLastName,
  setGoogleEmail,
  setGooglePhone,
  setGoogleOtp,
  setGoogleFlow,
  setGoogleSignupStep,
  setIsGooglePhoneVerified,
  setSocialProvider,
  setAppleNonce,
  setIsAppleLoading,
}: Params) {
  const cancelPendingFocus = useCallback(() => {
    focusInteractionRef.current?.cancel();
    focusInteractionRef.current = null;
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }
  }, []);

  const focusAfterInteractions = useCallback(
    (
      inputRef: React.RefObject<TextInput | null>,
      delay = Platform.OS === 'android' ? 350 : 100,
    ) => {
      cancelPendingFocus();
      focusInteractionRef.current = InteractionManager.runAfterInteractions(() => {
        focusTimeoutRef.current = setTimeout(() => {
          inputRef.current?.focus();
          focusTimeoutRef.current = null;
        }, delay);
      });
    },
    [cancelPendingFocus],
  );

  useEffect(() => cancelPendingFocus, [cancelPendingFocus]);

  useEffect(() => {
    let active = true;
    void getPendingReferralAttribution().then((pending) => {
      if (!active) return;
      setReferralAttribution(pending);
      if (pending) setMode('signup');
    });
    return () => {
      active = false;
    };
  }, [initialReferralToken]);

  useEffect(() => {
    if (step === 'sms') {
      focusAfterInteractions({ current: smsInputRefs.current[0] }, 500);
      return cancelPendingFocus;
    }
    if (step === 'pin') {
      focusAfterInteractions(pinInputRef, 500);
      return cancelPendingFocus;
    }
  }, [cancelPendingFocus, focusAfterInteractions, step]);

  useEffect(() => {
    if (googleSignupStep === 'otp' && googleIdToken) {
      focusAfterInteractions({ current: googleOtpRefs.current[0] }, 500);
      return cancelPendingFocus;
    }
  }, [cancelPendingFocus, focusAfterInteractions, googleSignupStep, googleIdToken]);

  useEffect(() => {
    if (isAuthenticated) {
      // Si on est en train de compléter le KYC (étape kyc), rester sur la page auth
      if (step === 'kyc') {
        console.log('[AuthScreen] Authentifié mais en train de compléter le KYC - rester sur auth');
        return;
      }
      
      // Sinon, rediriger vers l'écran d'accueil
      console.log('[AuthScreen] Authentifié -> redirection vers /(tabs)');
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, step, router]);

  // ============ HANDLERS ============

  // Navigation
  const handlePreviousStep = () => {
    if (step === 'resetPin') {
      setStep('pin');
      setResetPinStep('otp');
      setResetOtpCode(['', '', '', '', '']);
      setResetNewPin('');
      setResetNewPinConfirm('');
      return;
    }
    if (currentStepIndex > 0) {
      setStep(stepSequence[currentStepIndex - 1] as AuthStep);
    }
  };

  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setSmsCode(['', '', '', '', '']);
    setPin('');
    setPinConfirm('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setGender(null);
    setRole('passenger');
    setProfilePicture(null);
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
    setVehicleModalVisible(false);
    setIsSendingOtp(false);
    setGoogleIdToken(null);
    setGoogleProfileName(null);
    setGoogleFirstName(null);
    setGoogleLastName(null);
    setGoogleEmail(null);
    setGooglePhone('');
    setGoogleOtp(['', '', '', '', '']);
    setGoogleFlow(null);
    setGoogleSignupStep('phone');
    setIsGooglePhoneVerified(false);
    setSocialProvider(null);
    setAppleNonce(null);
    setIsAppleLoading(false);
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    resetForm();
  };

  return {
    focusAfterInteractions,
    handleModeChange,
    handlePreviousStep,
  };
}
import type { TripRequestVehicleType } from '@/types';
