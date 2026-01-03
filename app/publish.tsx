import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useCreateTripMutation } from '@/store/api/tripApi';
import { useGetKycStatusQuery, useGetProfileSummaryQuery, useUploadKycMutation } from '@/store/api/userApi';
import { useCreateVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { createBecomeDriverAction, isDriverRequiredError } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type PublishStep = 'route' | 'details' | 'confirm';

export default function PublishScreen() {
  const router = useRouter();
  const { isIdentityVerified } = useIdentityCheck();
  const [step, setStep] = useState<PublishStep>('route');
  const [createTrip, { isLoading: isPublishing }] = useCreateTripMutation();
  const { showDialog } = useDialog();

  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [kycWizardVisible, setKycWizardVisible] = useState(false);
  const [kycFrontImage, setKycFrontImage] = useState<string | null>(null);
  const [kycBackImage, setKycBackImage] = useState<string | null>(null);
  const [kycSelfieImage, setKycSelfieImage] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);

  const {
    data: kycStatus,
    refetch: refetchKycStatus,
  } = useGetKycStatusQuery();
  const [uploadKyc, { isLoading: uploadingKyc }] = useUploadKycMutation();

  const openKycModal = () => setKycModalVisible(true);
  const closeKycModal = () => {
    if (kycSubmitting || uploadingKyc) {
      return;
    }
    setKycModalVisible(false);
    setKycWizardVisible(false);
  };

  const handleStartKyc = () => {
    setKycWizardVisible(true);
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
      await refetchKycStatus();

      // Vérifier le statut retourné par le backend
      const kycStatusAfterUpload = result?.status;

      if (kycStatusAfterUpload === 'approved') {
        // KYC approuvé immédiatement (validation automatique réussie)
        showDialog({
          variant: 'success',
          title: 'KYC validé avec succès !',
          message: 'Votre identité a été vérifiée automatiquement. Vous pouvez maintenant publier vos trajets.',
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
    setKycWizardVisible(false);
  };

  const isKycBusy = kycSubmitting || uploadingKyc;

  const kycChecklist = [
    { icon: 'id-card', title: 'Carte nationale', subtitle: 'Recto-verso bien lisible' },
    { icon: 'camera', title: 'Selfie sécurisé', subtitle: 'Prenez une photo nette de votre visage' },
    { icon: 'time', title: 'Validation express', subtitle: 'Moins de 24h en moyenne' },
  ] as const;

  // Driver and Vehicle Management
  const { data: profileSummary } = useGetProfileSummaryQuery();
  const user = profileSummary?.user;
  // Déterminer si l'utilisateur est conducteur basé sur le role
  const isDriver = useMemo(() => {
    const role = user?.role;
    return role === 'driver' || role === 'both';
  }, [user?.role]);
  const [showDriverRequiredModal, setShowDriverRequiredModal] = useState(false);

  const { data: vehicles = [], refetch: refetchVehicles } = useGetVehiclesQuery(undefined, {
    skip: !isDriver,
  });
  const [createVehicle, { isLoading: isCreatingVehicle }] = useCreateVehicleMutation();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleLicensePlate, setVehicleLicensePlate] = useState('');

  const resetForm = () => {
    setStep('route');
    setDepartureLocation(null);
    setArrivalLocation(null);
    setActiveLocationType(null);
    setDepartureDateTime(null);
    setIosPickerMode(null);
    setSeats('4');
    setIsFreeTrip(false);
    setPrice('');
    setDescription('');
    setSelectedVehicleId(null);
    setShowVehicleForm(false);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehicleLicensePlate('');
  };

  // Données du formulaire
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [activeLocationType, setActiveLocationType] = useState<'departure' | 'arrival' | null>(null);
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [seats, setSeats] = useState('4');
  const [isFreeTrip, setIsFreeTrip] = useState(false);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  const departureSummary = useMemo(
    () => ({
      title: departureLocation?.title ?? 'Point de départ non défini',
      address: departureLocation?.address ?? 'Sélectionnez un lieu sur la carte',
      latitude: departureLocation?.latitude,
      longitude: departureLocation?.longitude,
    }),
    [departureLocation],
  );

  const arrivalSummary = useMemo(
    () => ({
      title: arrivalLocation?.title ?? 'Destination non définie',
      address: arrivalLocation?.address ?? 'Sélectionnez un lieu sur la carte',
      latitude: arrivalLocation?.latitude,
      longitude: arrivalLocation?.longitude,
    }),
    [arrivalLocation],
  );

  const openLocationPicker = (type: 'departure' | 'arrival') => setActiveLocationType(type);

  const closeLocationPicker = () => setActiveLocationType(null);

  const handleLocationSelected = (selection: MapLocationSelection) => {
    if (activeLocationType === 'departure') {
      setDepartureLocation(selection);
    } else if (activeLocationType === 'arrival') {
      setArrivalLocation(selection);
    }
    closeLocationPicker();
  };

  const getBaseDateTime = () => {
    if (departureDateTime) {
      return new Date(departureDateTime);
    }
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    return base;
  };

  const applyDatePart = (pickedDate: Date) => {
    const base = getBaseDateTime();
    const next = new Date(base);
    next.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
    return next;
  };

  const applyTimePart = (pickedDate: Date) => {
    const base = getBaseDateTime();
    const next = new Date(base);
    next.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
    return next;
  };

  const openDateOrTimePicker = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      const value = getBaseDateTime();
      DateTimePickerAndroid.open({
        mode,
        value,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) {
            return;
          }
          setDepartureDateTime(mode === 'date' ? applyDatePart(selectedDate) : applyTimePart(selectedDate));
        },
      });
    } else {
      setIosPickerMode(mode);
    }
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerMode) {
      return;
    }
    setDepartureDateTime(
      iosPickerMode === 'date' ? applyDatePart(selectedDate) : applyTimePart(selectedDate),
    );
  };

  const closeIosPicker = () => setIosPickerMode(null);

  const formatCoordinatePair = (latitude?: number, longitude?: number) => {
    if (
      typeof latitude !== 'number' ||
      Number.isNaN(latitude) ||
      typeof longitude !== 'number' ||
      Number.isNaN(longitude)
    ) {
      return null;
    }
    return `${latitude.toFixed(5)} / ${longitude.toFixed(5)}`;
  };

  const renderLocationCard = (
    type: 'departure' | 'arrival',
    summary: { title: string; address: string; latitude?: number; longitude?: number },
  ) => {
    const accentColor = type === 'departure' ? Colors.success : Colors.primary;
    const hasSelection = type === 'departure' ? !!departureLocation : !!arrivalLocation;
    const coords = formatCoordinatePair(summary.latitude, summary.longitude);
    return (
      <View style={styles.locationCard}>
        <View style={styles.locationCardHeader}>
          <Text style={styles.locationCardLabel}>
            {type === 'departure' ? 'Point de départ *' : 'Destination *'}
          </Text>
          {hasSelection && (
            <TouchableOpacity onPress={() => openLocationPicker(type)}>
              <Text style={styles.locationCardAction}>Modifier</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.locationCardContent}>
          <Text style={styles.locationCardTitle}>{summary.title}</Text>
          <Text style={styles.locationCardSubtitle}>{summary.address}</Text>
          <Text style={styles.locationCardCoords}>
            {coords ?? 'Coordonnées non définies'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.locationCardButton}
          onPress={() => openLocationPicker(type)}
        >
          <View style={[styles.locationCardButtonIcon, { backgroundColor: accentColor + '1A' }]}>
            <Ionicons name="map" size={18} color={accentColor} />
          </View>
          <Text style={styles.locationCardButtonText}>
            {hasSelection ? 'Mettre à jour sur la carte' : 'Choisir sur la carte'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const formattedDateLabel = useMemo(() => {
    if (!departureDateTime) {
      return 'Choisir la date';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(departureDateTime);
  }, [departureDateTime]);

  const formattedTimeLabel = useMemo(() => {
    if (!departureDateTime) {
      return 'Choisir l\'heure';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(departureDateTime);
  }, [departureDateTime]);

  const formattedFullDateTime = useMemo(() => {
    if (!departureDateTime) {
      return 'Non défini';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(departureDateTime);
  }, [departureDateTime]);

  const handleCreateVehicle = async () => {
    if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehicleLicensePlate.trim()) {
      showDialog({
        variant: 'warning',
        title: 'Informations manquantes',
        message: 'Veuillez remplir tous les champs du véhicule.',
      });
      return;
    }

    try {
      const newVehicle = await createVehicle({
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: vehicleLicensePlate.trim(),
      }).unwrap();

      await refetchVehicles();
      setSelectedVehicleId(newVehicle.id);
      setShowVehicleForm(false);
      setVehicleBrand('');
      setVehicleModel('');
      setVehicleColor('');
      setVehicleLicensePlate('');

      showDialog({
        variant: 'success',
        title: 'Véhicule ajouté',
        message: 'Votre véhicule a été ajouté avec succès.',
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible d\'ajouter le véhicule pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleNextStep = () => {
    // Check driver status first
    if (!isDriver) {
      setShowDriverRequiredModal(true);
      return;
    }

    if (step === 'route') {
      if (!departureLocation || !arrivalLocation) {
        showDialog({
          variant: 'warning',
          title: 'Itinéraire incomplet',
          message: 'Veuillez sélectionner un point de départ et une destination.',
        });
        return;
      }
      if (!isIdentityVerified) {
        openKycModal();
        return;
      }
      setStep('details');
    } else if (step === 'details') {
      if (!departureDateTime) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner la date de départ.',
        });
        return;
      }
      if (!isFreeTrip && !price) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner le prix ou de sélectionner "Gratuit".',
        });
        return;
      }
      if (!selectedVehicleId) {
        showDialog({
          variant: 'warning',
          title: 'Véhicule requis',
          message: 'Veuillez sélectionner un véhicule pour continuer.',
        });
        return;
      }
      setStep('confirm');
    }
  };

  const handlePublish = async () => {
    if (isPublishing) return;

    if (!departureLocation || !arrivalLocation) {
      showDialog({
        variant: 'warning',
        title: 'Itinéraire incomplet',
        message: 'Veuillez sélectionner vos points de départ et d’arrivée.',
      });
      return;
    }

    const seatsValue = parseInt(seats, 10);
    const priceValue = isFreeTrip ? 0 : parseFloat(price);
    const departureDate = departureDateTime;

    if (
      Number.isNaN(seatsValue) ||
      (!isFreeTrip && (Number.isNaN(priceValue) || priceValue <= 0)) ||
      !departureDate ||
      Number.isNaN(departureDate.getTime())
    ) {
      showDialog({
        variant: 'warning',
        title: 'Vérification requise',
        message: 'Veuillez vérifier les valeurs numériques et la date de départ.',
      });
      return;
    }

    if (!isDriver) {
      setShowDriverRequiredModal(true);
      return;
    }

    if (!selectedVehicleId) {
      showDialog({
        variant: 'warning',
        title: 'Véhicule requis',
        message: 'Veuillez sélectionner un véhicule pour publier votre trajet.',
      });
      return;
    }

    if (!isIdentityVerified) {
      openKycModal();
      return;
    }

    try {
      await createTrip({
        departureLocation: departureLocation.title,
        arrivalLocation: arrivalLocation.title,
        departureCoordinates: [departureLocation.longitude, departureLocation.latitude],
        arrivalCoordinates: [arrivalLocation.longitude, arrivalLocation.latitude],
        departureDate: departureDate.toISOString(),
        totalSeats: seatsValue,
        pricePerSeat: priceValue,
        isFree: isFreeTrip,
        description: description.trim() || undefined,
        vehicleId: selectedVehicleId,
      } as any).unwrap();

      resetForm();
      showDialog({
        variant: 'success',
        title: 'Trajet publié',
        message: 'Votre trajet a été publié avec succès !',
        actions: [
          { label: 'Publier un autre', variant: 'secondary', onPress: () => { } },
          { label: 'Voir mes trajets', variant: 'primary', onPress: () => router.push('/trips') },
        ],
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de publier le trajet pour le moment. Veuillez réessayer.';
      
      // Vérifier si l'erreur est liée au fait que l'utilisateur n'est pas conducteur
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

  const progressWidth = step === 'route' ? '33%' : step === 'details' ? '66%' : '100%';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Publier un trajet</Text>
          <Text style={styles.headerSubtitle}>
            Étape {step === 'route' ? '1' : step === 'details' ? '2' : '3'}/3
          </Text>
        </View>
      </View>

      {/* Step Indicator */}
      <View style={styles.stepIndicatorContainer}>
        <View style={styles.stepIndicatorRow}>
          <View style={[styles.stepDot, step === 'route' && styles.stepDotActive, (step === 'details' || step === 'confirm') && styles.stepDotCompleted]}>
            <Ionicons name={step === 'details' || step === 'confirm' ? "checkmark" : "map"} size={14} color={Colors.white} />
          </View>
          <View style={[styles.stepLine, (step === 'details' || step === 'confirm') && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 'details' && styles.stepDotActive, step === 'confirm' && styles.stepDotCompleted]}>
            <Ionicons name={step === 'confirm' ? "checkmark" : "car"} size={14} color={step === 'details' || step === 'confirm' ? Colors.white : Colors.gray[400]} />
          </View>
          <View style={[styles.stepLine, step === 'confirm' && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 'confirm' && styles.stepDotActive]}>
            <Ionicons name="checkmark-done" size={14} color={step === 'confirm' ? Colors.white : Colors.gray[400]} />
          </View>
        </View>
        <View style={styles.stepLabelRow}>
          <Text style={[styles.stepLabel, step === 'route' && styles.stepLabelActive]}>Route</Text>
          <Text style={[styles.stepLabel, step === 'details' && styles.stepLabelActive]}>Détails</Text>
          <Text style={[styles.stepLabel, step === 'confirm' && styles.stepLabelActive]}>Confirmer</Text>
        </View>
      </View>

      {!isIdentityVerified && (
        <View style={styles.identityWarningCard}>
          <View style={styles.identityWarningIcon}>
            <Ionicons name="shield" size={20} color={Colors.primary} />
          </View>
          <View style={styles.identityWarningContent}>
            <Text style={styles.identityWarningTitle}>KYC requis</Text>
            <Text style={styles.identityWarningText}>
              Vérifiez votre identité pour pouvoir publier et confirmer vos trajets.
            </Text>
            <TouchableOpacity
              style={styles.identityWarningButton}
              onPress={handleStartKyc}
            >
              <Text style={styles.identityWarningButtonText}>Compléter ma vérification</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Étape 1: Itinéraire */}
        {step === 'route' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Votre itinéraire</Text>

            {/* Message KYC visible dans l'étape route */}
            {!isIdentityVerified && (
              <View style={styles.routeKycWarningCard}>
                <View style={styles.routeKycWarningHeader}>
                  <View style={styles.routeKycWarningIconContainer}>
                    <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
                  </View>
                  <View style={styles.routeKycWarningTextContainer}>
                    <Text style={styles.routeKycWarningTitle}>KYC requis pour publier</Text>
                    <Text style={styles.routeKycWarningSubtitle}>
                      Vous devez vérifier votre identité avant de pouvoir publier des trajets
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.routeKycWarningButton}
                  onPress={handleStartKyc}
                >
                  <Ionicons name="shield" size={18} color={Colors.white} />
                  <Text style={styles.routeKycWarningButtonText}>Compléter ma vérification</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.routeCard}>
              <View style={styles.routeVisual}>
                <View style={styles.dotGreen} />
                <View style={styles.routeLine} />
                <View style={styles.dotBlue} />
              </View>
              <View style={styles.routeInputs}>
                <TouchableOpacity
                  style={styles.locationSelector}
                  onPress={() => openLocationPicker('departure')}
                >
                  <Text style={styles.locationLabel}>DÉPART</Text>
                  <Text style={styles.locationValue} numberOfLines={1}>
                    {departureLocation?.title || 'Sélectionnez le point de départ'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.locationSelector}
                  onPress={() => openLocationPicker('arrival')}
                >
                  <Text style={styles.locationLabel}>ARRIVÉE</Text>
                  <Text style={[styles.locationValue, !arrivalLocation && { color: Colors.gray[400] }]} numberOfLines={1}>
                    {arrivalLocation?.title || 'Où allez-vous ?'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
              <Text style={styles.infoText}>
                Assurez-vous que vos informations sont exactes pour faciliter la réservation.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                !isIdentityVerified && styles.buttonDisabled
              ]}
              onPress={handleNextStep}
              disabled={!isIdentityVerified}
            >
              <Text style={styles.buttonText}>
                {isIdentityVerified ? 'Continuer' : 'KYC requis pour continuer'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 2: Détails */}
        {step === 'details' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Détails du trajet</Text>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>QUAND PARTEZ-VOUS ?</Text>
              <View style={styles.datetimeButtons}>
                <TouchableOpacity
                  style={styles.datetimeButton}
                  onPress={() => openDateOrTimePicker('date')}
                >
                  <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.primary + '15' }]}>
                    <Ionicons name="calendar" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.datetimeButtonLabel}>Date</Text>
                    <Text style={styles.datetimeButtonValue} numberOfLines={1} ellipsizeMode="tail">{formattedDateLabel}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datetimeButton}
                  onPress={() => openDateOrTimePicker('time')}
                >
                  <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.gray[200] }]}>
                    <Ionicons name="time" size={18} color={Colors.gray[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.datetimeButtonLabel}>Heure</Text>
                    <Text style={styles.datetimeButtonValue} numberOfLines={1} ellipsizeMode="tail">{formattedTimeLabel}</Text>
                  </View>
                </TouchableOpacity>
              </View>
              {Platform.OS === 'ios' && iosPickerMode && (
                <View style={styles.iosPickerContainer}>
                  <DateTimePicker
                    value={getBaseDateTime()}
                    mode={iosPickerMode}
                    display="inline"
                    minuteInterval={5}
                    minimumDate={iosPickerMode === 'date' ? new Date() : undefined}
                    onChange={handleIosPickerChange}
                  />
                  <TouchableOpacity style={styles.iosPickerCloseButton} onPress={closeIosPicker}>
                    <Text style={styles.iosPickerCloseText}>Terminé</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Vehicle Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Véhicule *</Text>

              {vehicles.length === 0 ? (
                <View style={styles.vehicleEmptyState}>
                  <Ionicons name="car-outline" size={48} color={Colors.gray[400]} />
                  <Text style={styles.vehicleEmptyTitle}>Aucun véhicule</Text>
                  <Text style={styles.vehicleEmptyText}>
                    Ajoutez votre premier véhicule pour publier des trajets
                  </Text>
                  <TouchableOpacity
                    style={styles.addVehicleButton}
                    onPress={() => setShowVehicleForm(true)}
                  >
                    <Ionicons name="add-circle" size={20} color={Colors.white} />
                    <Text style={styles.addVehicleButtonText}>Ajouter un véhicule</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.vehicleScrollView}
                    contentContainerStyle={styles.vehicleScrollContent}
                  >
                    {vehicles.map((vehicle) => (
                      <TouchableOpacity
                        key={vehicle.id}
                        style={[
                          styles.vehicleCard,
                          selectedVehicleId === vehicle.id && styles.vehicleCardActive,
                        ]}
                        onPress={() => setSelectedVehicleId(vehicle.id)}
                      >
                        <View style={styles.vehicleCardHeader}>
                          <Ionicons
                            name="car"
                            size={24}
                            color={selectedVehicleId === vehicle.id ? Colors.primary : Colors.gray[600]}
                          />
                          {selectedVehicleId === vehicle.id && (
                            <View style={styles.vehicleCardBadge}>
                              <Ionicons name="checkmark" size={14} color={Colors.white} />
                            </View>
                          )}
                        </View>
                        <Text style={styles.vehicleCardBrand}>{vehicle.brand}</Text>
                        <Text style={styles.vehicleCardModel}>{vehicle.model}</Text>
                        <Text style={styles.vehicleCardDetails}>
                          {vehicle.color} • {vehicle.licensePlate}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.addVehicleButtonSecondary}
                    onPress={() => setShowVehicleForm(true)}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
                    <Text style={styles.addVehicleButtonSecondaryText}>Ajouter un autre véhicule</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Inline Vehicle Creation Form */}
              {showVehicleForm && (
                <View style={styles.vehicleForm}>
                  <View style={styles.vehicleFormHeader}>
                    <Text style={styles.vehicleFormTitle}>Nouveau véhicule</Text>
                    <TouchableOpacity onPress={() => setShowVehicleForm(false)}>
                      <Ionicons name="close" size={24} color={Colors.gray[600]} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.vehicleFormInputGroup}>
                    <Text style={styles.vehicleFormLabel}>Marque *</Text>
                    <TextInput
                      style={styles.vehicleFormInput}
                      placeholder="Ex: Toyota"
                      value={vehicleBrand}
                      onChangeText={setVehicleBrand}
                    />
                  </View>

                  <View style={styles.vehicleFormInputGroup}>
                    <Text style={styles.vehicleFormLabel}>Modèle *</Text>
                    <TextInput
                      style={styles.vehicleFormInput}
                      placeholder="Ex: Corolla"
                      value={vehicleModel}
                      onChangeText={setVehicleModel}
                    />
                  </View>

                  <View style={styles.vehicleFormInputGroup}>
                    <Text style={styles.vehicleFormLabel}>Couleur *</Text>
                    <TextInput
                      style={styles.vehicleFormInput}
                      placeholder="Ex: Blanc"
                      value={vehicleColor}
                      onChangeText={setVehicleColor}
                    />
                  </View>

                  <View style={styles.vehicleFormInputGroup}>
                    <Text style={styles.vehicleFormLabel}>Plaque d'immatriculation *</Text>
                    <TextInput
                      style={styles.vehicleFormInput}
                      placeholder="Ex: AB-123-CD"
                      value={vehicleLicensePlate}
                      onChangeText={setVehicleLicensePlate}
                      autoCapitalize="characters"
                    />
                  </View>

                  <View style={styles.vehicleFormButtons}>
                    <TouchableOpacity
                      style={[styles.vehicleFormButton, styles.vehicleFormButtonSecondary]}
                      onPress={() => {
                        setShowVehicleForm(false);
                        setVehicleBrand('');
                        setVehicleModel('');
                        setVehicleColor('');
                        setVehicleLicensePlate('');
                      }}
                    >
                      <Text style={styles.vehicleFormButtonSecondaryText}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.vehicleFormButton, styles.vehicleFormButtonPrimary]}
                      onPress={handleCreateVehicle}
                      disabled={isCreatingVehicle}
                    >
                      {isCreatingVehicle ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.vehicleFormButtonPrimaryText}>Enregistrer</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.card, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.cardLabel}>PLACES</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    onPress={() => setSeats(Math.max(1, parseInt(seats || '1') - 1).toString())}
                    style={styles.counterBtn}
                  >
                    <Ionicons name="remove" size={20} color={Colors.gray[900]} />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{seats}</Text>
                  <TouchableOpacity
                    onPress={() => setSeats((parseInt(seats || '1') + 1).toString())}
                    style={styles.counterBtn}
                  >
                    <Ionicons name="add" size={20} color={Colors.gray[900]} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.card, { flex: 1.5 }]}>
                <Text style={styles.cardLabel}>PRIX PAR PLACE (FC)</Text>
                <View style={styles.priceInputContainer}>
                  <TextInput
                    style={styles.priceInput}
                    placeholder={isFreeTrip ? "Gratuit" : "Ex: 2000"}
                    keyboardType="number-pad"
                    value={price}
                    onChangeText={setPrice}
                    editable={!isFreeTrip}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md }]}
              onPress={() => {
                setIsFreeTrip(!isFreeTrip);
                if (!isFreeTrip) {
                  setPrice('');
                }
              }}
              activeOpacity={0.8}
            >
              <View>
                <Text style={{ fontSize: FontSizes.base, fontWeight: FontWeights.semibold, color: Colors.gray[900] }}>
                  Trajet gratuit
                </Text>
                <Text style={{ fontSize: FontSizes.sm, color: Colors.gray[500], marginTop: 2 }}>
                  Proposer ce trajet gratuitement aux passagers
                </Text>
              </View>
              <View style={[styles.toggleSwitch, isFreeTrip && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, isFreeTrip && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>DESCRIPTION (OPTIONNEL)</Text>
              <TextInput
                style={styles.textAreaCard}
                placeholder="Ajoutez des informations supplémentaires (ex: bagages acceptés, point de rendez-vous, etc.)"
                placeholderTextColor={Colors.gray[400]}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setStep('route')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
                <Text style={styles.buttonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Étape 3: Confirmation */}
        {step === 'confirm' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleGreen]}>
                <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
              </View>
              <Text style={styles.stepTitle}>Confirmation</Text>
              <Text style={styles.stepSubtitle}>
                Vérifiez les informations avant de publier
              </Text>
            </View>

            <View style={styles.confirmCard}>
              {/* Itinéraire */}
              <View style={styles.confirmSection}>
                <Text style={styles.confirmSectionTitle}>ITINÉRAIRE</Text>
                <View style={styles.confirmRoute}>
                  <View style={styles.confirmRouteRow}>
                    <Ionicons name="location" size={20} color={Colors.success} />
                    <View style={styles.confirmRouteContent}>
                      <Text style={styles.confirmRouteName}>{departureSummary.title}</Text>
                      {departureLocation?.address && (
                        <Text style={styles.confirmRouteAddress}>{departureSummary.address}</Text>
                      )}
                      <Text style={styles.confirmRouteAddress}>
                        {formatCoordinatePair(
                          departureSummary.latitude,
                          departureSummary.longitude,
                        ) ?? '- / -'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.confirmRouteDivider} />
                  <View style={styles.confirmRouteRow}>
                    <Ionicons name="navigate" size={20} color={Colors.primary} />
                    <View style={styles.confirmRouteContent}>
                      <Text style={styles.confirmRouteName}>{arrivalSummary.title}</Text>
                      {arrivalLocation?.address && (
                        <Text style={styles.confirmRouteAddress}>{arrivalSummary.address}</Text>
                      )}
                      <Text style={styles.confirmRouteAddress}>
                        {formatCoordinatePair(
                          arrivalSummary.latitude,
                          arrivalSummary.longitude,
                        ) ?? '- / -'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Détails */}
              <View>
                <Text style={styles.confirmSectionTitle}>DÉTAILS</Text>
                <View style={styles.confirmDetails}>
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="time" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Heure de départ</Text>
                    </View>
                    <Text style={styles.confirmDetailValue}>{formattedFullDateTime}</Text>
                  </View>
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="people" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Places</Text>
                    </View>
                    <Text style={styles.confirmDetailValue}>{seats}</Text>
                  </View>
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="cash" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Prix</Text>
                    </View>
                    <Text style={[styles.confirmDetailValue, { color: Colors.success }]}>
                      {isFreeTrip ? 'Gratuit' : `${price} FC/pers`}
                    </Text>
                  </View>
                  {description ? (
                    <View style={styles.confirmDetailRow}>
                      <View style={styles.confirmDetailLeft}>
                        <Ionicons name="chatbox-ellipses" size={18} color={Colors.gray[600]} />
                        <Text style={styles.confirmDetailLabel}>Description</Text>
                      </View>
                      <Text style={[styles.confirmDetailValue, styles.confirmDetailDescription]}>{description}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setStep('details')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  { flex: 1, marginLeft: Spacing.md },
                  (isPublishing || !isIdentityVerified) && styles.buttonDisabled,
                ]}
                onPress={handlePublish}
                disabled={isPublishing || !isIdentityVerified}
              >
                {isPublishing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>
                    {isIdentityVerified ? 'Publier' : 'KYC requis'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <LocationPickerModal
        visible={activeLocationType !== null}
        title={
          activeLocationType === 'departure'
            ? 'Sélectionner le point de départ'
            : 'Sélectionner la destination'
        }
        initialLocation={
          activeLocationType === 'departure'
            ? departureLocation
            : activeLocationType === 'arrival'
              ? arrivalLocation
              : null
        }
        onClose={closeLocationPicker}
        onSelect={handleLocationSelected}
      />

      {/* Driver Required Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={showDriverRequiredModal}
        onRequestClose={() => setShowDriverRequiredModal(false)}
      >
        <View style={styles.driverModalOverlay}>
          <Animated.View entering={FadeInDown} style={styles.driverModalCard}>
            <View style={styles.driverModalIcon}>
              <Ionicons name="car" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.driverModalTitle}>Compte conducteur requis</Text>
            <Text style={styles.driverModalMessage}>
              Pour publier des trajets, vous devez d'abord activer votre compte conducteur et ajouter un véhicule dans votre profil.
            </Text>
            <View style={styles.driverModalButtons}>
              <TouchableOpacity
                style={[styles.driverModalButton, styles.driverModalButtonSecondary]}
                onPress={() => {
                  setShowDriverRequiredModal(false);
                  router.back();
                }}
              >
                <Text style={styles.driverModalButtonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.driverModalButton, styles.driverModalButtonPrimary]}
                onPress={() => {
                  setShowDriverRequiredModal(false);
                  router.push('/profile');
                }}
              >
                <Text style={styles.driverModalButtonPrimaryText}>Devenir conducteur</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <KycWizardModal
        visible={kycWizardVisible}
        onClose={closeKycModal}
        isSubmitting={isKycBusy}
        initialValues={{
          front: kycFrontImage,
          back: kycBackImage,
          selfie: kycSelfieImage,
        }}
        onComplete={handleKycWizardComplete}
      />


      <Modal
        transparent
        animationType="fade"
        visible={kycModalVisible}
        onRequestClose={closeKycModal}
      >
        <View style={styles.kycModalOverlay}>
          <Animated.View entering={FadeInDown} style={styles.kycModalCard}>
            <View style={styles.kycModalHero}>
              <View style={styles.kycModalBadge}>
                <Ionicons name="shield-checkmark" size={28} color={Colors.white} />
              </View>
              <Text style={styles.kycModalTitle}>Vérification requise</Text>
              <Text style={styles.kycModalSubtitle}>
                Publiez vos trajets en toute confiance en confirmant votre identité. Cela prend
                moins de 5 minutes et protège la communauté.
              </Text>
            </View>

            <View style={styles.kycModalHighlights}>
              <View style={styles.kycHighlight}>
                <Ionicons name="flash" size={18} color={Colors.success} />
                <Text style={styles.kycHighlightText}>Validation rapide</Text>
              </View>
              <View style={styles.kycHighlight}>
                <Ionicons name="lock-closed" size={18} color={Colors.primary} />
                <Text style={styles.kycHighlightText}>Données protégées</Text>
              </View>
            </View>

            <View style={styles.kycChecklist}>
              {kycChecklist.map((item) => (
                <View key={item.title} style={styles.kycChecklistItem}>
                  <View style={styles.kycChecklistIcon}>
                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.kycChecklistContent}>
                    <Text style={styles.kycChecklistTitle}>{item.title}</Text>
                    <Text style={styles.kycChecklistSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.kycModalActions}>
              <TouchableOpacity style={styles.kycPrimaryButton} onPress={handleStartKyc}>
                <Text style={styles.kycPrimaryButtonText}>Commencer ma vérification</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.kycSecondaryButton} onPress={closeKycModal}>
                <Text style={styles.kycSecondaryButtonText}>Plus tard</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  closeButton: {
    marginRight: Spacing.lg,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.gray[200],
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  identityWarningCard: {
    flexDirection: 'row',
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  identityWarningIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityWarningContent: {
    flex: 1,
  },
  identityWarningTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  identityWarningText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    marginVertical: Spacing.xs,
  },
  identityWarningButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  identityWarningButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  routeKycWarningCard: {
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  routeKycWarningHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  routeKycWarningIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  routeKycWarningTextContainer: {
    flex: 1,
  },
  routeKycWarningTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  routeKycWarningSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 20,
  },
  routeKycWarningButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  routeKycWarningButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  stepContainer: {
    marginTop: Spacing.xl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  iconCircleYellow: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
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
    marginBottom: Spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  freeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gray[300],
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: Colors.success,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.white,
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  freeToggleText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  freeToggleTextActive: {
    color: Colors.success,
    fontWeight: FontWeights.semibold,
  },
  inputDisabled: {
    backgroundColor: Colors.gray[100],
    color: Colors.gray[500],
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  input: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  datetimeButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  datetimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  datetimeButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datetimeButtonLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  datetimeButtonValue: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: 2,
    flexShrink: 1,
  },
  iosPickerContainer: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  iosPickerCloseButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  iosPickerCloseText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  locationCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  locationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  locationCardLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[600],
  },
  locationCardAction: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  locationCardContent: {
    marginBottom: Spacing.md,
    gap: 4,
  },
  locationCardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  locationCardSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  locationCardCoords: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  locationCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  locationCardButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCardButtonText: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    paddingHorizontal: Spacing.lg,
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  buttonSecondaryText: {
    color: Colors.gray[700],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  confirmCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  confirmSection: {
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  confirmSectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  confirmRoute: {
    marginTop: Spacing.md,
  },
  confirmRouteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  confirmRouteContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  confirmRouteName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  confirmRouteAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  confirmRouteDivider: {
    width: 2,
    height: 32,
    backgroundColor: Colors.gray[300],
    marginLeft: 10,
    marginBottom: Spacing.md,
  },
  confirmDetails: {
    marginTop: Spacing.md,
  },
  confirmDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  confirmDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmDetailLabel: {
    color: Colors.gray[700],
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
  },
  confirmDetailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  confirmDetailDescription: {
    flex: 1,
    textAlign: 'right',
    color: Colors.gray[600],
    fontWeight: FontWeights.regular,
  },
  kycModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  kycModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    gap: Spacing.lg,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  kycModalHero: {
    alignItems: 'center',
    textAlign: 'center',
    gap: Spacing.sm,
  },
  kycModalBadge: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  kycModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
  },
  kycModalSubtitle: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    textAlign: 'center',
  },
  kycModalHighlights: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  kycHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  kycHighlightText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  kycChecklist: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  kycChecklistItem: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  kycChecklistIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycChecklistContent: {
    flex: 1,
  },
  kycChecklistTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  kycChecklistSubtitle: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  kycModalActions: {
    gap: Spacing.sm,
  },
  kycPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  kycPrimaryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  kycSecondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  kycSecondaryButtonText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  // Driver Required Modal Styles
  driverModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  driverModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  driverModalIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
  },
  driverModalMessage: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
  },
  driverModalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: Spacing.md,
  },
  driverModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  driverModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  driverModalButtonSecondary: {
    backgroundColor: Colors.gray[200],
  },
  driverModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  driverModalButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  // Vehicle Selection Styles
  vehicleEmptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  vehicleEmptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  vehicleEmptyText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  addVehicleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  addVehicleButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  vehicleScrollView: {
    marginVertical: Spacing.sm,
  },
  vehicleScrollContent: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  vehicleCard: {
    width: 140,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.xl,
    gap: Spacing.xs,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  vehicleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleCardBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardBrand: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehicleCardModel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  vehicleCardDetails: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  addVehicleButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  addVehicleButtonSecondaryText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  // Vehicle Form Styles
  vehicleForm: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: Colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  vehicleFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleFormTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehicleFormInputGroup: {
    gap: Spacing.xs,
  },
  vehicleFormLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  vehicleFormInput: {
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOpacity: 0.02,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  vehicleFormButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  vehicleFormButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  vehicleFormButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  vehicleFormButtonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  vehicleFormButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  vehicleFormButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  // Step Indicator Styles
  stepIndicatorContainer: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  stepDot: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    transform: [{ scale: 1.1 }],
  },
  stepDotCompleted: {
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  stepLineActive: {
    backgroundColor: Colors.success,
  },
  stepLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.sm,
  },
  stepLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
    textAlign: 'center',
    flex: 1,
  },
  stepLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  // Route Card Styles (from request.tsx)
  sectionTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.lg,
  },
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
    marginBottom: Spacing.lg,
  },
  routeVisual: {
    width: 20,
    alignItems: 'center',
    paddingVertical: 12,
  },
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  dotBlue: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  routeLine: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.gray[200],
    marginVertical: 4,
  },
  routeInputs: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  locationSelector: {
    paddingVertical: Spacing.xs,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
    letterSpacing: 1,
  },
  locationValue: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.md,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.info + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 18,
  },
  // Card Styles (from request.tsx)
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.xs,
  },
  counterBtn: {
    width: 36,
    height: 36,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  counterValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.md,
  },
  priceInput: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  textAreaCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
