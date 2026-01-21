import { KycCaptureResult, KycWizardModal } from '@/components/KycWizardModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, Spacing } from '@/constants/styles';
import { useSendPhoneVerificationOtpMutation, useUploadKycMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useLoginMutation, useRegisterMutation } from '@/store/api/zwangaApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { setTokens } from '@/store/slices/authSlice';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

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

type AuthMode = 'login' | 'signup';
type AuthStep = 'phone' | 'sms' | 'pin' | 'profile' | 'kyc' | 'resetPin';
type VehicleType = 'sedan' | 'suv' | 'van' | 'moto';

const LOGIN_STEPS: AuthStep[] = ['phone', 'pin'];
// KYC n'est plus dans les étapes par défaut - il sera ajouté conditionnellement pour les conducteurs
const SIGNUP_STEPS: AuthStep[] = ['phone', 'sms', 'pin', 'profile'];

type VehicleOption = {
  id: VehicleType;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const vehicleOptions: VehicleOption[] = [
  {
    id: 'sedan',
    label: 'Berline',
    description: 'Confort 1-4 passagers',
    icon: 'car',
  },
  {
    id: 'suv',
    label: 'SUV / 4x4',
    description: 'Routes difficiles',
    icon: 'car-outline',
  },
  {
    id: 'van',
    label: 'Van / Mini-bus',
    description: 'Jusqu\'à 8 places',
    icon: 'bus',
  },
  {
    id: 'moto',
    label: 'Moto',
    description: 'Rapide & Agile',
    icon: 'bicycle',
  },
];

export default function AuthScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { mode: initialModeParam } = useLocalSearchParams<{ mode?: string }>();
  const initialMode: AuthMode = initialModeParam === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<AuthStep>('phone');

  // Form State
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState(['', '', '', '', '']); // 5 chiffres pour OTP
  const smsInputRefs = useRef<Array<TextInput | null>>([]);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [pin, setPin] = useState(''); // PIN comme string normale
  const [pinConfirm, setPinConfirm] = useState(''); // Confirmation PIN comme string normale
  const pinInputRef = useRef<TextInput | null>(null);
  const pinConfirmInputRef = useRef<TextInput | null>(null);
  
  // Reset PIN State (pour PIN oublié)
  const [resetPinStep, setResetPinStep] = useState<'otp' | 'newPin'>('otp');
  const [resetOtpCode, setResetOtpCode] = useState(['', '', '', '', '']); // 5 chiffres pour OTP de réinitialisation
  const [resetNewPin, setResetNewPin] = useState(''); // Nouveau PIN comme string normale
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState(''); // Confirmation nouveau PIN comme string normale
  const resetOtpInputRefs = useRef<Array<TextInput | null>>([]);
  const resetPinInputRef = useRef<TextInput | null>(null);
  const resetPinConfirmInputRef = useRef<TextInput | null>(null);
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);
  
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

  // API Hooks
  const [login, { isLoading: isLoggingIn }] = useLoginMutation();
  const [register, { isLoading: isRegistering }] = useRegisterMutation();
  const [uploadKyc] = useUploadKycMutation();
  const [sendPhoneVerificationOtp, { isLoading: isSendingOtpMutation }] = useSendPhoneVerificationOtpMutation();
  const [verifyPhoneOtp, { isLoading: isVerifyingOtp }] = useVerifyPhoneOtpMutation();
  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycFiles, setKycFiles] = useState<KycCaptureResult | null>(null);

  // Calculer la séquence d'étapes dynamiquement selon le rôle
  const getStepSequence = () => {
    if (mode === 'login') {
      return LOGIN_STEPS; // ['phone', 'pin']
    }
    // Pour l'inscription, ajouter KYC seulement si l'utilisateur est conducteur
    if (role === 'driver') {
      return ['phone', 'sms', 'pin', 'profile', 'kyc'];
    }
    return SIGNUP_STEPS; // ['phone', 'sms', 'pin', 'profile'] - Pas de KYC pour les passagers
  };

  const stepSequence = getStepSequence();
  const currentStepIndex = stepSequence.indexOf(step);
  const canGoBack = currentStepIndex > 0;

  // Calculate progress based on total steps
  const progress = Math.round(((currentStepIndex + 1) / stepSequence.length) * 100);

  const motivationalMessage = {
    phone: '',
    sms: '🚀 Vérification en cours...',
    pin: mode === 'login' ? '🔐 Entrez votre code PIN' : '🔐 Créez votre code PIN',
    profile: '✨ Créez votre identité unique !',
    kyc: '🔒 Vérification d\'identité',
    resetPin: '🔑 Réinitialisation du PIN',
  }[step];

  // Effects
  useEffect(() => {
    if (step === 'sms') {
      const timer = setTimeout(() => {
        smsInputRefs.current[0]?.focus();
      }, 500);
      return () => clearTimeout(timer);
    }
    if (step === 'pin') {
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Redirect if already authenticated on mount (e.g. app restart) or after successful login/signup
  // Redirect if already authenticated on mount (e.g. app restart) or after successful login/signup
  useEffect(() => {
    console.log('[AuthScreen] Auth state changed. isAuthenticated:', isAuthenticated, 'Mode:', mode, 'Step:', step);
    if (isAuthenticated) {
      if (mode === 'signup') {
        // DO NOT Redirect here. Let the user complete KYC.
        console.log('[AuthScreen] Signup success -> Staying on Auth for KYC');
      } else {
        console.log('[AuthScreen] Login success -> /(tabs)');
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, mode]);



  // Methods
  const handlePreviousStep = () => {
    // Si on est dans l'étape resetPin, revenir à l'étape pin
    if (step === 'resetPin') {
      setStep('pin');
      setResetPinStep('otp');
      setResetOtpCode(null as unknown as string[]);
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
    setSmsCode(['', '', '', '', '']); // 5 chiffres
    setPin(''); // 4 chiffres
    setPinConfirm(''); // 4 chiffres
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
  };

  const triggerSignupSuccessNotification = async (userName?: string) => {
    if (!notifeeInstance) return;
    try {
      await notifeeInstance.requestPermission();
      let channelId: string | undefined;
      if (Platform.OS === 'android' && androidImportanceEnum) {
        channelId = await notifeeInstance.createChannel({
          id: 'zwanga-signup',
          name: 'Confirmations Zwanga',
          importance: androidImportanceEnum.HIGH,
          vibration: true,
        });
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

  // SMS & Phone Handlers
  const handlePhoneSubmit = async () => {
    if (phone.length < 10) {
      showDialog({ variant: 'danger', title: 'Numéro invalide', message: 'Veuillez entrer un numéro valide' });
      return;
    }

    // En mode login, passer directement à l'étape PIN (pas besoin d'OTP)
    if (mode === 'login') {
      setStep('pin');
      return;
    }

    // En mode signup, envoyer le code OTP pour vérifier le numéro
    try {
      setIsSendingOtp(true);
      const context: 'registration' | 'login' | 'update' = 'registration';
      console.log('Sending OTP with context:', { phone, context, mode });
      
      const payload: { phone: string; context: 'registration' | 'login' | 'update' } = { phone, context };
      console.log('Payload:', JSON.stringify(payload));
      
      await sendPhoneVerificationOtp(payload).unwrap();
      setStep('sms');
      showDialog({
        variant: 'success',
        title: 'Code envoyé',
        message: 'Un code de vérification a été envoyé à votre numéro de téléphone.',
      });
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      const errorMessage = error?.data?.message || error?.data || 'Erreur lors de l\'envoi du code';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: errorMessage,
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

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
      else smsInputRefs.current[updated.length - 1]?.blur();
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
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet (5 chiffres)' });
      return;
    }

    // Vérifier le code OTP (uniquement en mode signup)
    try {
      await verifyPhoneOtp({ phone, otp: code }).unwrap();
      // Si la vérification réussit, passer à l'étape PIN
      setStep('pin');
    } catch (error: any) {
      const errorMessage = error?.data?.message || error?.data || 'Code OTP invalide ou expiré';
      showDialog({
        variant: 'danger',
        title: 'Code invalide',
        message: errorMessage,
        actions: [
          {
            label: 'Réessayer',
            variant: 'primary',
            onPress: () => {
              setStep('phone');
              setSmsCode(['', '', '', '', '']);
            },
          },
        ],
      });
    }
  };

  // PIN Handlers - Champs texte normaux
  const handlePinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setPin(sanitized);
  };

  const handlePinConfirmChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setPinConfirm(sanitized);
  };

  const handlePinSubmit = async () => {
    if (pin.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer un PIN à 4 chiffres' });
      return;
    }

    if (mode === 'login') {
      // Connexion avec PIN
      try {
        const result = await login({ phone, pin }).unwrap();
        dispatch(setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
        // L'utilisateur sera récupéré automatiquement par onQueryStarted dans authApi
        // Navigation handled by useEffect
      } catch (error: any) {
        showDialog({ 
          variant: 'danger', 
          title: 'Erreur', 
          message: error?.data?.message || 'Numéro de téléphone ou PIN incorrect' 
        });
        // Réinitialiser le PIN en cas d'erreur
        setPin('');
        pinInputRef.current?.focus();
      }
    } else {
      // Enregistrement : vérifier que les deux PIN correspondent
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
      // PIN confirmé, passer à l'étape profile
      setStep('profile');
    }
  };

  // Reset PIN Handlers (pour PIN oublié)
  const handleForgotPin = async () => {
    setStep('resetPin');
    setResetPinStep('otp');
    setResetOtpCode(['', '', '', '', '']);
    setResetNewPin('');
    setResetNewPinConfirm('');
    
    // Envoyer automatiquement l'OTP
    try {
      setIsSendingResetOtp(true);
      await sendPhoneVerificationOtp({ phone, context: 'update' }).unwrap();
      showDialog({
        variant: 'success',
        title: 'Code envoyé',
        message: 'Un code de vérification a été envoyé à votre numéro de téléphone.',
      });
      setTimeout(() => {
        resetOtpInputRefs.current[0]?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Erreur lors de l\'envoi du code',
      });
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
      else resetOtpInputRefs.current[updated.length - 1]?.blur();
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
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet (5 chiffres)' });
      return;
    }

    try {
      await verifyPhoneOtp({ phone, otp: code }).unwrap();
      setResetPinStep('newPin');
      setTimeout(() => {
        resetPinInputRef.current?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Code invalide',
        message: error?.data?.message || 'Code OTP invalide ou expiré',
      });
    }
  };

  // Reset PIN Handlers - Champs texte normaux
  const handleResetPinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setResetNewPin(sanitized);
  };

  const handleResetPinConfirmChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setResetNewPinConfirm(sanitized);
  };

  const handleResetPinSubmit = async () => {
    const otpValue = resetOtpCode.join('');
    
    if (resetPinStep === 'otp') {
      // Vérifier l'OTP d'abord
      if (otpValue.length !== 5) {
        showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet (5 chiffres)' });
        return;
      }

      try {
        await verifyPhoneOtp({ phone, otp: otpValue }).unwrap();
        setResetPinStep('newPin');
        setTimeout(() => {
          resetPinInputRef.current?.focus();
        }, 100);
      } catch (error: any) {
        showDialog({
          variant: 'danger',
          title: 'Code invalide',
          message: error?.data?.message || 'Code OTP invalide ou expiré',
        });
      }
      return;
    }
    
    // Étape de nouveau PIN
    if (resetNewPin.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer un PIN à 4 chiffres' });
      return;
    }
    
    if (resetNewPinConfirm.length !== 4) {
      showDialog({ variant: 'danger', title: 'Confirmation incomplète', message: 'Veuillez confirmer votre PIN' });
      return;
    }
    
    if (resetNewPin !== resetNewPinConfirm) {
      showDialog({ variant: 'danger', title: 'PIN non correspondant', message: 'Les deux codes PIN ne correspondent pas' });
      setResetNewPinConfirm('');
      resetPinConfirmInputRef.current?.focus();
      return;
    }

    // Utiliser login avec newPin pour réinitialiser le PIN et se connecter directement
    try {
      const result = await login({ phone, newPin: resetNewPin }).unwrap();
      dispatch(setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
      
      showDialog({
        variant: 'success',
        title: 'PIN réinitialisé',
        message: 'Votre code PIN a été réinitialisé avec succès. Vous êtes maintenant connecté.',
      });
      
      // Réinitialiser les états
      setStep('pin');
      setResetPinStep('otp');
      setResetOtpCode(['', '', '', '', '']);
      setResetNewPin('');
      setResetNewPinConfirm('');
      setPin('');
      
      // La navigation sera gérée automatiquement par le useEffect qui surveille isAuthenticated
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Erreur lors de la réinitialisation du PIN',
      });
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
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) setProfilePicture(result.assets[0].uri);
            }
          },
          {
            label: 'Galerie',
            variant: 'secondary',
            onPress: async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8,
              });
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

    const requiresVehicleSelection = role === 'driver';
    if (requiresVehicleSelection) {
      if (!vehicleType) {
        showDialog({ variant: 'warning', title: 'Véhicule', message: 'Veuillez sélectionner un type de véhicule.' });
        return;
      }
      if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehiclePlate.trim()) {
        showDialog({ variant: 'warning', title: 'Véhicule', message: 'Veuillez compléter les informations du véhicule.' });
        return;
      }
      // Si c'est un conducteur, passer à l'étape KYC
      setStep('kyc');
    } else {
      // Si c'est un passager, s'inscrire directement sans KYC
      handleFinalRegister();
    }
  };

  const handleFinalRegister = async () => {
    try {
      const requiresVehicleSelection = role === 'driver';
      const formData = new FormData();
      formData.append('phone', phone);
      formData.append('pin', pin); // Ajouter le PIN
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('role', role);
      formData.append('isDriver', JSON.stringify(requiresVehicleSelection));

      if (requiresVehicleSelection) {
        formData.append('vehicle[brand]', vehicleBrand.trim());
        formData.append('vehicle[model]', vehicleModel.trim());
        formData.append('vehicle[color]', vehicleColor.trim());
        formData.append('vehicle[licensePlate]', vehiclePlate.trim());
      }
      if (email) formData.append('email', email.trim());

      if (profilePicture) {
        const fileName = `pp-${Date.now()}.jpg`;
        formData.append('profilePicture', {
          uri: profilePicture,
          name: fileName,
          type: 'image/jpeg',
        } as any);
      }

      // 1. Register User
      const result = await register(formData).unwrap();
      dispatch(setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
      // L'utilisateur sera récupéré automatiquement par onQueryStarted dans authApi

      // 2. Upload KYC seulement si l'utilisateur est conducteur et a fourni des fichiers KYC
      if (requiresVehicleSelection && kycFiles) {
        setKycSubmitting(true);
        const kycData = buildKycFormData(kycFiles);
        await uploadKyc(kycData).unwrap();
      }

      // Récupérer le nom de l'utilisateur depuis le store après l'inscription
      await triggerSignupSuccessNotification(firstName);

      // 3. Navigate (AuthGuard or Effect will handle, but we can force it too if needed)
      // The useEffect on `isAuthenticated` handles redirection to tabs.

    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || "Erreur lors de l'inscription",
      });
    } finally {
      setKycSubmitting(false);
    }
  };





  const buildKycFormData = (files: KycCaptureResult) => {
    const formData = new FormData();
    const appendFile = (field: string, uri: string) => {
      const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
      formData.append(field, {
        uri,
        type: 'image/jpeg',
        name: `${field}-${Date.now()}.${ext}`,
      } as any);
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



  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {canGoBack ? (
            <TouchableOpacity style={styles.backButton} onPress={handlePreviousStep}>
              <Ionicons name="arrow-back" size={24} color={Colors.gray[800]} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} /> // Spacer
          )}

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'login' && styles.toggleButtonActive]}
              onPress={() => { setMode('login'); resetForm(); }}
            >
              <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>Connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'signup' && styles.toggleButtonActive]}
              onPress={() => { setMode('signup'); resetForm(); }}
            >
              <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>Inscription</Text>
            </TouchableOpacity>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>

        {motivationalMessage && <Text style={styles.motivationalText}>{motivationalMessage}</Text>}
      </View>

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
          {/* Step: Phone */}
        {step === 'phone' && (
          <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.heroSection}>
              <View style={styles.logoContainer}>
                <Ionicons name="car-sport" size={50} color={Colors.primary} />
              </View>
              <Text style={styles.heroTitle}>{mode === 'login' ? 'Bon retour !' : 'Rejoignez Zwanga'}</Text>
              <Text style={styles.heroSubtitle}>La mobilité simplifiée, pour tous.</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Numéro de téléphone</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+243 000 000 000"
                  placeholderTextColor={Colors.gray[400]}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <TouchableOpacity
                style={[styles.mainButton, phone.length >= 10 && !isSendingOtpMutation ? styles.mainButtonActive : styles.mainButtonDisabled]}
                onPress={handlePhoneSubmit}
                disabled={phone.length < 10 || isSendingOtpMutation}
              >
                {isSendingOtpMutation ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.mainButtonText}>Continuer</Text>
                    <Ionicons name="arrow-forward" size={20} color="white" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Step: SMS */}
        {step === 'sms' && (
          <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.heroSection}>
              <View style={[styles.logoContainer, { backgroundColor: Colors.secondary + '20' }]}>
                <Ionicons name="chatbubble-ellipses" size={40} color={Colors.secondary} />
              </View>
              <Text style={styles.heroTitle}>Vérification</Text>
              <Text style={styles.heroSubtitle}>Code de vérification (OTP) envoyé au <Text style={{ fontWeight: 'bold', color: Colors.gray[900] }}>{phone}</Text></Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
              <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>
              <View style={styles.smsCodeContainer}>
                {smsCode.map((digit, index) => (
                  <TextInput
                    key={`sms-${index}`}
                    ref={(ref) => { smsInputRefs.current[index] = ref; }}
                    style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleSmsInputChange(text, index)}
                    onKeyPress={(e) => handleSmsKeyPress(e, index)}
                  />
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.mainButton, smsCode.join('').length === 5 ? styles.mainButtonActive : styles.mainButtonDisabled]}
              onPress={handleSmsSubmit}
              disabled={smsCode.join('').length !== 5 || isVerifyingOtp || isLoggingIn}
            >
              {isVerifyingOtp || isLoggingIn ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={styles.mainButtonText}>{mode === 'login' ? 'Se connecter' : 'Vérifier'}</Text>
                  {!isVerifyingOtp && !isLoggingIn && <Ionicons name="checkmark-circle-outline" size={24} color="white" />}
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.resendButton}
              onPress={handlePhoneSubmit}
              disabled={isSendingOtpMutation}
            >
              {isSendingOtpMutation ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.resendButtonText}>Renvoyer le code</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Step: PIN */}
        {step === 'pin' && (
          <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.heroSection}>
              <View style={[styles.logoContainer, { backgroundColor: Colors.primary + '20' }]}>
                <Ionicons name="lock-closed" size={40} color={Colors.primary} />
              </View>
              <Text style={styles.heroTitle}>{mode === 'login' ? 'Entrez votre mot de passe PIN' : 'Créez votre mot de passe PIN'}</Text>
              <Text style={styles.heroSubtitle}>
                {mode === 'login' 
                  ? 'Mot de passe PIN à 4 chiffres' 
                  : 'Choisissez un mot de passe PIN à 4 chiffres pour sécuriser votre compte'}
              </Text>
            </View>

            {mode === 'login' ? (
              // Mode login : un seul champ PIN
              <>
                <View style={styles.pinInputWrapper}>
                  <Ionicons name="lock-closed" size={18} color={Colors.gray[500]} style={styles.pinInputIcon} />
                  <TextInput
                    ref={pinInputRef}
                    style={styles.pinInputField}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={pin}
                    onChangeText={handlePinChange}
                    placeholder="••••"
                    placeholderTextColor={Colors.gray[400]}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.mainButton, pin.length === 4 ? styles.mainButtonActive : styles.mainButtonDisabled]}
                  onPress={handlePinSubmit}
                  disabled={pin.length !== 4 || isLoggingIn}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Text style={styles.mainButtonText}>Se connecter</Text>
                      <Ionicons name="checkmark-circle-outline" size={24} color="white" />
                    </>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.forgotPinButton}
                  onPress={handleForgotPin}
                >
                  <Text style={styles.forgotPinText}>J'ai oublié mon PIN</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Mode signup : deux champs PIN (création et confirmation)
              <>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Mot de passe PIN</Text>
                  <View style={styles.pinInputWrapper}>
                    <Ionicons name="lock-closed" size={18} color={Colors.gray[500]} style={styles.pinInputIcon} />
                    <TextInput
                      ref={pinInputRef}
                      style={styles.pinInputField}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={pin}
                      onChangeText={handlePinChange}
                      placeholder="••••"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Confirmer le mot de passe PIN</Text>
                  <View style={styles.pinInputWrapper}>
                    <Ionicons name="lock-closed" size={18} color={Colors.gray[500]} style={styles.pinInputIcon} />
                    <TextInput
                      ref={pinConfirmInputRef}
                      style={styles.pinInputField}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={pinConfirm}
                      onChangeText={handlePinConfirmChange}
                      placeholder="••••"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.mainButton, pin.length === 4 && pinConfirm.length === 4 ? styles.mainButtonActive : styles.mainButtonDisabled]}
                  onPress={handlePinSubmit}
                  disabled={pin.length !== 4 || pinConfirm.length !== 4}
                >
                  <Text style={styles.mainButtonText}>Continuer</Text>
                  <Ionicons name="arrow-forward" size={20} color="white" />
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        )}

        {/* Step: Reset PIN (PIN oublié) */}
        {step === 'resetPin' && (
          <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.heroSection}>
              <View style={[styles.logoContainer, { backgroundColor: Colors.secondary + '20' }]}>
                <Ionicons name="key" size={40} color={Colors.secondary} />
              </View>
              <Text style={styles.heroTitle}>Réinitialiser votre mot de passe PIN</Text>
              <Text style={styles.heroSubtitle}>
                {resetPinStep === 'otp' 
                  ? 'Un code de vérification sera envoyé à votre numéro de téléphone'
                  : 'Créez un nouveau mot de passe PIN à 4 chiffres'}
              </Text>
            </View>

            {resetPinStep === 'otp' ? (
              <>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
                  <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>
                  <View style={styles.smsCodeContainer}>
                    {resetOtpCode.map((digit, index) => (
                      <TextInput
                        key={`reset-otp-${index}`}
                        ref={(ref) => { resetOtpInputRefs.current[index] = ref; }}
                        style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
                        keyboardType="number-pad"
                        maxLength={1}
                        value={digit}
                        onChangeText={(text) => handleResetOtpInputChange(text, index)}
                        onKeyPress={(e) => handleResetOtpKeyPress(e, index)}
                      />
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.mainButton, resetOtpCode.join('').length === 5 ? styles.mainButtonActive : styles.mainButtonDisabled]}
                  onPress={handleVerifyResetOtp}
                  disabled={resetOtpCode.join('').length !== 5}
                >
                  <Text style={styles.mainButtonText}>Vérifier</Text>
                  <Ionicons name="arrow-forward" size={20} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={handleForgotPin}
                  disabled={isSendingResetOtp}
                >
                  {isSendingResetOtp ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.resendButtonText}>Renvoyer le code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Nouveau mot de passe PIN</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={resetPinInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={resetNewPin}
                      onChangeText={handleResetPinChange}
                      placeholder="Créez un nouveau PIN (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Confirmer le nouveau mot de passe PIN</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={resetPinConfirmInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={resetNewPinConfirm}
                      onChangeText={handleResetPinConfirmChange}
                      placeholder="Confirmez votre nouveau PIN (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.mainButton, resetNewPin.length === 4 && resetNewPinConfirm.length === 4 ? styles.mainButtonActive : styles.mainButtonDisabled]}
                  onPress={handleResetPinSubmit}
                  disabled={resetNewPin.length !== 4 || resetNewPinConfirm.length !== 4 || isLoggingIn}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Text style={styles.mainButtonText}>Réinitialiser le PIN</Text>
                      <Ionicons name="checkmark-circle-outline" size={24} color="white" />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        )}

        {/* Step: Profile */}
        {step === 'profile' && mode === 'signup' && (
          <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.heroSectionCompact}>
              <Text style={styles.heroTitle}>Créez votre profil</Text>
              <Text style={styles.heroSubtitle}>Dites-nous en plus sur vous</Text>
            </View>

            <View style={styles.profileHeader}>
              <TouchableOpacity style={styles.avatarUpload} onPress={handleSelectProfilePicture}>
                {profilePicture ? (
                  <Image source={{ uri: profilePicture }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="camera" size={32} color={Colors.primary} />
                  </View>
                )}
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={14} color="white" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Prénom"
                  placeholderTextColor={Colors.gray[400]}
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Nom"
                  placeholderTextColor={Colors.gray[400]}
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>

            <View style={styles.roleSelection}>
              <Text style={styles.sectionLabel}>Je suis principalement :</Text>
              <View style={styles.roleCards}>
                <TouchableOpacity
                  style={[styles.roleCard, role === 'passenger' && styles.roleCardActive]}
                  onPress={() => setRole('passenger')}
                >
                  <View style={styles.roleIconBadge}>
                    <Ionicons name="person" size={24} color={role === 'passenger' ? 'white' : Colors.gray[500]} />
                  </View>
                  <Text style={[styles.roleLabel, role === 'passenger' && styles.roleLabelActive]}>Passager</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.roleCard, role === 'driver' && styles.roleCardActive]}
                  onPress={() => setRole('driver')}
                >
                  <View style={styles.roleIconBadge}>
                    <Ionicons name="car" size={24} color={role === 'driver' ? 'white' : Colors.gray[500]} />
                  </View>
                  <Text style={[styles.roleLabel, role === 'driver' && styles.roleLabelActive]}>Conducteur</Text>
                </TouchableOpacity>
              </View>
            </View>

            {role === 'driver' && (
              <Animated.View entering={FadeInDown} style={styles.vehicleSection}>
                <Text style={styles.sectionLabel}>Votre véhicule</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vehicleTypesScroll}>
                  {vehicleOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.vehicleTypeCard, vehicleType === opt.id && styles.vehicleTypeCardActive]}
                      onPress={() => setVehicleType(opt.id)}
                    >
                      <Ionicons name={opt.icon} size={28} color={vehicleType === opt.id ? Colors.primary : Colors.gray[400]} />
                      <Text style={[styles.vehicleTypeLabel, vehicleType === opt.id && styles.vehicleTypeLabelActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity style={styles.vehicleDetailsSheet} onPress={() => setVehicleModalVisible(true)}>
                  <View style={styles.vehicleDetailsInfo}>
                    <Text style={styles.vehicleDetailsTitle}>
                      {vehicleBrand ? `${vehicleBrand} ${vehicleModel}` : 'Informations du véhicule'}
                    </Text>
                    <Text style={styles.vehicleDetailsSubtitle}>
                      {vehiclePlate ? `${vehicleColor} • ${vehiclePlate}` : 'Appuyez pour compléter'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={Colors.gray[400]} />
                </TouchableOpacity>
              </Animated.View>
            )}

            <TouchableOpacity
              style={[styles.mainButton, styles.mainButtonActive, { marginTop: Spacing.xl, marginBottom: Spacing.xxl }]}
              onPress={validateProfileAndContinue}
            >
              <Text style={styles.mainButtonText}>Continuer</Text>
            </TouchableOpacity>

          </Animated.View>
        )}

        {/* Step: KYC - Seulement pour les conducteurs */}
        {step === 'kyc' && role === 'driver' && (
          <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.heroSection}>
              <View style={[styles.logoContainer, { backgroundColor: Colors.info + '15' }]}>
                <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
              </View>
              <Text style={styles.heroTitle}>Vérification d'identité requise</Text>
              <Text style={styles.heroSubtitle}>Pour devenir conducteur, vous devez vérifier votre identité.</Text>
            </View>

            <View style={styles.kycBenefitsContainer}>
              <View style={styles.benefitRow}>
                <Ionicons name="checkbox" size={24} color={Colors.success} style={{ marginBottom: 2 }} />
                <Text style={styles.benefitText}>Badge "Vérifié" sur votre profil</Text>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="flash" size={24} color={Colors.warning} style={{ marginBottom: 2 }} />
                <Text style={styles.benefitText}>Accès prioritaire aux trajets</Text>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="heart" size={24} color={Colors.danger} style={{ marginBottom: 2 }} />
                <Text style={styles.benefitText}>Plus de confiance des membres</Text>
              </View>
            </View>

            <View style={{ gap: 16 }}>
              <TouchableOpacity style={[styles.mainButton, kycFiles ? styles.mainButtonActive : { backgroundColor: Colors.primary + '20' }]} onPress={() => setKycModalVisible(true)}>
                <Text style={[styles.mainButtonText, !kycFiles && { color: Colors.primary }]}>
                  {kycFiles ? 'Documents scannés (Modifier)' : 'Scanner mes documents'}
                </Text>
                <Ionicons name={kycFiles ? "checkmark-circle" : "scan"} size={20} color={kycFiles ? "white" : Colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mainButton, styles.mainButtonActive, { backgroundColor: kycFiles ? Colors.success : Colors.primary }]}
                onPress={handleFinalRegister}
                disabled={isRegistering || kycSubmitting || !kycFiles}
              >
                {isRegistering || kycSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.mainButtonText}>
                      {kycFiles ? "Terminer l'inscription" : "KYC requis pour les conducteurs"}
                    </Text>
                    {kycFiles && <Ionicons name="arrow-forward" size={20} color="white" />}
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Vehicle Details Modal */}
      <Modal
        visible={vehicleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVehicleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Détails du véhicule</Text>
              <TouchableOpacity onPress={() => setVehicleModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.gray[900]} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 16 }}>
              <View style={styles.inputWrapper}>
                <Ionicons name="car-sport-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Marque (ex: Toyota)"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleBrand}
                  onChangeText={setVehicleBrand}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="car-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Modèle (ex: RAV4)"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="color-palette-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Couleur"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleColor}
                  onChangeText={setVehicleColor}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="card-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Plaque (ex: 1234AB01)"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehiclePlate}
                  onChangeText={setVehiclePlate}
                  autoCapitalize="characters"
                />
              </View>

              <TouchableOpacity
                style={[styles.mainButton, styles.mainButtonActive]}
                onPress={() => setVehicleModalVisible(false)}
              >
                <Text style={styles.mainButtonText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <KycWizardModal
        visible={kycModalVisible}
        onClose={() => setKycModalVisible(false)}
        onComplete={handleKycWizardComplete}
        isSubmitting={kycSubmitting}
      />

    </SafeAreaView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },

  // Header
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  backButton: { padding: Spacing.xs },

  toggleContainer: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: BorderRadius.full, padding: 4 },
  toggleButton: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: BorderRadius.full },
  toggleButtonActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleText: { fontSize: 14, fontWeight: '600', color: Colors.gray[500] },
  toggleTextActive: { color: Colors.primary },

  progressContainer: { alignItems: 'center', marginBottom: Spacing.sm },
  progressBarBg: { width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: BorderRadius.full },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: BorderRadius.full },
  motivationalText: { textAlign: 'center', color: Colors.primary, fontSize: 12, fontWeight: '600', marginTop: 4 },

  scrollView: { flex: 1 },
  scrollViewContent: { paddingHorizontal: Spacing.xl, paddingBottom: 40, flexGrow: 1 },

  stepContainer: { flex: 1 },

  // Hero Section
  heroSection: { alignItems: 'center', marginVertical: Spacing.xl },
  heroSectionCompact: { alignItems: 'center', marginVertical: Spacing.md },
  logoContainer: { width: 80, height: 80, borderRadius: 25, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  heroTitle: { fontSize: 28, fontWeight: '800', color: Colors.gray[900], marginBottom: 4, textAlign: 'center' },
  heroSubtitle: { fontSize: 16, color: Colors.gray[500], textAlign: 'center', paddingHorizontal: 20 },

  // Forms
  formSection: { gap: Spacing.lg, marginTop: Spacing.lg },
  inputLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray[700], marginBottom: 8 },
  inputLabelSmall: { fontSize: 12, fontWeight: '600', color: Colors.gray[600], marginBottom: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 16, backgroundColor: '#F9FAFB', height: 56, marginBottom: 12 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: Colors.gray[900], height: '100%' },
  rowInputs: { flexDirection: 'row', gap: 12 },

  // Buttons
  mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  mainButtonActive: { backgroundColor: Colors.primary },
  mainButtonDisabled: { backgroundColor: Colors.gray[300], shadowOpacity: 0 },
  mainButtonText: { fontSize: 18, fontWeight: '700', color: 'white' },
  resendButton: { alignSelf: 'center', marginTop: 16 },
  resendButtonText: { color: Colors.primary, fontWeight: '600' },
  forgotPinButton: { alignSelf: 'center', marginTop: 16 },
  forgotPinText: { color: Colors.gray[600], fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' },

  // SMS
  // Styles pour OTP (5 chiffres)
  smsCodeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 32 },
  smsInput: { width: 48, height: 60, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: 'bold', color: Colors.gray[900], backgroundColor: '#F9FAFB' },
  smsInputFilled: { borderColor: Colors.primary, backgroundColor: 'white' },
  
  // Styles pour PIN (4 chiffres) - Design différent pour éviter la confusion
  pinCodeContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 24 },
  pinInput: { width: 56, height: 64, borderWidth: 2, borderColor: '#D1D5DB', borderRadius: 16, textAlign: 'center', fontSize: 28, fontWeight: 'bold', color: Colors.gray[900], backgroundColor: '#F3F4F6' },
  pinInputFilled: { borderColor: Colors.secondary, backgroundColor: '#F0F9FF', borderWidth: 2.5 },
  
  // Styles pour champ PIN compact (4 chiffres)
  pinInputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: '#E5E7EB', 
    borderRadius: 12, 
    paddingHorizontal: 12, 
    backgroundColor: '#F9FAFB', 
    height: 48, 
    marginBottom: 12,
    alignSelf: 'center',
    width: 160,
    justifyContent: 'center',
  },
  pinInputIcon: { marginRight: 8 },
  pinInputField: { 
    flex: 1, 
    fontSize: 20, 
    fontWeight: '600',
    color: Colors.gray[900], 
    height: '100%',
    textAlign: 'center',
    letterSpacing: 8,
  },

  // Profile
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarUpload: { position: 'relative' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 40, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  avatarImage: { width: 100, height: 100, borderRadius: 40, borderWidth: 3, borderColor: 'white' },
  editBadge: { position: 'absolute', bottom: -4, right: -4, backgroundColor: Colors.primary, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },

  formGrid: { gap: 12 },

  // Roles
  sectionLabel: { fontSize: 16, fontWeight: '700', color: Colors.gray[800], marginBottom: 12, marginTop: 8 },
  roleSelection: { marginTop: 16 },
  roleCards: { flexDirection: 'row', gap: 16 },
  roleCard: { flex: 1, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 20, padding: 16, alignItems: 'center', gap: 12 },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '05' },
  roleIconBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  roleLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray[600] },
  roleLabelActive: { color: Colors.primary, fontWeight: '700' },

  // Vehicle
  vehicleSection: { marginTop: 24 },
  vehicleTypesScroll: { paddingVertical: 8, gap: 12 },
  vehicleTypeCard: { alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: 'white', gap: 8 },
  vehicleTypeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '05' },
  vehicleTypeLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray[500] },
  vehicleTypeLabelActive: { color: Colors.primary },

  vehicleDetailsSheet: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, marginTop: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  vehicleDetailsInfo: { flex: 1 },
  vehicleDetailsTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  vehicleDetailsSubtitle: { fontSize: 14, color: Colors.gray[500], marginTop: 2 },

  // KYC Screen
  kycBenefitsContainer: { gap: 16, marginVertical: 32, paddingHorizontal: 16 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16 },
  benefitText: { fontSize: 15, fontWeight: '600', color: Colors.gray[800] },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, minHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },

});
