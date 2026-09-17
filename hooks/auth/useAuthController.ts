import { useSignupProfileActions } from './useSignupProfileActions';
import { useAuthFormNavigation } from './useAuthFormNavigation';
import { useAuthFormState } from './useAuthFormState';
import { useRegistrationActions } from './useRegistrationActions';
import { usePhoneAuthActions } from './usePhoneAuthActions';
import { useSocialAuthActions } from './useSocialAuthActions';
import { useDialog } from '@/components/ui/DialogProvider';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import { isAppleSignInAvailable } from '@/services/appleAuth';
import { configureGoogleSignIn } from '@/services/googleAuth';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AuthMode, AuthStep, LOGIN_STEPS, SIGNUP_STEPS, getMotivationalMessage } from '@/components/auth';



export function useAuthController() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const {
    mode: initialModeParam,
    referralCode: initialReferralCode,
    referralToken: initialReferralToken,
  } = useLocalSearchParams<{
    mode?: string;
    referralCode?: string;
    referralToken?: string;
  }>();
  const initialMode: AuthMode =
    initialModeParam === 'signup' || initialReferralCode || initialReferralToken
      ? 'signup'
      : 'login';
  const legacyReferralCode = (initialReferralCode ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();

  // ============ STATE ============
  const form = useAuthFormState({
    initialMode,
  });

  // ============ COMPUTED VALUES ============
  const getStepSequence = () => {
    if (form.mode === 'login') return LOGIN_STEPS;
    const signupSteps: AuthStep[] = isSignupOtpVerificationEnabled ? SIGNUP_STEPS : ['phone', 'pin', 'profile'];
    const driverSignupSteps: AuthStep[] = isSignupOtpVerificationEnabled
      ? ['phone', 'sms', 'pin', 'profile', 'kyc']
      : ['phone', 'pin', 'profile', 'kyc'];
    if (form.googleIdToken && form.isGooglePhoneVerified) {
      return form.role === 'driver' ? ['profile', 'kyc'] : ['profile'];
    }
    return form.role === 'driver' ? driverSignupSteps : signupSteps;
  };

  const stepSequence = getStepSequence();
  const currentStepIndex = stepSequence.indexOf(form.step);
  const canGoBack = currentStepIndex > 0;
  const progress = Math.round(((currentStepIndex + 1) / stepSequence.length) * 100);
  const motivationalMessage = getMotivationalMessage(form.step, form.mode);

  // ============ EFFECTS ============
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  useEffect(() => {
    let isMounted = true;

    isAppleSignInAvailable()
      .then((available) => {
        if (isMounted) {
          form.setIsAppleAvailable(available);
        }
      })
      .catch(() => {
        if (isMounted) {
          form.setIsAppleAvailable(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const navigation = useAuthFormNavigation({
    focusInteractionRef: form.focusInteractionRef,
    focusTimeoutRef: form.focusTimeoutRef,
    setReferralAttribution: form.setReferralAttribution,
    setMode: form.setMode,
    initialReferralToken,
    step: form.step,
    smsInputRefs: form.smsInputRefs,
    pinInputRef: form.pinInputRef,
    googleSignupStep: form.googleSignupStep,
    googleIdToken: form.googleIdToken,
    googleOtpRefs: form.googleOtpRefs,
    isAuthenticated,
    router,
    setStep: form.setStep,
    setResetPinStep: form.setResetPinStep,
    setResetOtpCode: form.setResetOtpCode,
    setResetNewPin: form.setResetNewPin,
    setResetNewPinConfirm: form.setResetNewPinConfirm,
    currentStepIndex,
    stepSequence,
    setPhone: form.setPhone,
    setSmsCode: form.setSmsCode,
    setPin: form.setPin,
    setPinConfirm: form.setPinConfirm,
    setFirstName: form.setFirstName,
    setLastName: form.setLastName,
    setEmail: form.setEmail,
    setGender: form.setGender,
    setRole: form.setRole,
    setProfilePicture: form.setProfilePicture,
    setVehicleType: form.setVehicleType,
    setVehicleBrand: form.setVehicleBrand,
    setVehicleModel: form.setVehicleModel,
    setVehicleColor: form.setVehicleColor,
    setVehiclePlate: form.setVehiclePlate,
    setVehicleModalVisible: form.setVehicleModalVisible,
    setIsSendingOtp: form.setIsSendingOtp,
    setGoogleIdToken: form.setGoogleIdToken,
    setGoogleProfileName: form.setGoogleProfileName,
    setGoogleFirstName: form.setGoogleFirstName,
    setGoogleLastName: form.setGoogleLastName,
    setGoogleEmail: form.setGoogleEmail,
    setGooglePhone: form.setGooglePhone,
    setGoogleOtp: form.setGoogleOtp,
    setGoogleFlow: form.setGoogleFlow,
    setGoogleSignupStep: form.setGoogleSignupStep,
    setIsGooglePhoneVerified: form.setIsGooglePhoneVerified,
    setSocialProvider: form.setSocialProvider,
    setAppleNonce: form.setAppleNonce,
    setIsAppleLoading: form.setIsAppleLoading,
  });

  const social = useSocialAuthActions({
    phone: form.phone,
    setMode: form.setMode,
    setStep: form.setStep,
    setPhone: form.setPhone,
    setSmsCode: form.setSmsCode,
    setPin: form.setPin,
    setPinConfirm: form.setPinConfirm,
    setResetPinStep: form.setResetPinStep,
    setResetOtpCode: form.setResetOtpCode,
    setResetNewPin: form.setResetNewPin,
    setResetNewPinConfirm: form.setResetNewPinConfirm,
    setFirstName: form.setFirstName,
    setLastName: form.setLastName,
    setEmail: form.setEmail,
    setGender: form.setGender,
    setRole: form.setRole,
    setProfilePicture: form.setProfilePicture,
    setVehicleType: form.setVehicleType,
    setVehicleBrand: form.setVehicleBrand,
    setVehicleModel: form.setVehicleModel,
    setVehicleColor: form.setVehicleColor,
    setVehiclePlate: form.setVehiclePlate,
    setVehicleModalVisible: form.setVehicleModalVisible,
    setIsSendingOtp: form.setIsSendingOtp,
    setGoogleIdToken: form.setGoogleIdToken,
    setGoogleProfileName: form.setGoogleProfileName,
    setGoogleFirstName: form.setGoogleFirstName,
    setGoogleLastName: form.setGoogleLastName,
    setGoogleEmail: form.setGoogleEmail,
    setGooglePhone: form.setGooglePhone,
    setGoogleOtp: form.setGoogleOtp,
    setGoogleFlow: form.setGoogleFlow,
    setGoogleSignupStep: form.setGoogleSignupStep,
    setIsGooglePhoneVerified: form.setIsGooglePhoneVerified,
    setSocialProvider: form.setSocialProvider,
    setAppleNonce: form.setAppleNonce,
    googleMobile: form.googleMobile,
    showDialog,
    setIsAppleLoading: form.setIsAppleLoading,
    appleMobile: form.appleMobile,
    googlePhone: form.googlePhone,
    googleFirstName: form.googleFirstName,
    googleLastName: form.googleLastName,
    googleEmail: form.googleEmail,
    setIsSendingGoogleOtp: form.setIsSendingGoogleOtp,
    sendPhoneVerificationOtp: form.sendPhoneVerificationOtp,
    googleIdToken: form.googleIdToken,
    googleOtp: form.googleOtp,
    setIsVerifyingGoogleOtp: form.setIsVerifyingGoogleOtp,
    verifyPhoneOtp: form.verifyPhoneOtp,
  });

  // Phone Handlers
  const phoneActions = usePhoneAuthActions({
    step: form.step,
    phone: form.phone,
    showDialog,
    setPhone: form.setPhone,
    mode: form.mode,
    setStep: form.setStep,
    setIsSendingOtp: form.setIsSendingOtp,
    sendPhoneVerificationOtp: form.sendPhoneVerificationOtp,
    smsCode: form.smsCode,
    setSmsCode: form.setSmsCode,
    smsInputRefs: form.smsInputRefs,
    verifyPhoneOtp: form.verifyPhoneOtp,
    setPin: form.setPin,
    setPinConfirm: form.setPinConfirm,
    pin: form.pin,
    login: form.login,
    dispatch,
    pinInputRef: form.pinInputRef,
    pinConfirm: form.pinConfirm,
    pinConfirmInputRef: form.pinConfirmInputRef,
    setResetPinStep: form.setResetPinStep,
    setResetOtpCode: form.setResetOtpCode,
    setResetNewPin: form.setResetNewPin,
    setResetNewPinConfirm: form.setResetNewPinConfirm,
    setIsSendingResetOtp: form.setIsSendingResetOtp,
    focusAfterInteractions: navigation.focusAfterInteractions,
    resetOtpInputRefs: form.resetOtpInputRefs,
    resetOtpCode: form.resetOtpCode,
    resetPinInputRef: form.resetPinInputRef,
    resetNewPin: form.resetNewPin,
    resetNewPinConfirm: form.resetNewPinConfirm,
  });

  // Notifications
  const registration = useRegistrationActions({
    firstName: form.firstName,
    lastName: form.lastName,
    setStep: form.setStep,
    showDialog,
    isAppleSignupFlow: form.isAppleSignupFlow,
    legacyReferralCode,
    role: form.role,
    vehicleType: form.vehicleType,
    vehicleBrand: form.vehicleBrand,
    vehicleModel: form.vehicleModel,
    vehicleColor: form.vehicleColor,
    vehiclePlate: form.vehiclePlate,
    googleIdToken: form.googleIdToken,
    isGooglePhoneVerified: form.isGooglePhoneVerified,
    socialProvider: form.socialProvider,
    appleMobile: form.appleMobile,
    phone: form.phone,
    appleNonce: form.appleNonce,
    gender: form.gender,
    googleMobile: form.googleMobile,
    dispatch,
    startDiditKyc: form.startDiditKyc,
    googleProfileName: form.googleProfileName,
    router,
    setGoogleIdToken: form.setGoogleIdToken,
    setGoogleProfileName: form.setGoogleProfileName,
    setGoogleFirstName: form.setGoogleFirstName,
    setGoogleLastName: form.setGoogleLastName,
    setGoogleEmail: form.setGoogleEmail,
    setGooglePhone: form.setGooglePhone,
    setGoogleOtp: form.setGoogleOtp,
    setGoogleFlow: form.setGoogleFlow,
    setIsGooglePhoneVerified: form.setIsGooglePhoneVerified,
    setSocialProvider: form.setSocialProvider,
    setAppleNonce: form.setAppleNonce,
    pin: form.pin,
    email: form.email,
    profilePicture: form.profilePicture,
    register: form.register,
  });

  // Profile Handlers
  const profileActions = useSignupProfileActions({
    showDialog,
    setProfilePicture: form.setProfilePicture,
    firstName: form.firstName,
    lastName: form.lastName,
    isAppleSignupFlow: form.isAppleSignupFlow,
    setFirstName: form.setFirstName,
    setLastName: form.setLastName,
    role: form.role,
    vehicleType: form.vehicleType,
    vehicleBrand: form.vehicleBrand,
    vehicleModel: form.vehicleModel,
    vehicleColor: form.vehicleColor,
    vehiclePlate: form.vehiclePlate,
    setStep: form.setStep,
    handleFinalRegister: registration.handleFinalRegister,
  });

  // ============ RENDER ============
  const isGoogleSignupActive = form.googleFlow === 'signup' && form.googleIdToken;
  const showPhoneStep = form.step === 'phone' && !isGoogleSignupActive;
  const isAppleAuthLoading = form.isAppleLoading || form.isAppleMobileLoading;

  return {
    form,
    navigation,
    canGoBack,
    progress,
    motivationalMessage,
    showPhoneStep,
    phoneActions,
    social,
    isAppleAuthLoading,
    legacyReferralCode,
    isGoogleSignupActive,
    profileActions,
    registration,
  };
}
