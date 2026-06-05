import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { trackEvent } from '@/services/analytics';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useCreateTripRequestMutation } from '@/store/api/tripRequestApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import type { FavoriteLocation } from '@/types';
import {
  buildManualGeocodeQuery,
  MANUAL_GEOCODE_DEBOUNCE_MS,
  mapGeocodeResponseToSelection,
  type ManualGeocodeStatus,
} from '@/utils/manualAddressGeocode';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { getRouteCoordinates } from '@/utils/routeApi';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type TimePreset = 'now' | 'soon' | 'later' | 'tomorrow' | 'custom';
type PickerTarget = 'departure' | 'arrival';
type RequestFormStep = 'route' | 'details';
type LatLng = { latitude: number; longitude: number };

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
const TIME_PRESET_SYNC_INTERVAL_MS = 30000;
const DEFAULT_REQUEST_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const POPULAR_PLACES = [
  { name: 'Gare Centrale', commune: 'Gombe' },
  { name: 'Marché Zando', commune: 'Kalamu' },
  { name: 'Rond-point Victoire', commune: 'Lingwala' },
  { name: 'UPN', commune: 'Lemba' },
  { name: 'Kintambo Magasin', commune: 'Kintambo' },
  { name: 'Bandal Tshibangu', commune: 'Bandalungwa' },
  { name: 'Mont-Ngafula', commune: 'Mont-Ngafula' },
  { name: 'Kasa-Vubu', commune: 'Kasa-Vubu' },
];

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

function getMapCoordinate(selection: MapLocationSelection | null): LatLng | null {
  if (!selection || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
    return null;
  }

  return {
    latitude: selection.latitude,
    longitude: selection.longitude,
  };
}

function areSameCoordinate(left: LatLng, right: LatLng) {
  return (
    Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001
  );
}

function getRenderableRouteCoordinates(
  coordinates: LatLng[],
  origin: LatLng,
  destination: LatLng,
) {
  if (coordinates.length < 2) {
    return [];
  }

  const isStraightFallback =
    coordinates.length === 2 &&
    areSameCoordinate(coordinates[0], origin) &&
    areSameCoordinate(coordinates[1], destination);

  return isStraightFallback ? [] : coordinates;
}

function buildRoutePreviewRegion(points: LatLng[]): Region {
  if (points.length === 0) {
    return DEFAULT_REQUEST_REGION;
  }

  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.35, 0.035),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.35, 0.035),
  };
}

export default function RequestTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showDialog } = useDialog();
  const { data: favoriteLocations = [] } = useGetFavoriteLocationsQuery();
  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();
  const [geocodeManualAddress] = useGeocodeMutation();
  const [initialWindow] = useState(() => buildPresetWindow('now'));
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [departureManualAddress, setDepartureManualAddress] = useState('');
  const [departureReference, setDepartureReference] = useState('');
  const [arrivalManualAddress, setArrivalManualAddress] = useState('');
  const [arrivalReference, setArrivalReference] = useState('');
  const [departureManualGeocodeStatus, setDepartureManualGeocodeStatus] =
    useState<ManualGeocodeStatus>('idle');
  const [arrivalManualGeocodeStatus, setArrivalManualGeocodeStatus] =
    useState<ManualGeocodeStatus>('idle');
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
  const [showQuickLandmarks, setShowQuickLandmarks] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [requestFormStep, setRequestFormStep] = useState<RequestFormStep>('route');
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  const departureDateMax = useMemo(
    () => new Date(departureDateMin.getTime() + flexibilityMinutes * 60000),
    [departureDateMin, flexibilityMinutes],
  );
  const routePreviewRegion = useMemo<Region>(() => {
    const selectedPoints = [getMapCoordinate(departureLocation), getMapCoordinate(arrivalLocation)].filter(
      (point): point is LatLng => Boolean(point),
    );
    const previewPoints = routeCoordinates.length > 1 ? routeCoordinates : selectedPoints;

    return buildRoutePreviewRegion(previewPoints);
  }, [
    arrivalLocation,
    departureLocation,
    routeCoordinates,
  ]);
  const favoriteSuggestions = useMemo(() => favoriteLocations.slice(0, 4), [favoriteLocations]);
  const departureAddress = getLocationText(departureLocation, departureManualAddress);
  const arrivalAddress = getLocationText(arrivalLocation, arrivalManualAddress);
  const hasDepartureAddress = departureAddress.length > 0;
  const hasArrivalAddress = arrivalAddress.length > 0;
  const routeSummary = useMemo(() => {
    if (hasDepartureAddress && hasArrivalAddress) return `${departureAddress} \u2192 ${arrivalAddress}`;
    if (hasDepartureAddress) return `D\u00E9part : ${departureAddress}`;
    return 'Choisissez votre d\u00E9part et votre destination';
  }, [arrivalAddress, departureAddress, hasArrivalAddress, hasDepartureAddress]);
  const renderManualGeocodeStatus = (status: ManualGeocodeStatus) => {
    if (status === 'idle') {
      return null;
    }

    const isSearching = status === 'searching';
    const isFound = status === 'found';
    const color = isFound ? Colors.success : isSearching ? Colors.primary : Colors.danger;

    return (
      <View style={styles.manualGeocodeStatus}>
        {isSearching ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons
            name={isFound ? 'checkmark-circle' : 'alert-circle'}
            size={14}
            color={color}
          />
        )}
        <Text
          style={[
            styles.manualGeocodeStatusText,
            isFound && styles.manualGeocodeStatusTextFound,
            status === 'missing' && styles.manualGeocodeStatusTextMissing,
          ]}
        >
          {isSearching
            ? 'Recherche des coordonnees...'
            : isFound
              ? 'Coordonnees trouvees'
              : 'Adresse introuvable'}
        </Text>
      </View>
    );
  };

  const timeSummary = useMemo(() => {
    if (flexibilityMinutes === 0) return `${formatDateLabel(departureDateMin)} à ${formatTimeLabel(departureDateMin)}`;
    return `${formatDateLabel(departureDateMin)} entre ${formatTimeLabel(departureDateMin)} et ${formatTimeLabel(departureDateMax)}`;
  }, [departureDateMax, departureDateMin, flexibilityMinutes]);

  const getCurrentDepartureWindow = () => {
    if (timePreset === 'custom') {
      return {
        min: departureDateMin,
        max: departureDateMax,
        flex: flexibilityMinutes,
      };
    }

    const next = buildPresetWindow(timePreset);
    return {
      min: next.min,
      max: new Date(next.min.getTime() + next.flex * 60000),
      flex: next.flex,
    };
  };

  useEffect(() => {
    const preset = timePreset;
    if (preset === 'custom') {
      return;
    }

    const syncPresetWindow = () => {
      const next = buildPresetWindow(preset);
      setDepartureDateMin(next.min);
      setFlexibilityMinutes(next.flex);
    };

    syncPresetWindow();
    const interval = setInterval(syncPresetWindow, TIME_PRESET_SYNC_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncPresetWindow();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [timePreset]);

  useEffect(() => {
    if (addressInputMode !== 'manual') {
      setDepartureManualGeocodeStatus('idle');
      return;
    }

    const address = departureManualAddress.trim();
    if (address.length < 3) {
      setDepartureManualGeocodeStatus('idle');
      return;
    }

    if (departureLocation) {
      setDepartureManualGeocodeStatus('found');
      return;
    }

    let isCurrent = true;
    setDepartureManualGeocodeStatus('searching');

    const timeout = setTimeout(() => {
      geocodeManualAddress({
        address: buildManualGeocodeQuery(address),
        region: 'cd',
      })
        .unwrap()
        .then((response) => {
          if (!isCurrent) return;
          const selection = mapGeocodeResponseToSelection(address, response);
          if (!selection) {
            setDepartureManualGeocodeStatus('missing');
            return;
          }
          setDepartureLocation(selection);
          setDepartureManualGeocodeStatus('found');
        })
        .catch((error) => {
          if (!isCurrent) return;
          console.warn('Manual departure geocode failed', error);
          setDepartureManualGeocodeStatus('missing');
        });
    }, MANUAL_GEOCODE_DEBOUNCE_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [addressInputMode, departureLocation, departureManualAddress, geocodeManualAddress]);

  useEffect(() => {
    if (addressInputMode !== 'manual') {
      setArrivalManualGeocodeStatus('idle');
      return;
    }

    const address = arrivalManualAddress.trim();
    if (address.length < 3) {
      setArrivalManualGeocodeStatus('idle');
      return;
    }

    if (arrivalLocation) {
      setArrivalManualGeocodeStatus('found');
      return;
    }

    let isCurrent = true;
    setArrivalManualGeocodeStatus('searching');

    const timeout = setTimeout(() => {
      geocodeManualAddress({
        address: buildManualGeocodeQuery(address),
        region: 'cd',
      })
        .unwrap()
        .then((response) => {
          if (!isCurrent) return;
          const selection = mapGeocodeResponseToSelection(address, response);
          if (!selection) {
            setArrivalManualGeocodeStatus('missing');
            return;
          }
          setArrivalLocation(selection);
          setArrivalManualGeocodeStatus('found');
        })
        .catch((error) => {
          if (!isCurrent) return;
          console.warn('Manual arrival geocode failed', error);
          setArrivalManualGeocodeStatus('missing');
        });
    }, MANUAL_GEOCODE_DEBOUNCE_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [addressInputMode, arrivalLocation, arrivalManualAddress, geocodeManualAddress]);

  useEffect(() => {
    const origin = getMapCoordinate(departureLocation);
    const destination = getMapCoordinate(arrivalLocation);

    if (!origin || !destination) {
      setRouteCoordinates([]);
      setIsRouteLoading(false);
      return;
    }

    let isCurrent = true;
    setIsRouteLoading(true);
    setRouteCoordinates([]);

    getRouteCoordinates(origin, destination)
      .then((coordinates) => {
        if (!isCurrent) return;
        setRouteCoordinates(getRenderableRouteCoordinates(coordinates, origin, destination));
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.warn('Impossible de calculer l itineraire de demande', error);
        setRouteCoordinates([]);
      })
      .finally(() => {
        if (isCurrent) {
          setIsRouteLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    arrivalLocation,
    departureLocation,
  ]);

  const primaryLabel =
    requestFormStep === 'route'
      ? !hasDepartureAddress
        ? 'Définir le départ'
        : !hasArrivalAddress
          ? 'Indiquer la destination'
          : 'Voir les options'
      : 'Envoyer la demande';

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

  const openPickerFor = (target: PickerTarget) => {
    setAddressInputMode('map');
    setAddressSectionStep(target);
    setActivePicker(target);
  };

  const swapRoutePoints = () => {
    const tempLoc = departureLocation;
    const tempManual = departureManualAddress;
    const tempRef = departureReference;
    setDepartureLocation(arrivalLocation);
    setDepartureManualAddress(arrivalManualAddress);
    setDepartureReference(arrivalReference);
    setArrivalLocation(tempLoc);
    setArrivalManualAddress(tempManual);
    setArrivalReference(tempRef);
  };

  const applySelectionToNextSlot = (selection: MapLocationSelection) => {
    setAddressInputMode('map');
    if (!hasDepartureAddress) {
      setDepartureLocation(selection);
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
      return;
    }

    setArrivalLocation(selection);
    setArrivalManualAddress(selection.title || selection.address);
    setAddressSectionStep('arrival');
  };

  const applyManualPlaceToNextSlot = (place: string) => {
    setAddressInputMode('manual');
    if (!hasDepartureAddress) {
      setDepartureLocation(null);
      setDepartureManualAddress(place);
      setAddressSectionStep('arrival');
      return;
    }

    setArrivalLocation(null);
    setArrivalManualAddress(place);
    setAddressSectionStep('arrival');
  };

  const validate = (departureWindow = getCurrentDepartureWindow()) => {
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
    if (
      departureWindow.min.getTime() >= departureWindow.max.getTime() ||
      departureWindow.min.getTime() < Date.now() - 60000
    ) {
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
    const departureWindow = getCurrentDepartureWindow();
    if (timePreset !== 'custom') {
      setDepartureDateMin(departureWindow.min);
      setFlexibilityMinutes(departureWindow.flex);
    }
    if (!validate(departureWindow)) return;
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
      const departureCoordinates = getLocationCoordinates(departureLocation);
      const arrivalCoordinates = getLocationCoordinates(arrivalLocation);
      const createdRequest = await createTripRequest({
        departureLocation: departureAddress,
        departureReference: departureReference.trim() || undefined,
        departureCoordinates,
        arrivalLocation: arrivalAddress,
        arrivalReference: arrivalReference.trim() || undefined,
        arrivalCoordinates,
        departureDateMin: departureWindow.min.toISOString(),
        departureDateMax: departureWindow.max.toISOString(),
        numberOfSeats,
        maxPricePerSeat: parsedBudget,
        description: description.trim() || undefined,
      }).unwrap();
      await trackEvent('trip_request_created', {
        seats: numberOfSeats,
        max_price_per_seat: parsedBudget,
        has_description: Boolean(description.trim()),
        flexibility_minutes: departureWindow.flex,
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
      openPickerFor('departure');
      return;
    }
    if (!hasArrivalAddress) {
      setRequestFormStep('route');
      openPickerFor('arrival');
      return;
    }
    if (requestFormStep === 'route') {
      setRequestFormStep('details');
      return;
    }
    await handleCreateRequest();
  };

  const isManualAddressGeocoding =
    addressInputMode === 'manual' &&
    (departureManualGeocodeStatus === 'searching' || arrivalManualGeocodeStatus === 'searching');
  const primaryButtonDisabled = isCreating || isManualAddressGeocoding;
  const primaryIconName =
    !hasDepartureAddress || !hasArrivalAddress || requestFormStep === 'route'
      ? 'arrow-forward'
      : 'send';

  const renderPrimaryButton = (compact = false) => (
    <TouchableOpacity
      style={[styles.mainButtonWrap, compact && styles.mainButtonWrapCompact]}
      onPress={handlePrimaryAction}
      disabled={primaryButtonDisabled}
      activeOpacity={0.9}
    >
      <View style={[styles.mainButton, compact && styles.mainButtonCompact, primaryButtonDisabled && styles.mainButtonDisabled]}>
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
        <Text style={styles.headerTitle}>Demander un trajet</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            requestFormStep === 'route' ? styles.routeContent : styles.detailsContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {requestFormStep === 'route' && (
            <>
              <Animated.View entering={FadeIn} style={styles.rideSheet}>
                <View style={styles.sheetHandle} />
                <View style={styles.rideSheetHeader}>
                  <View>
                    <Text style={styles.rideSheetTitle}>Où allez-vous ?</Text>
                    <Text style={styles.rideSheetSubtitle}>
                      Choisissez un départ et une destination.
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.sheetSwapButton} onPress={swapRoutePoints} activeOpacity={0.85}>
                    <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.rideRouteBox}>
                  <View style={styles.rideRail}>
                    <View style={[styles.rideRailDot, styles.rideRailDotStart]} />
                    <View style={styles.rideRailLine} />
                    <View style={[styles.rideRailDot, styles.rideRailDotEnd]} />
                  </View>

                  <View style={styles.rideFields}>
                    <View
                      style={[
                        styles.rideLocationBlock,
                        addressSectionStep === 'departure' && styles.rideLocationBlockFocused,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.rideLocationButton}
                        onPress={() => openPickerFor('departure')}
                        activeOpacity={0.88}
                      >
                        <View style={styles.rideLocationTextBlock}>
                          <Text style={styles.rideLocationLabel}>Départ</Text>
                          <Text
                            style={[
                              styles.rideLocationValue,
                              !hasDepartureAddress && styles.rideLocationPlaceholder,
                            ]}
                            numberOfLines={1}
                          >
                            {departureAddress || 'Votre position ou un lieu'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.rideEditButton}
                          onPress={() => {
                            setAddressInputMode('manual');
                            setAddressSectionStep('departure');
                          }}
                        >
                          <Ionicons name="create-outline" size={16} color={Colors.gray[600]} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {addressInputMode === 'manual' && addressSectionStep === 'departure' ? (
                        <>
                          <TextInput
                            style={styles.rideManualInput}
                            value={departureManualAddress}
                            onChangeText={(value) => {
                              setDepartureManualAddress(value);
                              setDepartureLocation(null);
                            }}
                          placeholder="Saisir le départ"
                            placeholderTextColor={Colors.gray[400]}
                          />
                          {renderManualGeocodeStatus(departureManualGeocodeStatus)}
                        </>
                      ) : null}
                      {hasDepartureAddress ? (
                        <TextInput
                          style={styles.rideReferenceInput}
                          value={departureReference}
                          onChangeText={setDepartureReference}
                          placeholder="Repère de départ (facultatif)"
                          placeholderTextColor={Colors.gray[400]}
                        />
                      ) : null}
                    </View>

                    <View style={styles.rideDivider} />

                    <View
                      style={[
                        styles.rideLocationBlock,
                        addressSectionStep === 'arrival' && styles.rideLocationBlockFocused,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.rideLocationButton}
                        onPress={() => openPickerFor('arrival')}
                        activeOpacity={0.88}
                      >
                        <View style={styles.rideLocationTextBlock}>
                          <Text style={styles.rideLocationLabel}>Destination</Text>
                          <Text
                            style={[
                              styles.rideLocationValue,
                              !hasArrivalAddress && styles.rideLocationPlaceholder,
                            ]}
                            numberOfLines={1}
                          >
                            {arrivalAddress || 'Où voulez-vous aller ?'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.rideEditButton}
                          onPress={() => {
                            setAddressInputMode('manual');
                            setAddressSectionStep('arrival');
                          }}
                        >
                          <Ionicons name="create-outline" size={16} color={Colors.gray[600]} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {addressInputMode === 'manual' && addressSectionStep === 'arrival' ? (
                        <>
                          <TextInput
                            style={styles.rideManualInput}
                            value={arrivalManualAddress}
                            onChangeText={(value) => {
                              setArrivalManualAddress(value);
                              setArrivalLocation(null);
                            }}
                          placeholder="Saisir la destination"
                            placeholderTextColor={Colors.gray[400]}
                          />
                          {renderManualGeocodeStatus(arrivalManualGeocodeStatus)}
                        </>
                      ) : null}
                      {hasArrivalAddress ? (
                        <TextInput
                          style={styles.rideReferenceInput}
                          value={arrivalReference}
                          onChangeText={setArrivalReference}
                          placeholder="Repère d’arrivée (facultatif)"
                          placeholderTextColor={Colors.gray[400]}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={styles.quickActionButton}
                    onPress={handleUseCurrentLocation}
                    disabled={isLocating}
                    activeOpacity={0.85}
                  >
                    {isLocating ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : (
                      <Ionicons name="navigate" size={16} color={Colors.primary} />
                    )}
                    <Text style={styles.quickActionText}>Partir d’ici</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickActionButton} onPress={() => openPickerFor('arrival')}>
                    <Ionicons name="search" size={16} color={Colors.primary} />
                    <Text style={styles.quickActionText}>Chercher un lieu</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.suggestionsSection}>
                  <View style={styles.suggestionsHeader}>
                    <Text style={styles.suggestionsTitle}>Suggestions</Text>
                    {showQuickLandmarks ? (
                      <TouchableOpacity onPress={() => setShowQuickLandmarks(false)}>
                        <Text style={styles.suggestionsToggle}>Masquer</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setShowQuickLandmarks(true)}>
                        <Text style={styles.suggestionsToggle}>Afficher</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {(favoriteSuggestions.length > 0 || showQuickLandmarks) && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.suggestionsScroll}
                    >
                      {favoriteSuggestions.map((favorite) => (
                        <TouchableOpacity
                          key={favorite.id}
                          style={styles.suggestionChip}
                          onPress={() =>
                            applySelectionToNextSlot({
                              title: favorite.name,
                              address: favorite.address,
                              latitude: favorite.coordinates.latitude,
                              longitude: favorite.coordinates.longitude,
                            })
                          }
                          activeOpacity={0.86}
                        >
                          <View style={styles.suggestionIcon}>
                            <Ionicons name={favoriteIcon(favorite.type)} size={14} color={Colors.primary} />
                          </View>
                          <Text style={styles.suggestionText} numberOfLines={1}>
                            {favorite.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {showQuickLandmarks &&
                        POPULAR_PLACES.map((place) => (
                          <TouchableOpacity
                            key={place.name}
                            style={styles.suggestionChip}
                            onPress={() => applyManualPlaceToNextSlot(`${place.name}, ${place.commune}`)}
                            activeOpacity={0.86}
                          >
                            <View style={styles.suggestionIcon}>
                              <Ionicons name="location" size={14} color={Colors.primary} />
                            </View>
                            <Text style={styles.suggestionText} numberOfLines={1}>
                              {place.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  )}
                </View>
              </Animated.View>
            </>
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
          </View>

          <View style={[styles.mapPreview, styles.detailsMapPreview]}>
            <MapView
              style={styles.mapPreviewMap}
              provider={PROVIDER_GOOGLE}
              region={routePreviewRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
            >
              {departureLocation ? (
                <Marker
                  coordinate={{
                    latitude: departureLocation.latitude,
                    longitude: departureLocation.longitude,
                  }}
                  pinColor={Colors.success}
                  title="Depart"
                />
              ) : null}
              {arrivalLocation ? (
                <Marker
                  coordinate={{
                    latitude: arrivalLocation.latitude,
                    longitude: arrivalLocation.longitude,
                  }}
                  pinColor={Colors.primary}
                  title="Destination"
                />
              ) : null}
              {routeCoordinates.length > 1 ? (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor={Colors.primary}
                  strokeWidth={5}
                />
              ) : null}
            </MapView>
            <View pointerEvents="none" style={styles.mapPreviewShade} />
            {departureLocation && arrivalLocation ? (
              <View pointerEvents="none" style={styles.routeStatusBadge}>
                {isRouteLoading ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Ionicons
                    name={routeCoordinates.length > 1 ? 'git-branch' : 'alert-circle-outline'}
                    size={15}
                    color={routeCoordinates.length > 1 ? Colors.primary : Colors.gray[500]}
                  />
                )}
                <Text style={styles.routeStatusText}>
                  {isRouteLoading
                    ? 'Calcul de l itineraire'
                    : routeCoordinates.length > 1
                      ? 'Itineraire Google'
                      : 'Route a recalculer'}
                </Text>
              </View>
            ) : null}
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
        <View style={[styles.footerActions, requestFormStep === 'details' && styles.footerActionsRow]}>
          {requestFormStep === 'details' && (
            <TouchableOpacity style={styles.footerSecondaryButton} onPress={() => setRequestFormStep('route')}>
              <Text style={styles.footerSecondaryButtonText}>Retour</Text>
            </TouchableOpacity>
          )}
          {renderPrimaryButton(requestFormStep === 'details')}
        </View>
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
  container: { flex: 1, backgroundColor: '#EEF2F6' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: '#EEF2F6' },
  headerButton: { width: 40, height: 40, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  headerSpacer: { width: 40, height: 40 },
  content: { paddingBottom: Spacing.lg },
  routeContent: { paddingHorizontal: 0 },
  detailsContent: { paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  mapPreview: { height: 240, overflow: 'hidden', backgroundColor: Colors.gray[200] },
  detailsMapPreview: { height: 190, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray[200] },
  mapPreviewMap: { ...StyleSheet.absoluteFillObject },
  mapPreviewShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, backgroundColor: 'rgba(238,242,246,0.72)' },
  mapLocateButton: { position: 'absolute', right: Spacing.lg, top: Spacing.md, minHeight: 42, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.white, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  mapLocateButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  routeStatusBadge: { position: 'absolute', left: Spacing.lg, top: Spacing.md, minHeight: 38, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.white, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  routeStatusText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.gray[800] },
  rideSheet: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: BorderRadius.xl, backgroundColor: Colors.white, padding: Spacing.md, gap: Spacing.md, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 10 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.gray[200], marginBottom: 2 },
  rideSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  rideSheetTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  rideSheetSubtitle: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[500] },
  sheetSwapButton: { width: 42, height: 42, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}12`, borderWidth: 1, borderColor: `${Colors.primary}24` },
  rideRouteBox: { flexDirection: 'row', gap: Spacing.sm, borderRadius: BorderRadius.lg, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.gray[200], padding: Spacing.sm },
  rideRail: { width: 22, alignItems: 'center', paddingTop: 22, paddingBottom: 22 },
  rideRailDot: { width: 10, height: 10, borderRadius: BorderRadius.full },
  rideRailDotStart: { backgroundColor: Colors.success },
  rideRailDotEnd: { backgroundColor: Colors.primary },
  rideRailLine: { flex: 1, width: 2, backgroundColor: Colors.gray[300], marginVertical: 5, borderRadius: BorderRadius.full },
  rideFields: { flex: 1 },
  rideLocationBlock: { borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'transparent', backgroundColor: Colors.white, padding: Spacing.sm, gap: Spacing.xs },
  rideLocationBlockFocused: { borderColor: `${Colors.primary}45`, backgroundColor: `${Colors.primary}06` },
  rideLocationButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rideLocationTextBlock: { flex: 1, minWidth: 0 },
  rideLocationLabel: { fontSize: 11, fontWeight: FontWeights.bold, color: Colors.gray[500], textTransform: 'uppercase' },
  rideLocationValue: { marginTop: 2, fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  rideLocationPlaceholder: { color: Colors.gray[500], fontWeight: FontWeights.semibold },
  rideEditButton: { width: 34, height: 34, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[200] },
  rideManualInput: { minHeight: 42, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, fontSize: FontSizes.base, color: Colors.gray[900] },
  manualGeocodeStatus: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: 2 },
  manualGeocodeStatusText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, color: Colors.primary },
  manualGeocodeStatusTextFound: { color: Colors.success },
  manualGeocodeStatusTextMissing: { color: Colors.danger },
  rideReferenceInput: { minHeight: 38, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, fontSize: FontSizes.sm, color: Colors.gray[800] },
  rideDivider: { height: 1, backgroundColor: Colors.gray[200], marginVertical: Spacing.xs },
  quickActionsRow: { flexDirection: 'row', gap: Spacing.sm },
  quickActionButton: { flex: 1, minHeight: 42, borderRadius: BorderRadius.full, backgroundColor: `${Colors.primary}0F`, borderWidth: 1, borderColor: `${Colors.primary}22`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  quickActionText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.primary },
  suggestionsSection: { gap: Spacing.sm },
  suggestionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionsTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  suggestionsToggle: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.primary },
  suggestionsScroll: { gap: Spacing.sm, paddingRight: Spacing.xl },
  suggestionChip: { maxWidth: 170, minHeight: 42, borderRadius: BorderRadius.full, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[200], paddingLeft: 6, paddingRight: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  suggestionIcon: { width: 30, height: 30, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  suggestionText: { flexShrink: 1, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.gray[800] },
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
  stepIntroCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepIntroIcon: { width: 30, height: 30, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}12` },
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
  footer: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: 2, shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8 },
  footerCompact: { paddingTop: Spacing.sm },
  footerTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  footerText: { fontSize: FontSizes.sm, color: Colors.gray[500] },
  footerActions: { marginTop: Spacing.sm },
  footerActionsRow: { marginTop: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  footerSecondaryButton: { minWidth: 108, minHeight: 52, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  footerSecondaryButtonText: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[700] },
  mainButtonWrap: { width: '100%' },
  mainButtonWrapCompact: { flex: 1, width: 'auto' },
  mainButton: { minHeight: 56, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.24, shadowRadius: 12, elevation: 5 },
  mainButtonCompact: { minHeight: 52, marginTop: 0 },
  mainButtonDisabled: { opacity: 0.65 },
  mainButtonText: { color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.bold },
  iosOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  iosSheet: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingTop: Spacing.md },
  iosDone: { padding: Spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  iosDoneText: { color: Colors.primary, fontWeight: FontWeights.bold, fontSize: FontSizes.base },
});
