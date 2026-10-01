import { useSocialPhoneVerification } from './useSocialPhoneVerification';
import {
  SocialAuthProvider,
  SocialSignupSeed,
  getAuthErrorMessage,
  isSocialSignupRequiredError,
} from '../../features/auth/authModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackEvent } from '@/services/analytics';
import { signInWithApple, type AppleAuthResult } from '@/services/appleAuth';
import { useGoogleAuthActions } from './useGoogleAuthActions';
import { useSendPhoneVerificationOtpMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useAppleMobileMutation, useGoogleMobileMutation } from '@/store/api/zwangaApi';
import type { AuthResponse } from '@/store/api/authApi';
import type { TripRequestVehicleType, UserGender } from '@/types';
import React from 'react';
import { AuthMode, AuthStep } from '@/components/auth';

export interface SocialAuthParams {
  confirmSession: (tokens: AuthResponse) => Promise<void>;
  phone: string;
  setMode: React.Dispatch<React.SetStateAction<AuthMode>>;
  setStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  setSmsCode: React.Dispatch<React.SetStateAction<string[]>>;
  setPin: React.Dispatch<React.SetStateAction<string>>;
  setPinConfirm: React.Dispatch<React.SetStateAction<string>>;
  setResetPinStep: React.Dispatch<React.SetStateAction<"otp" | "newPin">>;
  setResetOtpCode: React.Dispatch<React.SetStateAction<string[]>>;
  setResetNewPin: React.Dispatch<React.SetStateAction<string>>;
  setResetNewPinConfirm: React.Dispatch<React.SetStateAction<string>>;
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
  googleMobile: ReturnType<typeof useGoogleMobileMutation>[0];
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  setIsAppleLoading: React.Dispatch<React.SetStateAction<boolean>>;
  appleMobile: ReturnType<typeof useAppleMobileMutation>[0];
  googlePhone: string;
  googleFirstName: string | null;
  googleLastName: string | null;
  googleEmail: string | null;
  setIsSendingGoogleOtp: React.Dispatch<React.SetStateAction<boolean>>;
  sendPhoneVerificationOtp: ReturnType<typeof useSendPhoneVerificationOtpMutation>[0];
  googleIdToken: string | null;
  googleOtp: string[];
  setIsVerifyingGoogleOtp: React.Dispatch<React.SetStateAction<boolean>>;
  verifyPhoneOtp: ReturnType<typeof useVerifyPhoneOtpMutation>[0];
}

export function useSocialAuthActions({
  confirmSession,
  phone,
  setMode,
  setStep,
  setPhone,
  setSmsCode,
  setPin,
  setPinConfirm,
  setResetPinStep,
  setResetOtpCode,
  setResetNewPin,
  setResetNewPinConfirm,
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
  googleMobile,
  showDialog,
  setIsAppleLoading,
  appleMobile,
  googlePhone,
  googleFirstName,
  googleLastName,
  googleEmail,
  setIsSendingGoogleOtp,
  sendPhoneVerificationOtp,
  googleIdToken,
  googleOtp,
  setIsVerifyingGoogleOtp,
  verifyPhoneOtp,
}: SocialAuthParams) {
  const attemptInFlight = React.useRef(false);
  const continueSocialSignupFromLogin = (seed: SocialSignupSeed) => {
    const reusablePhone = phone.trim();

    setMode('signup');
    setStep('phone');
    setPhone('');
    setSmsCode(['', '', '', '', '']);
    setPin('');
    setPinConfirm('');
    setResetPinStep('otp');
    setResetOtpCode(['', '', '', '', '', '']);
    setResetNewPin('');
    setResetNewPinConfirm('');
    setFirstName(seed.firstName ?? '');
    setLastName(seed.lastName ?? '');
    setEmail(seed.email ?? '');
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
    setGoogleIdToken(seed.idToken);
    setGoogleProfileName(seed.profileName);
    setGoogleFirstName(seed.firstName ?? null);
    setGoogleLastName(seed.lastName ?? null);
    setGoogleEmail(seed.email ?? null);
    setGooglePhone(reusablePhone.length >= 10 ? reusablePhone : '');
    setGoogleOtp(['', '', '', '', '']);
    setGoogleFlow('signup');
    setGoogleSignupStep('phone');
    setIsGooglePhoneVerified(false);
    setSocialProvider(seed.provider);
    setAppleNonce(seed.provider === 'apple' ? seed.nonce ?? null : null);
    void trackEvent('social_signup_redirected_from_login', {
      method: seed.provider,
    }).catch((error) => {
      console.warn('Social signup redirect analytics error:', error);
    });
  };

  const google = useGoogleAuthActions({
    attemptInFlight, onSignupRequired: continueSocialSignupFromLogin,
    setGoogleFlow, setSocialProvider, setGoogleIdToken, setGoogleProfileName,
    setGoogleFirstName, setGoogleLastName, setGoogleEmail, googleMobile, showDialog, confirmSession,
  });

  const handleAppleLogin = async () => {
    if (attemptInFlight.current) return;
    attemptInFlight.current = true;
    let result: AppleAuthResult | null = null;
    let awaitingRedirect = false;
    try {
      setIsAppleLoading(true);
      setGoogleFlow('login');
      setSocialProvider('apple');
      result = await signInWithApple();
      setGoogleIdToken(result.identityToken);
      setGoogleProfileName(
        [result.firstName, result.lastName].filter(Boolean).join(' ') || 'Profil Apple',
      );
      setGoogleFirstName(result.firstName);
      setGoogleLastName(result.lastName);
      setGoogleEmail(result.email);
      setAppleNonce(result.nonce);
      const tokens = await appleMobile({
        idToken: result.identityToken,
        nonce: result.nonce,
      }).unwrap();
      await confirmSession(tokens);
      awaitingRedirect = true;
      void trackEvent('login_success', { method: 'apple' }).catch(() => undefined);
    } catch (error: any) {
      console.error('Apple login error:', error);

      if (result && isSocialSignupRequiredError(error, 'apple')) {
        continueSocialSignupFromLogin({
          provider: 'apple',
          idToken: result.identityToken,
          profileName:
            [result.firstName, result.lastName].filter(Boolean).join(' ') || 'Profil Apple',
          firstName: result.firstName,
          lastName: result.lastName,
          email: result.email,
          nonce: result.nonce,
        });
        return;
      }

      showDialog({
        variant: 'danger',
        title: 'Connexion Apple',
        message: getAuthErrorMessage(error, 'Connexion Apple impossible'),
      });
      setGoogleFlow(null);
      setSocialProvider(null);
    } finally {
      if (!awaitingRedirect) {
        attemptInFlight.current = false;
        setIsAppleLoading(false);
      }
    }
  };

  const handleAppleSignupStart = async () => {
    if (attemptInFlight.current) return;
    attemptInFlight.current = true;
    try {
      setIsAppleLoading(true);
      setGoogleFlow('signup');
      setSocialProvider('apple');
      const result = await signInWithApple();
      setGoogleIdToken(result.identityToken);
      setGoogleProfileName(
        [result.firstName, result.lastName].filter(Boolean).join(' ') || 'Profil Apple',
      );
      setGoogleFirstName(result.firstName);
      setGoogleLastName(result.lastName);
      setGoogleEmail(result.email);
      setFirstName(result.firstName ?? '');
      setLastName(result.lastName ?? '');
      setEmail(result.email ?? '');
      setAppleNonce(result.nonce);
    } catch (error: any) {
      console.error('Apple signup error:', error);
      showDialog({
        variant: 'danger',
        title: 'Inscription Apple',
        message: getAuthErrorMessage(error, 'Inscription Apple impossible. Réessayez dans un instant.'),
      });
      setGoogleFlow(null);
      setSocialProvider(null);
    } finally {
      attemptInFlight.current = false;
      setIsAppleLoading(false);
    }
  };

  const { handleSendGoogleOtp, handleGoogleCancel, handleVerifyGoogleOtpAndContinue, handleResendGoogleOtp, handleGooglePhoneBack } = useSocialPhoneVerification({
    googlePhone,
    showDialog,
    setGooglePhone,
    setPhone,
    setGoogleOtp,
    setIsGooglePhoneVerified,
    googleFirstName,
    setFirstName,
    googleLastName,
    setLastName,
    googleEmail,
    setEmail,
    setGoogleSignupStep,
    setStep,
    setIsSendingGoogleOtp,
    sendPhoneVerificationOtp,
    setGoogleFlow,
    setGoogleIdToken,
    setGoogleProfileName,
    setSocialProvider,
    setAppleNonce,
    googleIdToken,
    googleOtp,
    setIsVerifyingGoogleOtp,
    verifyPhoneOtp,
  });

  return {
    ...google,
    isSocialAuthInFlight: () => attemptInFlight.current,
    handleAppleLogin,
    handleAppleSignupStart,
    handleSendGoogleOtp,
    handleGoogleCancel,
    handleVerifyGoogleOtpAndContinue,
    handleResendGoogleOtp,
    handleGooglePhoneBack,
  };
}
