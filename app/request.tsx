import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useCreateTripRequestMutation } from '@/store/api/tripRequestApi';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RequestStep = 'route' | 'details' | 'confirm';

export default function RequestTripScreen() {
  const router = useRouter();
  const [step, setStep] = useState<RequestStep>('route');
  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();
  const { showDialog } = useDialog();

  // États pour les étapes
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [departureDateMin, setDepartureDateMin] = useState(new Date());
  const [departureDateMax, setDepartureDateMax] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000)); // +24h par défaut
  const [showDatePickerMin, setShowDatePickerMin] = useState(false);
  const [showDatePickerMax, setShowDatePickerMax] = useState(false);
  const [numberOfSeats, setNumberOfSeats] = useState('1');
  const [maxPricePerSeat, setMaxPricePerSeat] = useState('');
  const [description, setDescription] = useState('');

  // Modals
  const [activePicker, setActivePicker] = useState<'departure' | 'arrival' | null>(null);

  const handleDateMinChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePickerMin(false);
    }
    if (selectedDate) {
      setDepartureDateMin(selectedDate);
      // Ajuster la date max si elle est antérieure à la date min
      if (selectedDate >= departureDateMax) {
        setDepartureDateMax(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000));
      }
    }
  };

  const handleDateMaxChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePickerMax(false);
    }
    if (selectedDate) {
      if (selectedDate > departureDateMin) {
        setDepartureDateMax(selectedDate);
      }
    }
  };

  const openDatePickerMin = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: departureDateMin,
        onChange: handleDateMinChange,
        mode: 'date',
        minimumDate: new Date(),
      });
    } else {
      setShowDatePickerMin(true);
    }
  };

  const openDatePickerMax = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: departureDateMax,
        onChange: handleDateMaxChange,
        mode: 'date',
        minimumDate: departureDateMin,
      });
    } else {
      setShowDatePickerMax(true);
    }
  };

  const handleNextStep = () => {
    if (step === 'route') {
      if (!departureLocation || !arrivalLocation) {
        showDialog({
          title: 'Champs requis',
          message: 'Veuillez sélectionner les points de départ et d\'arrivée',
          variant: 'danger',
        });
        return;
      }
      setStep('details');
    } else if (step === 'details') {
      if (!numberOfSeats || parseInt(numberOfSeats) < 1) {
        showDialog({
          title: 'Champs requis',
          message: 'Veuillez spécifier le nombre de places',
          variant: 'danger',
        });
        return;
      }
      if (departureDateMax <= departureDateMin) {
        showDialog({
          title: 'Dates invalides',
          message: 'La date de départ maximum doit être postérieure à la date minimum',
          variant: 'danger',
        });
        return;
      }
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'details') {
      setStep('route');
    } else if (step === 'confirm') {
      setStep('details');
    } else {
      router.back();
    }
  };

  const handleCreateRequest = async () => {
    if (!departureLocation || !arrivalLocation) {
      return;
    }

    try {
      await createTripRequest({
        departureLocation: departureLocation.title,
        departureCoordinates: [departureLocation.longitude, departureLocation.latitude],
        arrivalLocation: arrivalLocation.title,
        arrivalCoordinates: [arrivalLocation.longitude, arrivalLocation.latitude],
        departureDateMin: departureDateMin.toISOString(),
        departureDateMax: departureDateMax.toISOString(),
        numberOfSeats: parseInt(numberOfSeats),
        maxPricePerSeat: maxPricePerSeat ? parseFloat(maxPricePerSeat) : undefined,
        description: description.trim() || undefined,
      }).unwrap();

      showDialog({
        title: 'Demande créée',
        message: 'Votre demande de trajet a été créée avec succès. Les drivers pourront maintenant vous proposer leurs services.',
        variant: 'success',
        actions: [
          {
            label: 'OK',
            variant: 'primary',
            onPress: () => {
              router.back();
            },
          },
        ],
      });
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de créer la demande de trajet',
        variant: 'danger',
      });
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'route' && 'Itinéraire'}
          {step === 'details' && 'Détails'}
          {step === 'confirm' && 'Confirmation'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Étape 1: Itinéraire */}
        {step === 'route' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Où souhaitez-vous aller ?</Text>
            <Text style={styles.stepSubtitle}>Sélectionnez votre point de départ et d'arrivée</Text>

            <TouchableOpacity
              style={styles.locationButton}
              onPress={() => setActivePicker('departure')}
            >
              <View style={styles.locationButtonContent}>
                <Ionicons name="location" size={24} color={Colors.success} />
                <View style={styles.locationButtonText}>
                  <Text style={styles.locationLabel}>Départ</Text>
                  <Text style={styles.locationValue}>
                    {departureLocation?.title || 'Choisir le point de départ'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationButton}
              onPress={() => setActivePicker('arrival')}
            >
              <View style={styles.locationButtonContent}>
                <Ionicons name="navigate" size={24} color={Colors.primary} />
                <View style={styles.locationButtonText}>
                  <Text style={styles.locationLabel}>Arrivée</Text>
                  <Text style={styles.locationValue}>
                    {arrivalLocation?.title || 'Choisir le point d\'arrivée'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>
        )}

        {/* Étape 2: Détails */}
        {step === 'details' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Détails de votre demande</Text>
            <Text style={styles.stepSubtitle}>Remplissez les informations nécessaires</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date et heure de départ minimum</Text>
              <TouchableOpacity style={styles.dateButton} onPress={openDatePickerMin}>
                <Ionicons name="calendar" size={20} color={Colors.primary} />
                <Text style={styles.dateButtonText}>{formatDate(departureDateMin)}</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' && showDatePickerMin && (
                <DateTimePicker
                  value={departureDateMin}
                  mode="datetime"
                  display="default"
                  onChange={handleDateMinChange}
                  minimumDate={new Date()}
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date et heure de départ maximum (délai)</Text>
              <TouchableOpacity style={styles.dateButton} onPress={openDatePickerMax}>
                <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                <Text style={styles.dateButtonText}>{formatDate(departureDateMax)}</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' && showDatePickerMax && (
                <DateTimePicker
                  value={departureDateMax}
                  mode="datetime"
                  display="default"
                  onChange={handleDateMaxChange}
                  minimumDate={departureDateMin}
                />
              )}
              <Text style={styles.helperText}>
                Les drivers pourront proposer un départ entre ces deux dates
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre de places</Text>
              <TextInput
                style={styles.input}
                value={numberOfSeats}
                onChangeText={setNumberOfSeats}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Prix maximum par place (FC) - Optionnel</Text>
              <TextInput
                style={styles.input}
                value={maxPricePerSeat}
                onChangeText={setMaxPricePerSeat}
                keyboardType="decimal-pad"
                placeholder="Laissez vide si aucun maximum"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description - Optionnel</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                placeholder="Ajoutez des détails sur votre demande..."
                placeholderTextColor={Colors.gray[400]}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {/* Étape 3: Confirmation */}
        {step === 'confirm' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Confirmer votre demande</Text>
            <Text style={styles.stepSubtitle}>Vérifiez les informations avant de publier</Text>

            <View style={styles.confirmCard}>
              <View style={styles.confirmRow}>
                <Ionicons name="location" size={20} color={Colors.success} />
                <Text style={styles.confirmLabel}>Départ:</Text>
                <Text style={styles.confirmValue}>{departureLocation?.title}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Ionicons name="navigate" size={20} color={Colors.primary} />
                <Text style={styles.confirmLabel}>Arrivée:</Text>
                <Text style={styles.confirmValue}>{arrivalLocation?.title}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Ionicons name="calendar" size={20} color={Colors.gray[600]} />
                <Text style={styles.confirmLabel}>Départ min:</Text>
                <Text style={styles.confirmValue}>{formatDateShort(departureDateMin)}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Ionicons name="calendar-outline" size={20} color={Colors.gray[600]} />
                <Text style={styles.confirmLabel}>Départ max:</Text>
                <Text style={styles.confirmValue}>{formatDateShort(departureDateMax)}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Ionicons name="people" size={20} color={Colors.gray[600]} />
                <Text style={styles.confirmLabel}>Places:</Text>
                <Text style={styles.confirmValue}>{numberOfSeats}</Text>
              </View>
              {maxPricePerSeat && (
                <View style={styles.confirmRow}>
                  <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                  <Text style={styles.confirmLabel}>Prix max/place:</Text>
                  <Text style={styles.confirmValue}>{maxPricePerSeat} FC</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Boutons d'action */}
        <View style={styles.actions}>
          {step !== 'confirm' ? (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleNextStep}
            >
              <Text style={styles.buttonText}>Suivant</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleCreateRequest}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>Publier la demande</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Location Picker Modal */}
      <LocationPickerModal
        visible={activePicker !== null}
        title={activePicker === 'departure' ? 'Choisir le départ' : 'Choisir l\'arrivée'}
        initialLocation={activePicker === 'departure' ? departureLocation : arrivalLocation}
        onClose={() => setActivePicker(null)}
        onSelect={(location) => {
          if (activePicker === 'departure') {
            setDepartureLocation(location);
          } else {
            setArrivalLocation(location);
          }
          setActivePicker(null);
        }}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    marginRight: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  stepContainer: {
    marginBottom: Spacing.xl,
  },
  stepTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    marginBottom: Spacing.xl,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  locationButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationButtonText: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  locationLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  locationValue: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  textArea: {
    minHeight: 100,
    paddingTop: Spacing.md,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  dateButtonText: {
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    flex: 1,
  },
  helperText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  confirmCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  confirmLabel: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginLeft: Spacing.sm,
    marginRight: Spacing.xs,
  },
  confirmValue: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    flex: 1,
  },
  actions: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  button: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
});

