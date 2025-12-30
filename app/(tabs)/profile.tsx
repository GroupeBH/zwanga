import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useGetKycStatusQuery, useGetProfileSummaryQuery, useSendPhoneVerificationOtpMutation, useUpdatePinMutation, useUpdatePinWithOtpMutation, useUploadKycMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useGetMyTripRequestsQuery, useGetMyDriverOffersQuery } from '@/store/api/tripRequestApi';
import { useCreateVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { logout } from '@/store/slices/authSlice';
import type { Vehicle } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const { changeProfilePhoto, isUploading } = useProfilePhoto();
  const { showDialog } = useDialog();
  const [refreshing, setRefreshing] = useState(false);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [kycFrontImage, setKycFrontImage] = useState<string | null>(null);
  const [kycBackImage, setKycBackImage] = useState<string | null>(null);
  const [kycSelfieImage, setKycSelfieImage] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<'oldPin' | 'otp' | 'newPin'>('oldPin');
  const [forgotPinMode, setForgotPinMode] = useState(false); // true si l'utilisateur a oublié son PIN
  const [oldPin, setOldPin] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '']);
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const oldPinInputRef = useRef<TextInput | null>(null);
  const otpInputRefs = useRef<Array<TextInput | null>>([]);
  const pinInputRef = useRef<TextInput | null>(null);
  const pinConfirmInputRef = useRef<TextInput | null>(null);
  const {
    data: profileSummary,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useGetProfileSummaryQuery();
  const {
    data: kycStatus,
    isLoading: kycLoading,
    refetch: refetchKycStatus,
  } = useGetKycStatusQuery();
  const {
    data: vehicles,
    isLoading: vehiclesLoading,
    refetch: refetchVehicles,
  } = useGetVehiclesQuery();
  const [createVehicle, { isLoading: creatingVehicle }] = useCreateVehicleMutation();
  const [uploadKyc, { isLoading: uploadingKyc }] = useUploadKycMutation();
  const [updatePin, { isLoading: isUpdatingPin }] = useUpdatePinMutation();
  const [updatePinWithOtp, { isLoading: isUpdatingPinWithOtp }] = useUpdatePinWithOtpMutation();
  const [sendPhoneVerificationOtp] = useSendPhoneVerificationOtpMutation();
  const [verifyPhoneOtp] = useVerifyPhoneOtpMutation();
  const { data: myTripRequests = [] } = useGetMyTripRequestsQuery();
  const { data: myDriverOffers = [] } = useGetMyDriverOffersQuery();

  const currentUser = profileSummary?.user ?? user;
  const stats = profileSummary?.stats;
  const vehicleList: Vehicle[] = vehicles ?? [];

  const isKycApproved = kycStatus?.status === 'approved';
  const isKycPending = kycStatus?.status === 'pending';
  const isKycRejected = kycStatus?.status === 'rejected';
  const isKycBusy = kycSubmitting || uploadingKyc;
  const isKycActionDisabled = isKycBusy || isKycApproved;

  console.log("kycstatus:", kycStatus)
  const userId = currentUser?.id ?? '';
  const { data: reviews } = useGetReviewsQuery(userId, {
    skip: !userId,
  });
  const { data: avgRatingData } = useGetAverageRatingQuery(userId, {
    skip: !userId,
  });
  const reviewCount = reviews?.length ?? 0;
  const reviewAverage = useMemo(() => {
    if (avgRatingData?.averageRating !== undefined) {
      return avgRatingData.averageRating;
    }
    if (!reviews || reviews.length === 0) {
      return currentUser?.rating ?? 0;
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return total / reviews.length;
  }, [avgRatingData?.averageRating, reviews, currentUser?.rating]);
  const featuredReviews = useMemo(() => (reviews ?? []).slice(0, 3), [reviews]);
  const { shouldShow: shouldShowProfileGuide, complete: completeProfileGuide } =
    useTutorialGuide('profile_screen');
  const [profileGuideVisible, setProfileGuideVisible] = useState(false);

  useEffect(() => {
    if (shouldShowProfileGuide) {
      setProfileGuideVisible(true);
    }
  }, [shouldShowProfileGuide]);

  const handleDismissProfileGuide = () => {
    setProfileGuideVisible(false);
    completeProfileGuide();
  };

  // Calculer les statistiques détaillées pour les demandes
  const tripRequestsStats = useMemo(() => {
    const totalRequests = myTripRequests.length;
    const activeRequests = myTripRequests.filter(
      (req) => req.status === 'pending' || req.status === 'offers_received'
    ).length;
    const requestsWithOffers = myTripRequests.filter(
      (req) => req.status === 'offers_received' && (req.offers?.length || 0) > 0
    ).length;
    const completedRequests = myTripRequests.filter(
      (req) => req.status === 'driver_selected'
    ).length;
    return { totalRequests, activeRequests, requestsWithOffers, completedRequests };
  }, [myTripRequests]);

  // Calculer les statistiques détaillées pour les offres
  const offersStats = useMemo(() => {
    const totalOffers = myDriverOffers.length;
    const pendingOffers = myDriverOffers.filter((offer) => offer.status === 'pending').length;
    const acceptedOffers = myDriverOffers.filter((offer) => offer.status === 'accepted').length;
    const rejectedOffers = myDriverOffers.filter((offer) => offer.status === 'rejected').length;
    return { totalOffers, pendingOffers, acceptedOffers, rejectedOffers };
  }, [myDriverOffers]);

  const derivedStats = useMemo(
    () => [
      {
        label: 'Trajets publiés',
        value: stats?.tripsAsDriver ?? currentUser?.totalTrips ?? 0,
        color: Colors.primary,
      },
      {
        label: 'Réservations (passager)',
        value: stats?.bookingsAsPassenger ?? 0,
        color: Colors.secondary,
      },
      {
        label: 'Réservations (conducteur)',
        value: stats?.bookingsAsDriver ?? 0,
        color: Colors.info,
      },
      {
        label: 'Avis reçus',
        value: reviewCount,
        color: Colors.warning,
      },
    ],
    [currentUser?.totalTrips, stats, reviewCount],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), refetchVehicles(), refetchKycStatus()]);
    } finally {
      setRefreshing(false);
    }
  };

  const resetVehicleForm = () => {
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
  };

  const resetKycForm = () => {
    setKycFrontImage(null);
    setKycBackImage(null);
    setKycSelfieImage(null);
  };

  useEffect(() => {
    if (!kycModalVisible) {
      resetKycForm();
      setKycSubmitting(false);
    }
  }, [kycModalVisible]);

  const handleAddVehicle = async () => {
    if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehiclePlate.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Champs requis',
        message: 'Merci de renseigner la marque, le modèle, la couleur et la plaque.',
      });
      return;
    }

    try {
      await createVehicle({
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: vehiclePlate.trim(),
      }).unwrap();
      setVehicleModalVisible(false);
      resetVehicleForm();
      await Promise.all([refetchVehicles(), refetchProfile()]);
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible d\’ajouter le véhicule pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleOpenKycModal = () => {
    if (isKycApproved) {
      showDialog({
        variant: 'info',
        title: 'KYC validé',
        message: 'Vos documents sont déjà vérifiés. Contactez notre support si vous devez les modifier.',
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          { label: 'Support', variant: 'primary', onPress: () => router.push('/support') },
        ],
      });
      return;
    }
    setKycModalVisible(true);
  };

  const handleCloseKycModal = () => {
    if (kycSubmitting || uploadingKyc) {
      return;
    }
    setKycModalVisible(false);
  };

  const buildKycFormData = (files?: Partial<KycCaptureResult>) => {
    const formData = new FormData();
    const appendFile = (field: 'cniFront' | 'cniBack' | 'selfie', uri: string | null | undefined) => {
      if (!uri) return;
      const extensionMatch = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
      const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : extension === 'heic'
              ? 'image/heic'
              : 'image/jpeg';
      formData.append(field, {
        uri,
        type: mimeType,
        name: `${field}-${Date.now()}.${extension === 'jpg' ? 'jpg' : extension}`,
      } as any);
    };

    appendFile('cniFront', files?.front ?? kycFrontImage);
    appendFile('cniBack', files?.back ?? kycBackImage);
    appendFile('selfie', files?.selfie ?? kycSelfieImage);

    return formData;
  };

  const handleSubmitKyc = async (documents?: Partial<KycCaptureResult>) => {
    const front = documents?.front ?? kycFrontImage;
    const back = documents?.back ?? kycBackImage;
    const selfie = documents?.selfie ?? kycSelfieImage;

    if (!front || !back || !selfie) {
      showDialog({
        variant: 'warning',
        title: 'Documents requis',
        message: 'Merci de fournir les deux faces de votre pièce ainsi qu\'un selfie.',
      });
      return;
    }
    try {
      setKycSubmitting(true);
      const formData = buildKycFormData({ front, back, selfie });
      const result = await uploadKyc(formData).unwrap();
      setKycModalVisible(false);
      
      // Refetch immédiatement pour obtenir le statut mis à jour
      await Promise.all([refetchKycStatus(), refetchProfile()]);
      
      // Vérifier le statut retourné par le backend
      const kycStatusAfterUpload = result?.status;
      
      if (kycStatusAfterUpload === 'approved') {
        // KYC approuvé immédiatement (validation automatique réussie)
        showDialog({
          variant: 'success',
          title: 'KYC validé avec succès !',
          message: 'Votre identité a été vérifiée automatiquement. Vous pouvez maintenant accéder à toutes les fonctionnalités de l\'application.',
        });
      } else if (kycStatusAfterUpload === 'rejected') {
        // KYC rejeté (validation automatique échouée)
        const rejectionReason = result?.rejectionReason || 'Votre demande KYC a été rejetée.';
        showDialog({
          variant: 'danger',
          title: 'KYC rejeté',
          message: rejectionReason,
        });
      } else {
        // KYC en attente (validation manuelle requise)
        showDialog({
          variant: 'success',
          title: 'Documents envoyés',
          message: 'Vos documents sont en cours de vérification. Nous vous informerons dès que la vérification sera terminée.',
        });
      }
    } catch (error: any) {
      // Gérer les erreurs détaillées du backend
      let errorMessage = error?.data?.message ?? error?.error ?? 'Impossible de soumettre les documents pour le moment.';
      
      // Si le message est une chaîne, la traiter directement
      if (typeof errorMessage === 'string') {
        // Le backend peut retourner des messages multi-lignes avec des détails
        errorMessage = errorMessage;
      } else if (Array.isArray(errorMessage)) {
        errorMessage = errorMessage.join('\n');
      }
      
      showDialog({
        variant: 'danger',
        title: 'Erreur KYC',
        message: errorMessage,
      });
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleKycWizardComplete = async (payload: KycCaptureResult) => {
    setKycFrontImage(payload.front);
    setKycBackImage(payload.back);
    setKycSelfieImage(payload.selfie);
    await handleSubmitKyc(payload);
  };

  useEffect(() => {
    if (isKycApproved && kycModalVisible) {
      setKycModalVisible(false);
    }
  }, [isKycApproved, kycModalVisible]);

  const badges = [
    ...(currentUser?.role === 'driver'
      ? [{ icon: 'car', color: Colors.primary, label: 'Conducteur' }]
      : []),
    ...(isKycApproved
      ? [{ icon: 'shield-checkmark', color: Colors.success, label: 'KYC validé' }]
      : []),
  ];

  // Handlers pour la modification du PIN
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
      await sendPhoneVerificationOtp({ phone: currentUser?.phone || '', context: 'update' }).unwrap();
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
        message: error?.data?.message || 'Erreur lors de l\'envoi du code',
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
      showDialog({ variant: 'danger', title: 'Code incomplet', message: 'Veuillez entrer le code complet (5 chiffres)' });
      return;
    }

    try {
      await verifyPhoneOtp({ phone: currentUser?.phone || '', otp: code }).unwrap();
      setPinStep('newPin');
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Code invalide',
        message: error?.data?.message || 'Code OTP invalide ou expiré',
      });
    }
  };

  // Handler pour ancien PIN - champ texte normal
  const handleOldPinChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 4); // Max 4 chiffres
    setOldPin(sanitized);
  };

  const handleVerifyOldPin = () => {
    if (oldPin.length !== 4) {
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer votre code PIN actuel (4 chiffres)' });
      return;
    }
    // Passer à l'étape de saisie du nouveau PIN
    setPinStep('newPin');
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 100);
  };

  // Handlers pour nouveau PIN - champs texte normaux
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
      showDialog({ variant: 'danger', title: 'PIN incomplet', message: 'Veuillez entrer un PIN à 4 chiffres' });
      return;
    }
    
    if (newPinConfirm.length !== 4) {
      showDialog({ variant: 'danger', title: 'Confirmation incomplète', message: 'Veuillez confirmer votre PIN' });
      return;
    }
    
    if (newPin !== newPinConfirm) {
      showDialog({ variant: 'danger', title: 'PIN non correspondant', message: 'Les deux codes PIN ne correspondent pas' });
      setNewPinConfirm('');
      pinConfirmInputRef.current?.focus();
      return;
    }

    if (!forgotPinMode && oldPin === newPin) {
      showDialog({ variant: 'danger', title: 'PIN identique', message: 'Le nouveau PIN doit être différent de l\'ancien PIN' });
      return;
    }

    try {
      if (forgotPinMode) {
        // Utiliser updatePinWithOtp si l'utilisateur a oublié son PIN
        await updatePinWithOtp({
          phone: currentUser?.phone || '',
          otp: otpCode.join(''),
          newPin: newPin,
        }).unwrap();
      } else {
        // Utiliser updatePin avec l'ancien PIN
        await updatePin({
          oldPin: oldPin,
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
        message: error?.data?.message || 'Erreur lors de la modification du PIN',
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

  // Calculer les compteurs pour les demandes de trajet
  const tripRequestsCount = useMemo(() => {
    const activeRequests = myTripRequests.filter(
      (req) => req.status === 'pending' || req.status === 'offers_received'
    );
    return activeRequests.length;
  }, [myTripRequests]);

  const tripRequestsWithOffersCount = useMemo(() => {
    return myTripRequests.filter(
      (req) => req.status === 'offers_received' && (req.offers?.length || 0) > 0
    ).length;
  }, [myTripRequests]);

  // Calculer les compteurs pour les offres
  const pendingOffersCount = useMemo(() => {
    return myDriverOffers.filter((offer) => offer.status === 'pending').length;
  }, [myDriverOffers]);

  const acceptedOffersCount = useMemo(() => {
    return myDriverOffers.filter((offer) => offer.status === 'accepted').length;
  }, [myDriverOffers]);

  const menuItems = [
    { icon: 'person-outline', label: 'Modifier le profil', route: '/edit-profile' },
    { icon: 'lock-closed-outline', label: 'Modifier le code PIN', route: null, onPress: handleOpenPinModal },
    { icon: 'star-outline', label: 'Lieux favoris', route: '/favorite-locations' },
    {
      icon: 'document-text-outline',
      label: 'Mes demandes de trajet',
      route: '/my-requests',
      badge: tripRequestsCount > 0 ? tripRequestsCount : undefined,
      badgeColor: tripRequestsWithOffersCount > 0 ? Colors.info : Colors.warning,
    },
    ...(currentUser?.isDriver
      ? [
          { icon: 'list-outline', label: 'Demandes disponibles', route: '/requests' },
          {
            icon: 'briefcase-outline',
            label: 'Mes offres',
            route: '/my-offers',
            badge: pendingOffersCount > 0 ? pendingOffersCount : acceptedOffersCount > 0 ? acceptedOffersCount : undefined,
            badgeColor: pendingOffersCount > 0 ? Colors.warning : acceptedOffersCount > 0 ? Colors.success : undefined,
          },
        ]
      : []),
    { icon: 'notifications-outline', label: 'Notifications', route: '/notifications' },
    { icon: 'settings-outline', label: 'Paramètres', route: '/settings' },
    { icon: 'help-circle-outline', label: 'Aide & Support', route: '/support' },
  ];

  const handleLogout = () => {
    dispatch(logout());
    // router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Mon Profil</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* Infos utilisateur */}
          <View style={styles.userInfo}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={changeProfilePhoto}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              {currentUser?.profilePicture || user?.avatar ? (
                <Image
                  source={{ uri: currentUser?.profilePicture ?? user?.avatar ?? undefined }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarEmoji}>👤</Text>
                </View>
              )}
              {isUploading && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="small" color={Colors.white} />
                </View>
                // ) : (
                //   <View style={styles.editBadge}>
                //     <Ionicons name="camera" size={14} color={Colors.white} />
                //   </View>
                // )}}
              )}
              {currentUser?.identityVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={16} color={Colors.white} />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.userName}>{currentUser?.name || 'Utilisateur'}</Text>
            <Text style={styles.userPhone}>{currentUser?.phone || ''}</Text>

            {/* Bouton pour modifier la photo de profil */}
            <TouchableOpacity
              style={styles.changePhotoButton}
              onPress={changeProfilePhoto}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="camera" size={16} color={Colors.white} />
                  <Text style={styles.changePhotoButtonText}>Modifier la photo</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Rating */}
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={20} color={Colors.secondary} />
              <Text style={styles.ratingText}>{(currentUser?.rating ?? 0).toFixed(1)}</Text>
              <Text style={styles.ratingSubtext}>{currentUser?.totalTrips ?? 0} trajets</Text>
            </View>
            {profileLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.white} size="small" />
                <Text style={styles.loadingRowText}>Synchronisation du profil…</Text>
              </View>
            )}
          </View>
        </View>

        {/* Réservations - Mise en avant */}
        <View style={styles.bookingsContainer}>
          <TouchableOpacity
            style={styles.bookingsCard}
            onPress={() => router.push('/bookings')}
            activeOpacity={0.7}
          >
            <View style={styles.bookingsIconContainer}>
              <Ionicons name="bookmark" size={28} color={Colors.primary} />
            </View>
            <View style={styles.bookingsContent}>
              <Text style={styles.bookingsTitle}>Mes réservations</Text>
              <Text style={styles.bookingsSubtitle}>
                {stats?.bookingsAsPassenger ?? 0} en tant que passager · {stats?.bookingsAsDriver ?? 0} en tant que conducteur
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Demandes de trajet - Mise en avant */}
        <View style={styles.bookingsContainer}>
          <TouchableOpacity
            style={styles.bookingsCard}
            onPress={() => router.push('/my-requests')}
            activeOpacity={0.7}
          >
            <View style={styles.bookingsIconContainer}>
              <Ionicons name="document-text" size={28} color={Colors.warning} />
            </View>
            <View style={styles.bookingsContent}>
              <Text style={styles.bookingsTitle}>Mes demandes de trajet</Text>
              <Text style={styles.bookingsSubtitle}>
                {tripRequestsStats.activeRequests} active{tripRequestsStats.activeRequests > 1 ? 's' : ''} · {tripRequestsStats.requestsWithOffers} avec offre{tripRequestsStats.requestsWithOffers > 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.warning} />
          </TouchableOpacity>
        </View>

        {/* Offres - Mise en avant (uniquement pour les drivers) */}
        {currentUser?.isDriver && (
          <View style={styles.bookingsContainer}>
            <TouchableOpacity
              style={styles.bookingsCard}
              onPress={() => router.push('/my-offers')}
              activeOpacity={0.7}
            >
              <View style={styles.bookingsIconContainer}>
                <Ionicons name="briefcase" size={28} color={Colors.info} />
              </View>
              <View style={styles.bookingsContent}>
                <Text style={styles.bookingsTitle}>Mes offres</Text>
                <Text style={styles.bookingsSubtitle}>
                  {offersStats.pendingOffers} en attente · {offersStats.acceptedOffers} acceptée{offersStats.acceptedOffers > 1 ? 's' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.info} />
            </TouchableOpacity>
          </View>
        )}

        {/* Statistiques */}
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Statistiques</Text>
            <View style={styles.statsGrid}>
              {derivedStats.map((stat, index) => {
                const totalStats = derivedStats.length;
                const itemsPerRow = 2;
                const rowIndex = Math.floor(index / itemsPerRow);
                const totalRows = Math.ceil(totalStats / itemsPerRow);
                const isLastRow = rowIndex === totalRows - 1;
                const isRightColumn = index % itemsPerRow === 0;
                
                return (
                  <View
                    key={stat.label}
                    style={[
                      styles.statItem,
                      isRightColumn && styles.statItemBorderRight,
                      !isLastRow && styles.statItemBorderBottom,
                    ]}
                  >
                    <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Badges */}
        {badges.length > 0 && (
          <View style={styles.badgesContainer}>
            <View style={styles.badgesCard}>
              <Text style={styles.badgesTitle}>Badges</Text>
              <View style={styles.badgesList}>
                {badges.map((badge, index) => (
                  <Animated.View
                    key={`${badge.label}-${index}`}
                    entering={FadeInDown.delay(index * 100)}
                    style={styles.badgeItem}
                  >
                    <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                      <Ionicons name={badge.icon as any} size={32} color={badge.color} />
                    </View>
                    <Text style={styles.badgeLabel}>{badge.label}</Text>
                  </Animated.View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Reviews summary */}
        <View style={styles.reviewsContainer}>
          <View style={styles.reviewsCard}>
            <View style={styles.reviewsHeader}>
              <View>
                <Text style={styles.reviewsTitle}>Vos avis reçus</Text>
                <Text style={styles.reviewsSubtitle}>
                  {reviewCount} avis · note moyenne {reviewAverage.toFixed(1)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.reviewsLinkButton, reviewCount === 0 && styles.reviewsLinkButtonDisabled]}
                onPress={() => setReviewsModalVisible(true)}
                disabled={reviewCount === 0}
              >
                <Text
                  style={[
                    styles.reviewsLinkText,
                    reviewCount === 0 && styles.reviewsLinkTextDisabled,
                  ]}
                >
                  Voir tout
                </Text>
              </TouchableOpacity>
            </View>
            {reviewCount === 0 ? (
              <Text style={styles.reviewsEmptyText}>
                Vous n'avez pas encore reçu d'avis. Continuez à proposer des trajets sécurisés pour en
                recevoir.
              </Text>
            ) : (
              featuredReviews.map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <View>
                      <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
                      <Text style={styles.reviewDate}>
                        {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                      </Text>
                    </View>
                    <View style={styles.reviewRating}>
                      <Ionicons name="star" size={16} color={Colors.secondary} />
                      <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  {review.comment ? (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>

        {/* KYC */}
        <View style={styles.kycContainer}>
          <View style={styles.kycCard}>
            <View style={styles.kycHeader}>
              <View style={styles.kycHeaderLeft}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                <Text style={styles.kycTitle}>Statut KYC</Text>
              </View>
              {kycLoading && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>
            <Text
              style={[
                styles.kycStatusText,
                isKycApproved && styles.kycStatusApproved,
                isKycPending && styles.kycStatusPending,
              ]}
            >
              {isKycApproved
                ? 'Vérifié'
                : isKycPending
                  ? 'En cours de vérification'
                  : isKycRejected
                    ? 'Rejeté'
                    : 'Non vérifié'}
            </Text>
            {isKycRejected && kycStatus?.rejectionReason ? (
              <View style={styles.kycRejectionContainer}>
                <Text style={styles.kycRejectionTitle}>Motif du rejet :</Text>
                <Text style={styles.kycRejectionText}>
                  {kycStatus.rejectionReason}
                </Text>
              </View>
            ) : null}
            <Text style={styles.kycHelperText}>
              {isKycApproved
                ? 'Vos documents sont validés. Contactez le support pour toute mise à jour.'
                : isKycPending
                  ? 'Nous vérifions vos documents. Vous pouvez les actualiser en cas de changement.'
                  : 'Ajoutez vos documents officiels pour confirmer votre identité.'}
            </Text>
            <TouchableOpacity
              style={[
                styles.kycButton,
                isKycActionDisabled && styles.kycButtonDisabled,
                isKycApproved && styles.kycButtonLocked,
              ]}
              onPress={handleOpenKycModal}
              disabled={isKycActionDisabled}
            >
              {isKycBusy ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <>
                  <Text
                    style={[
                      styles.kycButtonText,
                      isKycApproved && styles.kycButtonTextMuted,
                    ]}
                  >
                    {isKycApproved ? 'Documents vérifiés' : 'Soumettre mes documents'}
                  </Text>
                  {!isKycApproved && <Ionicons name="chevron-forward" size={18} color={Colors.primary} />}
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.vehiclesContainer}>
          <View style={styles.vehiclesHeader}>
            <Text style={styles.sectionTitle}>Mes véhicules</Text>
            <TouchableOpacity
              style={styles.vehicleAddButton}
              onPress={() => {
                resetVehicleForm();
                setVehicleModalVisible(true);
              }}
            >
              <Ionicons name="add" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {vehiclesLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : vehicleList.length > 0 ? (
            vehicleList.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleItem}>
                <View>
                  <Text style={styles.vehicleTitle}>
                    {vehicle.brand} {vehicle.model}
                  </Text>
                  <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
                  <Text style={styles.vehicleColor}>{vehicle.color}</Text>
                </View>
                <View
                  style={[
                    styles.vehicleStatus,
                    { backgroundColor: vehicle.isActive ? Colors.success + '20' : Colors.gray[200] },
                  ]}
                >
                  <Text
                    style={[
                      styles.vehicleStatusText,
                      { color: vehicle.isActive ? Colors.success : Colors.gray[600] },
                    ]}
                  >
                    {vehicle.isActive ? 'Actif' : 'Inactif'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.vehicleEmptyText}>
              Aucun véhicule enregistré. Ajoutez-en un pour devenir conducteur.
            </Text>
          )}
        </View>

        {/* Menu */}
        <View style={styles.menuContainer}>
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index !== menuItems.length - 1 && styles.menuItemBorder,
                ]}
                onPress={() => {
                  if ((item as any).onPress) {
                    (item as any).onPress();
                  } else if (item.route) {
                    router.push(item.route as any);
                  }
                }}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={20} color={Colors.gray[600]} />
                </View>
                <Text style={styles.menuText}>{item.label}</Text>
                <View style={styles.menuRight}>
                  {(item as any).badge !== undefined && (item as any).badge > 0 && (
                    <View
                      style={[
                        styles.menuBadge,
                        { backgroundColor: (item as any).badgeColor || Colors.primary },
                      ]}
                    >
                      <Text style={styles.menuBadgeText}>{(item as any).badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bouton déconnexion */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <View style={styles.logoutButtonContent}>
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
              <Text style={styles.logoutText}>Déconnexion</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={vehicleModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.vehicleModalOverlay}
        >
          <Animated.View entering={FadeInDown} style={styles.vehicleModalCard}>
            <View style={styles.vehicleModalHeader}>
              <TouchableOpacity onPress={() => setVehicleModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.gray[500]} />
              </TouchableOpacity>
            </View>
            <View style={styles.vehicleModalHero}>
              <View style={styles.vehicleModalBadge}>
                <Ionicons name="car" size={28} color={Colors.white} />
              </View>
              <Text style={styles.vehicleModalTitle}>Ajouter un véhicule</Text>
              <Text style={styles.vehicleModalSubtitle}>
                Indiquez les détails exacts de votre véhicule pour rassurer vos passagers.
              </Text>
            </View>
            <ScrollView
              contentContainerStyle={styles.vehicleModalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Marque</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Toyota"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleBrand}
                  onChangeText={setVehicleBrand}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Modèle</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Corolla"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Couleur</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Bleu"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleColor}
                  onChangeText={setVehicleColor}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Plaque d'immatriculation</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="ABC-1234"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehiclePlate}
                  onChangeText={setVehiclePlate}
                />
              </View>
              <TouchableOpacity
                style={[styles.vehicleSaveButton, creatingVehicle && styles.vehicleSaveButtonDisabled]}
                onPress={handleAddVehicle}
                disabled={creatingVehicle}
              >
                {creatingVehicle ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.vehicleSaveButtonText}>Ajouter</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <KycWizardModal
        visible={kycModalVisible}
        onClose={handleCloseKycModal}
        isSubmitting={isKycBusy}
        initialValues={{
          front: kycFrontImage,
          back: kycBackImage,
          selfie: kycSelfieImage,
        }}
        onComplete={handleKycWizardComplete}
      />

      <Modal
        visible={reviewsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewsModalVisible(false)}
      >
        <View style={styles.reviewsModalOverlay}>
          <Animated.View entering={FadeInDown} style={styles.reviewsModalCard}>
            <View style={styles.reviewsModalHeader}>
              <Text style={styles.reviewsModalTitle}>Tous les avis</Text>
              <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.reviewsModalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              {(reviews ?? []).length === 0 ? (
                <Text style={styles.reviewsEmptyText}>
                  Vous n'avez pas encore reçu d'avis.
                </Text>
              ) : (
                reviews?.map((review) => (
                  <View key={review.id} style={styles.reviewItem}>
                    <View style={styles.reviewItemHeader}>
                      <View>
                        <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                        </Text>
                      </View>
                      <View style={styles.reviewRating}>
                        <Ionicons name="star" size={16} color={Colors.secondary} />
                        <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                    {review.comment ? (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Modal de modification du PIN */}
      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.pinModalOverlay}
        >
          <Animated.View entering={FadeInDown} style={styles.pinModalCard}>
            <View style={styles.pinModalHeader}>
              <Text style={styles.pinModalTitle}>Modifier le code PIN</Text>
              <TouchableOpacity onPress={() => setPinModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.gray[500]} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: Spacing.lg }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            {pinStep === 'oldPin' ? (
              <>
                <Text style={styles.pinModalSubtitle}>
                  Entrez votre mot de passe PIN actuel pour confirmer votre identité
                </Text>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Mot de passe PIN actuel</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={oldPinInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={oldPin}
                      onChangeText={handleOldPinChange}
                      placeholder="Entrez votre PIN actuel (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.pinModalButton, oldPin.length === 4 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled]}
                  onPress={handleVerifyOldPin}
                  disabled={oldPin.length !== 4}
                >
                  <Text style={styles.pinModalButtonText}>Continuer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pinModalForgotButton}
                  onPress={handleForgotPin}
                >
                  <Text style={styles.pinModalForgotText}>J'ai oublié mon PIN</Text>
                </TouchableOpacity>
              </>
            ) : pinStep === 'otp' ? (
              <>
                <Text style={styles.pinModalSubtitle}>
                  Un code de vérification a été envoyé au <Text style={{ fontWeight: 'bold' }}>{currentUser?.phone}</Text>
                </Text>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
                  <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>
                  <View style={styles.smsCodeContainer}>
                    {otpCode.map((digit, index) => (
                      <TextInput
                        key={`otp-${index}`}
                        ref={(ref) => { otpInputRefs.current[index] = ref; }}
                        style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
                        keyboardType="number-pad"
                        maxLength={1}
                        value={digit}
                        onChangeText={(text) => handleOtpInputChange(text, index)}
                        onKeyPress={(e) => handleOtpKeyPress(e, index)}
                      />
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.pinModalButton, otpCode.join('').length === 5 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled]}
                  onPress={handleVerifyOtpForPinChange}
                  disabled={otpCode.join('').length !== 5}
                >
                  <Text style={styles.pinModalButtonText}>Vérifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pinModalResendButton}
                  onPress={handleForgotPin}
                  disabled={isSendingOtp}
                >
                  {isSendingOtp ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.pinModalResendText}>Renvoyer le code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.pinModalSubtitle}>Créez un nouveau mot de passe PIN à 4 chiffres</Text>
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Nouveau mot de passe PIN</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                    <TextInput
                      ref={pinInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={newPin}
                      onChangeText={handleNewPinChange}
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
                      ref={pinConfirmInputRef}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      value={newPinConfirm}
                      onChangeText={handleNewPinConfirmChange}
                      placeholder="Confirmez votre nouveau PIN (4 chiffres)"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.pinModalButton, newPin.length === 4 && newPinConfirm.length === 4 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled]}
                  onPress={handleUpdatePin}
                  disabled={newPin.length !== 4 || newPinConfirm.length !== 4 || isUpdatingPin || isUpdatingPinWithOtp}
                >
                  {isUpdatingPin ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.pinModalButtonText}>Modifier le PIN</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <TutorialOverlay
        visible={profileGuideVisible}
        title="Votre espace Zwanga"
        message="Consultez vos statistiques, vos avis et vos documents KYC depuis cet écran. Glissez vers le bas pour tout rafraîchir."
        onDismiss={handleDismissProfileGuide}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  settingsButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
  },
  avatarEmoji: {
    fontSize: 48,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  userPhone: {
    color: Colors.white,
    opacity: 0.8,
    marginBottom: Spacing.lg,
    fontSize: FontSizes.base,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  ratingText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.lg,
    marginLeft: Spacing.sm,
  },
  ratingSubtext: {
    color: Colors.white,
    opacity: 0.8,
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  loadingRowText: {
    color: Colors.white,
    opacity: 0.85,
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  changePhotoButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  bookingsContainer: {
    paddingHorizontal: Spacing.xl,
    marginTop: -Spacing.xl,
    marginBottom: Spacing.lg,
  },
  bookingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...CommonStyles.shadowMd,
    borderWidth: 2,
    borderColor: Colors.primary + '20',
  },
  bookingsIconContainer: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingsContent: {
    flex: 1,
  },
  bookingsTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  bookingsSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  statsContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  statsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  statsTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.md,
    fontSize: FontSizes.base,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  statItemBorderRight: {
    borderRightWidth: 1,
    borderRightColor: Colors.gray[100],
  },
  statItemBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  badgesContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  badgesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  badgesTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.md,
    fontSize: FontSizes.base,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  badgesList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  badgeItem: {
    alignItems: 'center',
  },
  badgeIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  badgeLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  reviewsContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  reviewsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewsTitle: {
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  reviewsSubtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  reviewsLinkButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
  },
  reviewsLinkButtonDisabled: {
    backgroundColor: Colors.gray[200],
  },
  reviewsLinkText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  reviewsLinkTextDisabled: {
    color: Colors.gray[500],
  },
  reviewsEmptyText: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  reviewItem: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewAuthor: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  reviewDate: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reviewRatingText: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  reviewComment: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  reviewsModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    maxHeight: '85%',
    padding: Spacing.lg,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  reviewsModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsModalContent: {
    flex: 1,
  },
  kycContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  kycCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  kycHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  kycHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  kycTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  kycStatusText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  kycStatusApproved: {
    color: Colors.success,
  },
  kycStatusPending: {
    color: Colors.secondary,
  },
  kycRejectionContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  kycRejectionTitle: {
    color: Colors.danger,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.xs,
  },
  kycRejectionText: {
    color: Colors.danger,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  kycHelperText: {
    color: Colors.gray[600],
    marginBottom: Spacing.md,
    fontSize: FontSizes.sm,
  },
  kycButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  kycButtonDisabled: {
    opacity: 0.6,
  },
  kycButtonLocked: {
    borderColor: Colors.gray[300],
    backgroundColor: Colors.gray[100],
  },
  kycButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  kycButtonTextMuted: {
    color: Colors.gray[500],
  },
  vehiclesContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  vehiclesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  vehicleAddButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  vehicleTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehiclePlate: {
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  vehicleColor: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  vehicleStatus: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  vehicleStatusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  vehicleEmptyText: {
    textAlign: 'center',
    color: Colors.gray[600],
    marginTop: Spacing.sm,
  },
  vehicleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  vehicleModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '90%',
    ...CommonStyles.shadowLg,
  },
  vehicleModalHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  vehicleModalHero: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  vehicleModalBadge: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehicleModalSubtitle: {
    color: Colors.gray[600],
    marginBottom: Spacing.md,
    fontSize: FontSizes.sm,
  },
  vehicleModalContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  vehicleInputGroup: {
    gap: Spacing.xs,
  },
  vehicleInputLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  vehicleInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.gray[900],
    backgroundColor: Colors.gray[50],
  },
  vehicleSaveButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    ...CommonStyles.shadowMd,
  },
  vehicleSaveButtonDisabled: {
    opacity: 0.6,
  },
  vehicleSaveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  menuContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  menuCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CommonStyles.shadowSm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  menuIcon: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuText: {
    flex: 1,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.base,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  menuBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  menuBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  logoutContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  logoutButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
  },
  // Styles pour le modal PIN
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  pinModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    ...CommonStyles.shadowLg,
  },
  pinModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  pinModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  pinModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  smsCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  smsInput: {
    flex: 1,
    height: 60,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    backgroundColor: Colors.gray[50],
  },
  smsInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  // Styles pour PIN (4 chiffres) - Design différent pour éviter la confusion
  pinCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  pinInput: {
    width: 56,
    height: 64,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.lg,
    textAlign: 'center',
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    backgroundColor: Colors.gray[100],
  },
  pinInputFilled: {
    borderColor: Colors.secondary,
    backgroundColor: '#F0F9FF',
    borderWidth: 2.5,
  },
  inputLabelSmall: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
  },
  formSection: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.gray[50],
    height: 56,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    height: '100%',
  },
  pinModalButton: {
    backgroundColor: Colors.gray[300],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  pinModalButtonActive: {
    backgroundColor: Colors.primary,
  },
  pinModalButtonDisabled: {
    backgroundColor: Colors.gray[300],
    opacity: 0.5,
  },
  pinModalButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  pinModalResendButton: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  pinModalResendText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  pinModalForgotButton: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  pinModalForgotText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    textDecorationLine: 'underline',
  },
});
