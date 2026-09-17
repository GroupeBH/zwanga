import { useDialog } from '@/components/ui/DialogProvider';
import {
  useUpdatePinMutation,
} from '@/store/api/userApi';
import { emptyPinResetOtp, PIN_RESET_OTP_LENGTH, usePinResetFlow } from '@/hooks/auth/usePinResetFlow';
import { clearTokens } from '@/services/tokenStorage';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { useRouter } from 'expo-router';
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

  const pinReset = usePinResetFlow(currentUser?.phone || '', pinModalVisible && forgotPinMode);
  const isUpdatingPinWithOtp = pinReset.isBusy;

  const handleOpenPinModal = () => {
    setPinModalVisible(true);
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
    if (pinReset.isBusy || isUpdatingPin) return;
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
        message: 'Si ce numéro correspond à un compte éligible, vous recevrez un code SMS.',
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
    if (code.length !== PIN_RESET_OTP_LENGTH) {
      showDialog({
        variant: 'danger',
        title: 'Code incomplet',
        message: 'Veuillez entrer le code complet (6 chiffres)',
      });
      return;
    }

    try {
      if (!await pinReset.verifyOtp(code)) return;
      setOtpCode(emptyPinResetOtp());
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
    if (isUpdatingPin || pinReset.isBusy) return;
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
        if (!await pinReset.confirmPin(newPin)) return;
      } else {
        if (oldPin.length !== 4) {
          setPinStep('oldPin');
          return;
        }
        const request = updatePin({ oldPin, newPin });
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
        title: 'PIN modifié',
        message: 'Votre code PIN a été modifié. Connectez-vous avec votre nouveau PIN.',
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, forgotPinMode
          ? 'Demandez un nouveau code SMS pour réessayer. Si le PIN a déjà été changé, connectez-vous avec le nouveau PIN.'
          : 'Impossible de modifier le PIN pour le moment.'),
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
