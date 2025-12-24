import { KycCaptureResult, KycWizardModal } from '@/components/KycWizardModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { isDevelopment } from '@/config/env';
import { BorderRadius, Colors, Spacing } from '@/constants/styles';
import { useSendPhoneVerificationOtpMutation, useUploadKycMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useLoginMutation, useRegisterMutation } from '@/store/api/zwangaApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { setTokens, setUser } from '@/store/slices/authSlice';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
type AuthStep = 'phone' | 'sms' | 'profile' | 'kyc';
type VehicleType = 'sedan' | 'suv' | 'van' | 'moto';

const LOGIN_STEPS: AuthStep[] = ['phone', 'sms'];
// KYC n'est plus dans les étapes par défaut - il sera ajouté conditionnellement pour les conducteurs
const SIGNUP_STEPS: AuthStep[] = ['phone', 'sms', 'profile'];

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
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<AuthStep>('phone');

  // Form State
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState(['', '', '', '', '']); // 5 chiffres au lieu de 6
  const smsInputRefs = useRef<Array<TextInput | null>>([]);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
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
      return LOGIN_STEPS;
    }
    // Pour l'inscription, ajouter KYC seulement si l'utilisateur est conducteur
    if (role === 'driver') {
      return ['phone', 'sms', 'profile', 'kyc'];
    }
    return SIGNUP_STEPS; // Pas de KYC pour les passagers
  };

  const stepSequence = getStepSequence();
  const currentStepIndex = stepSequence.indexOf(step);
  const canGoBack = currentStepIndex > 0;

  // Calculate progress based on total steps
  const progress = Math.round(((currentStepIndex + 1) / stepSequence.length) * 100);

  const motivationalMessage = {
    phone: '',
    sms: mode === 'login' ? '🎉 Authentification réussie !' : '🚀 Vérification en cours...',
    profile: '✨ Créez votre identité unique !',
    kyc: '🔒 Vérification d\'identité',
  }[step];

  // Effects
  useEffect(() => {
    if (step === 'sms') {
      const timer = setTimeout(() => {
        smsInputRefs.current[0]?.focus();
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
    if (currentStepIndex > 0) {
      setStep(stepSequence[currentStepIndex - 1] as AuthStep);
    }
  };

  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setSmsCode(['', '', '', '', '']); // 5 chiffres
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

    // En développement, sauter l'étape OTP et passer directement à l'étape suivante
    if (isDevelopment) {
      if (mode === 'login') {
        try {
          const result = await login({ phone }).unwrap();
          dispatch(setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
          dispatch(setUser(result.user));
          // Navigation handled by useEffect
        } catch (error: any) {
          showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Erreur lors de la connexion' });
        }
      } else {
        // Mode signup : passer directement à l'étape profile
        setStep('profile');
      }
      return;
    }

    // En production, envoyer le code OTP normalement
    try {
      setIsSendingOtp(true);
      // Envoyer le contexte approprié selon le mode (login ou signup)
      const context: 'registration' | 'login' | 'update' = (mode === 'login' ? 'login' : 'registration') as 'registration' | 'login' | 'update';
      console.log('Sending OTP with context:', { phone, context, mode });
      
      // S'assurer que le contexte est bien défini et non vide
      if (!context || (context !== 'login' && context !== 'registration' && context !== 'update')) {
        throw new Error(`Invalid context: ${context}`);
      }
      
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

    // En développement, sauter la vérification OTP et continuer directement
    if (isDevelopment) {
      if (mode === 'login') {
        try {
          const result = await login({ phone }).unwrap();
          dispatch(setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
          dispatch(setUser(result.user));
          // Navigation handled by useEffect
        } catch (error: any) {
          showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Erreur lors de la connexion' });
        }
      } else {
        // Mode signup : passer à l'étape profile
        setStep('profile');
      }
      return;
    }

    // En production, vérifier le code OTP normalement
    try {
      // D'abord vérifier le code OTP
      await verifyPhoneOtp({ phone, otp: code }).unwrap();

      // Si la vérification réussit, continuer selon le mode
      if (mode === 'login') {
        try {
          const result = await login({ phone }).unwrap();
          dispatch(setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
          dispatch(setUser(result.user));
          // Navigation handled by useEffect
        } catch (error: any) {
          showDialog({ variant: 'danger', title: 'Erreur', message: error?.data?.message || 'Erreur lors de la connexion' });
        }
      } else {
        // Mode signup : passer à l'étape profile
        setStep('profile');
      }
    } catch (error: any) {
      // Si la vérification échoue, retourner à l'étape phone
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
      dispatch(setUser(result.user));

      // 2. Upload KYC seulement si l'utilisateur est conducteur et a fourni des fichiers KYC
      if (requiresVehicleSelection && kycFiles) {
        setKycSubmitting(true);
        const kycData = buildKycFormData(kycFiles);
        await uploadKyc(kycData).unwrap();
      }

      await triggerSignupSuccessNotification(result.user?.name || firstName);

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent} showsVerticalScrollIndicator={false}>

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
              <Text style={styles.heroSubtitle}>Code envoyé au <Text style={{ fontWeight: 'bold', color: Colors.gray[900] }}>{phone}</Text></Text>
            </View>

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

  // SMS
  smsCodeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 32 },
  smsInput: { width: 48, height: 60, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: 'bold', color: Colors.gray[900], backgroundColor: '#F9FAFB' },
  smsInputFilled: { borderColor: Colors.primary, backgroundColor: 'white' },

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
