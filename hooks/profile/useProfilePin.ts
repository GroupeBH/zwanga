import { useDialog } from '@/components/ui/DialogProvider';
import { otpDeliveryCopy } from '@/features/auth/otpDelivery';
import {
  useUpdatePinMutation,
  useRequestPinChangeOtpMutation,
} from '@/store/api/userApi';
import { emptyPinResetOtp, PIN_RESET_OTP_LENGTH, usePinResetFlow } from '@/hooks/auth/usePinResetFlow';
import { clearTokens } from '@/services/tokenStorage';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { useRouter } from 'expo-router';
import {
  getApiErrorMessage
} from '@/utils/errorHelpers';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import type { useProfileData } from './useProfileData';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
>;

export function useProfilePin({
  currentUser,
}: Props) {
  const { showDialog } = useDialog();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [pinModalVisible, setPinModalVisible] = useState(false);

  const [pinStep, setPinStep] = useState<'oldPin' | 'otp' | 'newPin'>('oldPin');

  const [forgotPinMode, setForgotPinMode] = useState(false);

  const [oldPin, setOldPin] = useState('');

  const [otpCode, setOtpCode] = useState(emptyPinResetOtp);

  const [newPin, setNewPin] = useState('');

  const [newPinConfirm, setNewPinConfirm] = useState('');

  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const oldPinInputRef = useRef<TextInput | null>(null);

  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  const pinInputRef = useRef<TextInput | null>(null);

  const pinConfirmInputRef = useRef<TextInput | null>(null);

  const [updatePin, { isLoading: isUpdatingPin }] = useUpdatePinMutation();
  const [requestPinChangeOtp] = useRequestPinChangeOtpMutation();
  const pinGeneration = useRef(0);
  const sendingChange = useRef(false);

  useEffect(() => {
    if (!pinModalVisible) {
      pinGeneration.current += 1;
      setOldPin('');
      setOtpCode(emptyPinResetOtp());
      setNewPin('');
      setNewPinConfirm('');
      setIsSendingOtp(false);
    }
  }, [pinModalVisible]);
  useEffect(() => {
    setOldPin('');
    setOtpCode(emptyPinResetOtp());
    setNewPin('');
    setNewPinConfirm('');
    setPinStep('oldPin');
    setIsSendingOtp(false);
    return () => { pinGeneration.current += 1; };
  }, [currentUser?.id, currentUser?.phone]);

  const pinReset = usePinResetFlow(currentUser?.phone || '', pinModalVisible && forgotPinMode);
  const isUpdatingPinWithOtp = pinReset.isBusy;

  const handleOpenPinModal = () => {
    pinGeneration.current += 1;
    setPinModalVisible(true);
    setIsSendingOtp(false);
    setPinStep('oldPin');
    setForgotPinMode(false);
    setOldPin('');
    setOtpCode(emptyPinResetOtp());
    setNewPin('');
    setNewPinConfirm('');
    // Focus sur le champ de l'ancien PIN
    setTimeout(() => {
      oldPinInputRef.current?.focus();
    }, 100);
  };

  const handleForgotPin = async () => {
    if (pinReset.isBusy || isUpdatingPin || sendingChange.current) return;
    setForgotPinMode(true);
    setPinStep('otp');
    setOldPin('');
    setOtpCode(emptyPinResetOtp());
    setNewPin('');
    setNewPinConfirm('');

    // Envoyer automatiquement l'OTP
    try {
      setIsSendingOtp(true);
      if (!await pinReset.requestOtp()) return;
      showDialog({
        variant: 'success',
        title: 'Demande envoyée',
        message: otpDeliveryCopy.pinResetRequested,
      });
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, "Impossible d'envoyer le code. Réessayez dans un instant."),
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtpForPinChange = async () => {
    const code = otpCode.join('');
    if (code.length !== PIN_RESET_OTP_LENGTH) {
      showDialog({
        variant: 'danger',
        title: 'Code incomplet',
        message: 'Veuillez entrer le code complet (6 chiffres)',
      });
      return;
    }

    try {
      if (forgotPinMode) {
        if (!await pinReset.verifyOtp(code)) return;
        setOtpCode(emptyPinResetOtp());
      }
      // A normal change verifies OTP and old PIN together on final submission.
      // The code stays only in component memory until that request.
      setPinStep('newPin');
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Code invalide',
        message: getApiErrorMessage(error, 'Code OTP invalide ou expiré.'),
      });
    }
  };

  const handleOldPinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setOldPin(sanitized);
  };

  const sendPinChangeOtp = async () => {
    if (sendingChange.current || isUpdatingPin || pinReset.isBusy) return;
    sendingChange.current = true;
    setIsSendingOtp(true);
    const generation = pinGeneration.current;
    const request = requestPinChangeOtp();
    try {
      await request.unwrap();
      if (generation !== pinGeneration.current) return;
      setOtpCode(emptyPinResetOtp());
      setPinStep('otp');
    } catch (error: unknown) {
      if (generation !== pinGeneration.current) return;
      showDialog({ variant: 'danger', title: 'SMS indisponible',
        message: getApiErrorMessage(error, 'Impossible d’envoyer le code. Réessayez dans un instant.') });
    } finally {
      request.reset();
      sendingChange.current = false;
      if (generation === pinGeneration.current) setIsSendingOtp(false);
    }
  };

  const handleResendPinOtp = () => forgotPinMode ? handleForgotPin() : sendPinChangeOtp();

  const handleVerifyOldPin = async () => {
    if (oldPin.length !== 4) {
      showDialog({
        variant: 'danger',
        title: 'Mot de passe incomplet',
        message: 'Saisissez votre mot de passe actuel à quatre chiffres.',
      });
      return;
    }
    setForgotPinMode(false);
    await sendPinChangeOtp();
  };

  const handleNewPinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setNewPin(sanitized);
  };

  const handleNewPinConfirmChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setNewPinConfirm(sanitized);
  };

  const handleUpdatePin = async () => {
    if (isUpdatingPin || pinReset.isBusy || sendingChange.current) return;
    if (newPin.length !== 4) {
      showDialog({
        variant: 'danger',
        title: 'Mot de passe incomplet',
        message: 'Saisissez un mot de passe à quatre chiffres.',
      });
      return;
    }

    if (newPinConfirm.length !== 4) {
      showDialog({
        variant: 'danger',
        title: 'Confirmation incomplète',
        message: 'Saisissez les mêmes quatre chiffres une deuxième fois.',
      });
      return;
    }

    if (newPin !== newPinConfirm) {
      showDialog({
        variant: 'danger',
        title: 'Chiffres différents',
        message: 'Les deux mots de passe doivent être identiques.',
      });
      setNewPinConfirm('');
      pinConfirmInputRef.current?.focus();
      return;
    }

    if (!forgotPinMode && oldPin === newPin) {
      showDialog({
        variant: 'danger',
        title: 'Même mot de passe',
        message: 'Choisissez un mot de passe différent de l’ancien.',
      });
      return;
    }

    try {
      if (forgotPinMode) {
        if (!await pinReset.confirmPin(newPin)) return;
      } else {
        if (oldPin.length !== 4) {
          setPinStep('oldPin');
          return;
        }
        const otp = otpCode.join('');
        if (!/^\d{6}$/.test(otp)) {
          setPinStep('otp');
          return;
        }
        const request = updatePin({ oldPin, newPin, otp });
        try {
          await request.unwrap();
        } finally {
          request.reset();
        }
      }

      setPinModalVisible(false);
      setPinStep('oldPin');
      setForgotPinMode(false);
      setOldPin('');
      setNewPin('');
      setNewPinConfirm('');
      setOtpCode(emptyPinResetOtp());

      // The backend revoked refresh tokens. Clear this device's session too.
      await clearTokens();
      dispatch(logout());
      router.replace('/auth?mode=login');

      showDialog({
        variant: 'success',
        title: 'Mot de passe modifié',
        message: 'Connectez-vous avec votre nouveau mot de passe à quatre chiffres.',
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, forgotPinMode
          ? otpDeliveryCopy.resetNotConfirmed
          : 'Impossible de modifier le mot de passe pour le moment.'),
      });
      // A reset proof may already be consumed, including after a timeout.
      setOldPin('');
      setNewPin('');
      setNewPinConfirm('');
      setOtpCode(emptyPinResetOtp());
      setPinStep(forgotPinMode ? 'otp' : 'oldPin');
      setTimeout(() => {
        if (forgotPinMode) otpInputRefs.current[0]?.focus();
        else oldPinInputRef.current?.focus();
      }, 100);
    }
  };
  return {
    handleResendPinOtp,
    handleForgotPin,
    handleNewPinChange,
    handleNewPinConfirmChange,
    handleOldPinChange,
    handleOpenPinModal,
    setOtpCode,
    handleUpdatePin,
    handleVerifyOldPin,
    handleVerifyOtpForPinChange,
    isSendingOtp,
    isUpdatingPin,
    isUpdatingPinWithOtp,
    newPin,
    newPinConfirm,
    oldPin,
    oldPinInputRef,
    otpCode,
    otpInputRefs,
    pinConfirmInputRef,
    pinInputRef,
    pinModalVisible,
    pinStep,
    setPinModalVisible,
  };
}
