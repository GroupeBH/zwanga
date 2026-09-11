import { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  ELECTRONIC_PAYMENTS_ENABLED,
} from '@/constants/paymentFeatures';
import { MUTATION_RECONCILIATION_DELAYS_MS } from '@/constants/network';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import { useUserLocation } from '@/hooks/useUserLocation';
import { trackEvent } from '@/services/analytics';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import {
  useCreateTripRequestMutation,
  useGetTripRequestVehicleOptionsMutation,
  useLazyGetMyTripRequestsQuery,
  type TripRequestVehiclePriceOption,
} from '@/store/api/tripRequestApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import type { FavoriteLocation, TripPaymentMode, TripRequestVehicleType } from '@/types';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import { getApiErrorMessage, isAmbiguousTransportError } from '@/utils/errorHelpers';
import {
  buildManualGeocodeQuery,
  MANUAL_GEOCODE_DEBOUNCE_MS,
  mapGeocodeResponseToSelection,
  type ManualGeocodeStatus,
} from '@/utils/manualAddressGeocode';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { getRouteCoordinates } from '@/utils/routeApi';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ImageRequireSource,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TimePreset, PickerTarget, RequestFormStep, LatLng, IOSDateTimePickerProps, TIME_PRESETS, FLEX_OPTIONS, MIN_REQUEST_SEATS, MAX_REQUEST_SEATS, MIN_REQUEST_PRICE, REQUEST_PRICE_STEP, TIME_PRESET_SYNC_INTERVAL_MS, DEFAULT_REQUEST_REGION, REQUEST_MAP_MARKER_ANCHOR, requestMapMarkerImages, IOSDateTimePicker, POPULAR_PLACES, TRIP_PAYMENT_MODE_OPTIONS, roundToStep, buildPresetWindow, applyDatePart, applyTimePart, formatDateLabel, formatTimeLabel, favoriteIcon, getLocationText, getLocationCoordinates, parseNumberParam, clampRequestSeats, clampRequestPrice, formatCdfPrice, formatDistanceKm, getMapCoordinate, areSameCoordinate, getRenderableRouteCoordinates, buildRoutePreviewRegion } from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';

export function useRequestTripController() {
const router = useRouter();

const requestParams = useLocalSearchParams<{
    arrival?: string;
    departure?: string;
    minSeats?: string;
    seats?: string;
  }>();

const insets = useSafeAreaInsets();

const { showDialog } = useDialog();

const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: false,
    trackingProfile: 'nearby',
  });

const departureAutoFillStartedRef = useRef(false);

const departureTouchedRef = useRef(false);

const createRequestInFlightRef = useRef(false);

const screenMountedRef = useRef(true);

const quickPlaceRequestSeqRef = useRef<Record<PickerTarget, number>>({
    departure: 0,
    arrival: 0,
  });

const { data: favoriteLocations = [] } = useGetFavoriteLocationsQuery();

const [createTripRequest, { isLoading: isCreating }] = useCreateTripRequestMutation();

const [getMyTripRequests] = useLazyGetMyTripRequestsQuery();

const [
    getTripRequestVehicleOptions,
    { isLoading: isPriceLoading, isError: isVehicleOptionsError },
  ] = useGetTripRequestVehicleOptionsMutation();

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

const [hasSpecifiedNumberOfSeats, setHasSpecifiedNumberOfSeats] = useState(false);

const [selectedVehicleType, setSelectedVehicleType] =
    useState<TripRequestVehicleType>('car');

const [vehicleOptions, setVehicleOptions] = useState<TripRequestVehiclePriceOption[]>([]);

const [vehicleOptionsRetry, setVehicleOptionsRetry] = useState(0);

const [maxPricePerSeat, setMaxPricePerSeat] = useState('');

const [hasEditedBudget, setHasEditedBudget] = useState(false);

const [requestPaymentMode, setRequestPaymentMode] =
    useState<TripPaymentMode>('cash');

const [description, setDescription] = useState('');

const [showAdvanced, setShowAdvanced] = useState(false);

const [showQuickLandmarks, setShowQuickLandmarks] = useState(true);

const [isLocating, setIsLocating] = useState(false);

const [quickPlaceResolvingKey, setQuickPlaceResolvingKey] = useState<string | null>(null);

const [requestFormStep, setRequestFormStep] = useState<RequestFormStep>('route');

const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);

const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);

const [isRouteLoading, setIsRouteLoading] = useState(false);

const [hasAppliedRoutePrefill, setHasAppliedRoutePrefill] = useState(false);

const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

const [submissionRecoveryMessage, setSubmissionRecoveryMessage] = useState<string | null>(null);

const [requestSentWithoutDetail, setRequestSentWithoutDetail] = useState(false);

const [submissionError, setSubmissionError] = useState<string | null>(null);

useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
    };
  }, []);

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
      departureTouchedRef.current = true;
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

useEffect(() => {
    if (
      !hasAppliedRoutePrefill ||
      departureAutoFillStartedRef.current ||
      departureTouchedRef.current ||
      departureLocation ||
      departureManualAddress.trim()
    ) {
      return;
    }

    departureAutoFillStartedRef.current = true;

    const initializeDeparture = async () => {
      const applyCoordinate = async (coordinate: LatLng) => {
        const selection = await buildCurrentLocationSelection(coordinate);
        if (departureTouchedRef.current) {
          return false;
        }

        setDepartureLocation(selection);
        setDepartureManualAddress(selection.title || selection.address);
        setAddressSectionStep('arrival');
        return true;
      };
      const knownLatitude = Number(lastKnownLocation?.coords?.latitude);
      const knownLongitude = Number(lastKnownLocation?.coords?.longitude);
      const knownTimestamp = Number(lastKnownLocation?.timestamp);
      const knownCoordinate =
        Number.isFinite(knownLatitude) &&
        Number.isFinite(knownLongitude) &&
        Number.isFinite(knownTimestamp) &&
        Date.now() - knownTimestamp <= 15 * 60 * 1000
          ? { latitude: knownLatitude, longitude: knownLongitude }
          : null;

      if (knownCoordinate) {
        await applyCoordinate(knownCoordinate);
      }

      if (departureTouchedRef.current) {
        return;
      }

      const position = await getCurrentLocation();
      if (!position || departureTouchedRef.current) {
        return;
      }

      const currentCoordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      if (knownCoordinate && areSameCoordinate(knownCoordinate, currentCoordinate)) {
        return;
      }

      await applyCoordinate(currentCoordinate);
    };

    void initializeDeparture();
  }, [
    departureLocation,
    departureManualAddress,
    getCurrentLocation,
    hasAppliedRoutePrefill,
    lastKnownLocation,
  ]);

const departureAddress = getLocationText(departureLocation, departureManualAddress);

const arrivalAddress = getLocationText(arrivalLocation, arrivalManualAddress);

const hasDepartureAddress = departureAddress.length > 0;

const hasArrivalAddress = arrivalAddress.length > 0;

const timeSummary = useMemo(() => {
    if (flexibilityMinutes === 0) return `${formatDateLabel(departureDateMin)} à ${formatTimeLabel(departureDateMin)}`;
    return `${formatDateLabel(departureDateMin)} entre ${formatTimeLabel(departureDateMin)} et ${formatTimeLabel(departureDateMax)}`;
  }, [departureDateMax, departureDateMin, flexibilityMinutes]);

const departureTimeRangeLabel = flexibilityMinutes === 0
    ? formatTimeLabel(departureDateMin)
    : `${formatTimeLabel(departureDateMin)} – ${formatTimeLabel(departureDateMax)}`;

const selectedTimePreset = TIME_PRESETS.find((preset) => preset.id === timePreset) ?? TIME_PRESETS[0];

const selectedVehicleOption = useMemo(
    () => vehicleOptions.find((option) => option.vehicleType === selectedVehicleType),
    [selectedVehicleType, vehicleOptions],
  );

const recommendedPricePerSeat = selectedVehicleOption?.recommendedPricePerSeat ?? null;

const parsedManualBudget = maxPricePerSeat.trim()
    ? Number.parseFloat(maxPricePerSeat)
    : undefined;

const hasValidManualBudget =
    hasEditedBudget &&
    parsedManualBudget !== undefined &&
    Number.isFinite(parsedManualBudget) &&
    parsedManualBudget > 0;

const selectedVehicleOptionUnavailable =
    selectedVehicleOption?.availableForRequestedSeats === false;

const canSubmitRequestDetails =
    !selectedVehicleOptionUnavailable &&
    (hasValidManualBudget || Boolean(selectedVehicleOption?.availableForRequestedSeats));

const budgetValue = maxPricePerSeat.trim()
    ? clampRequestPrice(parsedManualBudget)
    : recommendedPricePerSeat ?? 0;

const budgetLabel = budgetValue > 0
    ? formatCdfPrice(budgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'Prix à calculer';

const requestSeatsLabel = `${numberOfSeats} place${numberOfSeats > 1 ? 's' : ''}`;

const totalBudgetValue = budgetValue > 0 ? budgetValue * numberOfSeats : 0;

const totalBudgetLabel = totalBudgetValue > 0
    ? formatCdfPrice(totalBudgetValue)
    : isPriceLoading
      ? 'Calcul...'
      : 'À définir';

const budgetHintLabel = hasEditedBudget
    ? 'Votre budget maximum par place'
    : isVehicleOptionsError && vehicleOptions.length === 0
      ? 'Fixez votre budget pour continuer'
      : 'Prix recommandé par place';

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
    let previousAppState = AppState.currentState;
    let backgroundedAt: number | null = null;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        if (previousAppState === 'active') {
          backgroundedAt = Date.now();
        }
      } else if (
        previousAppState !== 'active' &&
        backgroundedAt !== null &&
        Date.now() - backgroundedAt >= 2_000
      ) {
        syncPresetWindow();
      }
      previousAppState = nextState;
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
    let pendingGeocode: ReturnType<typeof geocodeManualAddress> | undefined;
    setDepartureManualGeocodeStatus('searching');

    const timeout = setTimeout(() => {
      pendingGeocode = geocodeManualAddress({
        address: buildManualGeocodeQuery(address),
        region: 'cd',
      });
      pendingGeocode.unwrap()
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
      pendingGeocode?.abort();
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
    let pendingGeocode: ReturnType<typeof geocodeManualAddress> | undefined;
    setArrivalManualGeocodeStatus('searching');

    const timeout = setTimeout(() => {
      pendingGeocode = geocodeManualAddress({
        address: buildManualGeocodeQuery(address),
        region: 'cd',
      });
      pendingGeocode.unwrap()
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
      pendingGeocode?.abort();
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

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (!isCurrent) return;

      getRouteCoordinates(origin, destination)
        .then((coordinates) => {
          if (!isCurrent) return;
          setRouteCoordinates(getRenderableRouteCoordinates(coordinates, origin, destination));
        })
        .catch((error) => {
          if (!isCurrent) return;
          console.warn('Impossible de calculer l itinéraire de demande', error);
          setRouteCoordinates([]);
        })
        .finally(() => {
          if (isCurrent) {
            setIsRouteLoading(false);
          }
        });
    });

    return () => {
      isCurrent = false;
      interaction.cancel();
    };
  }, [
    arrivalLocation,
    departureLocation,
  ]);

useEffect(() => {
    if (!hasDepartureAddress || !hasArrivalAddress) {
      setRouteDistanceMeters(null);
      setVehicleOptions([]);
      return;
    }

    let isCurrent = true;
    setVehicleOptions([]);
    const interaction = InteractionManager.runAfterInteractions(() => {
      if (!isCurrent) return;

      getTripRequestVehicleOptions({
        departureLocation: departureAddress,
        departureReference: departureReference.trim() || undefined,
        departureCoordinates: getLocationCoordinates(departureLocation),
        arrivalLocation: arrivalAddress,
        arrivalReference: arrivalReference.trim() || undefined,
        arrivalCoordinates: getLocationCoordinates(arrivalLocation),
        ...(hasSpecifiedNumberOfSeats ? { numberOfSeats } : {}),
      })
        .unwrap()
        .then((recommendation) => {
          if (!isCurrent) return;
          setRouteDistanceMeters(recommendation.distanceMeters);
          setVehicleOptions(recommendation.options);
          setSelectedVehicleType((currentVehicleType) => {
            const currentOption = recommendation.options.find(
              (option) => option.vehicleType === currentVehicleType,
            );
            return currentOption?.availableForRequestedSeats
              ? currentVehicleType
              : recommendation.options.find((option) => option.availableForRequestedSeats)?.vehicleType ?? currentVehicleType;
          });
        })
        .catch((error) => {
          if (!isCurrent) return;
          console.warn('Impossible de récupérer les options de véhicule', error);
          setRouteDistanceMeters(null);
          setVehicleOptions([]);
        });
    });

    return () => {
      isCurrent = false;
      interaction.cancel();
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
    numberOfSeats,
    hasSpecifiedNumberOfSeats,
    getTripRequestVehicleOptions,
    vehicleOptionsRetry,
  ]);

useEffect(() => {
    if (hasEditedBudget) return;
    setMaxPricePerSeat(
      recommendedPricePerSeat === null ? '' : String(recommendedPricePerSeat),
    );
  }, [hasEditedBudget, recommendedPricePerSeat]);

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
    Keyboard.dismiss();
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
      departureTouchedRef.current = true;
      setAddressInputMode('map');
      setIsLocating(true);
      const position = await getCurrentLocation();
      if (!position) {
        showDialog({
          title: 'Localisation non disponible',
          message:
            "Autorisez l'accès à la localisation si vous voulez partir d'ici. Sinon, choisissez un repère manuellement.",
          variant: 'warning',
        });
        return;
      }
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const selection = await buildCurrentLocationSelection(coordinate);
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
    if (target === 'departure') {
      departureTouchedRef.current = true;
    }
    setAddressInputMode('map');
    setAddressSectionStep(target);
    setActivePicker(target);
  };

const swapRoutePoints = () => {
    departureTouchedRef.current = true;
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

const getQuickSelectionTarget = (): PickerTarget => {
    if (addressSectionStep === 'departure' || addressSectionStep === 'arrival') {
      return addressSectionStep;
    }

    return !hasDepartureAddress ? 'departure' : 'arrival';
  };

const applySelectionToSlot = (target: PickerTarget, selection: MapLocationSelection) => {
    setAddressInputMode('map');
    if (target === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(selection);
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
      return;
    }

    setArrivalLocation(selection);
    setArrivalManualAddress(selection.title || selection.address);
    setAddressSectionStep('arrival');
  };

const applySelectionToNextSlot = (selection: MapLocationSelection) => {
    applySelectionToSlot(getQuickSelectionTarget(), selection);
  };

const applyQuickPlaceToNextSlot = async (place: string) => {
    const target = getQuickSelectionTarget();
    const requestSeq = quickPlaceRequestSeqRef.current[target] + 1;
    quickPlaceRequestSeqRef.current[target] = requestSeq;
    setQuickPlaceResolvingKey(place);
    setAddressInputMode('map');

    if (target === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(null);
      setDepartureManualAddress(place);
      setDepartureManualGeocodeStatus('searching');
      setAddressSectionStep('arrival');
    } else {
      setArrivalLocation(null);
      setArrivalManualAddress(place);
      setArrivalManualGeocodeStatus('searching');
      setAddressSectionStep('arrival');
    }

    try {
      const response = await geocodeManualAddress({
        address: buildManualGeocodeQuery(place),
        region: 'cd',
      }).unwrap();
      if (quickPlaceRequestSeqRef.current[target] !== requestSeq) {
        return;
      }

      const selection = mapGeocodeResponseToSelection(place, response);
      if (!selection) {
        throw new Error('Lieu rapide introuvable');
      }

      setAddressInputMode('map');
      if (target === 'departure') {
        setDepartureLocation(selection);
        setDepartureManualAddress(selection.title || selection.address);
        setDepartureManualGeocodeStatus('found');
        setAddressSectionStep('arrival');
        return;
      }

      setArrivalLocation(selection);
      setArrivalManualAddress(selection.title || selection.address);
      setArrivalManualGeocodeStatus('found');
      setAddressSectionStep('arrival');
    } catch (error) {
      if (quickPlaceRequestSeqRef.current[target] !== requestSeq) {
        return;
      }

      console.warn('Quick place geocode failed', error);
      setAddressInputMode('manual');
      if (target === 'departure') {
        setDepartureManualGeocodeStatus('missing');
      } else {
        setArrivalManualGeocodeStatus('missing');
      }
    } finally {
      if (quickPlaceRequestSeqRef.current[target] === requestSeq) {
        setQuickPlaceResolvingKey(null);
      }
    }
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
    if (createRequestInFlightRef.current || isCreating) return;
    setSubmissionError(null);
    setCreatedRequestId(null);
    setSubmissionRecoveryMessage(null);
    setRequestSentWithoutDetail(false);

    const departureWindow = getCurrentDepartureWindow();
    if (timePreset !== 'custom') {
      setDepartureDateMin(departureWindow.min);
      setFlexibilityMinutes(departureWindow.flex);
    }
    if (!validate(departureWindow)) return;
    const parsedBudget = hasEditedBudget && parsedManualBudget !== undefined
      ? clampRequestPrice(parsedManualBudget)
      : undefined;
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      showDialog({
        title: 'Budget invalide',
        message: "Indiquez le montant que vous avez prévu pour la course avant d'envoyer la demande.",
        variant: 'warning',
      });
      return;
    }
    if (selectedVehicleOptionUnavailable) {
      showDialog({
        title: 'Véhicule requis',
        message: 'Ce type de véhicule ne peut pas prendre le nombre de places demandé. Choisissez un autre type de véhicule.',
        variant: 'warning',
      });
      return;
    }
    if (!canSubmitRequestDetails) {
      showDialog({
        title: 'Budget requis',
        message: "Le tarif automatique n'est pas disponible pour le moment. Fixez votre budget maximum par place, puis envoyez la demande.",
        variant: 'warning',
      });
      return;
    }
    createRequestInFlightRef.current = true;
    const submissionStartedAt = Date.now();

    const showRequestSuccess = (requestId: string) => {
      setSubmissionRecoveryMessage(null);
      setRequestSentWithoutDetail(false);
      setCreatedRequestId(requestId);
    };

    try {
      const departureCoordinates = getLocationCoordinates(departureLocation);
      const arrivalCoordinates = getLocationCoordinates(arrivalLocation);
      const requestNotes = description.trim();
      const createdRequest = await createTripRequest({
        departureLocation: departureAddress,
        departureReference: departureReference.trim() || undefined,
        departureCoordinates,
        arrivalLocation: arrivalAddress,
        arrivalReference: arrivalReference.trim() || undefined,
        arrivalCoordinates,
        departureDateMin: departureWindow.min.toISOString(),
        departureDateMax: departureWindow.max.toISOString(),
        ...(hasSpecifiedNumberOfSeats ? { numberOfSeats } : {}),
        vehicleType: selectedVehicleType,
        ...(parsedBudget !== undefined ? { maxPricePerSeat: parsedBudget } : {}),
        paymentMode: requestPaymentMode,
        description: requestNotes || undefined,
      }).unwrap();
      void trackEvent('trip_request_created', {
        seats: numberOfSeats,
        seat_count_specified: hasSpecifiedNumberOfSeats,
        vehicle_type: selectedVehicleType,
        max_price_per_seat: parsedBudget ?? null,
        payment_mode: requestPaymentMode,
        has_description: Boolean(description.trim()),
        flexibility_minutes: departureWindow.flex,
      });
      showRequestSuccess(String(createdRequest.id));
    } catch (error: any) {
      if (isAmbiguousTransportError(error)) {
        setCreatedRequestId(null);
        setRequestSentWithoutDetail(false);
        setSubmissionRecoveryMessage(
          'Demande envoyée. Récupération du détail en cours…',
        );

        let recoveredRequestId: string | null = null;
        for (const delayMs of MUTATION_RECONCILIATION_DELAYS_MS) {
          if (recoveredRequestId) break;
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          try {
            const requests = await getMyTripRequests(undefined, false).unwrap();
            const normalizedDeparture = departureAddress.trim().toLowerCase();
            const normalizedArrival = arrivalAddress.trim().toLowerCase();
            const matchingRequest = [...requests]
              .filter((request) => {
                const createdAt = new Date(request.createdAt).getTime();
                return (
                  Number.isFinite(createdAt) &&
                  createdAt >= submissionStartedAt - 10_000 &&
                  request.departure.name.trim().toLowerCase() === normalizedDeparture &&
                  request.arrival.name.trim().toLowerCase() === normalizedArrival
                );
              })
              .sort(
                (left, right) =>
                  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
              )[0];
            recoveredRequestId = matchingRequest?.id ? String(matchingRequest.id) : null;
          } catch {
            // Retry: the POST may be committed before the list endpoint catches up.
          }
        }

        if (recoveredRequestId) {
          showRequestSuccess(recoveredRequestId);
        } else {
          setSubmissionRecoveryMessage(null);
          setRequestSentWithoutDetail(true);
        }
      } else {
        setSubmissionError(
          getApiErrorMessage(
            error,
            'Impossible de créer la demande pour le moment. Vérifiez les informations puis réessayez.',
          ),
        );
      }
    } finally {
      createRequestInFlightRef.current = false;
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
      startTransition(() => {
        setRequestFormStep('details');
      });
      return;
    }
    await handleCreateRequest();
  };

const primaryButtonDisabled =
    isCreating ||
    (requestFormStep === 'details' && !canSubmitRequestDetails);

const primaryIconName =
    !hasDepartureAddress || !hasArrivalAddress || requestFormStep === 'route'
      ? 'arrow-forward'
      : 'send';

const isRequestSuccessVisible = Boolean(
    createdRequestId || submissionRecoveryMessage || requestSentWithoutDetail,
  );

const isResolvingSentRequest = Boolean(
    submissionRecoveryMessage && !createdRequestId && !requestSentWithoutDetail,
  );

const requestSuccessDetailLabel = createdRequestId
    ? 'Voir la demande'
    : 'Voir mes demandes';

const requestSuccessText = isResolvingSentRequest
    ? 'Votre demande est envoyée. Nous retrouvons son détail avant de vous proposer la suite.'
    : createdRequestId
      ? 'Votre demande est prête. Vous pouvez suivre les réponses des conducteurs ou revenir à l’accueil.'
      : 'Votre demande a été envoyée, mais le détail n’a pas pu être ouvert automatiquement. Retrouvez-la dans vos demandes.';

const goToRequestSuccessDetail = () => {
    if (createdRequestId) {
      router.replace(getTripRequestDetailHref(createdRequestId));
      return;
    }
    router.replace('/my-requests');
  };

const goHomeAfterRequestSuccess = () => {
    router.replace('/(tabs)');
  };
return { activePicker, addressInputMode, addressSectionStep, applyPreset, applyQuickPlaceToNextSlot, applySelectionToNextSlot, arrivalAddress, arrivalLocation, arrivalManualAddress, arrivalManualGeocodeStatus, budgetHintLabel, budgetLabel, budgetValue, createdRequestId, departureAddress, departureDateMin, departureLocation, departureManualAddress, departureManualGeocodeStatus, departureTimeRangeLabel, departureTouchedRef, description, favoriteSuggestions, flexibilityMinutes, goHomeAfterRequestSuccess, goToRequestSuccessDetail, handleCreateRequest, handleIosPickerChange, handlePrimaryAction, hasArrivalAddress, hasDepartureAddress, hasSpecifiedNumberOfSeats, insets, iosPickerMode, isCreating, isPriceLoading, isRequestSuccessVisible, isResolvingSentRequest, isRouteLoading, isVehicleOptionsError, numberOfSeats, openCustomPicker, openPickerFor, primaryButtonDisabled, primaryIconName, primaryLabel, quickPlaceResolvingKey, requestFormStep, requestPaymentMode, requestSeatsLabel, requestSuccessDetailLabel, requestSuccessText, routeCoordinates, routeDistanceLabel, routePreviewRegion, router, selectedTimePreset, selectedVehicleType, setActivePicker, setAddressInputMode, setAddressSectionStep, setArrivalLocation, setArrivalManualAddress, setDepartureLocation, setDepartureManualAddress, setDescription, setFlexibilityMinutes, setHasSpecifiedNumberOfSeats, setIosPickerMode, setNumberOfSeats, setRequestFormStep, setRequestPaymentMode, setSelectedVehicleType, setShowAdvanced, setShowQuickLandmarks, setVehicleOptionsRetry, showAdvanced, showQuickLandmarks, submissionError, submissionRecoveryMessage, swapRoutePoints, timePreset, timeSummary, totalBudgetLabel, updateBudget, vehicleOptions };
}

export type RequestTripController = ReturnType<typeof useRequestTripController>;
