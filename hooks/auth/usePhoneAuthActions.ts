import { getAuthErrorMessage } from '../../features/auth/authModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import { trackEvent } from '@/services/analytics';
import { useSendPhoneVerificationOtpMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useLoginMutation } from '@/store/api/zwangaApi';
import { useAppDispatch } from '@/store/hooks';
import { saveTokensAndUpdateState } from '@/store/slices/authSlice';
import React from 'react';
import { NativeSyntheticEvent, TextInput, TextInputKeyPressEventData } from 'react-native';
import { AuthMode, AuthStep } from '@/components/auth';
import { emptyPinResetOtp, PIN_RESET_OTP_LENGTH, usePinResetFlow } from './usePinResetFlow';

interface Params {
  step: AuthStep;
  phone: string;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  mode: AuthMode;
  setStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  setIsSendingOtp: React.Dispatch<React.SetStateAction<boolean>>;
  sendPhoneVerificationOtp: ReturnType<typeof useSendPhoneVerificationOtpMutation>[0];
  smsCode: string[];
  setSmsCode: React.Dispatch<React.SetStateAction<string[]>>;
  smsInputRefs: React.RefObject<(TextInput | null)[]>;
  verifyPhoneOtp: ReturnType<typeof useVerifyPhoneOtpMutation>[0];
  setPin: React.Dispatch<React.SetStateAction<string>>;
  setPinConfirm: React.Dispatch<React.SetStateAction<string>>;
  pin: string;
  login: ReturnType<typeof useLoginMutation>[0];
  dispatch: ReturnType<typeof useAppDispatch>;
  pinInputRef: React.RefObject<TextInput | null>;
  pinConfirm: string;
  pinConfirmInputRef: React.RefObject<TextInput | null>;
  setResetPinStep: React.Dispatch<React.SetStateAction<"otp" | "newPin">>;
  setResetOtpCode: React.Dispatch<React.SetStateAction<string[]>>;
  setResetNewPin: React.Dispatch<React.SetStateAction<string>>;
  setResetNewPinConfirm: React.Dispatch<React.SetStateAction<string>>;
  setIsSendingResetOtp: React.Dispatch<React.SetStateAction<boolean>>;
  focusAfterInteractions: (inputRef: React.RefObject<TextInput | null>, delay?: number) => void;
  resetOtpInputRefs: React.RefObject<(TextInput | null)[]>;
  resetOtpCode: string[];
  resetPinInputRef: React.RefObject<TextInput | null>;
  resetNewPin: string;
  resetNewPinConfirm: string;
}

export function usePhoneAuthActions({
  step,
  phone,
  showDialog,
  setPhone,
  mode,
  setStep,
  setIsSendingOtp,
  sendPhoneVerificationOtp,
  smsCode,
  setSmsCode,
  smsInputRefs,
  verifyPhoneOtp,
  setPin,
  setPinConfirm,
  pin,
  login,
  dispatch,
  pinInputRef,
  pinConfirm,
  pinConfirmInputRef,
  setResetPinStep,
  setResetOtpCode,
  setResetNewPin,
  setResetNewPinConfirm,
  setIsSendingResetOtp,
  focusAfterInteractions,
  resetOtpInputRefs,
  resetOtpCode,
  resetPinInputRef,
  resetNewPin,
  resetNewPinConfirm,
}: Params) {
  const pinReset = usePinResetFlow(phone, step === 'resetPin' && mode === 'login');
  const handlePhoneSubmit = async () => {
    const normalizedPhone = phone.trim();
    if (normalizedPhone.length < 10) {
      showDialog({ variant: 'danger', title: 'Numéro invalide', message: 'Veuillez entrer un numéro valide' });
      return;
    }
    setPhone(normalizedPhone);
    if (mode === 'login') {
      setStep('pin');
      return;
    }
    if (!isSignupOtpVerificationEnabled) {
      setStep('pin');
      return;
    }
    try {
      setIsSendingOtp(true);
      await sendPhoneVerificationOtp({ phone: normalizedPhone, context: 'registration' }).unwrap();
      setStep('sms');
      showDialog({ variant: 'success', title: 'Code envoyé', message: 'Un code de vérification a été envoyé.' });
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: getAuthErrorMessage(error, 'Impossible d\'envoyer le code. Réessayez dans un instant.') });
    } finally {
      setIsSendingOtp(false);
    }
  };

  // SMS Handlers
  const handleSmsInputChange = (value: string, index: number) => {
    const sanitized = value.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const digits = sanitized.split('');
      const updated = [...smsCode];
      let cursor = index;
      digits.forEach((digit) => {
        if (cursor <= updated.length - 1) updated[cursor] = digit;
        cursor += 1;
      });
      setSmsCode(updated);
      if (cursor <= updated.length - 1) smsInputRefs.current[cursor]?.focus();
      return;
    }
    const nextCode = [...smsCode];
    nextCode[index] = sanitized;
    setSmsCode(nextCode);
    if (sanitized && index < nextCode.length - 1) smsInputRefs.current[index + 1]?.focus();
  };

  const handleSmsKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (event.nativeEvent.key === 'Backspace') {
      if (smsCode[index]) {
        const updated = [...smsCode];
        updated[index] = '';
        setSmsCode(updated);
      } else if (index > 0) {
        smsInputRefs.current[index - 1]?.focus();
        const updated = [...smsCode];
        updated[index - 1] = '';
        setSmsCode(updated);
      }
    }
  };

  const handleSmsSubmit = async () => {
    const code = smsCode.join('');
    if (code.length !== 5) {
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet' });
      return;
    }
    try {
      await verifyPhoneOtp({ phone, otp: code }).unwrap();
      setStep('pin');
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Code invalide',
        message: getAuthErrorMessage(error, 'Code OTP invalide ou expiré.'),
        actions: [{ label: 'Réessayer', variant: 'primary', onPress: () => { setStep('phone'); setSmsCode(['', '', '', '', '']); } }],
      });
    }
  };

  // PIN Handlers
  const handlePinChange = (value: string) => setPin(value.replace(/\D/g, '').slice(0, 4));
  const handlePinConfirmChange = (value: string) => setPinConfirm(value.replace(/\D/g, '').slice(0, 4));

  const handlePinSubmit = async () => {
    if (pin.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer un PIN à 4 chiffres' });
      return;
    }
    if (mode === 'login') {
      try {
        const result = await login({ phone, pin }).unwrap();
        await dispatch(saveTokensAndUpdateState({ accessToken: result.accessToken, refreshToken: result.refreshToken })).unwrap();
        await trackEvent('login_success', { method: 'phone' });
      } catch (error: any) {
        showDialog({ variant: 'danger', title: 'Erreur', message: getAuthErrorMessage(error, 'PIN incorrect.') });
        setPin('');
        pinInputRef.current?.focus();
      }
    } else {
      if (pinConfirm.length !== 4) {
        showDialog({ variant: 'danger', title: 'Confirmation incomplète', message: 'Veuillez confirmer votre PIN' });
        return;
      }
      if (pin !== pinConfirm) {
        showDialog({ variant: 'danger', title: 'PIN non correspondant', message: 'Les deux codes PIN ne correspondent pas' });
        setPinConfirm('');
        pinConfirmInputRef.current?.focus();
        return;
      }
      setStep('profile');
    }
  };

  // Reset PIN Handlers
  const handleForgotPin = async () => {
    if (pinReset.isBusy) return;
    setStep('resetPin');
    setResetPinStep('otp');
    setResetOtpCode(emptyPinResetOtp());
    setResetNewPin('');
    setResetNewPinConfirm('');
    try {
      setIsSendingResetOtp(true);
      if (!await pinReset.requestOtp()) return;
      showDialog({ variant: 'success', title: 'Demande envoyée', message: 'Si ce numéro correspond à un compte éligible, vous recevrez un code SMS.' });
      focusAfterInteractions({ current: resetOtpInputRefs.current[0] });
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: getAuthErrorMessage(error, 'Impossible d\'envoyer le code. Réessayez dans un instant.') });
    } finally {
      setIsSendingResetOtp(false);
    }
  };

  const handleResetOtpInputChange = (value: string, index: number) => {
    const sanitized = value.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const digits = sanitized.split('');
      const updated = [...resetOtpCode];
      let cursor = index;
      digits.forEach((digit) => {
        if (cursor <= updated.length - 1) updated[cursor] = digit;
        cursor += 1;
      });
      setResetOtpCode(updated);
      if (cursor <= updated.length - 1) resetOtpInputRefs.current[cursor]?.focus();
      return;
    }
    const nextCode = [...resetOtpCode];
    nextCode[index] = sanitized;
    setResetOtpCode(nextCode);
    if (sanitized && index < nextCode.length - 1) resetOtpInputRefs.current[index + 1]?.focus();
  };

  const handleResetOtpKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (event.nativeEvent.key === 'Backspace') {
      if (resetOtpCode[index]) {
        const updated = [...resetOtpCode];
        updated[index] = '';
        setResetOtpCode(updated);
      } else if (index > 0) {
        resetOtpInputRefs.current[index - 1]?.focus();
        const updated = [...resetOtpCode];
        updated[index - 1] = '';
        setResetOtpCode(updated);
      }
    }
  };

  const handleVerifyResetOtp = async () => {
    const code = resetOtpCode.join('');
    if (code.length !== PIN_RESET_OTP_LENGTH) {
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet' });
      return;
    }
    try {
      if (!await pinReset.verifyOtp(code)) return;
      setResetOtpCode(emptyPinResetOtp());
      setResetPinStep('newPin');
      focusAfterInteractions(resetPinInputRef);
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Code invalide', message: getAuthErrorMessage(error, 'Code OTP invalide ou expiré.') });
    }
  };

  const handleResetPinChange = (value: string) => setResetNewPin(value.replace(/\D/g, '').slice(0, 4));
  const handleResetPinConfirmChange = (value: string) => setResetNewPinConfirm(value.replace(/\D/g, '').slice(0, 4));

  const handleResetPinSubmit = async () => {
    if (resetNewPin.length !== 4 || resetNewPinConfirm.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer un PIN à 4 chiffres' });
      return;
    }
    if (resetNewPin !== resetNewPinConfirm) {
      showDialog({ variant: 'danger', title: 'PIN non correspondant', message: 'Les deux codes PIN ne correspondent pas' });
      setResetNewPinConfirm('');
      return;
    }
    try {
      if (!await pinReset.confirmPin(resetNewPin)) return;
      showDialog({ variant: 'success', title: 'PIN réinitialisé', message: 'Connectez-vous avec votre nouveau PIN.' });
      setStep('pin');
      setResetPinStep('otp');
      setResetOtpCode(emptyPinResetOtp());
      setResetNewPin('');
      setResetNewPinConfirm('');
      setPin('');
    } catch (error: any) {
      setResetPinStep('otp');
      setResetOtpCode(emptyPinResetOtp());
      setResetNewPin('');
      setResetNewPinConfirm('');
      showDialog({ variant: 'danger', title: 'Réinitialisation non confirmée', message: getAuthErrorMessage(error, 'Demandez un nouveau code SMS pour réessayer. Si le PIN a déjà été changé, connectez-vous avec le nouveau PIN.') });
    }
  };

  return {
    isResettingPin: pinReset.isBusy,
    handlePhoneSubmit,
    handleSmsSubmit,
    handlePinChange,
    handlePinConfirmChange,
    handlePinSubmit,
    handleForgotPin,
    handleResetPinChange,
    handleResetPinConfirmChange,
    handleVerifyResetOtp,
    handleResetPinSubmit,
  };
}
