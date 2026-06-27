import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { trackEvent } from '@/services/analytics';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useCreateTripRequestMutation, useRecommendTripRequestPriceMutation } from '@/store/api/tripRequestApi';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type ImageRequireSource,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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
const MIN_REQUEST_SEATS = 1;
const MAX_REQUEST_SEATS = 2;
const MIN_REQUEST_PRICE = 500;
const REQUEST_PRICE_STEP = 500;
const TIME_PRESET_SYNC_INTERVAL_MS = 30000;
const DEFAULT_REQUEST_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const REQUEST_MAP_MARKER_ANCHOR = { x: 0.5, y: 0.86 };
const requestMapMarkerImages: Record<'departure' | 'arrival', ImageRequireSource> = {
  departure: require('@/assets/images/map-markers/trip-detail-marker-departure.png'),
  arrival: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
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

function parseNumberParam(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampRequestSeats(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MIN_REQUEST_SEATS;
  }

  return Math.min(MAX_REQUEST_SEATS, Math.max(MIN_REQUEST_SEATS, Math.floor(value)));
}

function clampRequestPrice(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MIN_REQUEST_PRICE;
  }

  const steppedValue = Math.round(value / REQUEST_PRICE_STEP) * REQUEST_PRICE_STEP;
  return Math.max(MIN_REQUEST_PRICE, steppedValue);
}

function formatCdfPrice(value: number) {
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FC`;
}

function formatDistanceKm(distanceMeters: number | null) {
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }

  const distanceKm = distanceMeters / 1000;
  const roundedDistance = distanceKm < 10 ? distanceKm.toFixed(1) : String(Math.round(distanceKm));
  return `${roundedDistance.replace('.', ',')} km`;
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
  const requestParams = useLocalSearchParams<{
    arrival?: string;
    departure?: string;
    minSeats?: string;
    seats?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { showDialog } = useDialog();
  const { data: favoriteLocations = [] } = useGetFavoriteLocationsQuery();
  const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();
  const [recommendTripRequestPrice, { isLoading: isPriceLoading }] = useRecommendTripRequestPriceMutation();
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
  const [numberOfSeats, setNumberOfSeats] = useState(MIN_REQUEST_SEATS);
  const [maxPricePerSeat, setMaxPricePerSeat] = useState('');
  const [hasEditedBudget, setHasEditedBudget] = useState(false);
  const [description, setDescription] = useState('');
  const [preferBudgetOffers, setPreferBudgetOffers] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showQuickLandmarks, setShowQuickLandmarks] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [requestFormStep, setRequestFormStep] = useState<RequestFormStep>('route');
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [recommendedPricePerSeat, setRecommendedPricePerSeat] = useState<number | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [hasAppliedRoutePrefill, setHasAppliedRoutePrefill] = useState(false);

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

  useEffect(() => {
    if (hasAppliedRoutePrefill) {
      return;
    }

    const departureParam = typeof requestParams.departure === 'string' ? requestParams.departure.trim() : '';
    const arrivalParam = typeof requestParams.arrival === 'string' ? requestParams.arrival.trim() : '';
    const seatsParam = parseNumberParam(requestParams.seats) ?? parseNumberParam(requestParams.minSeats);

    if (seatsParam !== undefined) {
      setNumberOfSeats(clampRequestSeats(seatsParam));
    }

    if (!departureParam && !arrivalParam) {
      setHasAppliedRoutePrefill(true);
      return;
    }

    setAddressInputMode('manual');
    setRequestFormStep('route');

    if (departureParam) {
      setDepartureLocation(null);
      setDepartureManualAddress(departureParam);
    }

    if (arrivalParam) {
      setArrivalLocation(null);
      setArrivalManualAddress(arrivalParam);
    }

    setAddressSectionStep(!departureParam ? 'departure' : 'arrival');
    setHasAppliedRoutePrefill(true);
  }, [
    hasAppliedRoutePrefill,
    requestParams.arrival,
    requestParams.departure,
    requestParams.minSeats,
    requestParams.seats,
  ]);

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
  const budgetValue = maxPricePerSeat.trim()
    ? clampRequestPrice(Number.parseFloat(maxPricePerSeat))
    : recommendedPricePerSeat ?? 0;
  const budgetLabel = budgetValue > 0
    ? formatCdfPrice(budgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'Prix a calculer';
  const routeDistanceLabel = formatDistanceKm(routeDistanceMeters);

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

  useEffect(() => {
    if (!hasDepartureAddress || !hasArrivalAddress) {
      setRouteDistanceMeters(null);
      setRecommendedPricePerSeat(null);
      if (!hasEditedBudget) {
        setMaxPricePerSeat('');
      }
      return;
    }

    let isCurrent = true;
    recommendTripRequestPrice({
      departureLocation: departureAddress,
      departureReference: departureReference.trim() || undefined,
      departureCoordinates: getLocationCoordinates(departureLocation),
      arrivalLocation: arrivalAddress,
      arrivalReference: arrivalReference.trim() || undefined,
      arrivalCoordinates: getLocationCoordinates(arrivalLocation),
      numberOfSeats,
    })
      .unwrap()
      .then((recommendation) => {
        if (!isCurrent) return;
        setRouteDistanceMeters(recommendation.distanceMeters);
        setRecommendedPricePerSeat(recommendation.recommendedPricePerSeat);

        if (!hasEditedBudget) {
          setMaxPricePerSeat(
            recommendation.recommendedPricePerSeat === null
              ? ''
              : String(recommendation.recommendedPricePerSeat),
          );
        }
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.warn('Impossible de recuperer le prix recommande', error);
        setRouteDistanceMeters(null);
        setRecommendedPricePerSeat(null);
        if (!hasEditedBudget) {
          setMaxPricePerSeat('');
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    arrivalAddress,
    arrivalLocation,
    arrivalReference,
    departureAddress,
    departureLocation,
    departureReference,
    hasArrivalAddress,
    hasDepartureAddress,
    hasEditedBudget,
    numberOfSeats,
    recommendTripRequestPrice,
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

  const updateBudget = (value: number) => {
    setHasEditedBudget(true);
    setMaxPricePerSeat(String(clampRequestPrice(value)));
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
    const parsedBudget = hasEditedBudget && maxPricePerSeat.trim()
      ? Number.parseFloat(maxPricePerSeat)
      : undefined;
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      showDialog({
        title: 'Budget invalide',
        message: "Indiquez le montant que vous avez prévu pour la course avant d'envoyer la demande.",
        variant: 'warning',
      });
      return;
    }
    try {
      const departureCoordinates = getLocationCoordinates(departureLocation);
      const arrivalCoordinates = getLocationCoordinates(arrivalLocation);
      const requestNotes = [
        description.trim(),
        preferBudgetOffers && parsedBudget !== undefined
          ? `Preference: offres jusqu'a ${formatCdfPrice(parsedBudget)} par place.`
          : '',
      ].filter(Boolean).join('\n');
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
        ...(parsedBudget !== undefined ? { maxPricePerSeat: parsedBudget } : {}),
        description: requestNotes || undefined,
      }).unwrap();
      await trackEvent('trip_request_created', {
        seats: numberOfSeats,
        max_price_per_seat: parsedBudget ?? null,
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
            <Animated.View entering={FadeIn} style={styles.routeSetup}>
              <View style={styles.routeSetupHeader}>
                <Text style={styles.routeSetupTitle}>Votre trajet</Text>
                <TouchableOpacity style={styles.routeSetupSwap} onPress={swapRoutePoints} activeOpacity={0.85}>
                  <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.routeInputStack}>
                <View style={styles.routePickerItem}>
                  <TouchableOpacity
                    style={styles.routePickerButton}
                    onPress={() => openPickerFor('departure')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.routePickerIcon, styles.routePickerIconStart]}>
                      <Ionicons name="navigate" size={18} color={Colors.success} />
                    </View>
                    <View style={styles.routePickerCopy}>
                      <Text style={styles.routePickerLabel}>Départ</Text>
                      <Text
                        style={[styles.routePickerValue, !hasDepartureAddress && styles.routePickerPlaceholder]}
                        numberOfLines={1}
                      >
                        {departureAddress || 'Point de départ'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                  {addressInputMode === 'manual' && addressSectionStep === 'departure' ? (
                    <View style={styles.routeManualWrap}>
                      <TextInput
                        style={styles.routeManualInput}
                        value={departureManualAddress}
                        onChangeText={(value) => {
                          setDepartureManualAddress(value);
                          setDepartureLocation(null);
                        }}
                        placeholder="Saisir le départ"
                        placeholderTextColor={Colors.gray[400]}
                      />
                      {renderManualGeocodeStatus(departureManualGeocodeStatus)}
                    </View>
                  ) : null}
                </View>

                <View style={styles.routeStackDivider} />

                <View style={styles.routePickerItem}>
                  <TouchableOpacity
                    style={styles.routePickerButton}
                    onPress={() => openPickerFor('arrival')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.routePickerIcon, styles.routePickerIconEnd]}>
                      <Ionicons name="flag" size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.routePickerCopy}>
                      <Text style={styles.routePickerLabel}>Destination</Text>
                      <Text
                        style={[styles.routePickerValue, !hasArrivalAddress && styles.routePickerPlaceholder]}
                        numberOfLines={1}
                      >
                        {arrivalAddress || 'Point d’arrivée'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                  {addressInputMode === 'manual' && addressSectionStep === 'arrival' ? (
                    <View style={styles.routeManualWrap}>
                      <TextInput
                        style={styles.routeManualInput}
                        value={arrivalManualAddress}
                        onChangeText={(value) => {
                          setArrivalManualAddress(value);
                          setArrivalLocation(null);
                        }}
                        placeholder="Saisir la destination"
                        placeholderTextColor={Colors.gray[400]}
                      />
                      {renderManualGeocodeStatus(arrivalManualGeocodeStatus)}
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.routeQuickRow}>
                <TouchableOpacity
                  style={styles.routeQuickButton}
                  onPress={handleUseCurrentLocation}
                  disabled={isLocating}
                  activeOpacity={0.85}
                >
                  {isLocating ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <Ionicons name="locate" size={16} color={Colors.primary} />
                  )}
                  <Text style={styles.routeQuickText}>Partir d’ici</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.routeQuickButton}
                  onPress={() => {
                    setAddressInputMode('manual');
                    setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                  <Text style={styles.routeQuickText}>Saisir</Text>
                </TouchableOpacity>
              </View>

              {(favoriteSuggestions.length > 0 || showQuickLandmarks) && (
                <View style={styles.routeSuggestions}>
                  <View style={styles.suggestionsHeader}>
                    <Text style={styles.suggestionsTitle}>Lieux rapides</Text>
                    <TouchableOpacity onPress={() => setShowQuickLandmarks((value) => !value)}>
                      <Text style={styles.suggestionsToggle}>{showQuickLandmarks ? 'Masquer' : 'Afficher'}</Text>
                    </TouchableOpacity>
                  </View>
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
                </View>
              )}
            </Animated.View>
          )}

          {requestFormStep === 'details' && (
            <Animated.View entering={FadeIn} style={styles.offerFlow}>
              <View style={styles.offerMap}>
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
                      anchor={REQUEST_MAP_MARKER_ANCHOR}
                      image={requestMapMarkerImages.departure}
                      title="Départ"
                      tracksViewChanges={false}
                    />
                  ) : null}
                  {arrivalLocation ? (
                    <Marker
                      coordinate={{
                        latitude: arrivalLocation.latitude,
                        longitude: arrivalLocation.longitude,
                      }}
                      anchor={REQUEST_MAP_MARKER_ANCHOR}
                      image={requestMapMarkerImages.arrival}
                      title="Destination"
                      tracksViewChanges={false}
                    />
                  ) : null}
                  {routeCoordinates.length > 1 ? (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={Colors.primaryDark}
                      strokeWidth={5}
                    />
                  ) : null}
                </MapView>
                <View pointerEvents="none" style={styles.offerMapShade} />
                <TouchableOpacity
                  style={styles.offerMapBack}
                  onPress={() => setRequestFormStep('route')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
                </TouchableOpacity>
                <View style={styles.offerRouteCard}>
                  <View style={styles.offerRouteRow}>
                    <Ionicons name="navigate" size={16} color={Colors.success} />
                    <Text style={styles.offerRouteText} numberOfLines={1}>{departureAddress}</Text>
                  </View>
                  <View style={styles.offerRouteDivider} />
                  <View style={styles.offerRouteRow}>
                    <Ionicons name="flag" size={16} color={Colors.primary} />
                    <Text style={styles.offerRouteText} numberOfLines={1}>{arrivalAddress}</Text>
                  </View>
                </View>
                <View pointerEvents="none" style={styles.routeStatusBadge}>
                  {isRouteLoading ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <Ionicons
                      name={routeCoordinates.length > 1 ? 'git-branch' : 'map-outline'}
                      size={15}
                      color={Colors.primary}
                    />
                  )}
                  <Text style={styles.routeStatusText}>
                    {isRouteLoading
                      ? 'Calcul itinéraire'
                      : routeDistanceLabel
                        ? routeDistanceLabel
                        : routeCoordinates.length > 1
                          ? 'Itinéraire prêt'
                          : 'Zone estimée'}
                  </Text>
                </View>
              </View>

              <View style={styles.offerSheet}>
                <View style={styles.rideTypeCard}>
                  <View style={styles.rideTypeIcon}>
                    <Ionicons name="car-sport" size={28} color={Colors.gray[900]} />
                  </View>
                  <View style={styles.rideTypeCopy}>
                    <Text style={styles.rideTypeTitle}>Course</Text>
                    <Text style={styles.rideTypeMeta}>
                      {numberOfSeats} personne{numberOfSeats > 1 ? 's' : ''} • {routeDistanceLabel || 'Prix abordables'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.rideTypeEdit} onPress={() => setRequestFormStep('route')}>
                    <Ionicons name="create-outline" size={16} color={Colors.gray[700]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.offerPriceControl}>
                  <TouchableOpacity
                    style={[styles.offerPriceButton, budgetValue <= MIN_REQUEST_PRICE && styles.offerPriceButtonDisabled]}
                    onPress={() => updateBudget(budgetValue - REQUEST_PRICE_STEP)}
                    disabled={budgetValue <= MIN_REQUEST_PRICE}
                    activeOpacity={0.78}
                  >
                    <Ionicons name="remove" size={26} color={budgetValue <= MIN_REQUEST_PRICE ? Colors.gray[400] : Colors.gray[900]} />
                  </TouchableOpacity>
                  <View style={styles.offerPriceCenter}>
                    <Text style={styles.offerPriceValue}>{budgetLabel}</Text>
                    <Text style={styles.offerPriceHint}>Prix recommandé par place</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.offerPriceButton}
                    onPress={() => updateBudget(budgetValue + REQUEST_PRICE_STEP)}
                    activeOpacity={0.78}
                  >
                    <Ionicons name="add" size={26} color={Colors.gray[900]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.offerOptionsRow}>
                  <View style={styles.offerOptionCopy}>
                    <Ionicons name="people" size={17} color={Colors.primary} />
                    <Text style={styles.offerOptionText}>{numberOfSeats} place{numberOfSeats > 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.counterCompact}>
                    <TouchableOpacity
                      style={[
                        styles.counterBtnCompact,
                        numberOfSeats <= MIN_REQUEST_SEATS && styles.counterBtnCompactDisabled,
                      ]}
                      onPress={() => setNumberOfSeats((value) => clampRequestSeats(value - 1))}
                      disabled={numberOfSeats <= MIN_REQUEST_SEATS}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="remove"
                        size={18}
                        color={numberOfSeats <= MIN_REQUEST_SEATS ? Colors.gray[400] : Colors.gray[900]}
                      />
                    </TouchableOpacity>
                    <Text style={styles.counterValueCompact}>{numberOfSeats}</Text>
                    <TouchableOpacity
                      style={[
                        styles.counterBtnCompact,
                        numberOfSeats >= MAX_REQUEST_SEATS && styles.counterBtnCompactDisabled,
                      ]}
                      onPress={() => setNumberOfSeats((value) => clampRequestSeats(value + 1))}
                      disabled={numberOfSeats >= MAX_REQUEST_SEATS}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={numberOfSeats >= MAX_REQUEST_SEATS ? Colors.gray[400] : Colors.gray[900]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.offerTimeBlock}>
                  <Text style={styles.offerSectionLabel}>Départ</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offerPresetScroll}>
                    {TIME_PRESETS.map((preset) => {
                      const active = timePreset === preset.id;
                      return (
                        <TouchableOpacity
                          key={preset.id}
                          style={[styles.offerPreset, active && styles.offerPresetActive]}
                          onPress={() => applyPreset(preset.id)}
                          activeOpacity={0.82}
                        >
                          <Ionicons name={preset.icon} size={15} color={active ? Colors.white : Colors.gray[600]} />
                          <Text style={[styles.offerPresetText, active && styles.offerPresetTextActive]} numberOfLines={1}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.offerTimeSummary}>
                    <Ionicons name="time-outline" size={17} color={Colors.primary} />
                    <Text style={styles.offerTimeText} numberOfLines={2}>{timeSummary}</Text>
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

                <View style={styles.offerPreferenceRow}>
                  <View style={styles.offerPreferenceIcon}>
                    <Ionicons name="send" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.offerPreferenceCopy}>
                    <Text style={styles.offerPreferenceTitle}>Recevoir les offres dans ce budget</Text>
                    <Text style={styles.offerPreferenceText}>{budgetLabel} par place</Text>
                  </View>
                  <Switch
                    value={preferBudgetOffers}
                    onValueChange={setPreferBudgetOffers}
                    trackColor={{ false: Colors.gray[200], true: Colors.primary + '55' }}
                    thumbColor={preferBudgetOffers ? Colors.primary : Colors.white}
                  />
                </View>

                <TouchableOpacity style={styles.offerNoteToggle} onPress={() => setShowAdvanced((value) => !value)}>
                  <Text style={styles.offerNoteToggleText}>{showAdvanced ? 'Masquer la note' : 'Ajouter une note'}</Text>
                  <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[500]} />
                </TouchableOpacity>

                {showAdvanced && (
                  <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.offerNotePanel}>
                    <TextInput
                      style={styles.textArea}
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      placeholder="Ex: j’ai un bagage, je voyage avec un enfant..."
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </Animated.View>
                )}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {requestFormStep === 'route' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          <Text style={styles.footerTitle} numberOfLines={1}>{routeSummary}</Text>
          <Text style={styles.footerText} numberOfLines={1}>{timeSummary}</Text>
          <View style={styles.footerActions}>
            {renderPrimaryButton(false)}
          </View>
        </View>
      )}

      {requestFormStep === 'details' && (
        <View style={[styles.offerStickyFooter, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
          <TouchableOpacity
            style={[styles.offerSubmitButton, primaryButtonDisabled && styles.mainButtonDisabled]}
            onPress={handleCreateRequest}
            disabled={primaryButtonDisabled}
            activeOpacity={0.9}
          >
            {isCreating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.offerSubmitText}>Chercher un driver</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

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
  routeContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  detailsContent: { paddingHorizontal: 0, paddingBottom: 116 },
  mapPreview: { height: 240, overflow: 'hidden', backgroundColor: Colors.gray[200] },
  detailsMapPreview: { height: 190, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray[200] },
  mapPreviewMap: { ...StyleSheet.absoluteFillObject },
  mapPreviewShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, backgroundColor: 'rgba(238,242,246,0.72)' },
  mapLocateButton: { position: 'absolute', right: Spacing.lg, top: Spacing.md, minHeight: 42, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.white, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  mapLocateButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  routeStatusBadge: { position: 'absolute', left: Spacing.lg, bottom: Spacing.lg, minHeight: 38, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.white, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  routeStatusText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.gray[800] },
  routeSetup: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.lg, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 5 },
  routeSetupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeSetupTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  routeSetupSwap: { width: 42, height: 42, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary + '12' },
  routeInputStack: { borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], overflow: 'hidden', backgroundColor: Colors.white },
  routePickerItem: { backgroundColor: Colors.white },
  routePickerButton: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md },
  routePickerIcon: { width: 42, height: 42, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  routePickerIconStart: { backgroundColor: Colors.success + '14' },
  routePickerIconEnd: { backgroundColor: Colors.primary + '14' },
  routePickerCopy: { flex: 1, minWidth: 0 },
  routePickerLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.gray[500], textTransform: 'uppercase' },
  routePickerValue: { marginTop: 3, fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  routePickerPlaceholder: { color: Colors.gray[500], fontWeight: FontWeights.semibold },
  routeManualWrap: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.xs },
  routeManualInput: { minHeight: 46, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: Spacing.md, fontSize: FontSizes.base, color: Colors.gray[900] },
  routeStackDivider: { height: 1, backgroundColor: Colors.gray[100], marginLeft: 66 },
  routeQuickRow: { flexDirection: 'row', gap: Spacing.sm },
  routeQuickButton: { flex: 1, minHeight: 48, borderRadius: BorderRadius.full, backgroundColor: Colors.primary + '10', borderWidth: 1, borderColor: Colors.primary + '20', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  routeQuickText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.primary },
  routeSuggestions: { gap: Spacing.sm },
  offerFlow: { flex: 1, backgroundColor: '#EEF2F6' },
  offerMap: { height: 300, overflow: 'hidden', backgroundColor: Colors.gray[200] },
  offerMapShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, backgroundColor: 'rgba(238,242,246,0.35)' },
  offerMapBack: { position: 'absolute', left: Spacing.lg, bottom: Spacing.xl, width: 48, height: 48, borderRadius: BorderRadius.full, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  offerRouteCard: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, top: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 6 },
  offerRouteRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  offerRouteDivider: { height: 1, backgroundColor: Colors.gray[100], marginLeft: 26 },
  offerRouteText: { flex: 1, fontSize: FontSizes.base, fontWeight: FontWeights.semibold, color: Colors.gray[900] },
  offerSheet: { marginTop: -18, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.sm },
  rideTypeCard: { minHeight: 72, borderRadius: BorderRadius.lg, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[100], flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, gap: Spacing.md },
  rideTypeIcon: { width: 48, height: 48, borderRadius: BorderRadius.md, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  rideTypeCopy: { flex: 1, minWidth: 0 },
  rideTypeTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  rideTypeMeta: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[600] },
  rideTypeEdit: { width: 38, height: 38, borderRadius: BorderRadius.full, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  offerPriceControl: { minHeight: 88, borderRadius: BorderRadius.lg, backgroundColor: '#F7F8FA', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md },
  offerPriceButton: { width: 50, height: 50, borderRadius: BorderRadius.full, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  offerPriceButtonDisabled: { backgroundColor: Colors.gray[100] },
  offerPriceCenter: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
  offerPriceValue: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  offerPriceHint: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[600], textAlign: 'center' },
  offerOptionsRow: { minHeight: 52, borderRadius: BorderRadius.lg, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[100], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md },
  offerOptionCopy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  offerOptionText: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  offerTimeBlock: { gap: Spacing.sm },
  offerSectionLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  offerPresetScroll: { gap: Spacing.sm, paddingRight: Spacing.lg },
  offerPreset: { minHeight: 40, borderRadius: BorderRadius.full, backgroundColor: Colors.gray[100], paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  offerPresetActive: { backgroundColor: Colors.primary },
  offerPresetText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[700] },
  offerPresetTextActive: { color: Colors.white },
  offerTimeSummary: { minHeight: 42, borderRadius: BorderRadius.md, backgroundColor: Colors.primary + '0D', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  offerTimeText: { flex: 1, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.gray[900], lineHeight: 19 },
  offerPreferenceRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[100], paddingHorizontal: Spacing.md },
  offerPreferenceIcon: { width: 42, height: 42, borderRadius: BorderRadius.full, backgroundColor: Colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
  offerPreferenceCopy: { flex: 1, minWidth: 0 },
  offerPreferenceTitle: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  offerPreferenceText: { marginTop: 2, fontSize: FontSizes.sm, color: Colors.gray[600] },
  offerSubmitButton: { minHeight: 58, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 6 },
  offerStickyFooter: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 10 },
  offerSubmitText: { color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  offerNoteToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  offerNoteToggleText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.gray[700] },
  offerNotePanel: { gap: Spacing.sm },
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
  counterBtnCompactDisabled: { backgroundColor: Colors.gray[100] },
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
