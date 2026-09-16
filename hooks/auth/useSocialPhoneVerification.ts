import { SocialAuthProvider, getAuthErrorMessage } from '../../features/auth/authModel';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import React from 'react';
import { AuthStep } from '@/components/auth';

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
}: Params) {
  const handleSendGoogleOtp = async () => {
    const normalizedPhone = googlePhone.trim();
    if (!normalizedPhone || normalizedPhone.length < 10) {
      showDialog({ variant: 'warning', title: 'Numéro requis', message: 'Veuillez entrer un numéro valide.' });
      return;
    }
    if (!isSignupOtpVerificationEnabled) {
      setGooglePhone(normalizedPhone);
      setPhone(normalizedPhone);
      setGoogleOtp(['', '', '', '', '']);
      setIsGooglePhoneVerified(true);
      if (googleFirstName) setFirstName(googleFirstName);
      if (googleLastName) setLastName(googleLastName);
      if (googleEmail) setEmail(googleEmail);
      setGoogleSignupStep('profile');
      setStep('profile');
      return;
    }
    try {
      setIsSendingGoogleOtp(true);
      await sendPhoneVerificationOtp({ phone: normalizedPhone, context: 'registration' }).unwrap();
      setGooglePhone(normalizedPhone);
      setGoogleSignupStep('otp');
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur OTP', message: getAuthErrorMessage(error, 'Impossible d\'envoyer le code. Réessayez dans un instant.') });
    } finally {
      setIsSendingGoogleOtp(false);
    }
  };

  const handleResendGoogleOtp = async () => {
    try {
      setIsSendingGoogleOtp(true);
      await sendPhoneVerificationOtp({ phone: googlePhone, context: 'registration' }).unwrap();
      showDialog({ variant: 'success', title: 'Code renvoyé', message: 'Un nouveau code a été envoyé par SMS.' });
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: getAuthErrorMessage(error, 'Impossible de renvoyer le code. Réessayez dans un instant.') });
    } finally {
      setIsSendingGoogleOtp(false);
    }
  };

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
    const code = googleOtp.join('');
    if (code.length !== 5) {
      showDialog({ variant: 'warning', title: 'Code incomplet', message: 'Saisissez les 5 chiffres du code.' });
      return;
    }
    try {
      setIsVerifyingGoogleOtp(true);
      await verifyPhoneOtp({ phone: googlePhone, otp: code }).unwrap();
      setIsGooglePhoneVerified(true);
      setPhone(googlePhone);
      if (googleFirstName) setFirstName(googleFirstName);
      if (googleLastName) setLastName(googleLastName);
      if (googleEmail) setEmail(googleEmail);
      setGoogleSignupStep('profile'); // Passer à l'étape profile du flow Google
      setStep('profile');
      showDialog({ variant: 'success', title: 'Numéro vérifié', message: 'Complétez maintenant votre profil.' });
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Validation', message: getAuthErrorMessage(error, 'Code invalide ou expiré.') });
    } finally {
      setIsVerifyingGoogleOtp(false);
    }
  };

  return {
    handleSendGoogleOtp,
    handleGoogleCancel,
    handleVerifyGoogleOtpAndContinue,
    handleResendGoogleOtp,
    handleGooglePhoneBack,
  };
}
import type { DialogOptions } from '@/features/dialogs/dialogTypes';
import type { useSendPhoneVerificationOtpMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
