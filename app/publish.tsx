import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useCreateTripMutation } from '@/store/api/tripApi';
import { useGetKycStatusQuery, useUploadKycMutation } from '@/store/api/userApi';
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
  };

  const handleStartKyc = () => {
    setKycModalVisible(true);
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
      await uploadKyc(formData).unwrap();
      setKycModalVisible(false);
      await refetchKycStatus();
      showDialog({
        variant: 'success',
        title: 'Documents envoyés',
        message: 'Nous vous informerons dès que la vérification sera terminée.',
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de soumettre les documents pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur KYC',
        message: Array.isArray(message) ? message.join('\n') : message,
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

  const isKycBusy = kycSubmitting || uploadingKyc;

  const kycChecklist = [
    { icon: 'id-card', title: 'Carte nationale', subtitle: 'Recto-verso bien lisible' },
    { icon: 'camera', title: 'Selfie sécurisé', subtitle: 'Prenez une photo nette de votre visage' },
    { icon: 'time', title: 'Validation express', subtitle: 'Moins de 24h en moyenne' },
  ] as const;

  const resetForm = () => {
    setStep('route');
    setDepartureLocation(null);
    setArrivalLocation(null);
    setActiveLocationType(null);
    setDepartureDateTime(null);
    setIosPickerMode(null);
    setSeats('4');
    setPrice('');
    setDescription('');
  };

  // Données du formulaire
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [activeLocationType, setActiveLocationType] = useState<'departure' | 'arrival' | null>(null);
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [seats, setSeats] = useState('4');
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

  const handleNextStep = () => {
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
      if (!departureDateTime || !price) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner la date de départ et le prix.',
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
    const priceValue = parseFloat(price);
    const departureDate = departureDateTime;

    if (
      Number.isNaN(seatsValue) ||
      Number.isNaN(priceValue) ||
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
        availableSeats: seatsValue,
        pricePerSeat: priceValue,
        description: description.trim() || undefined,
      } as any).unwrap();

      resetForm();
      showDialog({
        variant: 'success',
        title: 'Trajet publié',
        message: 'Votre trajet a été publié avec succès !',
        actions: [
          { label: 'Publier un autre', variant: 'secondary', onPress: () => {} },
          { label: 'Voir mes trajets', variant: 'primary', onPress: () => router.push('/trips') },
        ],
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de publier le trajet pour le moment. Veuillez réessayer.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
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

      {/* Barre de progression */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
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
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="map" size={40} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>Votre itinéraire</Text>
              <Text style={styles.stepSubtitle}>
                Indiquez le point de départ et d'arrivée
              </Text>
            </View>

            {renderLocationCard('departure', departureSummary)}
            {renderLocationCard('arrival', arrivalSummary)}

            <TouchableOpacity style={styles.button} onPress={handleNextStep}>
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Étape 2: Détails */}
        {step === 'details' && (
          <Animated.View entering={FadeInDown} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, styles.iconCircleYellow]}>
                <Ionicons name="information-circle" size={40} color={Colors.secondary} />
              </View>
              <Text style={styles.stepTitle}>Détails du trajet</Text>
              <Text style={styles.stepSubtitle}>
                Complétez les informations
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date et heure de départ *</Text>
              <View style={styles.datetimeButtons}>
                <TouchableOpacity
                  style={styles.datetimeButton}
                  onPress={() => openDateOrTimePicker('date')}
                >
                  <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.primary + '15' }]}>
                    <Ionicons name="calendar" size={18} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.datetimeButtonLabel}>Date</Text>
                    <Text style={styles.datetimeButtonValue}>{formattedDateLabel}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datetimeButton}
                  onPress={() => openDateOrTimePicker('time')}
                >
                  <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.gray[200] }]}>
                    <Ionicons name="time" size={18} color={Colors.gray[700]} />
                  </View>
                  <View>
                    <Text style={styles.datetimeButtonLabel}>Heure</Text>
                    <Text style={styles.datetimeButtonValue}>{formattedTimeLabel}</Text>
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre de places *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="people" size={20} color={Colors.gray[600]} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 3"
                  keyboardType="number-pad"
                  value={seats}
                  onChangeText={setSeats}
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
              <Text style={styles.label}>Prix par personne (FC) *</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 2000"
                  keyboardType="number-pad"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
              <Text style={styles.label}>Description (optionnel)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Ajoutez des informations supplémentaires (ex: bagages acceptés, point de rendez-vous, etc.)"
                placeholderTextColor={Colors.gray[500]}
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
                    <Text style={[styles.confirmDetailValue, { color: Colors.success }]}>{price} FC/pers</Text>
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

      <KycWizardModal
        visible={kycModalVisible}
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
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.sm,
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
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: 2,
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
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
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
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
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
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
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
  },
  kycSecondaryButtonText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
});
