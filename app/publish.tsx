import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useCreateTripMutation } from '@/store/api/tripApi';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const { checkIdentity } = useIdentityCheck();
  const [step, setStep] = useState<PublishStep>('route');
  const [createTrip, { isLoading: isPublishing }] = useCreateTripMutation();

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
        Alert.alert('Erreur', 'Veuillez sélectionner un point de départ et une destination.');
        return;
      }
      // Vérifier l'identité avant de continuer
      // if (!checkIdentity('publish')) {
      //   return;
      // }
      setStep('details');
    } else if (step === 'details') {
      if (!departureDateTime || !price) {
        Alert.alert('Erreur', 'Veuillez remplir tous les détails');
        return;
      }
      setStep('confirm');
    }
  };

  const handlePublish = async () => {
    if (isPublishing) return;

    if (!departureLocation || !arrivalLocation) {
      Alert.alert('Erreur', 'Veuillez sélectionner vos points de départ et d’arrivée.');
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
      Alert.alert('Erreur', 'Veuillez vérifier les valeurs numériques et la date de départ.');
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

      Alert.alert('Succès', 'Votre trajet a été publié avec succès!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de publier le trajet pour le moment. Veuillez réessayer.';
      Alert.alert('Erreur', Array.isArray(message) ? message.join('\n') : message);
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
                  isPublishing && styles.buttonDisabled,
                ]}
                onPress={handlePublish}
                disabled={isPublishing}
              >
                {isPublishing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Publier</Text>
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
});
