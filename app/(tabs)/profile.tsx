import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useGetMyDriverOffersQuery, useGetMyTripRequestsQuery } from '@/store/api/tripRequestApi';
import { useGetKycStatusQuery, useGetProfileSummaryQuery, useSendPhoneVerificationOtpMutation, useUpdatePinMutation, useUpdatePinWithOtpMutation, useUpdateUserMutation, useUploadKycMutation, useVerifyPhoneOtpMutation } from '@/store/api/userApi';
import { useCreateVehicleMutation, useDeleteVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { performLogout } from '@/store/slices/authSlice';
import type { Vehicle } from '@/types';
import { createBecomeDriverAction, isDriverRequiredError } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  TouchableWithoutFeedback,
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
  const [deleteVehicle, { isLoading: deletingVehicle }] = useDeleteVehicleMutation();
  const [uploadKyc, { isLoading: uploadingKyc }] = useUploadKycMutation();
  const [updatePin, { isLoading: isUpdatingPin }] = useUpdatePinMutation();
  const [updatePinWithOtp, { isLoading: isUpdatingPinWithOtp }] = useUpdatePinWithOtpMutation();
  const [updateUser, { isLoading: isUpdatingUser }] = useUpdateUserMutation();
  const [sendPhoneVerificationOtp] = useSendPhoneVerificationOtpMutation();
  const [verifyPhoneOtp] = useVerifyPhoneOtpMutation();
  const { data: myTripRequests = [] } = useGetMyTripRequestsQuery();
  const { data: myDriverOffers = [] } = useGetMyDriverOffersQuery();

  const currentUser = profileSummary?.user ?? user;
  const stats = profileSummary?.stats;
  const vehicleList: Vehicle[] = vehicles ?? [];

  // Déterminer si l'utilisateur est conducteur basé sur le role
  const isDriver = useMemo(() => {
    const role = currentUser?.role;
    return role === 'driver' || role === 'both';
  }, [currentUser?.role]);

  const isKycApproved = kycStatus?.status === 'approved';
  const isKycPending = kycStatus?.status === 'pending';
  const isKycRejected = kycStatus?.status === 'rejected';
  const isKycBusy = kycSubmitting || uploadingKyc;
  const isKycActionDisabled = isKycBusy || isKycApproved;

  // console.log("kycstatus:", kycStatus)
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

  const resetVehicleForm = useCallback(() => {
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
  }, []);

  // Handlers optimisés pour éviter les re-renders
  const handleVehicleBrandChange = useCallback((text: string) => {
    setVehicleBrand(text);
  }, []);

  const handleVehicleModelChange = useCallback((text: string) => {
    setVehicleModel(text);
  }, []);

  const handleVehicleColorChange = useCallback((text: string) => {
    setVehicleColor(text);
  }, []);

  const handleVehiclePlateChange = useCallback((text: string) => {
    setVehiclePlate(text);
  }, []);

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
        error?.data?.message ?? error?.error ?? 'Impossible d\'ajouter le véhicule pour le moment.';
      const isDriverError = isDriverRequiredError(error);
      
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
        actions: isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    }
  };

  const handleDeleteVehicle = useCallback((vehicle: Vehicle) => {
    showDialog({
      variant: 'warning',
      title: 'Supprimer le véhicule',
      message: `Êtes-vous sûr de vouloir supprimer ${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate}) ? Cette action est irréversible.`,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'primary',
          onPress: async () => {
            try {
              await deleteVehicle(vehicle.id).unwrap();
              await refetchVehicles();
              showDialog({
                variant: 'success',
                title: 'Véhicule supprimé',
                message: 'Le véhicule a été supprimé avec succès.',
              });
            } catch (error: any) {
              const message =
                error?.data?.message ?? error?.error ?? 'Impossible de supprimer le véhicule pour le moment.';
              const isDriverError = isDriverRequiredError(error);
              
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: Array.isArray(message) ? message.join('\n') : message,
                actions: isDriverError
                  ? [
                      { label: 'Fermer', variant: 'ghost' },
                      createBecomeDriverAction(router),
                    ]
                  : undefined,
              });
            }
          },
        },
      ],
    });
  }, [deleteVehicle, refetchVehicles, router, showDialog]);

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

  const handleBecomeDriver = async () => {
    try {
      const formData = new FormData();
      // Mettre à jour le rôle vers "driver"
      formData.append('role', 'driver');
      
      await updateUser(formData).unwrap();
      
      showDialog({
        variant: 'success',
        title: 'Félicitations ! 🎉',
        message: 'Votre compte conducteur a été activé avec succès. Vous pouvez maintenant publier des trajets et gagner de l\'argent.',
        actions: [
          {
            label: 'Publier un trajet',
            variant: 'primary',
            onPress: () => router.push('/publish'),
          },
          {
            label: 'Plus tard',
            variant: 'ghost',
          },
        ],
      });
    } catch (error: any) {
      console.error('Erreur lors de l\'activation du compte conducteur:', error);
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Impossible d\'activer le compte conducteur. Veuillez réessayer.',
      });
    }
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
    ...(isDriver
      ? [
          { icon: 'list-outline', label: 'Demandes disponibles', route: '/requests' },
          {
            icon: 'briefcase-outline',
            label: 'Mes offres',
            route: '/offers',
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
    dispatch(performLogout());
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.header}>
          <LinearGradient
            colors={[Colors.primary, '#2563EB']}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Mon Profil</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.userInfo}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={changeProfilePhoto}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              <View style={styles.avatarWrapper}>
                {currentUser?.profilePicture || user?.avatar ? (
                  <Image
                    source={{ uri: currentUser?.profilePicture ?? user?.avatar ?? undefined }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarEmoji}>👤</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color={Colors.white} />
                  </View>
                )}
              </View>
              {currentUser?.identityVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-sharp" size={14} color={Colors.white} />
                </View>
              )}
              <TouchableOpacity 
                style={styles.cameraBadge}
                onPress={changeProfilePhoto}
                disabled={isUploading}
              >
                <Ionicons name="camera" size={14} color={Colors.white} />
              </TouchableOpacity>
            </TouchableOpacity>
            
            <Text style={styles.userName}>{currentUser?.name || 'Utilisateur'}</Text>
            <View style={styles.userPhoneRow}>
              <Ionicons name="call-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.userPhone}>{currentUser?.phone || ''}</Text>
            </View>

            <View style={styles.headerStats}>
              <View style={styles.headerStatItem}>
                <Ionicons name="star" size={16} color={Colors.secondary} />
                <Text style={styles.headerStatValue}>{(currentUser?.rating ?? 0).toFixed(1)}</Text>
                <Text style={styles.headerStatLabel}>Note</Text>
              </View>
              <View style={styles.headerStatDivider} />
              <View style={styles.headerStatItem}>
                <Ionicons name="car-outline" size={18} color={Colors.white} />
                <Text style={styles.headerStatValue}>{currentUser?.totalTrips ?? 0}</Text>
                <Text style={styles.headerStatLabel}>Trajets</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.mainActionsContainer}>
          <TouchableOpacity
            style={[styles.mainActionCard, { borderColor: Colors.primary + '30' }]}
            onPress={() => router.push('/bookings')}
          >
            <View style={[styles.mainActionIcon, { backgroundColor: Colors.primary + '15' }]}>
              <Ionicons name="calendar" size={24} color={Colors.primary} />
            </View>
            <View style={styles.mainActionContent}>
              <Text style={styles.mainActionTitle}>Réservations</Text>
              <Text style={styles.mainActionSubtitle} numberOfLines={1}>
                {stats?.bookingsAsPassenger ?? 0} Passager · {stats?.bookingsAsDriver ?? 0} Conducteur
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainActionCard, { borderColor: Colors.warning + '30' }]}
            onPress={() => router.push('/my-requests')}
          >
            <View style={[styles.mainActionIcon, { backgroundColor: Colors.warning + '15' }]}>
              <Ionicons name="document-text" size={24} color={Colors.warning} />
            </View>
            <View style={styles.mainActionContent}>
              <Text style={styles.mainActionTitle}>Mes Demandes</Text>
              <Text style={styles.mainActionSubtitle} numberOfLines={1}>
                {tripRequestsStats.activeRequests} actives · {tripRequestsStats.requestsWithOffers} offres
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
          </TouchableOpacity>

          {isDriver && (
            <TouchableOpacity
              style={[styles.mainActionCard, { borderColor: Colors.info + '30' }]}
              onPress={() => router.push('/offers')}
            >
              <View style={[styles.mainActionIcon, { backgroundColor: Colors.info + '15' }]}>
                <Ionicons name="gift" size={24} color={Colors.info} />
              </View>
              <View style={styles.mainActionContent}>
                <Text style={styles.mainActionTitle}>Mes Offres</Text>
                <Text style={styles.mainActionSubtitle} numberOfLines={1}>
                  {offersStats.pendingOffers} en attente · {offersStats.acceptedOffers} acceptées
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
            </TouchableOpacity>
          )}

          {/* Section "Devenir conducteur" pour les passagers */}
          {!isDriver && (
            <Animated.View entering={FadeInDown.delay(200)}>
              <TouchableOpacity
                style={styles.becomeDriverCard}
                disabled={isUpdatingUser}
                onPress={() => {
                  // Vérifier les prérequis et guider l'utilisateur
                  const hasVehicle = vehicleList.length > 0;
                  const hasKyc = isKycApproved;
                  
                  if (!hasVehicle && !hasKyc) {
                    showDialog({
                      variant: 'info',
                      title: 'Devenir conducteur',
                      message: 'Pour devenir conducteur, vous devez :\n\n1. Ajouter un véhicule\n2. Compléter la vérification d\'identité (KYC)\n\nSouhaitez-vous commencer par ajouter un véhicule ?',
                      actions: [
                        { label: 'Plus tard', variant: 'ghost' },
                        {
                          label: 'Ajouter un véhicule',
                          variant: 'primary',
                          onPress: () => {
                            resetVehicleForm();
                            setVehicleModalVisible(true);
                          },
                        },
                      ],
                    });
                  } else if (!hasVehicle) {
                    resetVehicleForm();
                    setVehicleModalVisible(true);
                  } else if (!hasKyc) {
                    handleOpenKycModal();
                  } else {
                    // Tous les prérequis sont remplis, activer le compte conducteur
                    handleBecomeDriver();
                  }
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[Colors.secondary, '#F59E0B']}
                  style={styles.becomeDriverGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.becomeDriverContent}>
                    <View style={styles.becomeDriverIconContainer}>
                      <Ionicons name="car-sport" size={32} color={Colors.white} />
                    </View>
                    <View style={styles.becomeDriverTextContainer}>
                      <Text style={styles.becomeDriverTitle}>Devenir conducteur</Text>
                      <Text style={styles.becomeDriverSubtitle}>
                        Gagnez de l'argent en proposant des trajets
                      </Text>
                    </View>
                    <View style={styles.becomeDriverProgress}>
                      <View style={styles.becomeDriverProgressItem}>
                        <Ionicons
                          name={vehicleList.length > 0 ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={vehicleList.length > 0 ? Colors.white : 'rgba(255,255,255,0.6)'}
                        />
                        <Text
                          style={[
                            styles.becomeDriverProgressText,
                            vehicleList.length > 0 && styles.becomeDriverProgressTextCompleted,
                          ]}
                        >
                          Véhicule
                        </Text>
                      </View>
                      <View style={styles.becomeDriverProgressItem}>
                        <Ionicons
                          name={isKycApproved ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={isKycApproved ? Colors.white : 'rgba(255,255,255,0.6)'}
                        />
                        <Text
                          style={[
                            styles.becomeDriverProgressText,
                            isKycApproved && styles.becomeDriverProgressTextCompleted,
                          ]}
                        >
                          KYC
                        </Text>
                      </View>
                    </View>
                  </View>
                  {isUpdatingUser ? (
                    <ActivityIndicator size="small" color={Colors.white} style={styles.becomeDriverArrow} />
                  ) : (
                    <Ionicons name="arrow-forward-circle" size={24} color={Colors.white} style={styles.becomeDriverArrow} />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeaderTitle}>Activité</Text>
          <View style={styles.statsGrid}>
            {derivedStats.map((stat, index) => (
              <View key={stat.label} style={styles.statGridItem}>
                <Text style={[styles.statGridValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.statGridLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

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
            <Text style={styles.sectionHeaderTitle}>Mes véhicules</Text>
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
                <View style={styles.vehicleItemLeft}>
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
                <TouchableOpacity
                  style={styles.vehicleDeleteButton}
                  onPress={() => handleDeleteVehicle(vehicle)}
                  disabled={deletingVehicle}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {deletingVehicle ? (
                    <ActivityIndicator size="small" color={Colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  )}
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.vehicleEmptyText}>
              Aucun véhicule enregistré. Ajoutez-en un pour devenir conducteur.
            </Text>
          )}
        </View>

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

      <Modal 
        visible={vehicleModalVisible} 
        transparent 
        animationType="slide"
        onRequestClose={() => setVehicleModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setVehicleModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.vehicleModalOverlay}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.vehicleModalCard}>
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
              nestedScrollEnabled={true}
              bounces={false}
            >
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Marque</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Toyota"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleBrand}
                  onChangeText={handleVehicleBrandChange}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Modèle</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Corolla"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleModel}
                  onChangeText={handleVehicleModelChange}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Couleur</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Bleu"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleColor}
                  onChangeText={handleVehicleColorChange}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Plaque d'immatriculation</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="ABC-1234"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehiclePlate}
                  onChangeText={handleVehiclePlateChange}
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
          </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
    overflow: 'hidden',
    position: 'relative',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  settingsButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  userInfo: {
    alignItems: 'center',
    zIndex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    backgroundColor: Colors.white,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.gray[200],
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  avatarEmoji: {
    fontSize: 40,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: 4,
  },
  userPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.8,
    marginBottom: Spacing.xl,
  },
  userPhone: {
    color: Colors.white,
    fontSize: FontSizes.sm,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    gap: Spacing.xl,
  },
  headerStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  headerStatValue: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  headerStatLabel: {
    color: Colors.white,
    opacity: 0.7,
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: FontWeights.medium,
  },
  headerStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  mainActionsContainer: {
    paddingHorizontal: Spacing.xl,
    marginTop: -Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  mainActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    ...CommonStyles.shadowSm,
  },
  mainActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  mainActionContent: {
    flex: 1,
  },
  mainActionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  mainActionSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  sectionHeaderTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  statGridItem: {
    width: '50%',
    padding: Spacing.md,
    alignItems: 'center',
  },
  statGridValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  statGridLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
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
    color: Colors.gray[900],
    marginBottom: Spacing.lg,
    fontSize: FontSizes.base,
  },
  badgesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    justifyContent: 'center',
  },
  badgeItem: {
    alignItems: 'center',
    width: 80,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgeLabel: {
    fontSize: 10,
    color: Colors.gray[600],
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
  reviewsContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  reviewsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  reviewsTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  reviewsLinkButton: {
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  reviewsLinkButtonDisabled: {
    opacity: 0.5,
  },
  reviewsLinkText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  reviewsLinkTextDisabled: {
    color: Colors.gray[400],
  },
  reviewsEmptyText: {
    textAlign: 'center',
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.lg,
  },
  reviewItem: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewAuthor: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewDate: {
    fontSize: 10,
    color: Colors.gray[500],
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewRatingText: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewComment: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 18,
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reviewsModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: '80%',
    padding: Spacing.xl,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
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
    marginBottom: Spacing.md,
  },
  kycHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  kycTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  kycStatusText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  kycStatusApproved: {
    color: Colors.success,
  },
  kycStatusPending: {
    color: Colors.warning,
  },
  kycRejectionContainer: {
    backgroundColor: Colors.danger + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginVertical: Spacing.sm,
  },
  kycRejectionTitle: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
    marginBottom: 2,
  },
  kycRejectionText: {
    color: Colors.danger,
    fontSize: FontSizes.xs,
  },
  kycHelperText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.lg,
  },
  kycButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '10',
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    gap: 8,
  },
  kycButtonDisabled: {
    opacity: 0.6,
  },
  kycButtonLocked: {
    backgroundColor: Colors.gray[100],
  },
  kycButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  vehicleItemLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleDeleteButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.danger + '10',
  },
  vehicleTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehiclePlate: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: 2,
  },
  vehicleColor: {
    fontSize: 10,
    color: Colors.gray[400],
    textTransform: 'uppercase',
    marginTop: 2,
  },
  vehicleStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  vehicleStatusText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  vehicleEmptyText: {
    textAlign: 'center',
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.xl,
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
    padding: Spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[50],
  },
  menuIcon: {
    width: 36,
    height: 36,
    backgroundColor: Colors.gray[50],
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  logoutContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  logoutButton: {
    backgroundColor: Colors.danger + '10',
    paddingVertical: 16,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  vehicleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  vehicleModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    maxHeight: '90%',
    width: '100%',
  },
  vehicleModalHeader: {
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  vehicleModalHero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  vehicleModalBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  vehicleModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  vehicleModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  vehicleModalContent: {
    gap: Spacing.md,
  },
  vehicleInputGroup: {
    gap: 4,
  },
  vehicleInputLabel: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  vehicleInput: {
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.base,
  },
  vehicleSaveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  vehicleSaveButtonDisabled: {
    opacity: 0.6,
  },
  vehicleSaveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  formSection: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  inputLabelSmall: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
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
  pinModalResendButton: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  pinModalResendText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  becomeDriverCard: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CommonStyles.shadowMd,
  },
  becomeDriverGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    position: 'relative',
  },
  becomeDriverContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  becomeDriverIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  becomeDriverTextContainer: {
    flex: 1,
  },
  becomeDriverTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: 2,
  },
  becomeDriverSubtitle: {
    fontSize: FontSizes.xs,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  becomeDriverProgress: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  becomeDriverProgressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  becomeDriverProgressText: {
    fontSize: FontSizes.xs,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: FontWeights.medium,
  },
  becomeDriverProgressTextCompleted: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  becomeDriverArrow: {
    marginLeft: Spacing.sm,
  },
});