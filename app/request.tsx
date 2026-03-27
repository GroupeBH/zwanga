import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useCreateTripRequestMutation } from '@/store/api/tripRequestApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import type { FavoriteLocation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useMemo, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type TimePreset = 'now' | 'soon' | 'later' | 'tomorrow' | 'custom';
type PickerTarget = 'departure' | 'arrival';

const TIME_PRESETS: {
  id: TimePreset;
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'now', label: 'Maintenant', caption: 'Départ rapide', icon: 'flash' },
  { id: 'soon', label: 'Dans 30 min', caption: 'Encore un peu', icon: 'time' },
  { id: 'later', label: 'Plus tard', caption: "Aujourd'hui", icon: 'calendar-outline' },
  { id: 'tomorrow', label: 'Demain matin', caption: 'Planifié', icon: 'sunny-outline' },
  { id: 'custom', label: 'Je choisis', caption: 'Date et heure', icon: 'create-outline' },
];

const FLEX_OPTIONS = [0, 30, 60, 120];

function roundToStep(date: Date, step: number) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % step;
  if (remainder) next.setMinutes(next.getMinutes() + (step - remainder));
  return next;
}

function buildPresetWindow(preset: Exclude<TimePreset, 'custom'>) {
  const now = new Date();
  if (preset === 'now') return { min: roundToStep(new Date(now.getTime() + 5 * 60000), 5), flex: 40 };
  if (preset === 'soon') return { min: roundToStep(new Date(now.getTime() + 30 * 60000), 10), flex: 60 };
  if (preset === 'later') return { min: roundToStep(new Date(now.getTime() + 2 * 3600000), 15), flex: 90 };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);
  return { min: tomorrow, flex: 180 };
}

function applyDatePart(date: Date, current: Date) {
  const next = new Date(current);
  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return next;
}

function applyTimePart(date: Date, current: Date) {
  const next = new Date(current);
  next.setHours(date.getHours(), date.getMinutes(), 0, 0);
  return next;
}

function formatAddress(data?: Partial<Location.LocationGeocodedAddress>) {
  if (!data) return '';
  const street = [data.streetNumber, data.street].filter(Boolean).join(' ').trim();
  return [data.name, street, data.district, data.city || data.subregion, data.region]
    .map((value) => value?.toString().trim())
    .filter(Boolean)
    .join(', ');
}

function buildSelection(
  coordinate: { latitude: number; longitude: number },
  address?: Partial<Location.LocationGeocodedAddress>,
): MapLocationSelection {
  return {
    title: address?.name || address?.street || 'Ma position',
    address:
      formatAddress(address) ||
      `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function favoriteIcon(type: FavoriteLocation['type']) {
  if (type === 'home') return 'home';
  if (type === 'work') return 'briefcase';
  return 'location';
}

export default function RequestTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showDialog } = useDialog();
  const { isIdentityVerified, isChecking: isCheckingIdentity, checkIdentity } = useIdentityCheck();
  const { data: favoriteLocations = [] } = useGetFavoriteLocationsQuery();
  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();
  const [initialWindow] = useState(() => buildPresetWindow('now'));
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [activePicker, setActivePicker] = useState<PickerTarget | null>(null);
  const [timePreset, setTimePreset] = useState<TimePreset>('now');
  const [departureDateMin, setDepartureDateMin] = useState(initialWindow.min);
  const [flexibilityMinutes, setFlexibilityMinutes] = useState(initialWindow.flex);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [numberOfSeats, setNumberOfSeats] = useState(1);
  const [maxPricePerSeat, setMaxPricePerSeat] = useState('');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const departureDateMax = useMemo(
    () => new Date(departureDateMin.getTime() + flexibilityMinutes * 60000),
    [departureDateMin, flexibilityMinutes],
  );

  const routeSummary = useMemo(() => {
    if (departureLocation && arrivalLocation) return `${departureLocation.title} → ${arrivalLocation.title}`;
    if (departureLocation) return `Départ : ${departureLocation.title}`;
    return 'Choisissez votre départ et votre destination';
  }, [arrivalLocation, departureLocation]);

  const timeSummary = useMemo(() => {
    if (flexibilityMinutes === 0) return `${formatDateLabel(departureDateMin)} à ${formatTimeLabel(departureDateMin)}`;
    return `${formatDateLabel(departureDateMin)} entre ${formatTimeLabel(departureDateMin)} et ${formatTimeLabel(departureDateMax)}`;
  }, [departureDateMax, departureDateMin, flexibilityMinutes]);

  const primaryLabel = !departureLocation
    ? 'Choisir mon départ'
    : !arrivalLocation
      ? 'Choisir ma destination'
      : !isIdentityVerified
        ? isCheckingIdentity
          ? 'Vérification en cours...'
          : 'Continuer avec ma vérification'
        : 'Publier ma demande';

  const applyPreset = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset === 'custom') return;
    const next = buildPresetWindow(preset);
    setDepartureDateMin(next.min);
    setFlexibilityMinutes(next.flex);
  };

  const openCustomPicker = (mode: 'date' | 'time') => {
    setTimePreset('custom');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: departureDateMin,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          setDepartureDateMin((current) =>
            mode === 'date' ? applyDatePart(selectedDate, current) : applyTimePart(selectedDate, current),
          );
        },
      });
      return;
    }
    setIosPickerMode(mode);
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !iosPickerMode) return;
    setDepartureDateMin((current) =>
      iosPickerMode === 'date' ? applyDatePart(selectedDate, current) : applyTimePart(selectedDate, current),
    );
  };

  const handleUseCurrentLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        showDialog({
          title: 'Localisation non disponible',
          message:
            "Autorisez l'accès à la localisation si vous voulez partir d'ici. Sinon, choisissez un repère manuellement.",
          variant: 'warning',
        });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      setDepartureLocation(buildSelection(coordinate, address));
      if (!arrivalLocation) setTimeout(() => setActivePicker('arrival'), 150);
    } catch (error) {
      console.warn('Impossible de récupérer la position actuelle', error);
      showDialog({
        title: 'Position introuvable',
        message: 'Choisissez simplement votre départ dans la recherche ou sur la carte.',
        variant: 'danger',
      });
    } finally {
      setIsLocating(false);
    }
  };

  const validate = () => {
    if (!departureLocation) return setActivePicker('departure'), false;
    if (!arrivalLocation) return setActivePicker('arrival'), false;
    if (
      departureLocation.latitude === arrivalLocation.latitude &&
      departureLocation.longitude === arrivalLocation.longitude
    ) {
      showDialog({
        title: 'Trajet incomplet',
        message: 'Choisissez deux lieux différents pour le départ et la destination.',
        variant: 'warning',
      });
      return false;
    }
    if (departureDateMin >= departureDateMax || departureDateMin.getTime() < Date.now() - 60000) {
      showDialog({
        title: 'Heure invalide',
        message: 'Choisissez une heure de départ à venir.',
        variant: 'warning',
      });
      return false;
    }
    return true;
  };

  const handleCreateRequest = async () => {
    if (!validate() || !departureLocation || !arrivalLocation) return;
    if (!isIdentityVerified) {
      const canProceed = checkIdentity('request');
      if (!canProceed) return;
    }
    try {
      await createTripRequest({
        departureLocation: departureLocation.title,
        departureCoordinates: [departureLocation.longitude, departureLocation.latitude],
        arrivalLocation: arrivalLocation.title,
        arrivalCoordinates: [arrivalLocation.longitude, arrivalLocation.latitude],
        departureDateMin: departureDateMin.toISOString(),
        departureDateMax: departureDateMax.toISOString(),
        numberOfSeats,
        maxPricePerSeat: maxPricePerSeat ? parseFloat(maxPricePerSeat) : undefined,
        description: description.trim() || undefined,
      }).unwrap();
      showDialog({
        title: 'Demande publiée',
        message: 'Votre demande sera visible par les conducteurs qui peuvent vous proposer un covoiturage.',
        variant: 'success',
        actions: [{ label: 'Fermer', variant: 'primary' }],
      });
      router.replace('/(tabs)');
    } catch (error: any) {
      showDialog({
        title: 'Envoi impossible',
        message: error?.data?.message || 'Impossible de créer la demande pour le moment.',
        variant: 'danger',
      });
    }
  };

  const handlePrimaryAction = async () => {
    if (!departureLocation) return setActivePicker('departure');
    if (!arrivalLocation) return setActivePicker('arrival');
    if (!isIdentityVerified) return void checkIdentity('request');
    await handleCreateRequest();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demande de covoiturage</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={['#0F766E', '#14B8A6']} style={styles.hero}>
            <Text style={styles.heroPill}>Mode simple</Text>
            <Text style={styles.heroTitle}>Dites-nous d&apos;où vous partez, où vous allez et quand.</Text>
            <Text style={styles.heroSubtitle}>
              Ensuite, des conducteurs pourront vous faire une proposition de covoiturage simple à comprendre.
            </Text>
          </LinearGradient>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.cardTitle}>Votre trajet</Text>
                <Text style={styles.cardSubtitle}>Repère, quartier, marché, église ou rond-point.</Text>
              </View>
              <TouchableOpacity style={styles.iconCircle} onPress={() => {
                setDepartureLocation(arrivalLocation);
                setArrivalLocation(departureLocation);
              }}>
                <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.routeRow} onPress={() => setActivePicker('departure')}>
              <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
              <View style={styles.routeText}>
                <Text style={styles.routeLabel}>Je pars de</Text>
                <Text style={[styles.routeValue, !departureLocation && styles.placeholder]} numberOfLines={1}>
                  {departureLocation?.title || 'Touchez pour choisir votre départ'}
                </Text>
                <Text style={styles.routeHint} numberOfLines={1}>
                  {departureLocation?.address || 'Départ manuel ou ma position'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>

            <View style={styles.line} />

            <TouchableOpacity style={styles.routeRow} onPress={() => setActivePicker('arrival')}>
              <View style={[styles.routeDot, styles.squareDot]} />
              <View style={styles.routeText}>
                <Text style={styles.routeLabel}>Je vais vers</Text>
                <Text style={[styles.routeValue, !arrivalLocation && styles.placeholder]} numberOfLines={1}>
                  {arrivalLocation?.title || 'Touchez pour choisir votre destination'}
                </Text>
                <Text style={styles.routeHint} numberOfLines={1}>
                  {arrivalLocation?.address || 'Les repères de Kinshasa sont proposés dans la recherche'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>

            <View style={styles.chipRow}>
              <TouchableOpacity style={[styles.chip, styles.primaryChip]} onPress={handleUseCurrentLocation} disabled={isLocating}>
                {isLocating ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="locate" size={16} color={Colors.primary} />}
                <Text style={styles.chipText}>Partir d&apos;ici</Text>
              </TouchableOpacity>
              {favoriteLocations.slice(0, 3).map((location) => (
                <TouchableOpacity
                  key={location.id}
                  style={styles.chip}
                  onPress={() => {
                    setDepartureLocation({
                      title: location.name,
                      address: location.address,
                      latitude: location.coordinates.latitude,
                      longitude: location.coordinates.longitude,
                    });
                    if (!arrivalLocation) setTimeout(() => setActivePicker('arrival'), 150);
                  }}
                >
                  <Ionicons name={favoriteIcon(location.type)} size={16} color={Colors.primary} />
                  <Text style={styles.chipText}>{location.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Quand voulez-vous partir ?</Text>
            <View style={styles.presetGrid}>
              {TIME_PRESETS.map((preset) => {
                const active = timePreset === preset.id;
                return (
                  <TouchableOpacity key={preset.id} style={[styles.preset, active && styles.presetActive]} onPress={() => applyPreset(preset.id)}>
                    <Ionicons name={preset.icon} size={18} color={active ? Colors.primary : Colors.gray[500]} />
                    <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>{preset.label}</Text>
                    <Text style={styles.presetCaption}>{preset.caption}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="time" size={18} color={Colors.secondary} />
              <Text style={styles.infoCardText}>{timeSummary}</Text>
            </View>

            {timePreset === 'custom' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.customWrap}>
                <TouchableOpacity style={styles.inputLike} onPress={() => openCustomPicker('date')}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                  <Text style={styles.inputLikeText}>{formatDateLabel(departureDateMin)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.inputLike} onPress={() => openCustomPicker('time')}>
                  <Ionicons name="time-outline" size={18} color={Colors.primary} />
                  <Text style={styles.inputLikeText}>{formatTimeLabel(departureDateMin)}</Text>
                </TouchableOpacity>
                <View style={styles.chipRow}>
                  {FLEX_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.chip, flexibilityMinutes === option && styles.flexChipActive]}
                      onPress={() => setFlexibilityMinutes(option)}
                    >
                      <Text style={[styles.chipText, flexibilityMinutes === option && styles.flexChipTextActive]}>
                        {option === 0 ? 'Exact' : option === 60 ? '1 h' : option === 120 ? '2 h' : `${option} min`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Animated.View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Combien de personnes ?</Text>
            <View style={styles.counter}>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setNumberOfSeats((value) => Math.max(1, value - 1))}>
                <Ionicons name="remove" size={20} color={Colors.gray[900]} />
              </TouchableOpacity>
              <View style={styles.counterText}>
                <Text style={styles.counterValue}>{numberOfSeats}</Text>
                <Text style={styles.counterLabel}>{numberOfSeats} personne{numberOfSeats > 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setNumberOfSeats((value) => value + 1)}>
                <Ionicons name="add" size={20} color={Colors.gray[900]} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.cardHeadCompact} onPress={() => setShowAdvanced((value) => !value)}>
            <View>
              <Text style={styles.cardTitle}>Ajouter un budget ou une note</Text>
              <Text style={styles.cardSubtitle}>Facultatif</Text>
            </View>
            <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray[500]} />
          </TouchableOpacity>

          {showAdvanced && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.card}>
              <Text style={styles.smallLabel}>Budget indicatif maximum par place</Text>
              <View style={styles.priceBox}>
                <TextInput style={styles.priceInput} value={maxPricePerSeat} onChangeText={setMaxPricePerSeat} keyboardType="number-pad" placeholder="Ex: 2000" placeholderTextColor={Colors.gray[400]} />
                <Text style={styles.currency}>FC</Text>
              </View>
              <Text style={styles.smallLabel}>Petit message pour les conducteurs</Text>
              <TextInput
                style={styles.textArea}
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder="Ex: J ai un bagage, je voyage avec un enfant..."
                placeholderTextColor={Colors.gray[400]}
              />
            </Animated.View>
          )}

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Resume rapide</Text>
            <Text style={styles.summaryText}>{routeSummary}</Text>
            <Text style={styles.summaryText}>{timeSummary}</Text>
            <Text style={styles.summaryText}>{numberOfSeats} personne{numberOfSeats > 1 ? 's' : ''}</Text>
            {maxPricePerSeat ? <Text style={styles.summaryText}>Maximum {maxPricePerSeat} FC / place</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Text style={styles.footerTitle} numberOfLines={1}>{routeSummary}</Text>
        <Text style={styles.footerText} numberOfLines={1}>{timeSummary}</Text>
        <TouchableOpacity onPress={handlePrimaryAction} disabled={isCreating || isCheckingIdentity}>
          <LinearGradient
            colors={!departureLocation || !arrivalLocation ? [Colors.primary, '#2563EB'] : !isIdentityVerified ? [Colors.warning, '#F97316'] : [Colors.success, '#16A34A']}
            style={styles.mainButton}
          >
            {isCreating || isCheckingIdentity ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.mainButtonText}>{primaryLabel}</Text>
                <Ionicons name={!departureLocation || !arrivalLocation ? 'arrow-forward' : !isIdentityVerified ? 'shield-checkmark-outline' : 'send'} size={18} color={Colors.white} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <LocationPickerModal
        visible={activePicker !== null}
        title={activePicker === 'departure' ? 'Choisir le départ' : 'Choisir la destination'}
        initialLocation={activePicker === 'departure' ? departureLocation : arrivalLocation}
        autoLocateOnOpen={false}
        onClose={() => setActivePicker(null)}
        onSelect={(location) => {
          const target = activePicker;
          setActivePicker(null);
          if (target === 'departure') {
            setDepartureLocation(location);
            if (!arrivalLocation) setTimeout(() => setActivePicker('arrival'), 150);
            return;
          }
          setArrivalLocation(location);
        }}
      />

      {Platform.OS === 'ios' && iosPickerMode && (
        <Modal transparent animationType="slide">
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <DateTimePicker value={departureDateMin} mode={iosPickerMode} display="spinner" onChange={handleIosPickerChange} />
              <TouchableOpacity style={[styles.iosDone, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} onPress={() => setIosPickerMode(null)}>
                <Text style={styles.iosDoneText}>Terminer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  headerButton: { width: 40, height: 40, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  headerSpacer: { width: 40, height: 40 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  hero: { borderRadius: BorderRadius.xxl, padding: Spacing.xl, gap: Spacing.sm },
  heroPill: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.16)', color: Colors.white, fontWeight: FontWeights.semibold },
  heroTitle: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.white, lineHeight: 34 },
  heroSubtitle: { fontSize: FontSizes.base, color: 'rgba(255,255,255,0.92)', lineHeight: 22 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.xxl, padding: Spacing.lg, gap: Spacing.md, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 3 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.md },
  cardHeadCompact: { backgroundColor: Colors.white, borderRadius: BorderRadius.xxl, padding: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  cardSubtitle: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[500] },
  iconCircle: { width: 40, height: 40, borderRadius: BorderRadius.full, backgroundColor: `${Colors.primary}12`, alignItems: 'center', justifyContent: 'center' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  routeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  squareDot: { borderRadius: 3 },
  routeText: { flex: 1 },
  routeLabel: { fontSize: FontSizes.xs, color: Colors.gray[500], textTransform: 'uppercase', fontWeight: FontWeights.bold, letterSpacing: 0.6 },
  routeValue: { marginTop: 4, fontSize: FontSizes.base, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  placeholder: { color: Colors.gray[400] },
  routeHint: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[500] },
  line: { height: 1, backgroundColor: Colors.gray[200], marginLeft: 26 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.gray[100], borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  primaryChip: { backgroundColor: `${Colors.primary}12` },
  chipText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium, color: Colors.gray[800] },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  preset: { width: '48%', minWidth: 140, backgroundColor: Colors.gray[50], borderRadius: BorderRadius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray[100], gap: 6 },
  presetActive: { backgroundColor: `${Colors.primary}10`, borderColor: Colors.primary },
  presetLabel: { fontSize: FontSizes.base, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  presetLabelActive: { color: Colors.primary },
  presetCaption: { fontSize: FontSizes.sm, color: Colors.gray[500] },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gray[50], borderRadius: BorderRadius.xl, padding: Spacing.md },
  infoCardText: { flex: 1, fontSize: FontSizes.base, color: Colors.gray[900], fontWeight: FontWeights.semibold, lineHeight: 22 },
  customWrap: { gap: Spacing.sm },
  inputLike: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.xl, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[100], padding: Spacing.md },
  inputLikeText: { fontSize: FontSizes.base, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  counter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.xl, padding: Spacing.md },
  counterBtn: { width: 48, height: 48, borderRadius: BorderRadius.lg, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  counterText: { alignItems: 'center', gap: 4 },
  counterValue: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  counterLabel: { fontSize: FontSizes.sm, color: Colors.gray[500] },
  smallLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.gray[600] },
  priceBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.xl, paddingHorizontal: Spacing.lg, height: 60, borderWidth: 1, borderColor: Colors.gray[100] },
  priceInput: { flex: 1, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  currency: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[500] },
  textArea: { minHeight: 96, borderRadius: BorderRadius.xl, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[100], padding: Spacing.md, fontSize: FontSizes.base, color: Colors.gray[900], textAlignVertical: 'top', lineHeight: 22 },
  summary: { backgroundColor: Colors.white, borderRadius: BorderRadius.xxl, padding: Spacing.lg, gap: Spacing.xs },
  summaryTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  summaryText: { fontSize: FontSizes.sm, color: Colors.gray[600], lineHeight: 20 },
  footer: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: 4 },
  footerTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  footerText: { fontSize: FontSizes.sm, color: Colors.gray[500] },
  mainButton: { minHeight: 56, borderRadius: BorderRadius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  mainButtonText: { color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.bold },
  iosOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  iosSheet: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingTop: Spacing.md },
  iosDone: { padding: Spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  iosDoneText: { color: Colors.primary, fontWeight: FontWeights.bold, fontSize: FontSizes.base },
});
