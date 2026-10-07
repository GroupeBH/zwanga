import { getAuthDraftSnapshot, markAuthFlowOpened } from '@/services/authFlowDraft';
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
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { AuthMode, AuthStep, VehicleType } from '@/components/auth';

interface Params {
  initialMode: AuthMode;
  explicitMode?: AuthMode;
}

export function useAuthFormState({
  initialMode, explicitMode,
}: Params) {
  const candidate = getAuthDraftSnapshot();
  const draft = useRef(candidate && (!explicitMode || explicitMode === candidate.mode) ? candidate : null).current;
  useEffect(() => { markAuthFlowOpened(); }, []);
  const [mode, setMode] = useState<AuthMode>(draft?.mode ?? initialMode);
  const [step, setStep] = useState<AuthStep>(draft?.step ?? 'phone');

  // Form State
  const [phone, setPhone] = useState(draft?.phone ?? '');
  const [smsCode, setSmsCode] = useState(['', '', '', '', '']);
  const smsInputRefs = useRef<(TextInput | null)[]>([]);
  const [, setIsSendingOtp] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const pinInputRef = useRef<TextInput | null>(null);
  const pinConfirmInputRef = useRef<TextInput | null>(null);

  // Reset PIN State
  const [resetPinStep, setResetPinStep] = useState<'otp' | 'newPin'>('otp');
  const [resetOtpCode, setResetOtpCode] = useState(emptyPinResetOtp);
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState('');
  const resetOtpInputRefs = useRef<(TextInput | null)[]>([]);
  const resetPinInputRef = useRef<TextInput | null>(null);
  const resetPinConfirmInputRef = useRef<TextInput | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusInteractionRef = useRef<{ cancel: () => void } | null>(null);
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);

  // Profile State
  const [firstName, setFirstName] = useState(draft?.firstName ?? '');
  const [lastName, setLastName] = useState(draft?.lastName ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [gender, setGender] = useState<UserGender | null>(draft?.gender ?? null);
  const [role, setRole] = useState<'driver' | 'passenger'>(draft?.role ?? 'passenger');
  const [profilePicture, setProfilePicture] = useState<string | null>(draft?.profilePicture ?? null);
  const [referralAttribution, setReferralAttribution] =
    useState<PendingReferralAttribution | null>(null);

  // Vehicle State
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(draft?.vehicleType ?? null);
  const [vehicleBrand, setVehicleBrand] = useState(draft?.vehicleBrand ?? '');
  const [vehicleModel, setVehicleModel] = useState(draft?.vehicleModel ?? '');
  const [vehicleColor, setVehicleColor] = useState(draft?.vehicleColor ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(draft?.vehiclePlate ?? '');
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);

  // Google flow states
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(draft?.googleIdToken ?? null);
  const [googleProfileName, setGoogleProfileName] = useState<string | null>(draft?.googleProfileName ?? null);
  const [googleFirstName, setGoogleFirstName] = useState<string | null>(draft?.googleFirstName ?? null);
  const [googleLastName, setGoogleLastName] = useState<string | null>(draft?.googleLastName ?? null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(draft?.googleEmail ?? null);
  const [googlePhone, setGooglePhone] = useState(draft?.googlePhone ?? '');
  const [googleOtp, setGoogleOtp] = useState(['', '', '', '', '']);
  const googleOtpRefs = useRef<(TextInput | null)[]>([]);
  const [isSendingGoogleOtp, setIsSendingGoogleOtp] = useState(false);
  const [isVerifyingGoogleOtp, setIsVerifyingGoogleOtp] = useState(false);
  const [googleFlow, setGoogleFlow] = useState<'login' | 'signup' | null>(draft?.googleFlow ?? null);
  const [googleSignupStep, setGoogleSignupStep] = useState<'phone' | 'otp' | 'profile'>(draft?.googleSignupStep ?? 'phone');
  const [isGooglePhoneVerified, setIsGooglePhoneVerified] = useState(draft?.isGooglePhoneVerified ?? false);
  const [socialProvider, setSocialProvider] = useState<SocialAuthProvider | null>(draft?.socialProvider ?? null);
  const [appleNonce, setAppleNonce] = useState<string | null>(draft?.appleNonce ?? null);
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
    isResumingProfile: Boolean(draft?.mode === 'signup' && draft.step === 'pin' && (draft.firstName || draft.lastName)),
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
