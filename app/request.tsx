import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useCreateTripRequestMutation } from '@/store/api/tripRequestApi';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type RequestStep = 'route' | 'details' | 'confirm';

const STEPS: { id: RequestStep; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'route', label: 'Trajet', icon: 'map' },
  { id: 'details', label: 'Détails', icon: 'options' },
  { id: 'confirm', label: 'Fin', icon: 'checkmark-circle' },
];

export default function RequestTripScreen() {
  const router = useRouter();
  const [step, setStep] = useState<RequestStep>('route');
  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();
  const { showDialog } = useDialog();

  // États pour les étapes
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [departureDateMin, setDepartureDateMin] = useState(new Date());
  const [departureDateMax, setDepartureDateMax] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [iosPickerModeMin, setIosPickerModeMin] = useState<'date' | 'time' | null>(null);
  const [iosPickerModeMax, setIosPickerModeMax] = useState<'date' | 'time' | null>(null);
  const [numberOfSeats, setNumberOfSeats] = useState('1');
  const [maxPricePerSeat, setMaxPricePerSeat] = useState('');
  const [description, setDescription] = useState('');

  // Modals
  const [activePicker, setActivePicker] = useState<'departure' | 'arrival' | null>(null);

  const applyDatePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setFullYear(date.getFullYear());
    next.setMonth(date.getMonth());
    next.setDate(date.getDate());
    return next;
  };

  const applyTimePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setHours(date.getHours());
    next.setMinutes(date.getMinutes());
    next.setSeconds(0);
    next.setMilliseconds(0);
    return next;
  };

  const openDateOrTimePickerMin = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: departureDateMin,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          setDepartureDateMin(
            mode === 'date' 
              ? applyDatePart(selectedDate, departureDateMin) 
              : applyTimePart(selectedDate, departureDateMin)
          );
          if (mode === 'date' && selectedDate >= departureDateMax) {
            setDepartureDateMax(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000));
          }
        },
      });
    } else {
      setIosPickerModeMin(mode);
    }
  };

  const openDateOrTimePickerMax = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: departureDateMax,
        is24Hour: true,
        minimumDate: mode === 'date' ? departureDateMin : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, departureDateMax) 
            : applyTimePart(selectedDate, departureDateMax);
          setDepartureDateMax(newDate);
        },
      });
    } else {
      setIosPickerModeMax(mode);
    }
  };

  const handleIosPickerChangeMin = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerModeMin) return;
    const newDate = iosPickerModeMin === 'date' 
      ? applyDatePart(selectedDate, departureDateMin) 
      : applyTimePart(selectedDate, departureDateMin);
    setDepartureDateMin(newDate);
    if (iosPickerModeMin === 'date' && newDate >= departureDateMax) {
      setDepartureDateMax(newDate);
    }
  };

  const handleIosPickerChangeMax = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerModeMax) return;
    const newDate = iosPickerModeMax === 'date' 
      ? applyDatePart(selectedDate, departureDateMax) 
      : applyTimePart(selectedDate, departureDateMax);
    setDepartureDateMax(newDate);
  };

  const handleNextStep = () => {
    if (step === 'route') {
      if (!departureLocation || !arrivalLocation) {
        showDialog({
          title: 'Destination requise',
          message: 'Où allez-vous ? Sélectionnez vos points de départ et d\'arrivée.',
          variant: 'danger',
        });
        return;
      }
      setStep('details');
    } else if (step === 'details') {
      if (!numberOfSeats || parseInt(numberOfSeats) < 1) {
        showDialog({
          title: 'Places requises',
          message: 'Combien de personnes voyagent avec vous ?',
          variant: 'danger',
        });
        return;
      }
      if (departureDateMin >= departureDateMax) {
        showDialog({
          title: 'Dates invalides',
          message: 'Le délai maximum doit être après le départ minimum.',
          variant: 'danger',
        });
        return;
      }
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'details') setStep('route');
    else if (step === 'confirm') setStep('details');
    else router.back();
  };

  const handleCreateRequest = async () => {
    if (!departureLocation || !arrivalLocation) return;
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
        title: 'Demande publiée !',
        message: 'Les chauffeurs seront bientôt notifiés de votre demande.',
        variant: 'success',
        actions: [{ label: 'voir mes demandes', variant: 'primary', onPress: () => router.push('/my-requests') }],
      });
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de créer la demande.',
        variant: 'danger',
      });
    }
  };

  const StepIndicator = () => (
    <View style={styles.stepIndicatorContainer}>
      {STEPS.map((s, idx) => {
        const isActive = step === s.id;
        const isCompleted = STEPS.findIndex(x => x.id === step) > idx;
        return (
          <React.Fragment key={s.id}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                isActive && styles.stepCircleActive,
                isCompleted && styles.stepCircleCompleted
              ]}>
                {isCompleted ? (
                  <Ionicons name="checkmark" size={16} color={Colors.white} />
                ) : (
                  <Ionicons name={s.icon} size={16} color={isActive ? Colors.primary : Colors.gray[400]} />
                )}
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{s.label}</Text>
            </View>
            {idx < STEPS.length - 1 && (
              <View style={[styles.stepLine, isCompleted && styles.stepLineCompleted]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demander un trajet</Text>
        <View style={{ width: 40 }} />
      </View>

      <StepIndicator />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'route' && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepWrapper}>
              <Text style={styles.sectionTitle}>Votre itinéraire</Text>
              <View style={styles.routeCard}>
                <View style={styles.routeVisual}>
                  <View style={styles.dotGreen} />
                  <View style={styles.routeLine} />
                  <View style={styles.dotBlue} />
                </View>
                <View style={styles.routeInputs}>
                  <TouchableOpacity
                    style={styles.locationSelector}
                    onPress={() => setActivePicker('departure')}
                  >
                    <Text style={styles.locationLabel}>DÉPART</Text>
                    <Text style={styles.locationValue} numberOfLines={1}>
                      {departureLocation?.title || 'Ma position actuelle'}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.locationSelector}
                    onPress={() => setActivePicker('arrival')}
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
                  Les trajets spontanés permettent aux drivers à proximité de vous proposer leurs services rapidement.
                </Text>
              </View>
            </Animated.View>
          )}

          {step === 'details' && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepWrapper}>
              <Text style={styles.sectionTitle}>Horaires et options</Text>
              
              <View style={styles.card}>
                <Text style={styles.cardLabel}>QUAND VOULEZ-VOUS PARTIR ?</Text>
                <View style={styles.timeRangeContainer}>
                  <View style={styles.timeBox}>
                    <Text style={styles.timeLabel}>AU PLUS TÔT</Text>
                    <TouchableOpacity onPress={() => openDateOrTimePickerMin('time')} style={styles.timeValueBox}>
                      <Text style={styles.timeValue}>
                        {departureDateMin.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={Colors.gray[300]} style={{ marginTop: 25 }} />
                  <View style={styles.timeBox}>
                    <Text style={styles.timeLabel}>AU PLUS TARD</Text>
                    <TouchableOpacity onPress={() => openDateOrTimePickerMax('time')} style={styles.timeValueBox}>
                      <Text style={styles.timeValue}>
                        {departureDateMax.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity onPress={() => openDateOrTimePickerMin('date')} style={styles.dateSelector}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                  <Text style={styles.dateText}>
                    {departureDateMin.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.row}>
                <View style={[styles.card, { flex: 1, marginRight: Spacing.sm }]}>
                  <Text style={styles.cardLabel}>PLACES</Text>
                  <View style={styles.counterContainer}>
                    <TouchableOpacity 
                      onPress={() => setNumberOfSeats(Math.max(1, parseInt(numberOfSeats) - 1).toString())}
                      style={styles.counterBtn}
                    >
                      <Ionicons name="remove" size={20} color={Colors.gray[900]} />
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>{numberOfSeats}</Text>
                    <TouchableOpacity 
                      onPress={() => setNumberOfSeats((parseInt(numberOfSeats) + 1).toString())}
                      style={styles.counterBtn}
                    >
                      <Ionicons name="add" size={20} color={Colors.gray[900]} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.card, { flex: 1.5 }]}>
                  <Text style={styles.cardLabel}>PRIX MAX (FACULTATIF)</Text>
                  <View style={styles.priceInputContainer}>
                    <TextInput
                      style={styles.priceInput}
                      value={maxPricePerSeat}
                      onChangeText={setMaxPricePerSeat}
                      keyboardType="number-pad"
                      placeholder="FC"
                    />
                    <Text style={styles.currency}>FC</Text>
                  </View>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>NOTES POUR LE CHAUFFEUR</Text>
                <TextInput
                  style={styles.textArea}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  placeholder="Ex: Bagages volumineux, bébé à bord..."
                  placeholderTextColor={Colors.gray[400]}
                />
              </View>
            </Animated.View>
          )}

          {step === 'confirm' && (
            <Animated.View entering={FadeIn} style={styles.stepWrapper}>
              <Text style={styles.sectionTitle}>Résumé de votre demande</Text>
              <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <LinearGradient
                    colors={[Colors.primary, '#6366f1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.summaryHeaderGradient}
                  >
                    <Text style={styles.summaryHeaderText}>VOTRE TRAJET</Text>
                    <Ionicons name="car-sport" size={24} color={Colors.white} />
                  </LinearGradient>
                </View>
                
                <View style={styles.summaryBody}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryDotGreen} />
                    <Text style={styles.summaryLocation} numberOfLines={2}>{departureLocation?.title}</Text>
                  </View>
                  <View style={styles.summaryLine} />
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryDotBlue} />
                    <Text style={styles.summaryLocation} numberOfLines={2}>{arrivalLocation?.title}</Text>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryGrid}>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>HEURE</Text>
                      <Text style={styles.gridValue}>
                        {departureDateMin.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>PLACES</Text>
                      <Text style={styles.gridValue}>{numberOfSeats}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>PRIX MAX</Text>
                      <Text style={styles.gridValue}>{maxPricePerSeat || 'Libre'} {maxPricePerSeat ? 'FC' : ''}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.summaryFooter}>
                  <Text style={styles.summaryFooterText}>
                    En publiant cette demande, vous acceptez que les drivers à proximité puissent vous contacter.
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={step === 'confirm' ? handleCreateRequest : handleNextStep}
          disabled={isCreating}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={step === 'confirm' ? [Colors.success, '#10b981'] : [Colors.primary, '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.mainButton}
          >
            {isCreating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.mainButtonText}>
                  {step === 'confirm' ? 'Publier ma demande' : 'Continuer'}
                </Text>
                <Ionicons name={step === 'confirm' ? 'send' : 'arrow-forward'} size={20} color={Colors.white} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <LocationPickerModal
        visible={activePicker !== null}
        title={activePicker === 'departure' ? 'Lieu de départ' : 'Lieu d\'arrivée'}
        initialLocation={activePicker === 'departure' ? departureLocation : arrivalLocation}
        onClose={() => setActivePicker(null)}
        onSelect={(location) => {
          if (activePicker === 'departure') setDepartureLocation(location);
          else setArrivalLocation(location);
          setActivePicker(null);
        }}
      />

      {Platform.OS === 'ios' && (iosPickerModeMin || iosPickerModeMax) && (
        <Modal transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerContainer}>
              <DateTimePicker
                value={iosPickerModeMin ? departureDateMin : departureDateMax}
                mode={iosPickerModeMin || iosPickerModeMax || 'date'}
                display="spinner"
                onChange={iosPickerModeMin ? handleIosPickerChangeMin : handleIosPickerChangeMax}
              />
              <TouchableOpacity
                style={styles.iosPickerCloseButton}
                onPress={() => { setIosPickerModeMin(null); setIosPickerModeMax(null); }}
              >
                <Text style={styles.iosPickerCloseText}>Terminer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 1,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stepCircleActive: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  stepCircleCompleted: {
    backgroundColor: Colors.primary,
  },
  stepLabel: {
    fontSize: 10,
    color: Colors.gray[400],
    fontWeight: FontWeights.medium,
    marginTop: 4,
  },
  stepLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.gray[100],
    marginHorizontal: -8,
    marginTop: -16,
  },
  stepLineCompleted: {
    backgroundColor: Colors.primary,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  stepWrapper: {
    flex: 1,
  },
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
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 18,
  },
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
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  timeBox: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 10,
    color: Colors.gray[500],
    marginBottom: 4,
  },
  timeValueBox: {
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  timeValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '05',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '15',
  },
  dateText: {
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
    textTransform: 'capitalize',
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
  },
  priceInput: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  currency: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
    marginLeft: 4,
  },
  textArea: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    minHeight: 80,
    textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  summaryHeader: {
    height: 60,
  },
  summaryHeaderGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  summaryHeaderText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    letterSpacing: 2,
  },
  summaryBody: {
    padding: Spacing.xl,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 3,
    borderColor: Colors.success + '30',
  },
  summaryDotBlue: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.primary + '30',
  },
  summaryLocation: {
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    flex: 1,
  },
  summaryLine: {
    width: 2,
    height: 24,
    backgroundColor: Colors.gray[100],
    marginLeft: 5,
    marginVertical: 4,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.xl,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridItem: {
    flex: 1,
  },
  gridLabel: {
    fontSize: 10,
    color: Colors.gray[400],
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  gridValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  summaryFooter: {
    backgroundColor: Colors.gray[50],
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  summaryFooterText: {
    fontSize: 12,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  mainButton: {
    height: 56,
    borderRadius: BorderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  mainButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  iosPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  iosPickerContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.md,
  },
  iosPickerCloseButton: {
    padding: Spacing.lg,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  iosPickerCloseText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
});
