import AddressEntryModeSelector, { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import AddressSectionSlider, { type AddressSectionStep } from '@/components/AddressSectionSlider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { trackEvent } from '@/services/analytics';
import { useCreateTripRequestMutation } from '@/store/api/tripRequestApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import type { FavoriteLocation } from '@/types';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
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
type RequestFormStep = 'route' | 'details';

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
const LANDMARK_PLACEHOLDER = 'Ex: devant la station, portail bleu, entr\u00E9e principale';

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

function getLocationText(selection: MapLocationSelection | null, manualAddress: string) {
  return (manualAddress.trim() || selection?.title || selection?.address || '').trim();
}

function getLocationCoordinates(selection: MapLocationSelection | null): [number, number] | undefined {
  if (!selection || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
    return undefined;
  }
  return [selection.longitude, selection.latitude];
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
  const [departureManualAddress, setDepartureManualAddress] = useState('');
  const [departureReference, setDepartureReference] = useState('');
  const [arrivalManualAddress, setArrivalManualAddress] = useState('');
  const [arrivalReference, setArrivalReference] = useState('');
  const [addressInputMode, setAddressInputMode] = useState<AddressInputMode>('map');
  const [addressSectionStep, setAddressSectionStep] = useState<AddressSectionStep>('method');
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
  const [requestFormStep, setRequestFormStep] = useState<RequestFormStep>('route');

  const departureDateMax = useMemo(
    () => new Date(departureDateMin.getTime() + flexibilityMinutes * 60000),
    [departureDateMin, flexibilityMinutes],
  );
  const departureAddress =
    addressInputMode === 'manual'
      ? departureManualAddress.trim()
      : getLocationText(departureLocation, '');
  const arrivalAddress =
    addressInputMode === 'manual'
      ? arrivalManualAddress.trim()
      : getLocationText(arrivalLocation, '');
  const hasDepartureAddress = departureAddress.length > 0;
  const hasArrivalAddress = arrivalAddress.length > 0;
  const canOpenAddressSectionStep = (step: AddressSectionStep) =>
    step !== 'arrival' || hasDepartureAddress;
  const goToPreviousAddressSectionStep = () => {
    setAddressSectionStep((current) => (current === 'arrival' ? 'departure' : 'method'));
  };
  const goToNextAddressSectionStep = () => {
    setAddressSectionStep((current) => (current === 'method' ? 'departure' : 'arrival'));
  };
  const addressSectionNextDisabled = addressSectionStep === 'departure' && !hasDepartureAddress;
  const addressSectionNextLabel =
    addressSectionStep === 'method' ? 'Choisir le départ' : 'Choisir l’arrivée';
  const canOpenRequestDetails = hasDepartureAddress && hasArrivalAddress;

  const routeSummary = useMemo(() => {
    if (hasDepartureAddress && hasArrivalAddress) return `${departureAddress} \u2192 ${arrivalAddress}`;
    if (hasDepartureAddress) return `D\u00E9part : ${departureAddress}`;
    return 'Choisissez votre d\u00E9part et votre destination';
  }, [arrivalAddress, departureAddress, hasArrivalAddress, hasDepartureAddress]);

  const timeSummary = useMemo(() => {
    if (flexibilityMinutes === 0) return `${formatDateLabel(departureDateMin)} à ${formatTimeLabel(departureDateMin)}`;
    return `${formatDateLabel(departureDateMin)} entre ${formatTimeLabel(departureDateMin)} et ${formatTimeLabel(departureDateMax)}`;
  }, [departureDateMax, departureDateMin, flexibilityMinutes]);

  const primaryLabel =
    requestFormStep === 'route'
      ? !hasDepartureAddress
        ? 'Choisir mon départ'
        : !hasArrivalAddress
          ? 'Choisir ma destination'
          : 'Continuer'
      : !isIdentityVerified
        ? isCheckingIdentity
          ? 'Vérification en cours...'
          : 'Continuer avec ma vérification'
        : 'Valider ma demande';

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
      setAddressInputMode('map');
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
      const selection = buildSelection(coordinate, address);
      setDepartureLocation(selection);
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
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
    if (!hasDepartureAddress) {
      setRequestFormStep('route');
      setAddressSectionStep('departure');
      showDialog({
        title: 'Départ requis',
        message: 'Indiquez une adresse de départ ou choisissez un point sur la carte.',
        variant: 'warning',
      });
      return false;
    }
    if (!hasArrivalAddress) {
      setRequestFormStep('route');
      setAddressSectionStep('arrival');
      showDialog({
        title: 'Destination requise',
        message: 'Indiquez une adresse d’arrivée ou choisissez un point sur la carte.',
        variant: 'warning',
      });
      return false;
    }
    if (
      addressInputMode === 'map' &&
      departureLocation &&
      arrivalLocation &&
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
    if (!validate()) return;
    if (!isIdentityVerified) {
      const canProceed = checkIdentity('request');
      if (!canProceed) return;
    }
    const parsedBudget = Number.parseFloat(maxPricePerSeat);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      showDialog({
        title: 'Budget requis',
        message: "Indiquez le montant que vous avez prévu pour la course avant d'envoyer la demande.",
        variant: 'warning',
      });
      return;
    }
    try {
      const departureCoordinates =
        addressInputMode === 'map' ? getLocationCoordinates(departureLocation) : undefined;
      const arrivalCoordinates =
        addressInputMode === 'map' ? getLocationCoordinates(arrivalLocation) : undefined;
      const createdRequest = await createTripRequest({
        departureLocation: departureAddress,
        departureReference: departureReference.trim() || undefined,
        departureCoordinates,
        arrivalLocation: arrivalAddress,
        arrivalReference: arrivalReference.trim() || undefined,
        arrivalCoordinates,
        departureDateMin: departureDateMin.toISOString(),
        departureDateMax: departureDateMax.toISOString(),
        numberOfSeats,
        maxPricePerSeat: parsedBudget,
        description: description.trim() || undefined,
      }).unwrap();
      await trackEvent('trip_request_created', {
        seats: numberOfSeats,
        max_price_per_seat: parsedBudget,
        has_description: Boolean(description.trim()),
        flexibility_minutes: flexibilityMinutes,
      });
      router.push(getTripRequestDetailHref(createdRequest.id));
    } catch (error: any) {
      showDialog({
        title: 'Envoi impossible',
        message: error?.data?.message || 'Impossible de créer la demande pour le moment.',
        variant: 'danger',
      });
    }
  };

  const handlePrimaryAction = async () => {
    if (!hasDepartureAddress) {
      setRequestFormStep('route');
      setAddressSectionStep('departure');
      if (addressInputMode === 'map') setActivePicker('departure');
      return;
    }
    if (!hasArrivalAddress) {
      setRequestFormStep('route');
      setAddressSectionStep('arrival');
      if (addressInputMode === 'map') setActivePicker('arrival');
      return;
    }
    if (requestFormStep === 'route') {
      setRequestFormStep('details');
      return;
    }
    if (!isIdentityVerified) return void checkIdentity('request');
    if (!validate()) return;
    await handleCreateRequest();
  };

  const primaryButtonDisabled = isCreating || isCheckingIdentity;
  const primaryIconName =
    !hasDepartureAddress || !hasArrivalAddress || requestFormStep === 'route'
      ? 'arrow-forward'
      : !isIdentityVerified
        ? 'shield-checkmark-outline'
        : 'send';

  const renderPrimaryButton = () => (
    <TouchableOpacity
      style={styles.mainButtonWrap}
      onPress={handlePrimaryAction}
      disabled={primaryButtonDisabled}
      activeOpacity={0.9}
    >
      <View style={[styles.mainButton, primaryButtonDisabled && styles.mainButtonDisabled]}>
        {primaryButtonDisabled ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Text style={styles.mainButtonText}>{primaryLabel}</Text>
            <Ionicons name={primaryIconName} size={18} color={Colors.white} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );

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
          <View style={styles.requestStepper}>
            <TouchableOpacity
              style={[styles.requestStepPill, requestFormStep === 'route' && styles.requestStepPillActive]}
              onPress={() => setRequestFormStep('route')}
              activeOpacity={0.9}
            >
              <View style={[styles.requestStepNumber, requestFormStep === 'route' && styles.requestStepNumberActive]}>
                <Text style={[styles.requestStepNumberText, requestFormStep === 'route' && styles.requestStepNumberTextActive]}>1</Text>
              </View>
              <Text style={[styles.requestStepLabel, requestFormStep === 'route' && styles.requestStepLabelActive]}>
                Trajet
              </Text>
            </TouchableOpacity>
            <View style={[styles.requestStepLine, canOpenRequestDetails && styles.requestStepLineActive]} />
            <TouchableOpacity
              style={[
                styles.requestStepPill,
                requestFormStep === 'details' && styles.requestStepPillActive,
                !canOpenRequestDetails && styles.requestStepPillDisabled,
              ]}
              onPress={() => {
                if (canOpenRequestDetails) setRequestFormStep('details');
              }}
              disabled={!canOpenRequestDetails}
              activeOpacity={0.9}
            >
              <View style={[styles.requestStepNumber, requestFormStep === 'details' && styles.requestStepNumberActive]}>
                <Text style={[styles.requestStepNumberText, requestFormStep === 'details' && styles.requestStepNumberTextActive]}>2</Text>
              </View>
              <Text style={[styles.requestStepLabel, requestFormStep === 'details' && styles.requestStepLabelActive]}>
                Détails
              </Text>
            </TouchableOpacity>
          </View>

          {requestFormStep === 'route' && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.cardTitle}>Votre trajet</Text>
                <Text style={styles.cardSubtitle}>Repère, quartier, marché, église ou rond-point.</Text>
              </View>
              <TouchableOpacity style={styles.iconCircle} onPress={() => {
                setDepartureLocation(arrivalLocation);
                setArrivalLocation(departureLocation);
                setDepartureManualAddress(arrivalManualAddress);
                setArrivalManualAddress(departureManualAddress);
                setDepartureReference(arrivalReference);
                setArrivalReference(departureReference);
              }}>
                <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <AddressSectionSlider
              activeStep={addressSectionStep}
              completedSteps={{
                method: true,
                departure: hasDepartureAddress,
                arrival: hasArrivalAddress,
              }}
              canOpenStep={canOpenAddressSectionStep}
              nextDisabled={addressSectionNextDisabled}
              nextLabel={addressSectionNextLabel}
              onBack={goToPreviousAddressSectionStep}
              onNext={goToNextAddressSectionStep}
              onStepChange={setAddressSectionStep}
            >
              {addressSectionStep === 'method' && (
                <AddressEntryModeSelector
                  mode={addressInputMode}
                  onChange={setAddressInputMode}
                  title="Comment renseigner les adresses ?"
                  hint="Choisissez une seule méthode pour le départ et l’arrivée."
                />
              )}

              {addressSectionStep === 'departure' && (
                <>
                  <View style={styles.addressBlock}>
                    <View style={styles.routeRow}>
                      <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
                      <View style={styles.routeText}>
                        <Text style={styles.routeLabel}>Adresse de départ</Text>
                        <Text style={styles.routeHint}>
                          {addressInputMode === 'map'
                            ? 'Choisissez le point de départ sur la carte.'
                            : 'Écrivez l’adresse de départ, sans chercher un point GPS.'}
                        </Text>
                      </View>
                    </View>

                    {addressInputMode === 'map' && (
                      <View style={styles.addressChoiceRow}>
                        <TouchableOpacity
                          style={[styles.addressChoiceButton, departureLocation && styles.addressChoiceButtonActive]}
                          onPress={() => setActivePicker('departure')}
                          activeOpacity={0.9}
                        >
                          <Ionicons name="map-outline" size={18} color={departureLocation ? Colors.primary : Colors.gray[600]} />
                          <View style={styles.addressChoiceText}>
                            <Text style={styles.addressChoiceTitle}>Choisir sur la carte</Text>
                            <Text style={styles.addressChoiceHint} numberOfLines={1}>
                              {departureLocation?.title || 'Choisir sur la carte'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.manualLocationGroup}>
                    {addressInputMode === 'manual' && (
                      <>
                        <Text style={styles.manualLocationLabel}>Adresse de départ</Text>
                        <TextInput
                          style={styles.manualLocationInput}
                          value={departureManualAddress}
                          onChangeText={setDepartureManualAddress}
                          placeholder="Ex: avenue Kasa-Vubu, Bandal"
                          placeholderTextColor={Colors.gray[400]}
                        />
                      </>
                    )}
                    <Text style={styles.manualLocationLabel}>Repère de départ (optionnel)</Text>
                    <TextInput
                      style={styles.manualLocationInput}
                      value={departureReference}
                      onChangeText={setDepartureReference}
                      placeholder={LANDMARK_PLACEHOLDER}
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>

                  {addressInputMode === 'map' && (
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
                            const selection = {
                              title: location.name,
                              address: location.address,
                              latitude: location.coordinates.latitude,
                              longitude: location.coordinates.longitude,
                            };
                            setAddressInputMode('map');
                            setDepartureLocation(selection);
                            setDepartureManualAddress(selection.title || selection.address);
                            setAddressSectionStep('arrival');
                          }}
                        >
                          <Ionicons name={favoriteIcon(location.type)} size={16} color={Colors.primary} />
                          <Text style={styles.chipText}>{location.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {addressSectionStep === 'arrival' && (
                <>
                  <View style={styles.addressBlock}>
                    <View style={styles.routeRow}>
                      <View style={[styles.routeDot, styles.squareDot]} />
                      <View style={styles.routeText}>
                        <Text style={styles.routeLabel}>Adresse d’arrivée</Text>
                        <Text style={styles.routeHint}>
                          {addressInputMode === 'map'
                            ? 'Choisissez le point d’arrivée sur la carte.'
                            : 'Écrivez l’adresse d’arrivée, même sans coordonnées.'}
                        </Text>
                      </View>
                    </View>

                    {addressInputMode === 'map' && (
                      <View style={styles.addressChoiceRow}>
                        <TouchableOpacity
                          style={[styles.addressChoiceButton, arrivalLocation && styles.addressChoiceButtonActive]}
                          onPress={() => setActivePicker('arrival')}
                          activeOpacity={0.9}
                        >
                          <Ionicons name="map-outline" size={18} color={arrivalLocation ? Colors.primary : Colors.gray[600]} />
                          <View style={styles.addressChoiceText}>
                            <Text style={styles.addressChoiceTitle}>Choisir sur la carte</Text>
                            <Text style={styles.addressChoiceHint} numberOfLines={1}>
                              {arrivalLocation?.title || 'Choisir sur la carte'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.manualLocationGroup}>
                    {addressInputMode === 'manual' && (
                      <>
                        <Text style={styles.manualLocationLabel}>Adresse d’arrivée</Text>
                        <TextInput
                          style={styles.manualLocationInput}
                          value={arrivalManualAddress}
                          onChangeText={setArrivalManualAddress}
                          placeholder="Ex: rond-point Victoire"
                          placeholderTextColor={Colors.gray[400]}
                        />
                      </>
                    )}
                    <Text style={styles.manualLocationLabel}>Repère d’arrivée (optionnel)</Text>
                    <TextInput
                      style={styles.manualLocationInput}
                      value={arrivalReference}
                      onChangeText={setArrivalReference}
                      placeholder={LANDMARK_PLACEHOLDER}
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                </>
              )}
            </AddressSectionSlider>
          </View>
          )}

          {requestFormStep === 'details' && (
          <>
          <View style={styles.stepIntroCard}>
            <View style={styles.stepIntroIcon}>
              <Ionicons name="options-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.stepIntroText}>
              <Text style={styles.stepIntroTitle}>Détails</Text>
              <Text style={styles.stepIntroSubtitle} numberOfLines={1}>
                {routeSummary}
              </Text>
            </View>
            <TouchableOpacity style={styles.stepBackButton} onPress={() => setRequestFormStep('route')}>
              <Text style={styles.stepBackButtonText}>Modifier</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, styles.detailsCard]}>
            <Text style={styles.cardTitle}>Quand voulez-vous partir ?</Text>
            <View style={styles.presetGrid}>
              {TIME_PRESETS.map((preset) => {
                const active = timePreset === preset.id;
                return (
                  <TouchableOpacity key={preset.id} style={[styles.preset, active && styles.presetActive]} onPress={() => applyPreset(preset.id)}>
                    <Ionicons name={preset.icon} size={16} color={active ? Colors.primary : Colors.gray[500]} />
                    <Text style={[styles.presetLabel, active && styles.presetLabelActive]} numberOfLines={1}>{preset.label}</Text>
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

          <View style={styles.detailsPanel}>
            <View style={styles.detailsFieldRow}>
              <View style={styles.detailsFieldLabelBlock}>
                <Text style={styles.detailsFieldTitle}>Places</Text>
                <Text style={styles.detailsFieldHint}>{numberOfSeats} personne{numberOfSeats > 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.counterCompact}>
                <TouchableOpacity style={styles.counterBtnCompact} onPress={() => setNumberOfSeats((value) => Math.max(1, value - 1))}>
                  <Ionicons name="remove" size={18} color={Colors.gray[900]} />
                </TouchableOpacity>
                <Text style={styles.counterValueCompact}>{numberOfSeats}</Text>
                <TouchableOpacity style={styles.counterBtnCompact} onPress={() => setNumberOfSeats((value) => value + 1)}>
                  <Ionicons name="add" size={18} color={Colors.gray[900]} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.detailsDivider} />
            <View style={styles.detailsFieldRow}>
              <View style={styles.detailsFieldLabelBlock}>
                <Text style={styles.detailsFieldTitle}>Budget max</Text>
                <Text style={styles.detailsFieldHint}>Par place</Text>
              </View>
              <View style={styles.priceBoxCompact}>
                <TextInput
                  style={styles.priceInputCompact}
                  value={maxPricePerSeat}
                  onChangeText={setMaxPricePerSeat}
                  keyboardType="number-pad"
                  placeholder="2500"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={styles.currency}>FC</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.cardHeadCompact} onPress={() => setShowAdvanced((value) => !value)}>
            <View>
              <Text style={styles.cardTitle}>Ajouter une note</Text>
              <Text style={styles.cardSubtitle}>Facultatif</Text>
            </View>
            <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray[500]} />
          </TouchableOpacity>

          {showAdvanced && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.card}>
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
            <Text style={styles.summaryText} numberOfLines={1}>{routeSummary}</Text>
            <Text style={styles.summaryText} numberOfLines={1}>{timeSummary}</Text>
            <Text style={styles.summaryText}>{numberOfSeats} personne{numberOfSeats > 1 ? 's' : ''}</Text>
            {maxPricePerSeat ? <Text style={styles.summaryText}>Maximum {maxPricePerSeat} FC / place</Text> : null}
          </View>
          </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, requestFormStep === 'details' && styles.footerCompact, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        {requestFormStep === 'route' && (
          <>
            <Text style={styles.footerTitle} numberOfLines={1}>{routeSummary}</Text>
            <Text style={styles.footerText} numberOfLines={1}>{timeSummary}</Text>
          </>
        )}
        {renderPrimaryButton()}
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
            setAddressInputMode('map');
            setDepartureLocation(location);
            setDepartureManualAddress(location.title || location.address);
            setAddressSectionStep('arrival');
            return;
          }
          setAddressInputMode('map');
          setArrivalLocation(location);
          setArrivalManualAddress(location.title || location.address);
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
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm },
  requestStepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.sm, padding: 6, gap: Spacing.xs },
  requestStepPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 36, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, backgroundColor: Colors.gray[50] },
  requestStepPillActive: { backgroundColor: `${Colors.primary}10` },
  requestStepPillDisabled: { opacity: 0.5 },
  requestStepNumber: { width: 22, height: 22, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray[200] },
  requestStepNumberActive: { backgroundColor: Colors.primary },
  requestStepNumberText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.gray[600] },
  requestStepNumberTextActive: { color: Colors.white },
  requestStepLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[600] },
  requestStepLabelActive: { color: Colors.primary },
  requestStepLine: { flex: 1, height: 1, backgroundColor: Colors.gray[200] },
  requestStepLineActive: { backgroundColor: Colors.primary },
  hero: { borderRadius: BorderRadius.xxl, padding: Spacing.xl, gap: Spacing.sm },
  heroPill: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.16)', color: Colors.white, fontWeight: FontWeights.semibold },
  heroTitle: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.white, lineHeight: 34 },
  heroSubtitle: { fontSize: FontSizes.base, color: 'rgba(255,255,255,0.92)', lineHeight: 22 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.sm, padding: Spacing.md, gap: Spacing.sm, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.md },
  cardHeadCompact: { backgroundColor: Colors.white, borderRadius: BorderRadius.sm, padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  cardSubtitle: { marginTop: 2, fontSize: 13, color: Colors.gray[500] },
  stepIntroCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.sm, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepIntroIcon: { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}12` },
  stepIntroText: { flex: 1 },
  stepIntroTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  stepIntroSubtitle: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[500], lineHeight: 18 },
  stepBackButton: { minHeight: 34, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray[200], alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  stepBackButtonText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.gray[700] },
  iconCircle: { width: 40, height: 40, borderRadius: BorderRadius.full, backgroundColor: `${Colors.primary}12`, alignItems: 'center', justifyContent: 'center' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  routeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  squareDot: { borderRadius: 3 },
  routeText: { flex: 1 },
  routeLabel: { fontSize: FontSizes.xs, color: Colors.gray[500], textTransform: 'uppercase', fontWeight: FontWeights.bold, letterSpacing: 0.6 },
  routeValue: { marginTop: 4, fontSize: FontSizes.base, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  placeholder: { color: Colors.gray[400] },
  routeHint: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[500] },
  addressBlock: { gap: Spacing.sm },
  addressChoiceRow: { flexDirection: 'row', gap: Spacing.sm, marginLeft: 26 },
  addressChoiceButton: { flex: 1, minHeight: 66, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addressChoiceButtonActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  addressChoiceText: { flex: 1 },
  addressChoiceTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  addressChoiceHint: { marginTop: 2, fontSize: FontSizes.xs, color: Colors.gray[500] },
  manualLocationGroup: { gap: Spacing.sm, marginLeft: 26 },
  manualLocationLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.gray[600] },
  manualLocationInput: { minHeight: 48, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.base, color: Colors.gray[900] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.gray[100], borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  primaryChip: { backgroundColor: `${Colors.primary}12` },
  chipText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium, color: Colors.gray[800] },
  flexChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  flexChipTextActive: { color: Colors.white },
  detailsCard: { paddingBottom: Spacing.sm },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  preset: { minHeight: 42, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.gray[100], gap: 6 },
  presetActive: { backgroundColor: `${Colors.primary}10`, borderColor: Colors.primary },
  presetLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  presetLabelActive: { color: Colors.primary },
  presetCaption: { fontSize: FontSizes.xs, color: Colors.gray[500] },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gray[50], borderRadius: BorderRadius.sm, padding: Spacing.sm },
  infoCardText: { flex: 1, fontSize: 13, color: Colors.gray[900], fontWeight: FontWeights.semibold, lineHeight: 18 },
  customWrap: { gap: Spacing.sm },
  inputLike: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.sm, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[100], padding: Spacing.sm },
  inputLikeText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  counter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.xl, padding: Spacing.md },
  counterBtn: { width: 48, height: 48, borderRadius: BorderRadius.lg, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  counterText: { alignItems: 'center', gap: 4 },
  counterValue: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  counterLabel: { fontSize: FontSizes.sm, color: Colors.gray[500] },
  smallLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.gray[600] },
  detailsPanel: { backgroundColor: Colors.white, borderRadius: BorderRadius.sm, padding: Spacing.md, gap: Spacing.sm, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  detailsFieldRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  detailsFieldLabelBlock: { flex: 1, minWidth: 0 },
  detailsFieldTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  detailsFieldHint: { marginTop: 2, fontSize: FontSizes.xs, color: Colors.gray[500] },
  detailsDivider: { height: 1, backgroundColor: Colors.gray[100] },
  counterCompact: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gray[50], borderRadius: BorderRadius.sm, padding: 4 },
  counterBtnCompact: { width: 34, height: 34, borderRadius: BorderRadius.sm, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  counterValueCompact: { minWidth: 28, textAlign: 'center', fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  priceBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.lg, height: 52, borderWidth: 1, borderColor: Colors.gray[100] },
  priceInput: { flex: 1, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  priceBoxCompact: { width: 150, height: 42, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[100] },
  priceInputCompact: { flex: 1, fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  currency: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[500] },
  textArea: { minHeight: 78, borderRadius: BorderRadius.sm, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[100], padding: Spacing.md, fontSize: FontSizes.base, color: Colors.gray[900], textAlignVertical: 'top', lineHeight: 22 },
  summary: { backgroundColor: Colors.white, borderRadius: BorderRadius.sm, padding: Spacing.md, gap: 2 },
  summaryTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  summaryText: { fontSize: 13, color: Colors.gray[600], lineHeight: 18 },
  footer: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: 2 },
  footerCompact: { paddingTop: Spacing.sm },
  footerTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  footerText: { fontSize: FontSizes.sm, color: Colors.gray[500] },
  mainButtonWrap: { width: '100%' },
  mainButton: { minHeight: 54, borderRadius: BorderRadius.sm, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: 6 },
  mainButtonDisabled: { opacity: 0.65 },
  mainButtonText: { color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.bold },
  iosOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  iosSheet: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingTop: Spacing.md },
  iosDone: { padding: Spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  iosDoneText: { color: Colors.primary, fontWeight: FontWeights.bold, fontSize: FontSizes.base },
});
