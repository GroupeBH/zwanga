import { IdentityVerification } from '@/components/IdentityVerification';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useLoginMutation, useRegisterMutation } from '@/store/api/zwangaApi';
import { useAppDispatch } from '@/store/hooks';
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

import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthMode = 'login' | 'signup';
type AuthStep = 'phone' | 'sms' | 'kyc' | 'identity' | 'profile';
type VehicleType = 'sedan' | 'suv' | 'van' | 'moto';

const LOGIN_STEPS: AuthStep[] = ['phone', 'sms'];
const SIGNUP_STEPS: AuthStep[] = ['phone', 'sms', 'kyc', 'identity', 'profile'];

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
    description: 'Idéal pour les routes difficiles',
    icon: 'car-outline',
  },
  {
    id: 'van',
    label: 'Van / Mini-bus',
    description: 'Jusqu\'à 8 passagers',
    icon: 'bus',
  },
  {
    id: 'moto',
    label: 'Moto / Scooter',
    description: 'Pour les trajets urbains rapides',
    icon: 'bicycle',
  },
];

export default function AuthScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState(['', '', '', '', '', '']);
  const smsInputRefs = useRef<Array<TextInput | null>>([]);
  const [fullName, setFullName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  // const [idNumber, setIdNumber] = useState('');
  const [role, setRole] = useState<'driver' | 'passenger' | 'both'>('passenger');
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const stepSequence = mode === 'login' ? LOGIN_STEPS : SIGNUP_STEPS;
  const currentStepIndex = stepSequence.indexOf(step);
  const canGoBack = currentStepIndex > 0;

  useEffect(() => {
    if (step !== 'sms') {
      return;
    }
    const timer = setTimeout(() => {
      smsInputRefs.current[0]?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [step]);

  const handlePreviousStep = () => {
    if (currentStepIndex > 0) {
      setStep(stepSequence[currentStepIndex - 1]);
    }
  };

  const handleSmsInputChange = (value: string, index: number) => {
    const sanitized = value.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const digits = sanitized.split('');
      const updated = [...smsCode];
      let cursor = index;
      digits.forEach((digit) => {
        if (cursor <= updated.length - 1) {
          updated[cursor] = digit;
        }
        cursor += 1;
      });
      setSmsCode(updated);
      if (cursor <= updated.length - 1) {
        smsInputRefs.current[cursor]?.focus();
      } else {
        smsInputRefs.current[updated.length - 1]?.blur();
      }
      return;
    }

    const nextCode = [...smsCode];
    nextCode[index] = sanitized;
    setSmsCode(nextCode);

    if (sanitized && index < nextCode.length - 1) {
      smsInputRefs.current[index + 1]?.focus();
    }
  };

  const handleSmsKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (event.nativeEvent.key !== 'Backspace') {
      return;
    }

    if (smsCode[index]) {
      const updated = [...smsCode];
      updated[index] = '';
      setSmsCode(updated);
      return;
    }

    if (index > 0) {
      smsInputRefs.current[index - 1]?.focus();
      const updated = [...smsCode];
      updated[index - 1] = '';
      setSmsCode(updated);
    }
  };

  const [identityVerified, setIdentityVerified] = useState(false);
  
  // États pour les images
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [cniImage, setCniImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState({
    visible: false,
    title: '',
    message: '',
  });
  
  // Hooks RTK Query pour login et register
  const [login, { isLoading: isLoggingIn }] = useLoginMutation();
  const [register, { isLoading: isRegistering }] = useRegisterMutation();

  const progress = {
    phone: mode === 'login' ? 50 : 20,
    sms: mode === 'login' ? 100 : 40,
    kyc: 60,
    identity: 80,
    profile: 100,
  }[step];

  const motivationalMessage = {
    phone: '',
    sms: mode === 'login' ? '🎉 Connexion réussie!' : '🎉 Super! Continuez comme ça!',
    kyc: '⚡ Presque fini!',
    identity: '🔒 Sécurisez votre compte!',
    profile: '🎊 Dernière étape!',
  }[step];

  const showErrorModal = (message: string, title = 'Quelque chose s\'est mal passé') => {
    setErrorModal({
      visible: true,
      title,
      message,
    });
  };

  const hideErrorModal = () => {
    setErrorModal((prev) => ({ ...prev, visible: false }));
  };

  const triggerSignupSuccessNotification = async (userName?: string) => {
    if (!notifeeInstance) {
      return;
    }

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
        android: channelId
          ? {
              channelId,
              pressAction: { id: 'default' },
            }
          : undefined,
        ios: {
          sound: 'default',
        },
      });
    } catch (notificationError) {
      console.warn('Notification inscription Notifee', notificationError);
    }
  };

  const handlePhoneSubmit = () => {
    if (phone.length >= 10) {
      setStep('sms');
    } else {
      showErrorModal('Veuillez entrer un numéro valide');
    }
  };

  const handleSmsSubmit = async () => {
    const code = smsCode.join('');
    if (code.length === 6) {
      if (mode === 'login') {
        try {
          // Appel API de connexion
          // Note: Dans un vrai cas, vous devriez envoyer le code SMS au backend
          // Ici, on simule avec le numéro de téléphone
          const result = await login({ 
            phone, 
            // password: code // Dans un vrai cas, ce serait le mot de passe
          }).unwrap();
          
          // Les tokens sont automatiquement stockés dans SecureStore via onQueryStarted
          // Mettre à jour le state Redux avec les tokens et l'utilisateur
          dispatch(setTokens({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          }));
          dispatch(setUser(result.user));
          
          router.replace('/(tabs)');
        } catch (error: any) {
          showErrorModal(error?.data?.message || 'Erreur lors de la connexion');
        }
      } else {
        setStep('kyc');
      }
    } else {
      showErrorModal('Veuillez entrer le code complet');
    }
  };

  const handleSkipKYC = () => {
    setStep('profile');
  };

  const handleKYCSubmit = () => {
    if (firstName && lastName) {
      setStep('identity');
    } else {
      showErrorModal('Veuillez remplir tous les champs');
    }
  };

  const handleIdentityComplete = (data: { idCardImage: string; faceImage: string }) => {
    // Stocker les images de la CNI et du selfie
    setCniImage(data.idCardImage);
    setSelfieImage(data.faceImage);
    setIdentityVerified(true);
    setStep('profile');
  };

  const handleSkipIdentity = () => {
    setIdentityVerified(false);
    setStep('profile');
  };

  const handleSelectProfilePicture = async () => {
    try {
      // Demander les permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showErrorModal('L\'accès à la galerie est nécessaire pour sélectionner une photo.', 'Permission requise');
        return;
      }

      const openCamera = async () => {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (cameraStatus !== 'granted') {
          showErrorModal('L\'accès à la caméra est nécessaire pour prendre une photo.', 'Permission requise');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setProfilePicture(result.assets[0].uri);
        }
      };

      const openGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setProfilePicture(result.assets[0].uri);
        }
      };

      showDialog({
        variant: 'info',
        title: 'Photo de profil',
        message: 'Choisissez comment ajouter votre photo de profil.',
        actions: [
          { label: 'Caméra', variant: 'primary', onPress: openCamera },
          { label: 'Galerie', variant: 'secondary', onPress: openGallery },
          { label: 'Annuler', variant: 'ghost' },
        ],
      });
    } catch (error) {
      console.error('Erreur lors de la sélection de l\'image:', error);
      showErrorModal('Impossible de sélectionner l\'image. Veuillez réessayer.');
    }
  };

  const appendImageToFormData = (
    formData: FormData,
    field: 'profilePicture' | 'cniImage' | 'selfieImage',
    uri: string | null,
  ) => {
    if (!uri) return;

    const fileName = `${field}-${Date.now()}.jpg`;
    formData.append(field, {
      uri,
      name: fileName,
      type: 'image/jpeg',
    } as any);
  };

  const handleProfileSubmit = async () => {
    try {
      const requiresVehicleSelection = role === 'driver' || role === 'both';

      if (requiresVehicleSelection) {
        if (!vehicleType) {
          showErrorModal('Veuillez sélectionner un type de véhicule pour continuer.', 'Information manquante');
          return;
        }

        if (
          !vehicleBrand.trim() ||
          !vehicleModel.trim() ||
          !vehicleColor.trim() ||
          !vehiclePlate.trim()
        ) {
          showErrorModal('Merci de compléter toutes les informations du véhicule.', 'Information manquante');
          return;
        }
      }

      const formData = new FormData();

      formData.append('phone', phone);
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('role', role);
      formData.append('isDriver', JSON.stringify(role === 'driver' || role === 'both'));

      if (requiresVehicleSelection) {
        formData.append('vehicle[brand]', vehicleBrand.trim());
        formData.append('vehicle[model]', vehicleModel.trim());
        formData.append('vehicle[color]', vehicleColor.trim());
        formData.append('vehicle[licensePlate]', vehiclePlate.trim());
      }

      if (email) {
        formData.append('email', email.trim());
      }

      appendImageToFormData(formData, 'profilePicture', profilePicture);
      appendImageToFormData(formData, 'cniImage', cniImage);
      appendImageToFormData(formData, 'selfieImage', selfieImage);

      console.log('formData vehicle', formData?.get('vehicle'));
      
      // Appel API d'inscription avec les images
      const result = await register(formData).unwrap();
      
      // Mettre à jour l'utilisateur avec le statut de vérification d'identité
      const userWithIdentity = {
        ...result.user,
        identityVerified,
      };
      
      // Les tokens sont automatiquement stockés dans SecureStore via onQueryStarted
      // Mettre à jour le state Redux avec les tokens et l'utilisateur
      dispatch(setTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }));
      dispatch(setUser(userWithIdentity));

      await triggerSignupSuccessNotification(result.user?.name || firstName || lastName || phone);
      
      router.replace('/(tabs)');
    } catch (error: any) {
      showErrorModal(error?.data?.message || 'Erreur lors de l\'inscription', 'Impossible de finaliser l\'inscription');
    }
  };

  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setSmsCode(['', '', '', '', '', '']);
    setFullName('');
    setFirstName('');
    setLastName('');
    setEmail('');
    // setIdNumber('');
    setRole('passenger');
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
    setVehicleModalVisible(false);
  };

  return (
    <>
    <SafeAreaView style={styles.container}>
      {/* Header avec toggle et progression */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {/* Toggle Connexion/Inscription */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'login' && styles.toggleButtonActive]}
              onPress={() => {
                setMode('login');
                resetForm();
              }}
            >
              <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>
                Connexion
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'signup' && styles.toggleButtonActive]}
              onPress={() => {
                setMode('signup');
                resetForm();
              }}
            >
              <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>
                Inscription
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
        <View style={styles.progressBar}>
          <Animated.View
            style={[styles.progressFill, { width: `${progress}%` }]}
          />
        </View>
        {motivationalMessage && (
          <Text style={styles.motivationalText}>{motivationalMessage}</Text>
        )}
        {canGoBack && (
          <TouchableOpacity style={styles.previousStepButton} onPress={handlePreviousStep}>
            <Ionicons name="arrow-back" size={18} color={Colors.primary} />
            <Text style={styles.previousStepText}>Étape précédente</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Étape 1: Numéro de téléphone */}
        {step === 'phone' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="call" size={48} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>
                {mode === 'login' ? 'Bon retour sur ZWANGA' : 'Bienvenue sur ZWANGA'}
              </Text>
              <Text style={styles.stepSubtitle}>
                {mode === 'login' 
                  ? 'Entrez votre numéro de téléphone pour vous connecter'
                  : 'Entrez votre numéro de téléphone pour commencer'}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Numéro de téléphone</Text>
              <TextInput
                style={styles.input}
                placeholder="+243 xxx xxx xxx"
                placeholderTextColor={Colors.gray[500]}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, phone.length >= 10 ? styles.buttonPrimary : styles.buttonDisabled]}
              onPress={handlePhoneSubmit}
              disabled={phone.length < 10}
            >
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 2: Code SMS */}
        {step === 'sms' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleYellow]}>
                <Ionicons name="chatbox" size={48} color={Colors.secondary} />
              </View>
              <Text style={styles.stepTitle}>Vérification SMS</Text>
              <Text style={styles.stepSubtitle}>
                Entrez le code à 6 chiffres envoyé au {phone}
              </Text>
            </View>

            <View style={styles.smsCodeContainer}>
              {smsCode.map((digit, index) => (
                <TextInput
                  key={`sms-input-${index}`}
                  ref={(ref) => {
                    smsInputRefs.current[index] = ref;
                  }}
                  style={styles.smsInput}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={1}
                  value={digit}
                  onChangeText={(text) => handleSmsInputChange(text, index)}
                  onKeyPress={(event) => handleSmsKeyPress(event, index)}
                  selectTextOnFocus
                  importantForAutofill="no"
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, smsCode.join('').length === 6 ? styles.buttonPrimary : styles.buttonDisabled]}
              onPress={handleSmsSubmit}
              disabled={smsCode.join('').length !== 6}
            >
              <Text style={styles.buttonText}>
                {mode === 'login' ? 'Se connecter' : 'Vérifier'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>Renvoyer le code</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 3: KYC (uniquement pour l'inscription) */}
        {step === 'kyc' && mode === 'signup' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleBlue]}>
                <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
              </View>
              <Text style={styles.stepTitle}>Vérification d'identité</Text>
              <Text style={styles.stepSubtitle}>
                Pour votre sécurité et celle des autres utilisateurs
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Votre prénom</Text>
              <TextInput
                style={styles.input}
                placeholder="Jean"
                placeholderTextColor={Colors.gray[500]}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nom de famille</Text>
              <TextInput
                style={styles.input}
                placeholder="Mukendi"
                placeholderTextColor={Colors.gray[500]}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>

            {/* <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
              <Text style={styles.label}>Numéro de carte d'identité</Text>
              <TextInput
                style={styles.input}
                placeholder="1-XXXX-XXXXXXX-XX"
                placeholderTextColor={Colors.gray[500]}
                value={idNumber}
                onChangeText={setIdNumber}
              />
            </View> */}

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleKYCSubmit}
            >
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>

            {/* <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleSkipKYC}
            >
              <Text style={styles.buttonSecondaryText}>Passer cette étape</Text>
            </TouchableOpacity> */}
          </Animated.View>
        )}

        {/* Étape 4: Vérification d'identité (uniquement pour l'inscription) */}
        {step === 'identity' && mode === 'signup' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <IdentityVerification
              onComplete={handleIdentityComplete}
              onSkip={handleSkipIdentity}
              canSkip={true}
            />
          </Animated.View>
        )}

        {/* Étape 5: Configuration du profil (uniquement pour l'inscription) */}
        {step === 'profile' && mode === 'signup' && (
          <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <Text style={styles.stepSubtitle}>
                Dites-nous comment vous utiliserez ZWANGA
              </Text>
            </View>

            {/* Section Photo de profil */}
            <View style={styles.profilePictureContainer}>
              <Text style={styles.label}>Photo de profil (optionnel)</Text>
              <TouchableOpacity
                style={styles.profilePictureButton}
                onPress={handleSelectProfilePicture}
              >
                {profilePicture ? (
                  <Image source={{ uri: profilePicture }} style={styles.profilePictureImage} />
                ) : (
                  <View style={styles.profilePicturePlaceholder}>
                    <Ionicons name="camera" size={32} color={Colors.gray[400]} />
                  </View>
                )}
                <View style={styles.profilePictureEditBadge}>
                  <Ionicons name="camera" size={16} color={Colors.white} />
                </View>
              </TouchableOpacity>
              <Text style={styles.profilePictureHint}>
                Ajoutez une photo pour que les autres utilisateurs vous reconnaissent
              </Text>
            </View>

            <View style={styles.roleContainer}>
              <Text style={styles.label}>Je souhaite être:</Text>
              
              <TouchableOpacity
                style={[styles.roleCard, role === 'passenger' && styles.roleCardActive]}
                onPress={() => {
                  setRole('passenger');
                  setVehicleType(null);
                  setVehicleBrand('');
                  setVehicleModel('');
                  setVehicleColor('');
                  setVehiclePlate('');
                  setVehicleModalVisible(false);
                }}
              >
                <View style={[styles.roleIcon, role === 'passenger' && styles.roleIconActive]}>
                  <Ionicons name="person" size={24} color={role === 'passenger' ? Colors.white : Colors.gray[600]} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleTitle}>Passager</Text>
                  <Text style={styles.roleSubtitle}>Je cherche des trajets</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'driver' && styles.roleCardActive]}
                onPress={() => setRole('driver')}
              >
                <View style={[styles.roleIcon, role === 'driver' && styles.roleIconActive]}>
                  <Ionicons name="car" size={24} color={role === 'driver' ? Colors.white : Colors.gray[600]} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleTitle}>Conducteur</Text>
                  <Text style={styles.roleSubtitle}>Je propose des trajets</Text>
                </View>
              </TouchableOpacity>

              {/* <TouchableOpacity
                style={[styles.roleCard, role === 'both' && styles.roleCardActive, { marginBottom: Spacing.xl }]}
                onPress={() => setRole('both')}
              >
                <View style={[styles.roleIcon, role === 'both' && styles.roleIconActive]}>
                  <Ionicons name="swap-horizontal" size={24} color={role === 'both' ? Colors.white : Colors.gray[600]} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleTitle}>Les deux</Text>
                  <Text style={styles.roleSubtitle}>Je propose et je cherche des trajets</Text>
                </View>
              </TouchableOpacity> */}
            </View>

            {(role === 'driver' || role === 'both') && (
              <>
                <View style={styles.vehicleSection}>
                  <Text style={styles.label}>Choisissez votre véhicule</Text>
                  <View style={styles.vehicleOptions}>
                    {vehicleOptions.map((option) => {
                      const isActive = vehicleType === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.vehicleCard, isActive && styles.vehicleCardActive]}
                          onPress={() => setVehicleType(option.id)}
                        >
                          <View style={[styles.vehicleCardIcon, isActive && styles.vehicleCardIconActive]}>
                            <Ionicons
                              name={option.icon}
                              size={20}
                              color={isActive ? Colors.white : Colors.gray[600]}
                            />
                          </View>
                          <View style={styles.vehicleCardContent}>
                            <Text style={[styles.vehicleCardTitle, isActive && styles.vehicleCardTitleActive]}>
                              {option.label}
                            </Text>
                            <Text style={[styles.vehicleCardSubtitle, isActive && styles.vehicleCardSubtitleActive]}>
                              {option.description}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.vehicleDetailsTrigger}
                  onPress={() => setVehicleModalVisible(true)}
                  activeOpacity={0.9}
                >
                  <View style={styles.vehicleDetailsTriggerIcon}>
                    <Ionicons name="construct" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.vehicleDetailsTriggerContent}>
                    <Text style={styles.vehicleDetailsTriggerTitle}>Informations du véhicule</Text>
                    <Text style={styles.vehicleDetailsTriggerSubtitle}>
                      {vehicleBrand && vehicleModel && vehicleColor && vehiclePlate
                        ? `${vehicleBrand} ${vehicleModel} • ${vehicleColor} • ${vehiclePlate}`
                        : 'Ajoutez la marque, le modèle, la couleur et la plaque'}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={20} color={Colors.gray[500]} />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary, isRegistering && styles.buttonLoading]}
              onPress={handleProfileSubmit}
              disabled={isRegistering}
            >
              {isRegistering ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>Terminer</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>

    <Modal
      visible={vehicleModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setVehicleModalVisible(false)}
    >
      <View style={styles.vehicleModalOverlay}>
        <View style={styles.vehicleModalCard}>
          <ScrollView
            contentContainerStyle={styles.vehicleModalContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.vehicleModalTitle}>Informations du véhicule</Text>
            <Text style={styles.vehicleModalSubtitle}>
              Indiquez les détails de votre véhicule afin d'inspirer confiance aux passagers.
            </Text>
            <View style={styles.vehicleDetailsForm}>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Marque</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Ex : Toyota"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleBrand}
                  onChangeText={setVehicleBrand}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Modèle</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Ex : Corolla 2018"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Couleur</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Ex : Noir"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleColor}
                  onChangeText={setVehicleColor}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Plaque d'immatriculation</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Ex : XYZ 1234"
                  placeholderTextColor={Colors.gray[400]}
                  autoCapitalize="characters"
                  value={vehiclePlate}
                  onChangeText={(text) => setVehiclePlate(text.toUpperCase())}
                />
              </View>
            </View>
            <View style={styles.vehicleModalActions}>
              <TouchableOpacity
                style={[styles.vehicleModalButton, styles.vehicleModalButtonSecondary]}
                onPress={() => setVehicleModalVisible(false)}
              >
                <Text style={styles.vehicleModalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.vehicleModalButton, styles.vehicleModalButtonPrimary]}
                onPress={() => setVehicleModalVisible(false)}
              >
                <Text style={styles.vehicleModalButtonPrimaryText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    <Modal
      visible={errorModal.visible}
      transparent
      animationType="fade"
      onRequestClose={hideErrorModal}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconCircle}>
            <Ionicons name="alert-circle" size={36} color={Colors.white} />
          </View>
          <Text style={styles.modalTitle}>
            {errorModal.title || 'Une erreur est survenue'}
          </Text>
          <Text style={styles.modalMessage}>{errorModal.message}</Text>
          <TouchableOpacity style={styles.modalButton} onPress={hideErrorModal}>
            <Text style={styles.modalButtonText}>Compris</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  toggleButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  toggleButtonActive: {
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  toggleText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[600],
  },
  toggleTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  progressText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  motivationalText: {
    fontSize: FontSizes.sm,
    color: Colors.success,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  previousStepButton: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  previousStepText: {
    marginLeft: Spacing.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
  },
  stepContainer: {
    marginTop: Spacing.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircleYellow: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  iconCircleBlue: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
  },
  iconCircleGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  stepTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  button: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: Colors.primary,
  },
  buttonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  buttonLoading: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  buttonSecondaryText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  smsCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  smsInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    textAlign: 'center',
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  linkButton: {
    paddingVertical: Spacing.md,
  },
  linkText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  roleContainer: {
    marginBottom: Spacing.xl,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.05)',
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    backgroundColor: Colors.gray[200],
  },
  roleIconActive: {
    backgroundColor: Colors.primary,
  },
  roleContent: {
    flex: 1,
  },
  roleTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  roleSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  vehicleSection: {
    marginBottom: Spacing.xl,
  },
  vehicleOptions: {},
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    marginBottom: Spacing.sm,
  },
  vehicleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0D',
  },
  vehicleCardIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  vehicleCardIconActive: {
    backgroundColor: Colors.primary,
  },
  vehicleCardContent: {
    flex: 1,
  },
  vehicleCardTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  vehicleCardTitleActive: {
    color: Colors.primary,
  },
  vehicleCardSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  vehicleCardSubtitleActive: {
    color: Colors.gray[700],
  },
  vehicleDetailsTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    ...CommonStyles.shadowSm,
  },
  vehicleDetailsTriggerIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  vehicleDetailsTriggerContent: {
    flex: 1,
  },
  vehicleDetailsTriggerTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  vehicleDetailsTriggerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  vehicleDetailsForm: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  vehicleInputGroup: {},
  vehicleInputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  vehicleInput: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    backgroundColor: Colors.white,
  },
  vehicleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  vehicleModalCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxHeight: '85%',
  },
  vehicleModalContent: {
    paddingBottom: Spacing.md,
  },
  vehicleModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  vehicleModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  vehicleModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  vehicleModalButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  vehicleModalButtonSecondary: {
    backgroundColor: Colors.gray[100],
  },
  vehicleModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  vehicleModalButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  vehicleModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  profilePictureContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  profilePictureButton: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  profilePicturePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.gray[300],
    borderStyle: 'dashed',
  },
  profilePictureImage: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.full,
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  profilePictureEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
  },
  profilePictureHint: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    gap: Spacing.lg,
    ...(CommonStyles.shadowLg || CommonStyles.shadowSm),
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.danger,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
});
