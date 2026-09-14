import { useDialog } from '@/components/ui/DialogProvider';
import {
  useSendPhoneVerificationOtpMutation,
  useUpdatePinMutation,
  useUpdatePinWithOtpMutation,
  useVerifyPhoneOtpMutation
} from '@/store/api/userApi';
import {
  getApiErrorMessage
} from '@/utils/errorHelpers';
import { useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  TextInput,
  TextInputKeyPressEventData
} from 'react-native';
import type { useProfileData } from './useProfileData';

type Props = Pick<ReturnType<typeof useProfileData>,
  | 'currentUser'
>;

export function useProfilePin({
  currentUser,
}: Props) {
  const { showDialog } = useDialog();

  const [pinModalVisible, setPinModalVisible] = useState(false);

  const [pinStep, setPinStep] = useState<'oldPin' | 'otp' | 'newPin'>('oldPin');

  const [forgotPinMode, setForgotPinMode] = useState(false);

  const [oldPin, setOldPin] = useState('');

  const [otpCode, setOtpCode] = useState(['', '', '', '', '']);

  const [newPin, setNewPin] = useState('');

  const [newPinConfirm, setNewPinConfirm] = useState('');

  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const oldPinInputRef = useRef<TextInput | null>(null);

  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  const pinInputRef = useRef<TextInput | null>(null);

  const pinConfirmInputRef = useRef<TextInput | null>(null);

  const [updatePin, { isLoading: isUpdatingPin }] = useUpdatePinMutation();

  const [updatePinWithOtp, { isLoading: isUpdatingPinWithOtp }] = useUpdatePinWithOtpMutation();

  const [sendPhoneVerificationOtp] = useSendPhoneVerificationOtpMutation();

  const [verifyPhoneOtp] = useVerifyPhoneOtpMutation();

  const handleOpenPinModal = () => {
    setPinModalVisible(true);
    setPinStep('oldPin');
    setForgotPinMode(false);
    setOldPin('');
    setOtpCode(['', '', '', '', '']);
    setNewPin('');
    setNewPinConfirm('');
    // Focus sur le champ de l'ancien PIN
    setTimeout(() => {
      oldPinInputRef.current?.focus();
    }, 100);
  };

  const handleForgotPin = async () => {
    setForgotPinMode(true);
    setPinStep('otp');
    setOldPin('');
    setOtpCode(['', '', '', '', '']);

    // Envoyer automatiquement l'OTP
    try {
      setIsSendingOtp(true);
      await sendPhoneVerificationOtp({
        phone: currentUser?.phone || '',
        context: 'update',
      }).unwrap();
      showDialog({
        variant: 'success',
        title: 'Code envoyé',
        message: 'Un code de vérification a été envoyé à votre numéro de téléphone.',
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

  const handleOtpInputChange = (value: string, index: number) => {
    const sanitized = value.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const digits = sanitized.split('');
      const updated = [...otpCode];
      let cursor = index;
      digits.forEach((digit) => {
        if (cursor <= updated.length - 1) updated[cursor] = digit;
        cursor += 1;
      });
      setOtpCode(updated);
      if (cursor <= updated.length - 1) otpInputRefs.current[cursor]?.focus();
      else otpInputRefs.current[updated.length - 1]?.blur();
      return;
    }
    const nextCode = [...otpCode];
    nextCode[index] = sanitized;
    setOtpCode(nextCode);
    if (sanitized && index < nextCode.length - 1) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (event.nativeEvent.key === 'Backspace') {
      if (otpCode[index]) {
        const updated = [...otpCode];
        updated[index] = '';
        setOtpCode(updated);
      } else if (index > 0) {
        otpInputRefs.current[index - 1]?.focus();
        const updated = [...otpCode];
        updated[index - 1] = '';
        setOtpCode(updated);
      }
    }
  };

  const handleVerifyOtpForPinChange = async () => {
    const code = otpCode.join('');
    if (code.length !== 5) {
      showDialog({
        variant: 'danger',
        title: 'Code incomplet',
        message: 'Veuillez entrer le code complet (5 chiffres)',
      });
      return;
    }

    try {
      await verifyPhoneOtp({
        phone: currentUser?.phone || '',
        otp: code,
      }).unwrap();
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

  const handleVerifyOldPin = () => {
    if (oldPin.length !== 4) {
      showDialog({
        variant: 'danger',
        title: 'PIN incomplet',
        message: 'Veuillez entrer votre code PIN actuel (4 chiffres)',
      });
      return;
    }
    // Passer à l'étape de saisie du nouveau PIN
    setPinStep('newPin');
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 100);
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
    if (newPin.length !== 4) {
      showDialog({
        variant: 'danger',
        title: 'PIN incomplet',
        message: 'Veuillez entrer un PIN à 4 chiffres',
      });
      return;
    }

    if (newPinConfirm.length !== 4) {
      showDialog({
        variant: 'danger',
        title: 'Confirmation incomplète',
        message: 'Veuillez confirmer votre PIN',
      });
      return;
    }

    if (newPin !== newPinConfirm) {
      showDialog({
        variant: 'danger',
        title: 'PIN non correspondant',
        message: 'Les deux codes PIN ne correspondent pas',
      });
      setNewPinConfirm('');
      pinConfirmInputRef.current?.focus();
      return;
    }

    if (!forgotPinMode && oldPin === newPin) {
      showDialog({
        variant: 'danger',
        title: 'PIN identique',
        message: "Le nouveau PIN doit être différent de l'ancien PIN",
      });
      return;
    }

    try {
      if (forgotPinMode) {
        // Utiliser updatePinWithOtp si l'utilisateur a oublié son PIN
        // Note: L'OTP doit être vérifié avant d'appeler cette fonction
        await updatePinWithOtp({
          newPin: newPin,
        }).unwrap();
      } else {
        // Utiliser updatePin (l'ancien PIN est vérifié côté serveur via l'authentification)
        await updatePin({
          newPin: newPin,
        }).unwrap();
      }

      setPinModalVisible(false);
      setPinStep('oldPin');
      setForgotPinMode(false);
      setOldPin('');
      setNewPin('');
      setNewPinConfirm('');
      setOtpCode(['', '', '', '', '']);

      showDialog({
        variant: 'success',
        title: 'PIN modifié',
        message: 'Votre code PIN a été modifié avec succès.',
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de modifier le PIN pour le moment.'),
      });
      // En cas d'erreur, réinitialiser et revenir à l'étape de l'ancien PIN
      setOldPin('');
      setNewPin('');
      setNewPinConfirm('');
      setPinStep('oldPin');
      setTimeout(() => {
        oldPinInputRef.current?.focus();
      }, 100);
    }
  };
  return {
    handleForgotPin,
    handleNewPinChange,
    handleNewPinConfirmChange,
    handleOldPinChange,
    handleOpenPinModal,
    handleOtpInputChange,
    handleOtpKeyPress,
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
