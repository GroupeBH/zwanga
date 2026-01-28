import { KycCaptureResult, KycWizardModal } from '@/components/KycWizardModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { configureGoogleSignIn, signInWithGoogle } from '@/services/googleAuth';
import { useSendPhoneVerificationOtpMutation, useUploadKycMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useGoogleMobileMutation, useLoginMutation, useRegisterMutation } from '@/store/api/zwangaApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { saveTokensAndUpdateState } from '@/store/slices/authSlice';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  TextInput,
  TextInputKeyPressEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Auth Components
import {
  AuthHeader,
  AuthMode,
  AuthStep,
  GoogleOtpStep,
  GooglePhoneStep,
  KycStep,
  LOGIN_STEPS,
  PhoneStep,
  PinStep,
  ProfileStep,
  ResetPinStep,
  SIGNUP_STEPS,
  SmsStep,
  VehicleModal,
  VehicleType,
  getMotivationalMessage,
  authStyles as styles,
} from '@/components/auth';

// Notifee setup
type NotifeeModule = typeof import('@notifee/react-native');
type NotifeeDefault = NotifeeModule['default'];
type AndroidImportanceEnum = NotifeeModule['AndroidImportance'];

let notifeeInstance: NotifeeDefault | null = null;
let androidImportanceEnum: AndroidImportanceEnum | undefined;

try {
  const notifeeModule = require('@notifee/react-native') as NotifeeModule;
  notifeeInstance = notifeeModule.default ?? (notifeeModule as unknown as NotifeeDefault);
  androidImportanceEnum = notifeeModule.AndroidImportance;
} catch (error) {
  console.warn('[Notifee] Module not available. Notifications disabled in this environment.');
}

export default function AuthScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { mode: initialModeParam } = useLocalSearchParams<{ mode?: string }>();
  const initialMode: AuthMode = initialModeParam === 'signup' ? 'signup' : 'login';
  
  // ============ STATE ============
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
  const [resetOtpCode, setResetOtpCode] = useState(['', '', '', '', '']);
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState('');
  const resetOtpInputRefs = useRef<Array<TextInput | null>>([]);
  const resetPinInputRef = useRef<TextInput | null>(null);
  const resetPinConfirmInputRef = useRef<TextInput | null>(null);
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);
  
  // Profile State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'driver' | 'passenger'>('passenger');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  // Vehicle State
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);

  // KYC State
  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycFiles, setKycFiles] = useState<KycCaptureResult | null>(null);

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

  // ============ API HOOKS ============
  const [login, { isLoading: isLoggingIn }] = useLoginMutation();
  const [register, { isLoading: isRegistering }] = useRegisterMutation();
  const [googleMobile, { isLoading: isGoogleMobileLoading }] = useGoogleMobileMutation();
  const [uploadKyc] = useUploadKycMutation();
  const [sendPhoneVerificationOtp, { isLoading: isSendingOtpMutation }] = useSendPhoneVerificationOtpMutation();
  const [verifyPhoneOtp, { isLoading: isVerifyingOtp }] = useVerifyPhoneOtpMutation();

  // ============ COMPUTED VALUES ============
  const getStepSequence = () => {
    if (mode === 'login') return LOGIN_STEPS;
    if (googleIdToken && isGooglePhoneVerified) {
      return role === 'driver' ? ['profile', 'kyc'] : ['profile'];
    }
    return role === 'driver' ? ['phone', 'sms', 'pin', 'profile', 'kyc'] : SIGNUP_STEPS;
  };

  const stepSequence = getStepSequence();
  const currentStepIndex = stepSequence.indexOf(step);
  const canGoBack = currentStepIndex > 0;
  const progress = Math.round(((currentStepIndex + 1) / stepSequence.length) * 100);
  const motivationalMessage = getMotivationalMessage(step, mode);

  // ============ EFFECTS ============
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  useEffect(() => {
    if (step === 'sms') {
      const timer = setTimeout(() => smsInputRefs.current[0]?.focus(), 500);
      return () => clearTimeout(timer);
    }
    if (step === 'pin') {
      const timer = setTimeout(() => pinInputRef.current?.focus(), 500);
      return () => clearTimeout(timer);
    }
  }, [step]);
  
  useEffect(() => {
    if (googleSignupStep === 'otp' && googleIdToken) {
      const timer = setTimeout(() => googleOtpRefs.current[0]?.focus(), 500);
      return () => clearTimeout(timer);
    }
  }, [googleSignupStep, googleIdToken]);

  useEffect(() => {
    if (isAuthenticated) {
      // Si on est en train de compléter le KYC (étape kyc), rester sur la page auth
      if (step === 'kyc') {
        console.log('[AuthScreen] Authentifié mais en train de compléter le KYC - rester sur auth');
        return;
      }
      
      // Sinon, rediriger vers l'écran d'accueil
      console.log('[AuthScreen] Authentifié -> redirection vers /(tabs)');
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, step, router]);

  // ============ HANDLERS ============
  
  // Navigation
  const handlePreviousStep = () => {
    if (step === 'resetPin') {
      setStep('pin');
      setResetPinStep('otp');
      setResetOtpCode(['', '', '', '', '']);
      setResetNewPin('');
      setResetNewPinConfirm('');
      return;
    }
    if (currentStepIndex > 0) {
      setStep(stepSequence[currentStepIndex - 1] as AuthStep);
    }
  };

  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setSmsCode(['', '', '', '', '']);
    setPin('');
    setPinConfirm('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setRole('passenger');
    setProfilePicture(null);
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
    setVehicleModalVisible(false);
    setKycFiles(null);
    setIsSendingOtp(false);
    setGoogleIdToken(null);
    setGoogleProfileName(null);
    setGoogleFirstName(null);
    setGoogleLastName(null);
    setGoogleEmail(null);
    setGooglePhone('');
    setGoogleOtp(['', '', '', '', '']);
    setGoogleFlow(null);
    setGoogleSignupStep('phone');
    setIsGooglePhoneVerified(false);
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    resetForm();
  };

  // Google Handlers
  const handleGoogleLogin = async () => {
    try {
      setGoogleFlow('login');
      const result = await signInWithGoogle();
      setGoogleIdToken(result.idToken);
      setGoogleProfileName(result.name || result.email || 'Profil Google');
      await googleMobile({ idToken: result.idToken }).unwrap();
    } catch (error: any) {
      console.error('Google login error:', error);
      showDialog({
        variant: 'danger',
        title: 'Connexion Google',
        message: error?.data?.message || error?.message || 'Connexion Google impossible',
      });
      setGoogleFlow(null);
    }
  };

  const handleGoogleSignupStart = async () => {
    try {
      setGoogleFlow('signup');
      const result = await signInWithGoogle();
      setGoogleIdToken(result.idToken);
      setGoogleProfileName(result.name || result.email || 'Profil Google');
      setGoogleFirstName(result.givenName || null);
      setGoogleLastName(result.familyName || null);
      setGoogleEmail(result.email || null);
    } catch (error: any) {
      console.error('Google signup error:', error);
      showDialog({
        variant: 'danger',
        title: 'Inscription Google',
        message: error?.data?.message || error?.message || 'Inscription Google impossible',
      });
      setGoogleFlow(null);
    }
  };

  const handleSendGoogleOtp = async () => {
    if (!googlePhone || googlePhone.length < 10) {
      showDialog({ variant: 'warning', title: 'Numéro requis', message: 'Veuillez entrer un numéro valide.' });
      return;
    }
    try {
      setIsSendingGoogleOtp(true);
      await sendPhoneVerificationOtp({ phone: googlePhone, context: 'registration' }).unwrap();
      setGoogleSignupStep('otp');
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur OTP', message: error?.data?.message || 'Impossible d\'envoyer le code' });
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
      showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Impossible de renvoyer le code' });
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
  };

  const handleVerifyGoogleOtpAndContinue = async () => {
    if (!googleIdToken) {
      showDialog({ variant: 'danger', title: 'Token manquant', message: 'Veuillez relancer la connexion Google.' });
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
      showDialog({ variant: 'danger', title: 'Validation', message: error?.data?.message || 'Code invalide ou expiré' });
    } finally {
      setIsVerifyingGoogleOtp(false);
    }
  };

  // Phone Handlers
  const handlePhoneSubmit = async () => {
    if (phone.length < 10) {
      showDialog({ variant: 'danger', title: 'Numéro invalide', message: 'Veuillez entrer un numéro valide' });
      return;
    }
    if (mode === 'login') {
      setStep('pin');
      return;
    }
    try {
      setIsSendingOtp(true);
      await sendPhoneVerificationOtp({ phone, context: 'registration' }).unwrap();
      setStep('sms');
      showDialog({ variant: 'success', title: 'Code envoyé', message: 'Un code de vérification a été envoyé.' });
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Erreur lors de l\'envoi du code' });
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
        message: error?.data?.message || 'Code OTP invalide ou expiré',
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
      } catch (error: any) {
        showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'PIN incorrect' });
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
    setStep('resetPin');
    setResetPinStep('otp');
    setResetOtpCode(['', '', '', '', '']);
    setResetNewPin('');
    setResetNewPinConfirm('');
    try {
      setIsSendingResetOtp(true);
      await sendPhoneVerificationOtp({ phone, context: 'update' }).unwrap();
      showDialog({ variant: 'success', title: 'Code envoyé', message: 'Un code de vérification a été envoyé.' });
      setTimeout(() => resetOtpInputRefs.current[0]?.focus(), 100);
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Erreur lors de l\'envoi du code' });
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
    if (code.length !== 5) {
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet' });
      return;
    }
    try {
      await verifyPhoneOtp({ phone, otp: code }).unwrap();
      setResetPinStep('newPin');
      setTimeout(() => resetPinInputRef.current?.focus(), 100);
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Code invalide', message: error?.data?.message || 'Code OTP invalide' });
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
      const result = await login({ phone, newPin: resetNewPin }).unwrap();
      await dispatch(saveTokensAndUpdateState({ accessToken: result.accessToken, refreshToken: result.refreshToken })).unwrap();
      showDialog({ variant: 'success', title: 'PIN réinitialisé', message: 'Vous êtes maintenant connecté.' });
      setStep('pin');
      setResetPinStep('otp');
      setResetOtpCode(['', '', '', '', '']);
      setResetNewPin('');
      setResetNewPinConfirm('');
      setPin('');
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Erreur lors de la réinitialisation' });
    }
  };

  // Profile Handlers
  const handleSelectProfilePicture = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showDialog({ variant: 'danger', title: 'Permission requise', message: "L'accès à la galerie est nécessaire." });
        return;
      }
      showDialog({
        variant: 'info',
        title: 'Photo de profil',
        message: 'Choisissez une source',
        actions: [
          {
            label: 'Caméra',
            variant: 'primary',
            onPress: async () => {
              const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
              if (camStatus !== 'granted') return;
              const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
              if (!result.canceled && result.assets[0]) setProfilePicture(result.assets[0].uri);
            }
          },
          {
            label: 'Galerie',
            variant: 'secondary',
            onPress: async () => {
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
              if (!result.canceled && result.assets[0]) setProfilePicture(result.assets[0].uri);
            }
          },
          { label: 'Annuler', variant: 'ghost' },
        ],
      });
    } catch (e) {
      console.error(e);
    }
  };

  const validateProfileAndContinue = () => {
    if (!firstName.trim() || !lastName.trim()) {
      showDialog({ variant: 'warning', title: 'Information manquante', message: 'Veuillez entrer votre nom et prénom.' });
      return;
    }
    if (role === 'driver') {
      if (!vehicleType) {
        showDialog({ variant: 'warning', title: 'Véhicule', message: 'Veuillez sélectionner un type de véhicule.' });
        return;
      }
      if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehiclePlate.trim()) {
        showDialog({ variant: 'warning', title: 'Véhicule', message: 'Veuillez compléter les informations du véhicule.' });
        return;
      }
      setStep('kyc');
    } else {
      handleFinalRegister();
    }
  };

  // Notifications
  const triggerSignupSuccessNotification = async (userName?: string) => {
    if (!notifeeInstance) return;
    try {
      await notifeeInstance.requestPermission();
      let channelId: string | undefined;
      if (Platform.OS === 'android' && androidImportanceEnum) {
        channelId = await notifeeInstance.createChannel({ id: 'zwanga-signup', name: 'Confirmations Zwanga', importance: androidImportanceEnum.HIGH, vibration: true });
      }
      await notifeeInstance.displayNotification({
        title: '🎉 Inscription réussie',
        body: `${userName ? `${userName}, ` : ''}bienvenue sur Zwanga !`,
        android: channelId ? { channelId, pressAction: { id: 'default' } } : undefined,
        ios: { sound: 'default' },
      });
    } catch (e) {
      console.warn('Notification error', e);
    }
  };

  // KYC Helpers
  const buildKycFormData = (files: KycCaptureResult) => {
    const formData = new FormData();
    const appendFile = (field: string, uri: string) => {
      const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
      formData.append(field, { uri, type: 'image/jpeg', name: `${field}-${Date.now()}.${ext}` } as any);
    };
    appendFile('cniFront', files.front);
    appendFile('cniBack', files.back);
    appendFile('selfie', files.selfie);
    return formData;
  };

  const handleKycWizardComplete = async (payload: KycCaptureResult) => {
    setKycFiles(payload);
    setKycModalVisible(false);
  };

  // Final Registration
  const handleFinalRegister = async () => {
    try {
      const requiresVehicle = role === 'driver';
      
      if (googleIdToken && isGooglePhoneVerified) {
        const result = await googleMobile({ idToken: googleIdToken, phone }).unwrap();
        await dispatch(saveTokensAndUpdateState({ accessToken: result.accessToken, refreshToken: result.refreshToken })).unwrap();
        
        if (requiresVehicle && kycFiles) {
          setKycSubmitting(true);
          await uploadKyc(buildKycFormData(kycFiles)).unwrap();
        }

        await triggerSignupSuccessNotification(firstName || googleProfileName || undefined);
        setGoogleIdToken(null);
        setGoogleProfileName(null);
        setGoogleFirstName(null);
        setGoogleLastName(null);
        setGoogleEmail(null);
        setGooglePhone('');
        setGoogleOtp(['', '', '', '', '']);
        setGoogleFlow(null);
        setIsGooglePhoneVerified(false);
        return;
      }
      
      const formData = new FormData();
      formData.append('phone', phone);
      formData.append('pin', pin);
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('role', role);
      formData.append('isDriver', JSON.stringify(requiresVehicle));

      if (requiresVehicle) {
        formData.append('vehicle[brand]', vehicleBrand.trim());
        formData.append('vehicle[model]', vehicleModel.trim());
        formData.append('vehicle[color]', vehicleColor.trim());
        formData.append('vehicle[licensePlate]', vehiclePlate.trim());
      }
      if (email) formData.append('email', email.trim());

      if (profilePicture) {
        formData.append('profilePicture', { uri: profilePicture, name: `pp-${Date.now()}.jpg`, type: 'image/jpeg' } as any);
      }

      const result = await register(formData).unwrap();
      await dispatch(saveTokensAndUpdateState({ accessToken: result.accessToken, refreshToken: result.refreshToken })).unwrap();

      if (requiresVehicle && kycFiles) {
        setKycSubmitting(true);
        await uploadKyc(buildKycFormData(kycFiles)).unwrap();
      }

      await triggerSignupSuccessNotification(firstName);
    } catch (error: any) {
      showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || "Erreur lors de l'inscription" });
    } finally {
      setKycSubmitting(false);
    }
  };

  // ============ RENDER ============
  const isGoogleSignupActive = googleFlow === 'signup' && googleIdToken;
  const showPhoneStep = step === 'phone' && !isGoogleSignupActive;

  return (
    <SafeAreaView style={styles.container}>
      <AuthHeader
        mode={mode}
        onModeChange={handleModeChange}
        canGoBack={canGoBack}
        onBack={handlePreviousStep}
        progress={progress}
        motivationalMessage={motivationalMessage}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Phone Step */}
          {showPhoneStep && (
            <PhoneStep
              mode={mode}
              phone={phone}
              onPhoneChange={setPhone}
              onSubmit={handlePhoneSubmit}
              onGoogleAuth={mode === 'login' ? handleGoogleLogin : handleGoogleSignupStart}
              isLoading={isSendingOtpMutation}
              isGoogleLoading={isGoogleMobileLoading || isSendingGoogleOtp || isVerifyingGoogleOtp}
            />
          )}

          {/* Google Phone Step */}
          {isGoogleSignupActive && googleSignupStep === 'phone' && (
            <GooglePhoneStep
              profileName={googleProfileName}
              phone={googlePhone}
              onPhoneChange={setGooglePhone}
              onSubmit={handleSendGoogleOtp}
              onCancel={handleGoogleCancel}
              isLoading={isSendingGoogleOtp}
            />
          )}

          {/* Google OTP Step */}
          {isGoogleSignupActive && googleSignupStep === 'otp' && (
            <GoogleOtpStep
              phone={googlePhone}
              otp={googleOtp}
              otpRefs={googleOtpRefs}
              onOtpChange={setGoogleOtp}
              onVerify={handleVerifyGoogleOtpAndContinue}
              onResend={handleResendGoogleOtp}
              onBack={handleGooglePhoneBack}
              isVerifying={isVerifyingGoogleOtp}
              isResending={isSendingGoogleOtp}
            />
          )}

          {/* SMS Step */}
          {step === 'sms' && (
            <SmsStep
              mode={mode}
              phone={phone}
              smsCode={smsCode}
              smsInputRefs={smsInputRefs}
              onSmsCodeChange={setSmsCode}
              onSubmit={handleSmsSubmit}
              onResend={handlePhoneSubmit}
              isVerifying={isVerifyingOtp || isLoggingIn}
              isResending={isSendingOtpMutation}
            />
          )}

          {/* PIN Step */}
          {step === 'pin' && (
            <PinStep
              mode={mode}
              pin={pin}
              pinConfirm={pinConfirm}
              pinInputRef={pinInputRef}
              pinConfirmInputRef={pinConfirmInputRef}
              onPinChange={handlePinChange}
              onPinConfirmChange={handlePinConfirmChange}
              onSubmit={handlePinSubmit}
              onForgotPin={mode === 'login' ? handleForgotPin : undefined}
              isLoading={isLoggingIn}
            />
          )}

          {/* Reset PIN Step */}
          {step === 'resetPin' && (
            <ResetPinStep
              resetPinStep={resetPinStep}
              otpCode={resetOtpCode}
              otpInputRefs={resetOtpInputRefs}
              newPin={resetNewPin}
              newPinConfirm={resetNewPinConfirm}
              pinInputRef={resetPinInputRef}
              pinConfirmInputRef={resetPinConfirmInputRef}
              onOtpChange={setResetOtpCode}
              onPinChange={handleResetPinChange}
              onPinConfirmChange={handleResetPinConfirmChange}
              onVerifyOtp={handleVerifyResetOtp}
              onResetPin={handleResetPinSubmit}
              onResendOtp={handleForgotPin}
              isResending={isSendingResetOtp}
              isLoading={isLoggingIn}
            />
          )}

          {/* Profile Step - Normal signup ou Google signup après OTP */}
          {step === 'profile' && mode === 'signup' && (!isGoogleSignupActive || googleSignupStep === 'profile') && (
            <ProfileStep
              firstName={firstName}
              lastName={lastName}
              profilePicture={profilePicture}
              role={role}
              vehicleType={vehicleType}
              vehicleBrand={vehicleBrand}
              vehicleModel={vehicleModel}
              vehicleColor={vehicleColor}
              vehiclePlate={vehiclePlate}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onSelectProfilePicture={handleSelectProfilePicture}
              onRoleChange={setRole}
              onVehicleTypeChange={setVehicleType}
              onOpenVehicleModal={() => setVehicleModalVisible(true)}
              onContinue={validateProfileAndContinue}
            />
          )}

          {/* KYC Step */}
          {step === 'kyc' && role === 'driver' && (
            <KycStep
              kycFiles={kycFiles}
              onOpenKycModal={() => setKycModalVisible(true)}
              onFinish={handleFinalRegister}
              isLoading={isRegistering || kycSubmitting}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <VehicleModal
        visible={vehicleModalVisible}
        onClose={() => setVehicleModalVisible(false)}
        vehicleBrand={vehicleBrand}
        vehicleModel={vehicleModel}
        vehicleColor={vehicleColor}
        vehiclePlate={vehiclePlate}
        onBrandChange={setVehicleBrand}
        onModelChange={setVehicleModel}
        onColorChange={setVehicleColor}
        onPlateChange={setVehiclePlate}
      />

      <KycWizardModal
        visible={kycModalVisible}
        onClose={() => setKycModalVisible(false)}
        onComplete={handleKycWizardComplete}
        isSubmitting={kycSubmitting}
      />
    </SafeAreaView>
  );
}
