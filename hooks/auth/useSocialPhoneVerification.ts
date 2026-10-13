import { SocialAuthProvider } from '../../features/auth/authModel';
import { authPhoneCopy, isAuthPhoneValid } from '@/features/auth/authPhone';
import React from 'react';
import { AuthStep } from '@/components/auth';
import type { DialogOptions } from '@/features/dialogs/dialogTypes';
import type { useSendPhoneVerificationOtpMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';

interface Params {
  googlePhone: string;
  showDialog: (options: DialogOptions) => void;
  setGooglePhone: React.Dispatch<React.SetStateAction<string>>;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  setGoogleOtp: React.Dispatch<React.SetStateAction<string[]>>;
  setIsGooglePhoneVerified: React.Dispatch<React.SetStateAction<boolean>>;
  googleFirstName: string | null;
  setFirstName: React.Dispatch<React.SetStateAction<string>>;
  googleLastName: string | null;
  setLastName: React.Dispatch<React.SetStateAction<string>>;
  googleEmail: string | null;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setGoogleSignupStep: React.Dispatch<React.SetStateAction<"phone" | "profile" | "otp">>;
  setStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  setIsSendingGoogleOtp: React.Dispatch<React.SetStateAction<boolean>>;
  sendPhoneVerificationOtp: ReturnType<typeof useSendPhoneVerificationOtpMutation>[0];
  setGoogleFlow: React.Dispatch<React.SetStateAction<"login" | "signup" | null>>;
  setGoogleIdToken: React.Dispatch<React.SetStateAction<string | null>>;
  setGoogleProfileName: React.Dispatch<React.SetStateAction<string | null>>;
  setSocialProvider: React.Dispatch<React.SetStateAction<SocialAuthProvider | null>>;
  setAppleNonce: React.Dispatch<React.SetStateAction<string | null>>;
  googleIdToken: string | null;
  googleOtp: string[];
  setIsVerifyingGoogleOtp: React.Dispatch<React.SetStateAction<boolean>>;
  verifyPhoneOtp: ReturnType<typeof useVerifyPhoneOtpMutation>[0];
}

export function useSocialPhoneVerification({
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
  setGoogleFlow,
  setGoogleIdToken,
  setGoogleProfileName,
  setSocialProvider,
  setAppleNonce,
  googleIdToken,
}: Params) {
  const handleSendGoogleOtp = async () => {
    const normalizedPhone = googlePhone.trim();
    if (!isAuthPhoneValid(normalizedPhone)) {
      showDialog({ variant: 'warning', title: 'Numéro invalide', message: authPhoneCopy.invalid });
      return;
    }
    setGooglePhone(normalizedPhone);
    setPhone(normalizedPhone);
    setGoogleOtp(['', '', '', '', '']);
    // Legacy UI flag means phone entry is complete, never proof of ownership.
    // The backend still owns the real isPhoneVerified field.
    setIsGooglePhoneVerified(true);
    if (googleFirstName) setFirstName(googleFirstName);
    if (googleLastName) setLastName(googleLastName);
    if (googleEmail) setEmail(googleEmail);
    setGoogleSignupStep('profile');
    setStep('profile');
  };

  // Old UI callbacks continue safely without invoking the retired OTP endpoints.
  const handleResendGoogleOtp = handleSendGoogleOtp;

  const handleGooglePhoneBack = () => {
    setGoogleSignupStep('phone');
    setGoogleOtp(['', '', '', '', '']);
  };

  const handleGoogleCancel = () => {
    setGoogleFlow(null);
    setGoogleIdToken(null);
    setGoogleProfileName(null);
    setGooglePhone('');
    setSocialProvider(null);
    setAppleNonce(null);
  };

  const handleVerifyGoogleOtpAndContinue = async () => {
    if (!googleIdToken) {
      showDialog({ variant: 'danger', title: 'Token manquant', message: 'Veuillez relancer la connexion sociale.' });
      return;
    }
    await handleSendGoogleOtp();
  };

  return {
    handleSendGoogleOtp,
    handleGoogleCancel,
    handleVerifyGoogleOtpAndContinue,
    handleResendGoogleOtp,
    handleGooglePhoneBack,
  };
}
