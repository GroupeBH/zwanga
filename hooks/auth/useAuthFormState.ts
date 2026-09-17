import { SocialAuthProvider } from '../../features/auth/authModel';
import { emptyPinResetOtp } from './usePinResetFlow';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { useSendPhoneVerificationOtpMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import {
  useAppleMobileMutation,
  useGoogleMobileMutation,
  useLoginMutation,
  useRegisterMutation,
} from '@/store/api/zwangaApi';
import type { UserGender } from '@/types';
import { type PendingReferralAttribution } from '@/utils/referralAttribution';
import { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { AuthMode, AuthStep, VehicleType } from '@/components/auth';

interface Params {
  initialMode: AuthMode;
}

export function useAuthFormState({
  initialMode,
}: Params) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<AuthStep>('phone');

  // Form State
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState(['', '', '', '', '']);
  const smsInputRefs = useRef<Array<TextInput | null>>([]);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const pinInputRef = useRef<TextInput | null>(null);
  const pinConfirmInputRef = useRef<TextInput | null>(null);

  // Reset PIN State
  const [resetPinStep, setResetPinStep] = useState<'otp' | 'newPin'>('otp');
  const [resetOtpCode, setResetOtpCode] = useState(emptyPinResetOtp);
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState('');
  const resetOtpInputRefs = useRef<Array<TextInput | null>>([]);
  const resetPinInputRef = useRef<TextInput | null>(null);
  const resetPinConfirmInputRef = useRef<TextInput | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusInteractionRef = useRef<{ cancel: () => void } | null>(null);
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);

  // Profile State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<UserGender | null>(null);
  const [role, setRole] = useState<'driver' | 'passenger'>('passenger');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [referralAttribution, setReferralAttribution] =
    useState<PendingReferralAttribution | null>(null);

  // Vehicle State
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);

  // Google flow states
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [googleProfileName, setGoogleProfileName] = useState<string | null>(null);
  const [googleFirstName, setGoogleFirstName] = useState<string | null>(null);
  const [googleLastName, setGoogleLastName] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googlePhone, setGooglePhone] = useState('');
  const [googleOtp, setGoogleOtp] = useState(['', '', '', '', '']);
  const googleOtpRefs = useRef<Array<TextInput | null>>([]);
  const [isSendingGoogleOtp, setIsSendingGoogleOtp] = useState(false);
  const [isVerifyingGoogleOtp, setIsVerifyingGoogleOtp] = useState(false);
  const [googleFlow, setGoogleFlow] = useState<'login' | 'signup' | null>(null);
  const [googleSignupStep, setGoogleSignupStep] = useState<'phone' | 'otp' | 'profile'>('phone');
  const [isGooglePhoneVerified, setIsGooglePhoneVerified] = useState(false);
  const [socialProvider, setSocialProvider] = useState<SocialAuthProvider | null>(null);
  const [appleNonce, setAppleNonce] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const isAppleSignupFlow =
    googleFlow === 'signup' && socialProvider === 'apple' && Boolean(googleIdToken);

  // ============ API HOOKS ============
  const [login, { isLoading: isLoggingIn }] = useLoginMutation();
  const [register, { isLoading: isRegistering }] = useRegisterMutation();
  const [googleMobile, { isLoading: isGoogleMobileLoading }] = useGoogleMobileMutation();
  const [appleMobile, { isLoading: isAppleMobileLoading }] = useAppleMobileMutation();
  const [sendPhoneVerificationOtp, { isLoading: isSendingOtpMutation }] = useSendPhoneVerificationOtpMutation();
  const [verifyPhoneOtp, { isLoading: isVerifyingOtp }] = useVerifyPhoneOtpMutation();
  const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
    sourceScreen: 'auth',
    approvedMessage:
      "Votre identité a été vérifiée avec succès. Bienvenue parmi les conducteurs Zwanga.",
    pendingMessage:
      'Votre compte est créé. Terminez la vérification Didit pour activer toutes les fonctionnalités conducteur.',
  });

  return {
    mode,
    googleIdToken,
    isGooglePhoneVerified,
    role,
    step,
    setIsAppleAvailable,
    focusInteractionRef,
    focusTimeoutRef,
    setReferralAttribution,
    setMode,
    smsInputRefs,
    pinInputRef,
    googleSignupStep,
    googleOtpRefs,
    setStep,
    setResetPinStep,
    setResetOtpCode,
    setResetNewPin,
    setResetNewPinConfirm,
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
    phone,
    googleMobile,
    appleMobile,
    googlePhone,
    googleFirstName,
    googleLastName,
    googleEmail,
    setIsSendingGoogleOtp,
    sendPhoneVerificationOtp,
    googleOtp,
    setIsVerifyingGoogleOtp,
    verifyPhoneOtp,
    smsCode,
    pin,
    login,
    pinConfirm,
    pinConfirmInputRef,
    setIsSendingResetOtp,
    resetOtpInputRefs,
    resetOtpCode,
    resetPinInputRef,
    resetNewPin,
    resetNewPinConfirm,
    firstName,
    lastName,
    isAppleSignupFlow,
    vehicleType,
    vehicleBrand,
    vehicleModel,
    vehicleColor,
    vehiclePlate,
    socialProvider,
    appleNonce,
    gender,
    startDiditKyc,
    googleProfileName,
    email,
    profilePicture,
    register,
    googleFlow,
    isAppleLoading,
    isAppleMobileLoading,
    isSendingOtpMutation,
    isGoogleMobileLoading,
    isSendingGoogleOtp,
    isVerifyingGoogleOtp,
    isAppleAvailable,
    referralAttribution,
    isVerifyingOtp,
    isLoggingIn,
    resetPinStep,
    resetPinConfirmInputRef,
    isSendingResetOtp,
    isRegistering,
    isStartingDiditKyc,
    vehicleModalVisible,
  };
}
