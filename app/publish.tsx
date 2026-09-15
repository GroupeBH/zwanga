import { styles } from '../features/screen-styles/app/publish/index';
import { FormModal as Modal, FormScreen } from '@/components/forms/FormLayout';
import { ManualAddressStatus } from '@/components/address/ManualAddressStatus';
import { type AddressSectionStep } from '@/components/AddressSectionSlider';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { VehicleFormModal } from '@/components/VehicleFormModal';
import { Colors, Spacing } from '@/constants/styles';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { useDiditKycFlow } from '@/hooks/useDiditKycFlow';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useManualAddressGeocode } from '@/hooks/useManualAddressGeocode';
import { useUserLocation } from '@/hooks/useUserLocation';
import { trackEvent } from '@/services/analytics';
import {
  useCreateRecurringTripMutation,
  useCreateTripMutation,
  useLazyGetMyRecurringTripsQuery,
  useLazyGetMyTripsQuery,
} from '@/store/api/tripApi';
import { useGetKycStatusQuery, useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useCreateVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import type { TripRequestVehicleType, Vehicle } from '@/types';
import { buildCurrentLocationSelection } from '@/utils/currentLocationSelection';
import {
  createBecomeDriverAction,
  createSubscribeToZwangaProAction,
  getApiErrorMessage,
  isDailyPublicationLimitError,
  isDriverRequiredError,
} from '@/utils/errorHelpers';
import { reconcileAmbiguousMutation } from '@/utils/mutationReconciliation';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { getRouteCoordinates } from '@/utils/routeApi';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PublishStep = 'route' | 'datetime' | 'vehicle' | 'pricing' | 'confirm';
type PublicationSuccess = { recurring: boolean } | null;
type LatLng = { latitude: number; longitude: number };
type RoutePointStatus = 'confirmed' | 'suggested' | null;
type IOSDateTimePickerProps = React.ComponentProps<typeof DateTimePicker> & {
  accentColor?: string;
  display?: 'default' | 'compact' | 'inline' | 'spinner';
  locale?: string;
  minuteInterval?: number;
  textColor?: string;
  themeVariant?: 'dark' | 'light';
};
const PUBLISH_STEP_ORDER: PublishStep[] = ['route', 'datetime', 'vehicle', 'pricing', 'confirm'];
const IOSDateTimePicker = DateTimePicker as React.ComponentType<IOSDateTimePickerProps>;
const DEFAULT_PUBLISH_REGION: Region = {
  latitude: -4.441931,
  longitude: 15.266293,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const PUBLISH_MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

function getLocationText(selection: MapLocationSelection | null, manualAddress: string) {
  return (manualAddress.trim() || selection?.title || selection?.address || '').trim();
}

function getLocationCoordinates(selection: MapLocationSelection | null): [number, number] | undefined {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return undefined;
  }
  return [coordinate.longitude, coordinate.latitude];
}

function getMapCoordinate(selection: MapLocationSelection | null): LatLng | null {
  const coordinate = selection
    ? normalizeTripMapCoordinate(selection.latitude, selection.longitude)
    : null;
  if (!coordinate) {
    return null;
  }

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
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
    return DEFAULT_PUBLISH_REGION;
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

function isUserDriver(user?: { role?: unknown; isDriver?: boolean | null } | null) {
  const role = String(user?.role ?? '').toLowerCase();
  return role === 'driver' || role === 'both' || role === 'conducteur' || role === 'chauffeur' || Boolean(user?.isDriver);
}

export default function PublishScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const { isIdentityVerified } = useIdentityCheck();
  const [step, setStep] = useState<PublishStep>('route');
  const stepNumber = useMemo(() => PUBLISH_STEP_ORDER.indexOf(step) + 1, [step]);
  const stepEntering = Platform.OS === 'android' ? undefined : FadeInDown.duration(180);
  const [createTrip, { isLoading: isPublishing }] = useCreateTripMutation();
  const [createRecurringTrip, { isLoading: isPublishingRecurring }] = useCreateRecurringTripMutation();
  const [getMyTrips] = useLazyGetMyTripsQuery();
  const [getMyRecurringTrips] = useLazyGetMyRecurringTripsQuery();
  const publishInFlightRef = useRef(false);
  const publicationSuccessActionRef = useRef(false);
  const [publicationSuccess, setPublicationSuccess] = useState<PublicationSuccess>(null);
  const { showDialog } = useDialog();
  const { getCurrentLocation, lastKnownLocation } = useUserLocation({
    autoRequest: false,
    trackingProfile: 'nearby',
  });
  const departureAutoFillStartedRef = useRef(false);
  const departureTouchedRef = useRef(false);

  const [kycModalVisible, setKycModalVisible] = useState(false);
  const [kycApprovedInForm, setKycApprovedInForm] = useState(false);

  const { data: kycStatusData, refetch: refetchKycStatus } = useGetKycStatusQuery();
  const isPublishIdentityVerified =
    isIdentityVerified || kycApprovedInForm || kycStatusData?.status === 'approved';
  const { startDiditKyc, isStartingDiditKyc } = useDiditKycFlow({
    sourceScreen: 'publish',
    onStatusRefresh: refetchKycStatus,
    approvedMessage:
      "Votre identité a été vérifiée avec succès. Vous pouvez maintenant publier vos trajets.",
    pendingMessage:
      'Votre vérification Didit est en cours. Vous pourrez publier dès que le statut sera validé.',
  });

  useEffect(() => {
    if (kycStatusData?.status !== 'approved') {
      return;
    }

    setKycApprovedInForm(true);
    setKycModalVisible(false);
  }, [kycStatusData?.status]);

  const openKycModal = () => setKycModalVisible(true);
  const closeKycModal = () => {
    if (isStartingDiditKyc) {
      return;
    }
    setKycModalVisible(false);
  };

  const handleStartKyc = async () => {
    setKycModalVisible(false);
    const outcome = await startDiditKyc();
    if (outcome?.status === 'approved') {
      setKycApprovedInForm(true);
      if (step === 'route' && hasDepartureCoordinates && hasArrivalCoordinates) {
        goToStep('datetime');
      }
    }
  };

  const isKycBusy = isStartingDiditKyc;

  const kycChecklist = [
    { icon: 'shield-checkmark', title: 'Didit sécurisé', subtitle: 'Vérification hébergée par Didit' },
    { icon: 'id-card', title: "Pièce d'identité", subtitle: 'Contrôle guidé depuis le parcours Didit' },
    { icon: 'time', title: 'Validation rapide', subtitle: 'Suivi automatique de votre vérification' },
  ] as const;

  // Driver and Vehicle Management
  const {
    data: profileSummary,
    refetch: refetchProfile,
    isLoading: isLoadingProfile,
    isFetching: isFetchingProfile,
  } = useGetProfileSummaryQuery();
  const user = profileSummary?.user;
  const isDriver = useMemo(() => isUserDriver(user), [user]);
  const [showDriverRequiredModal, setShowDriverRequiredModal] = useState(false);

  const {
    data: vehicles = [],
    refetch: refetchVehicles,
    isLoading: isLoadingVehicles,
  } = useGetVehiclesQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  const [createdVehicle, setCreatedVehicle] = useState<Vehicle | null>(null);

  // Keep the POST response visible while the profile and vehicle caches refresh.
  const activeVehicles = useMemo(() => {
    const vehiclesById = new Map<string, Vehicle>();

    if (createdVehicle && createdVehicle.isActive !== false) {
      vehiclesById.set(createdVehicle.id, createdVehicle);
    }

    vehicles.forEach((vehicle) => {
      if (vehicle.isActive !== false) {
        vehiclesById.set(vehicle.id, vehicle);
      }
    });

    return Array.from(vehiclesById.values());
  }, [createdVehicle, vehicles]);

  const [createVehicle, { isLoading: isCreatingVehicle }] = useCreateVehicleMutation();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleType, setVehicleType] = useState<TripRequestVehicleType | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleLicensePlate, setVehicleLicensePlate] = useState('');
  const [vehicleFormError, setVehicleFormError] = useState<string | null>(null);
  const [vehicleCreationMessage, setVehicleCreationMessage] = useState<string | null>(null);
  const [isFinalizingVehicleCreation, setIsFinalizingVehicleCreation] = useState(false);

  useEffect(() => {
    if (activeVehicles.length === 0) {
      if (selectedVehicleId !== null) {
        setSelectedVehicleId(null);
      }
      return;
    }

    const currentSelectionStillValid = selectedVehicleId
      ? activeVehicles.some((vehicle) => vehicle.id === selectedVehicleId)
      : false;

    if (currentSelectionStillValid) {
      return;
    }

    const preferredVehicleId =
      user?.vehicle?.id && activeVehicles.some((vehicle) => vehicle.id === user.vehicle?.id)
        ? user.vehicle.id
        : activeVehicles[0].id;

    setSelectedVehicleId(preferredVehicleId);
  }, [activeVehicles, selectedVehicleId, user?.vehicle?.id]);

  const resetForm = () => {
    departureAutoFillStartedRef.current = false;
    departureTouchedRef.current = false;
    setStep('route');
    setDepartureLocation(null);
    setArrivalLocation(null);
    setDeparturePointStatus(null);
    setArrivalPointStatus(null);
    setActiveLocationType(null);
    setDepartureDateTime(null);
    setIosPickerMode(null);
    setIosPickerTarget('departure');
    setSeats('4');
    setIsFreeTrip(false);
    setPrice('');
    setDescription('');
    setIsRecurringTrip(false);
    setRecurringWeekdays([]);
    setRecurringEndDate(null);
    setDepartureManualAddress('');
    setDepartureReference('');
    setArrivalManualAddress('');
    setArrivalReference('');
    setShowDepartureReference(false);
    setShowArrivalReference(false);
    setManualAddressTarget(null);
    setAddressSectionStep('method');
    setLocationPickerInitialQuery('');
    setShowQuickLandmarks(false);
    setSelectedVehicleId(null);
    setCreatedVehicle(null);
    setShowVehicleForm(false);
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehicleLicensePlate('');
    setVehicleFormError(null);
    setVehicleCreationMessage(null);
    setIsFinalizingVehicleCreation(false);
  };

  const resetVehicleForm = () => {
    setVehicleType(null);
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehicleLicensePlate('');
  };

  const closeVehicleForm = () => {
    setShowVehicleForm(false);
    resetVehicleForm();
    setVehicleFormError(null);
    setIsFinalizingVehicleCreation(false);
  };

  const openVehicleForm = () => {
    resetVehicleForm();
    setVehicleFormError(null);
    setVehicleCreationMessage(null);
    setIsFinalizingVehicleCreation(false);
    setShowVehicleForm(true);
  };

  const vehicleModalCopy = {
    title: 'Nouveau v\u00e9hicule',
    subtitle:
      'Ajoutez votre v\u00e9hicule maintenant pour continuer la publication sans perdre votre progression.',
  };

  // Données du formulaire
  const [departureLocation, setDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [arrivalLocation, setArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [departurePointStatus, setDeparturePointStatus] = useState<RoutePointStatus>(null);
  const [arrivalPointStatus, setArrivalPointStatus] = useState<RoutePointStatus>(null);
  const [departureManualAddress, setDepartureManualAddress] = useState('');
  const [departureReference, setDepartureReference] = useState('');
  const [arrivalManualAddress, setArrivalManualAddress] = useState('');
  const [arrivalReference, setArrivalReference] = useState('');
  const [showDepartureReference, setShowDepartureReference] = useState(false);
  const [showArrivalReference, setShowArrivalReference] = useState(false);
  const [showQuickLandmarks, setShowQuickLandmarks] = useState(false);
  const [manualAddressTarget, setManualAddressTarget] = useState<'departure' | 'arrival' | null>(null);
  const [, setAddressSectionStep] = useState<AddressSectionStep>('method');
  const [activeLocationType, setActiveLocationType] = useState<'departure' | 'arrival' | null>(null);
  const [locationPickerInitialQuery, setLocationPickerInitialQuery] = useState('');
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [iosPickerTarget, setIosPickerTarget] = useState<'departure' | 'recurringEndDate'>('departure');
  const [iosPickerValue, setIosPickerValue] = useState<Date>(new Date());
  const [seats, setSeats] = useState('4');
  const [isFreeTrip, setIsFreeTrip] = useState(false);
  const [requiresPassengerKyc, setRequiresPassengerKyc] = useState(false);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurringTrip, setIsRecurringTrip] = useState(false);
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState<Date | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const departureAddress =
    manualAddressTarget === 'departure'
      ? departureManualAddress.trim()
      : getLocationText(departureLocation, '');
  const arrivalAddress =
    manualAddressTarget === 'arrival'
      ? arrivalManualAddress.trim()
      : getLocationText(arrivalLocation, '');
  const hasDepartureAddress = departureAddress.length > 0;
  const hasArrivalAddress = arrivalAddress.length > 0;
  const hasDepartureGpsSuggestion = Boolean(getMapCoordinate(departureLocation));
  const hasArrivalGpsSuggestion = Boolean(getMapCoordinate(arrivalLocation));
  const hasDepartureCoordinates = hasDepartureGpsSuggestion && departurePointStatus === 'confirmed';
  const hasArrivalCoordinates = hasArrivalGpsSuggestion && arrivalPointStatus === 'confirmed';
  const shouldShowDepartureReference = showDepartureReference || departureReference.trim().length > 0;
  const shouldShowArrivalReference = showArrivalReference || arrivalReference.trim().length > 0;
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

  useEffect(() => {
    if (
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

        setManualAddressTarget(null);
        setDepartureLocation(selection);
        setDeparturePointStatus('confirmed');
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
  }, [departureLocation, departureManualAddress, getCurrentLocation, lastKnownLocation]);

  const renderGpsStatus = (
    hasAddress: boolean,
    hasGpsSuggestion: boolean,
    isConfirmed: boolean,
    label: string,
  ) => {
    if (!hasAddress && !hasGpsSuggestion) {
      return null;
    }

    const isReady = isConfirmed;
    const message = isReady
      ? `${label} confirmé sur la carte`
      : hasGpsSuggestion
        ? `${label} trouvé, vérifiez le point sur la carte`
        : `${label} à confirmer sur la carte`;

    return (
      <View style={styles.gpsStatus}>
        <Ionicons
          name={isReady ? 'checkmark-circle' : 'alert-circle'}
          size={14}
          color={isReady ? Colors.success : Colors.warning}
        />
        <Text style={[styles.gpsStatusText, isReady && styles.gpsStatusTextReady]}>
          {message}
        </Text>
      </View>
    );
  };
  const departureSummary = useMemo(
    () => ({
      title: departureAddress || 'Point de départ non défini',
      address: departureLocation?.address ?? departureAddress,
      latitude: departureLocation?.latitude,
      longitude: departureLocation?.longitude,
    }),
    [departureAddress, departureLocation?.address, departureLocation?.latitude, departureLocation?.longitude],
  );

  const arrivalSummary = useMemo(
    () => ({
      title: arrivalAddress || 'Destination non définie',
      address: arrivalLocation?.address ?? arrivalAddress,
      latitude: arrivalLocation?.latitude,
      longitude: arrivalLocation?.longitude,
    }),
    [arrivalAddress, arrivalLocation?.address, arrivalLocation?.latitude, arrivalLocation?.longitude],
  );
  const recurringWeekdayOptions = useMemo(
    () => [
      { value: 1, label: 'Lun' },
      { value: 2, label: 'Mar' },
      { value: 3, label: 'Mer' },
      { value: 4, label: 'Jeu' },
      { value: 5, label: 'Ven' },
      { value: 6, label: 'Sam' },
      { value: 7, label: 'Dim' },
    ],
    [],
  );

  const formatDateOnlyValue = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTimeOnlyValue = (date: Date) => {
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const toIsoWeekday = (date: Date) => {
    const weekday = date.getDay();
    return weekday === 0 ? 7 : weekday;
  };

  const openLocationPicker = (type: 'departure' | 'arrival', initialQuery = '') => {
    if (type === 'departure') {
      departureTouchedRef.current = true;
    }
    setLocationPickerInitialQuery(initialQuery);
    setActiveLocationType(type);
  };

  const closeLocationPicker = () => {
    setActiveLocationType(null);
    setLocationPickerInitialQuery('');
  };

  const swapRoutePoints = () => {
    departureTouchedRef.current = true;
    const tempLoc = departureLocation;
    const tempStatus = departurePointStatus;
    const tempManual = departureManualAddress;
    const tempRef = departureReference;
    const tempShowRef = showDepartureReference;
    setDepartureLocation(arrivalLocation);
    setDeparturePointStatus(arrivalPointStatus);
    setDepartureManualAddress(arrivalManualAddress);
    setDepartureReference(arrivalReference);
    setShowDepartureReference(showArrivalReference);
    setArrivalLocation(tempLoc);
    setArrivalPointStatus(tempStatus);
    setArrivalManualAddress(tempManual);
    setArrivalReference(tempRef);
    setShowArrivalReference(tempShowRef);
  };

  const handleLocationSelected = (selection: MapLocationSelection) => {
    setManualAddressTarget(null);
    if (activeLocationType === 'departure') {
      departureTouchedRef.current = true;
      setDepartureLocation(selection);
      setDeparturePointStatus('confirmed');
      setDepartureManualAddress(selection.title || selection.address);
      setAddressSectionStep('arrival');
    } else if (activeLocationType === 'arrival') {
      setArrivalLocation(selection);
      setArrivalPointStatus('confirmed');
      setArrivalManualAddress(selection.title || selection.address);
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

  const openDateOrTimePicker = (
    mode: 'date' | 'time',
    target: 'departure' | 'recurringEndDate' = 'departure',
  ) => {
    Keyboard.dismiss();
    if (Platform.OS === 'android') {
      const value =
        target === 'recurringEndDate'
          ? recurringEndDate ?? departureDateTime ?? getBaseDateTime()
          : getBaseDateTime();
      DateTimePickerAndroid.open({
        mode,
        value,
        is24Hour: true,
        minimumDate:
          mode === 'date'
            ? target === 'recurringEndDate'
              ? departureDateTime ?? new Date()
              : new Date()
            : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) {
            return;
          }

          if (target === 'recurringEndDate') {
            const nextEndDate = new Date(selectedDate);
            nextEndDate.setHours(0, 0, 0, 0);
            setRecurringEndDate(nextEndDate);
            return;
          }

          setDepartureDateTime(
            mode === 'date' ? applyDatePart(selectedDate) : applyTimePart(selectedDate),
          );
        },
      });
    } else {
      const value =
        target === 'recurringEndDate'
          ? recurringEndDate ?? departureDateTime ?? getBaseDateTime()
          : getBaseDateTime();
      setIosPickerValue(new Date(value));
      setIosPickerTarget(target);
      setIosPickerMode(mode);
    }
  };

  const handleIosPickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate) {
      return;
    }
    setIosPickerValue(selectedDate);
  };

  const confirmIosPicker = () => {
    if (!iosPickerMode) {
      return;
    }
    if (iosPickerTarget === 'recurringEndDate') {
      const nextEndDate = new Date(iosPickerValue);
      nextEndDate.setHours(0, 0, 0, 0);
      setRecurringEndDate(nextEndDate);
    } else {
      setDepartureDateTime(
        iosPickerMode === 'date' ? applyDatePart(iosPickerValue) : applyTimePart(iosPickerValue),
      );
    }
    closeIosPicker();
  };

  const closeIosPicker = () => {
    setIosPickerMode(null);
    setIosPickerTarget('departure');
  };

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
  const formattedRecurringEndDate = useMemo(() => {
    if (!recurringEndDate) {
      return 'Aucune date de fin';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(recurringEndDate);
  }, [recurringEndDate]);

  const recurringDaysSummary = useMemo(() => {
    return recurringWeekdayOptions
      .filter((option) => recurringWeekdays.includes(option.value))
      .map((option) => option.label)
      .join(', ');
  }, [recurringWeekdayOptions, recurringWeekdays]);

  const isSubmittingTrip = isPublishing || isPublishingRecurring;
  const toggleRecurringTrip = () => {
    setIsRecurringTrip((current) => {
      const next = !current;
      if (next && recurringWeekdays.length === 0) {
        setRecurringWeekdays([toIsoWeekday(departureDateTime ?? new Date())]);
      }
      if (!next) {
        setRecurringEndDate(null);
      }
      return next;
    });
  };

  const toggleRecurringWeekday = (weekday: number) => {
    setRecurringWeekdays((current) => {
      if (current.includes(weekday)) {
        return current.filter((value) => value !== weekday);
      }
      return [...current, weekday].sort((left, right) => left - right);
    });
  };

  const [departureManualGeocodeStatus] = useManualAddressGeocode({
    enabled: manualAddressTarget === 'departure', address: departureManualAddress,
    selection: departureLocation, onResolved: (selection) => {
      setDepartureLocation(selection);
      setDeparturePointStatus('suggested');
    }, onMissing: () => setDeparturePointStatus(null),
  });

  const [arrivalManualGeocodeStatus] = useManualAddressGeocode({
    enabled: manualAddressTarget === 'arrival', address: arrivalManualAddress,
    selection: arrivalLocation, onResolved: (selection) => {
      setArrivalLocation(selection);
      setArrivalPointStatus('suggested');
    }, onMissing: () => setArrivalPointStatus(null),
  });

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
          console.warn("Impossible de calculer l'itinéraire de publication", error);
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
  }, [arrivalLocation, departureLocation]);

  useEffect(() => {
    if (mode !== 'recurring' || isRecurringTrip) {
      return;
    }

    setIsRecurringTrip(true);
    if (recurringWeekdays.length === 0) {
      setRecurringWeekdays([toIsoWeekday(departureDateTime ?? new Date())]);
    }
  }, [mode, isRecurringTrip, recurringWeekdays.length, departureDateTime]);

  const handleCreateVehicle = async () => {
    if (!vehicleType || !vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehicleLicensePlate.trim()) {
      setVehicleFormError('Veuillez choisir le type et remplir tous les champs du véhicule.');
      return;
    }

    setVehicleFormError(null);

    try {
      const newVehicle = await createVehicle({
        type: vehicleType,
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: vehicleLicensePlate.trim(),
      }).unwrap();

      Keyboard.dismiss();
      setIsFinalizingVehicleCreation(true);
      setCreatedVehicle(newVehicle);
      setSelectedVehicleId(newVehicle.id);
      setVehicleCreationMessage(
        `${newVehicle.brand} ${newVehicle.model} a été ajouté et sélectionné pour ce trajet.`,
      );
      setShowVehicleForm(false);
      resetVehicleForm();

      // The POST response already updates the form; these calls synchronize the remaining caches.
      void Promise.allSettled([refetchProfile(), refetchVehicles()]);
    } catch (error: any) {
      const message = getApiErrorMessage(
        error,
        'Impossible d\'ajouter le véhicule pour le moment.',
      );
      setVehicleFormError(message);
      setIsFinalizingVehicleCreation(false);
    }
  };

  const handleNextStep = () => {
    if (step === 'route') {
      if (!hasDepartureAddress || !hasArrivalAddress) {
        setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
        showDialog({
          variant: 'warning',
          title: 'Itinéraire incomplet',
          message: 'Indiquez une adresse de départ et une destination, ou choisissez-les sur la carte.',
        });
        return;
      }
      if (!isPublishIdentityVerified) {
        openKycModal();
        return;
      }
      goToStep('datetime');
    } else if (step === 'datetime') {
      if (!departureDateTime) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner la date et l heure de départ.',
        });
        return;
      }
      if (isRecurringTrip && recurringWeekdays.length === 0) {
        showDialog({
          variant: 'warning',
          title: 'Jours manquants',
          message: 'Sélectionnez au moins un jour pour ce trajet habituel.',
        });
        return;
      }
      if (isRecurringTrip && recurringEndDate) {
        const startDate = new Date(departureDateTime);
        startDate.setHours(0, 0, 0, 0);
        if (recurringEndDate < startDate) {
          showDialog({
            variant: 'warning',
            title: 'Date de fin invalide',
            message: 'La date de fin doit être posterieure au debut.',
          });
          return;
        }
      }
      goToStep('vehicle');
    } else if (step === 'vehicle') {
      if (!selectedVehicleId) {
        showDialog({
          variant: 'warning',
          title: 'Véhicule requis',
          message: 'Veuillez sélectionner un véhicule pour continuer.',
        });
        return;
      }
      goToStep('pricing');
    } else if (step === 'pricing') {
      if (!isFreeTrip && !price) {
        showDialog({
          variant: 'warning',
          title: 'Informations manquantes',
          message: 'Merci de renseigner le prix ou de sélectionner Gratuit.',
        });
        return;
      }
      goToStep('confirm');
    }
  };

  const handlePublish = async () => {
    // RTK Query's isLoading is updated on the next render. The ref also blocks
    // two taps occurring in the same frame from creating duplicate trips.
    if (publishInFlightRef.current || isSubmittingTrip) return;

    if (!hasDepartureAddress || !hasArrivalAddress) {
      setAddressSectionStep(!hasDepartureAddress ? 'departure' : 'arrival');
      showDialog({
        variant: 'warning',
        title: 'Itinéraire incomplet',
        message: "Indiquez vos adresses de départ et d’arrivée, ou choisissez-les sur la carte.",
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

    if (isRecurringTrip && recurringWeekdays.length === 0) {
      showDialog({
        variant: 'warning',
        title: 'Jours manquants',
        message: 'Sélectionnez au moins un jour pour publier ce trajet habituel.',
      });
      return;
    }

    if (!isDriver && !createdVehicle) {
      const refreshedProfile =
        isLoadingProfile || isFetchingProfile || !user ? await refetchProfile() : null;
      const refreshedUser = refreshedProfile?.data?.user;

      if (!isUserDriver(refreshedUser ?? user)) {
        setShowDriverRequiredModal(true);
        return;
      }
    }

    if (!selectedVehicleId) {
      showDialog({
        variant: 'warning',
        title: 'Véhicule requis',
        message: 'Veuillez sélectionner un véhicule pour publier votre trajet.',
      });
      return;
    }

    if (!isPublishIdentityVerified) {
      openKycModal();
      return;
    }

    publishInFlightRef.current = true;
    const publicationStartedAt = Date.now();

    try {
      const departureCoordinates = getLocationCoordinates(departureLocation);
      const arrivalCoordinates = getLocationCoordinates(arrivalLocation);

      if (isRecurringTrip) {
        await createRecurringTrip({
          departureLocation: departureAddress,
          departureReference: departureReference.trim() || undefined,
          departureCoordinates,
          arrivalLocation: arrivalAddress,
          arrivalReference: arrivalReference.trim() || undefined,
          arrivalCoordinates,
          startDate: formatDateOnlyValue(departureDate),
          endDate: recurringEndDate ? formatDateOnlyValue(recurringEndDate) : undefined,
          departureTime: formatTimeOnlyValue(departureDate),
          weekdays: recurringWeekdays,
          totalSeats: seatsValue,
          pricePerSeat: priceValue,
          isFree: isFreeTrip,
          description: description.trim() || undefined,
          vehicleId: selectedVehicleId,
          requiresPassengerKyc,
        }).unwrap();
        void trackEvent('recurring_trip_created', {
          seats: seatsValue,
          is_free: isFreeTrip,
          has_description: Boolean(description.trim()),
          requires_passenger_kyc: requiresPassengerKyc,
          weekdays_count: recurringWeekdays.length,
        });
      } else {
        await createTrip({
          departureLocation: departureAddress,
          departureReference: departureReference.trim() || undefined,
          departureCoordinates,
          arrivalLocation: arrivalAddress,
          arrivalReference: arrivalReference.trim() || undefined,
          arrivalCoordinates,
          departureDate: departureDate.toISOString(),
          totalSeats: seatsValue,
          pricePerSeat: priceValue,
          isFree: isFreeTrip,
          description: description.trim() || undefined,
          vehicleId: selectedVehicleId,
          requiresPassengerKyc,
        }).unwrap();
        void trackEvent('trip_published', {
          seats: seatsValue,
          price_per_seat: priceValue,
          is_free: isFreeTrip,
          has_description: Boolean(description.trim()),
          requires_passenger_kyc: requiresPassengerKyc,
        });
      }

      // Keep the confirmation screen mounted behind the success feedback. On iOS,
      // opening a native Modal above a stack screen that already contains a
      // MapView can crash during the publication transition, so the feedback is
      // rendered as an in-screen overlay instead of a React Native Modal.
      setPublicationSuccess({ recurring: isRecurringTrip });
    } catch (error: any) {
      const normalizedDeparture = departureAddress.trim().toLowerCase();
      const normalizedArrival = arrivalAddress.trim().toLowerCase();
      const recoveredPublication = isRecurringTrip
        ? await reconcileAmbiguousMutation({
            error,
            loadSnapshot: async () => getMyRecurringTrips(undefined, false).unwrap(),
            isApplied: (templates) =>
              templates.some((template) => {
                const createdAt = new Date(template.createdAt).getTime();
                return (
                  Number.isFinite(createdAt) &&
                  createdAt >= publicationStartedAt - 10_000 &&
                  template.departure.name.trim().toLowerCase() === normalizedDeparture &&
                  template.arrival.name.trim().toLowerCase() === normalizedArrival
                );
              }),
          })
        : await reconcileAmbiguousMutation({
            error,
            loadSnapshot: async () => getMyTrips(undefined, false).unwrap(),
            isApplied: (latestTrips) =>
              latestTrips.some((latestTrip) => {
                const latestDepartureAt = new Date(latestTrip.departureTime).getTime();
                return (
                  Number.isFinite(latestDepartureAt) &&
                  Math.abs(latestDepartureAt - departureDate.getTime()) < 60_000 &&
                  latestTrip.departure.name.trim().toLowerCase() === normalizedDeparture &&
                  latestTrip.arrival.name.trim().toLowerCase() === normalizedArrival &&
                  (latestTrip.vehicle?.id ?? latestTrip.vehicleId) === selectedVehicleId
                );
              }),
          });

      if (recoveredPublication) {
        setPublicationSuccess({ recurring: isRecurringTrip });
        return;
      }

      const message = getApiErrorMessage(
        error,
        'Impossible de publier le trajet pour le moment. Veuillez réessayer.',
      );

      const isDriverError = isDriverRequiredError(error);
      const isQuotaError = isDailyPublicationLimitError(error);

      showDialog({
        variant: isQuotaError ? 'warning' : 'danger',
        title: isQuotaError ? 'Abonnement conducteur requis' : 'Erreur',
        message,
        actions: isQuotaError
          ? [
              { label: 'Plus tard', variant: 'ghost' },
              createSubscribeToZwangaProAction(router),
            ]
          : isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    } finally {
      publishInFlightRef.current = false;
    }
  };

  const getStepNumber = () => {
    return stepNumber;
  };

  const isStepCompleted = (checkStep: PublishStep) => {
    const currentIndex = PUBLISH_STEP_ORDER.indexOf(step);
    const checkIndex = PUBLISH_STEP_ORDER.indexOf(checkStep);
    return checkIndex < currentIndex;
  };

  const isStepActive = (checkStep: PublishStep) => step === checkStep;
  const goToStep = (nextStep: PublishStep) => {
    if (nextStep === step) return;
    startTransition(() => {
      setStep(nextStep);
    });
  };

  const previousStep = useMemo(() => {
    const currentIndex = PUBLISH_STEP_ORDER.indexOf(step);
    return currentIndex > 0 ? PUBLISH_STEP_ORDER[currentIndex - 1] : null;
  }, [step]);

  const footerPrimaryDisabled =
    step === 'route'
      ? !hasDepartureAddress || !hasArrivalAddress
      : step === 'confirm'
        ? isSubmittingTrip ||
          !isPublishIdentityVerified
        : false;

  const footerPrimaryLabel = (() => {
    if (step === 'route') {
      if (!hasDepartureAddress) return 'Indiquez le départ';
      if (!hasArrivalAddress) return "Indiquez l'arrivée";
      return 'Continuer';
    }
    if (step === 'confirm') {
      if (!isPublishIdentityVerified) return 'Identité à vérifier';
      return isRecurringTrip ? 'Publier les trajets' : 'Publier';
    }
    return 'Continuer';
  })();

  const handleFooterPrimary = () => {
    if (step === 'confirm') {
      handlePublish();
      return;
    }
    handleNextStep();
  };

  const finishPublicationSuccess = (action: 'home' | 'trips' | 'another') => {
    if (publicationSuccessActionRef.current) return;

    publicationSuccessActionRef.current = true;
    const wasRecurring = publicationSuccess?.recurring ?? false;
    setPublicationSuccess(null);

    // Let React Native finish removing the success overlay before changing the
    // navigation stack or remounting maps on the destination screen.
    setTimeout(() => {
      if (action === 'another') {
        resetForm();
        publicationSuccessActionRef.current = false;
        return;
      }

      if (action === 'trips') {
        router.replace(wasRecurring ? '/recurring-trips' : '/trips');
        return;
      }

      router.replace('/(tabs)');
    }, Platform.OS === 'ios' ? 180 : 80);
  };

  return (
    <FormScreen style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Publier un trajet</Text>
          <Text style={styles.headerSubtitle}>
            Étape {getStepNumber()}/5
          </Text>
        </View>
      </View>

      {/* Step Indicator */}
      <View style={styles.stepIndicatorContainer}>
        <View style={styles.stepIndicatorRow}>
          {/* Route */}
          <View style={[
            styles.stepDot,
            isStepActive('route') && styles.stepDotActive,
            isStepCompleted('route') && styles.stepDotCompleted
          ]}>
            <Ionicons 
              name={isStepCompleted('route') ? "checkmark" : "map"} 
              size={14} 
              color={Colors.white} 
            />
          </View>
          <View style={[styles.stepLine, isStepCompleted('datetime') && styles.stepLineActive]} />
          
          {/* DateTime */}
          <View style={[
            styles.stepDot,
            isStepActive('datetime') && styles.stepDotActive,
            isStepCompleted('datetime') && styles.stepDotCompleted
          ]}>
            <Ionicons 
              name={isStepCompleted('datetime') ? "checkmark" : "time"} 
              size={14} 
              color={isStepActive('datetime') || isStepCompleted('datetime') ? Colors.white : Colors.gray[400]} 
            />
          </View>
          <View style={[styles.stepLine, isStepCompleted('vehicle') && styles.stepLineActive]} />
          
          {/* Vehicle */}
          <View style={[
            styles.stepDot,
            isStepActive('vehicle') && styles.stepDotActive,
            isStepCompleted('vehicle') && styles.stepDotCompleted
          ]}>
            <Ionicons 
              name={isStepCompleted('vehicle') ? "checkmark" : "car"} 
              size={14} 
              color={isStepActive('vehicle') || isStepCompleted('vehicle') ? Colors.white : Colors.gray[400]} 
            />
          </View>
          <View style={[styles.stepLine, isStepCompleted('pricing') && styles.stepLineActive]} />
          
          {/* Pricing */}
          <View style={[
            styles.stepDot,
            isStepActive('pricing') && styles.stepDotActive,
            isStepCompleted('pricing') && styles.stepDotCompleted
          ]}>
            <Ionicons 
              name={isStepCompleted('pricing') ? "checkmark" : "cash"} 
              size={14} 
              color={isStepActive('pricing') || isStepCompleted('pricing') ? Colors.white : Colors.gray[400]} 
            />
          </View>
          <View style={[styles.stepLine, isStepCompleted('confirm') && styles.stepLineActive]} />
          
          {/* Confirm */}
          <View style={[
            styles.stepDot,
            isStepActive('confirm') && styles.stepDotActive
          ]}>
            <Ionicons 
              name="checkmark-done" 
              size={14} 
              color={isStepActive('confirm') ? Colors.white : Colors.gray[400]} 
            />
          </View>
        </View>
        <View style={styles.stepLabelRow}>
          <Text style={[styles.stepLabel, isStepActive('route') && styles.stepLabelActive]}>Route</Text>
          <Text style={[styles.stepLabel, isStepActive('datetime') && styles.stepLabelActive]}>Date</Text>
          <Text style={[styles.stepLabel, isStepActive('vehicle') && styles.stepLabelActive]}>Véhicule</Text>
          <Text style={[styles.stepLabel, isStepActive('pricing') && styles.stepLabelActive]}>Détails</Text>
          <Text style={[styles.stepLabel, isStepActive('confirm') && styles.stepLabelActive]}>Confirmer</Text>
        </View>
      </View>

      {/* {!isIdentityVerified && (
        <View style={styles.identityWarningCard}>
          <View style={styles.identityWarningIcon}>
            <Ionicons name="shield" size={20} color={Colors.primary} />
          </View>
          <View style={styles.identityWarningContent}>
            <Text style={styles.identityWarningTitle}>Identité à vérifier</Text>
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
      )} */}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollViewContent,
            step === 'route' && styles.routeScrollViewContent,
            { paddingBottom: Spacing.lg },
          ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Étape 1: Itinéraire */}
        {step === 'route' && (
          <Animated.View entering={stepEntering} style={[styles.stepContainer, styles.routeStepContainer]}>
            <View style={styles.publishRouteSheet}>
              <View style={styles.rideSheetHeader}>
                <View style={styles.routeSheetHeaderCopy}>
                  <Text style={styles.sectionTitle}>Votre itinéraire</Text>
                  <Text style={styles.routeSheetSubtitle} numberOfLines={1}>
                    Choisissez le départ et la destination sur la carte
                  </Text>
                </View>
              </View>

            {/* Carte récap itinéraire */}
            <View style={styles.routeCard}>
              <View style={styles.routeVisual}>
                <View style={styles.dotGreen} />
                <View style={styles.routeLine} />
                <View style={styles.dotBlue} />
              </View>
              <View style={styles.routeInputs}>
                {/* Départ */}
                <View style={[styles.addressField, hasDepartureCoordinates && styles.addressFieldDepartureReady]}>
                  <Text style={[styles.addressFieldLabel, hasDepartureCoordinates && styles.addressFieldLabelReady]}>
                    Départ
                  </Text>
                  <View style={styles.addressInputRow}>
                    <TouchableOpacity
                      style={[
                        styles.addressInputButton,
                        hasDepartureCoordinates && styles.addressInputButtonDepartureActive,
                      ]}
                      onPress={() => {
                        setManualAddressTarget(null);
                        openLocationPicker('departure');
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={hasDepartureCoordinates ? "location" : "location-outline"}
                        size={18}
                        color={hasDepartureCoordinates ? Colors.success : Colors.gray[500]}
                      />
                      <Text
                        style={[
                          styles.addressInputText,
                          hasDepartureAddress && styles.addressInputTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {departureLocation?.title || departureManualAddress || 'Choisir sur la carte'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modeToggle,
                        manualAddressTarget === 'departure' && styles.modeToggleActive,
                      ]}
                      onPress={() => {
                        departureTouchedRef.current = true;
                        setManualAddressTarget(
                          manualAddressTarget === 'departure' ? null : 'departure',
                        );
                      }}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={manualAddressTarget === 'departure' ? Colors.primary : Colors.gray[500]}
                      />
                    </TouchableOpacity>
                  </View>
                  {manualAddressTarget === 'departure' && (
                    <>
                      <TextInput
                        style={styles.inlineManualInput}
                        value={departureManualAddress}
                        onChangeText={(value) => {
                          departureTouchedRef.current = true;
                          setDepartureManualAddress(value);
                          setDepartureLocation(null);
                          setDeparturePointStatus(null);
                        }}
                        placeholder="Ex: avenue Kasa-Vubu, Bandal"
                        placeholderTextColor={Colors.gray[400]}
                      />
                      <ManualAddressStatus status={departureManualGeocodeStatus} appearance={styles} foundLabel="Coordonnées trouvées, vérifiez sur la carte" />
                    </>
                  )}
                  {renderGpsStatus(
                    hasDepartureAddress,
                    hasDepartureGpsSuggestion,
                    hasDepartureCoordinates,
                    'Départ',
                  )}
                  {shouldShowDepartureReference ? (
                    <View style={styles.referenceField}>
                      <View style={styles.referenceHeader}>
                        <Text style={styles.referenceLabel}>Repère de départ</Text>
                        {!departureReference.trim() && (
                          <TouchableOpacity onPress={() => setShowDepartureReference(false)}>
                            <Ionicons name="close" size={16} color={Colors.gray[500]} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        style={styles.referenceInput}
                        value={departureReference}
                        onChangeText={setDepartureReference}
                        placeholder="Ex: station, portail bleu"
                        placeholderTextColor={Colors.gray[400]}
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.referenceAddButton}
                      onPress={() => setShowDepartureReference(true)}
                    >
                      <Ionicons name="add" size={15} color={Colors.gray[600]} />
                      <Text style={styles.referenceAddText}>Ajouter un repère</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Swap button */}
                <TouchableOpacity
                  style={styles.swapButton}
                  onPress={swapRoutePoints}
                >
                  <View style={styles.swapButtonInner}>
                    <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
                  </View>
                </TouchableOpacity>

                {/* Arrivée */}
                <View style={[styles.addressField, hasArrivalCoordinates && styles.addressFieldArrivalReady]}>
                  <Text style={[styles.addressFieldLabel, hasArrivalCoordinates && styles.addressFieldLabelReady]}>
                    Arrivée
                  </Text>
                  <View style={styles.addressInputRow}>
                    <TouchableOpacity
                      style={[
                        styles.addressInputButton,
                        hasArrivalCoordinates && styles.addressInputButtonArrivalActive,
                      ]}
                      onPress={() => {
                        setManualAddressTarget(null);
                        openLocationPicker('arrival');
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={hasArrivalCoordinates ? "navigate" : "navigate-outline"}
                        size={18}
                        color={hasArrivalCoordinates ? Colors.primary : Colors.gray[500]}
                      />
                      <Text
                        style={[
                          styles.addressInputText,
                          hasArrivalAddress && styles.addressInputTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {arrivalLocation?.title || arrivalManualAddress || 'Choisir sur la carte'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modeToggle,
                        manualAddressTarget === 'arrival' && styles.modeToggleActive,
                      ]}
                      onPress={() => {
                        setManualAddressTarget(
                          manualAddressTarget === 'arrival' ? null : 'arrival',
                        );
                      }}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={manualAddressTarget === 'arrival' ? Colors.primary : Colors.gray[500]}
                      />
                    </TouchableOpacity>
                  </View>
                  {manualAddressTarget === 'arrival' && (
                    <>
                      <TextInput
                        style={styles.inlineManualInput}
                        value={arrivalManualAddress}
                        onChangeText={(value) => {
                          setArrivalManualAddress(value);
                          setArrivalLocation(null);
                          setArrivalPointStatus(null);
                        }}
                        placeholder="Ex: rond-point Victoire"
                        placeholderTextColor={Colors.gray[400]}
                      />
                      <ManualAddressStatus status={arrivalManualGeocodeStatus} appearance={styles} foundLabel="Coordonnées trouvées, vérifiez sur la carte" />
                    </>
                  )}
                  {renderGpsStatus(
                    hasArrivalAddress,
                    hasArrivalGpsSuggestion,
                    hasArrivalCoordinates,
                    'Arrivée',
                  )}
                  {shouldShowArrivalReference ? (
                    <View style={styles.referenceField}>
                      <View style={styles.referenceHeader}>
                        <Text style={styles.referenceLabel}>Repère d’arrivée</Text>
                        {!arrivalReference.trim() && (
                          <TouchableOpacity onPress={() => setShowArrivalReference(false)}>
                            <Ionicons name="close" size={16} color={Colors.gray[500]} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        style={styles.referenceInput}
                        value={arrivalReference}
                        onChangeText={setArrivalReference}
                        placeholder="Ex: entrée principale"
                        placeholderTextColor={Colors.gray[400]}
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.referenceAddButton}
                      onPress={() => setShowArrivalReference(true)}
                    >
                      <Ionicons name="add" size={15} color={Colors.gray[600]} />
                      <Text style={styles.referenceAddText}>Ajouter un repère</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {!showQuickLandmarks && (
              <TouchableOpacity
                style={styles.quickLandmarksOpenButton}
                onPress={() => setShowQuickLandmarks(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate-outline" size={15} color={Colors.primary} />
                <Text style={styles.quickLandmarksOpenText}>Repères rapides</Text>
                <Ionicons name="chevron-down" size={15} color={Colors.gray[500]} />
              </TouchableOpacity>
            )}

            {/* Repères rapides Kinshasa */}
            {showQuickLandmarks && (
              <View style={styles.quickLandmarksSection}>
                <View style={styles.quickLandmarksHeader}>
                  <Ionicons name="navigate" size={14} color={Colors.primary} />
                  <Text style={styles.quickLandmarksTitle}>Repères rapides</Text>
                  <TouchableOpacity
                    style={styles.quickLandmarksToggle}
                    onPress={() => setShowQuickLandmarks(false)}
                  >
                    <Ionicons name="chevron-up" size={16} color={Colors.gray[500]} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickLandmarksScroll}
                >
                  {[
                    { name: 'Gare Centrale', commune: 'Gombe' },
                    { name: 'Marché Zando', commune: 'Kalamu' },
                    { name: 'Rond-point Victoire', commune: 'Lingwala' },
                    { name: 'UPN', commune: 'Lemba' },
                    { name: 'Kintambo Magasin', commune: 'Kintambo' },
                    { name: 'Bandal Tshibangu', commune: 'Bandalungwa' },
                    { name: 'Mont-Ngafula', commune: 'Mont-Ngafula' },
                    { name: 'Kasa-Vubu', commune: 'Kasa-Vubu' },
                    { name: 'Ndjili', commune: 'Ndjili' },
                    { name: 'Matete', commune: 'Matete' },
                  ].map((place) => (
                    <TouchableOpacity
                      key={place.name}
                      style={styles.quickLandmarkChip}
                      onPress={() => {
                        const target = !hasDepartureCoordinates ? 'departure' : 'arrival';
                        setManualAddressTarget(null);
                        openLocationPicker(target, `${place.name}, ${place.commune}, Kinshasa`);
                      }}
                    >
                      <Ionicons name="location" size={12} color={Colors.primary} />
                      <Text style={styles.quickLandmarkText} numberOfLines={1}>
                        {place.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* KYC Warning si non vérifié */}
            {!isPublishIdentityVerified && (
              <TouchableOpacity
                style={styles.inlineKycBanner}
                onPress={handleStartKyc}
                activeOpacity={0.85}
              >
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.inlineKycTitle}>Vérifiez votre identité pour publier</Text>
                  <Text style={styles.inlineKycSubtitle}>
                    Vérifiez votre identité en moins de 5 min
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
              </TouchableOpacity>
            )}

            </View>
          </Animated.View>
        )}
        {/* Étape 2: Date & Heure */}
        {step === 'datetime' && (
          <Animated.View entering={stepEntering} style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Quand partez-vous ?</Text>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>DATE ET HEURE DE DÉPART</Text>
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
            </View>
            <TouchableOpacity
              style={[
                styles.card,
                styles.recurringToggleCard,
                isRecurringTrip && styles.recurringToggleCardActive,
              ]}
              onPress={toggleRecurringTrip}
              activeOpacity={0.85}
            >
              <View style={styles.freeTripContent}>
                <Text style={styles.freeTripTitle}>Vous effectuez souvent ce trajet ?</Text>
                <Text style={styles.freeTripSubtitle}>
                  Choisissez vos jours habituels, Zwanga le publiera pour vous.
                </Text>
              </View>
              <View style={[styles.toggleSwitch, isRecurringTrip && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, isRecurringTrip && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            {isRecurringTrip && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>TRAJET HABITUEL</Text>
                <Text style={styles.recurringSectionTitle}>Quels jours ?</Text>
                <View style={styles.recurringDayRow}>
                  {recurringWeekdayOptions.map((option) => {
                    const isSelected = recurringWeekdays.includes(option.value);
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.recurringDayChip,
                          isSelected && styles.recurringDayChipActive,
                        ]}
                        onPress={() => toggleRecurringWeekday(option.value)}
                      >
                        <Text
                          style={[
                            styles.recurringDayChipText,
                            isSelected && styles.recurringDayChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.recurringSummaryCard}>
                  <Ionicons name="repeat" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recurringSummaryLabel}>Vos jours</Text>
                    <Text style={styles.recurringSummaryValue}>
                      {recurringDaysSummary || 'Choisissez au moins un jour'} à {formattedTimeLabel}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.recurringEndDateButton}
                  onPress={() => openDateOrTimePicker('date', 'recurringEndDate')}
                >
                  <View style={[styles.datetimeButtonIcon, { backgroundColor: Colors.gray[200] }]}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.gray[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.datetimeButtonLabel}>Date de fin optionnelle</Text>
                    <Text style={styles.datetimeButtonValue}>{formattedRecurringEndDate}</Text>
                  </View>
                  {recurringEndDate ? (
                    <TouchableOpacity
                      onPress={() => setRecurringEndDate(null)}
                      style={styles.clearRecurringEndDateButton}
                    >
                      <Ionicons name="close" size={16} color={Colors.gray[600]} />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
              <Text style={styles.infoText}>
                Choisissez une date et une heure précises pour que les passagers puissent mieux planifier.
              </Text>
            </View>

            <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => goToStep('route')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
                <Text style={styles.buttonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Étape 3: Véhicule */}
        {step === 'vehicle' && (
          <Animated.View entering={stepEntering} style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Votre véhicule</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sélectionnez un véhicule *</Text>

              {activeVehicles.length > 0 && selectedVehicleId && (
                <Text style={styles.vehicleDefaultHint}>
                  Un véhicule actif est déjà sélectionné par défaut.
                </Text>
              )}
              {vehicleCreationMessage ? (
                <View style={styles.vehicleSuccessBanner} accessibilityRole="alert">
                  <View style={styles.vehicleSuccessIcon}>
                    <Ionicons name="checkmark" size={18} color={Colors.white} />
                  </View>
                  <View style={styles.vehicleSuccessContent}>
                    <Text style={styles.vehicleSuccessTitle}>Véhicule prêt</Text>
                    <Text style={styles.vehicleSuccessText}>{vehicleCreationMessage}</Text>
                  </View>
                </View>
              ) : null}
              {isLoadingVehicles && activeVehicles.length === 0 ? (
                <View style={styles.vehicleLoadingState}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.vehicleLoadingText}>Chargement de vos véhicules...</Text>
                </View>
              ) : activeVehicles.length === 0 ? (
                <View style={styles.vehicleEmptyState}>
                  <Ionicons name="car-outline" size={48} color={Colors.gray[400]} />
                  <Text style={styles.vehicleEmptyTitle}>Aucun véhicule</Text>
                  <Text style={styles.vehicleEmptyText}>
                    Ajoutez votre premier véhicule pour publier des trajets
                  </Text>
                  <TouchableOpacity
                    style={styles.addVehicleButton}
                    onPress={openVehicleForm}
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
                    {activeVehicles.map((vehicle) => {
                      const isSelected = selectedVehicleId === vehicle.id;
                      const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim();

                      return (
                        <TouchableOpacity
                          key={vehicle.id}
                          style={[
                            styles.vehicleCard,
                            isSelected && styles.vehicleCardActive,
                          ]}
                          onPress={() => setSelectedVehicleId(vehicle.id)}
                          activeOpacity={0.86}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View style={[styles.vehicleCardAccent, isSelected && styles.vehicleCardAccentActive]} />
                          <View style={styles.vehicleCardHeader}>
                            <View style={[styles.vehicleCardIconWrap, isSelected && styles.vehicleCardIconWrapActive]}>
                              <Ionicons
                                name="car-sport"
                                size={22}
                                color={isSelected ? Colors.white : Colors.primary}
                              />
                            </View>
                            <View style={[styles.vehicleCardStatus, isSelected && styles.vehicleCardStatusActive]}>
                              {isSelected ? <Ionicons name="checkmark" size={12} color={Colors.white} /> : null}
                              <Text style={[styles.vehicleCardStatusText, isSelected && styles.vehicleCardStatusTextActive]}>
                                {isSelected ? 'Choisi' : 'Actif'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.vehicleCardBrand} numberOfLines={1}>
                            {vehicleName || 'Véhicule'}
                          </Text>
                          <View style={styles.vehiclePlatePill}>
                            <Ionicons name="card-outline" size={13} color={Colors.gray[500]} />
                            <Text style={styles.vehiclePlateText} numberOfLines={1}>
                              {vehicle.licensePlate}
                            </Text>
                          </View>
                          <Text style={styles.vehicleCardDetails} numberOfLines={1}>
                            {getRegisteredVehicleTypeLabel(vehicle.type)} • {vehicle.color || 'Couleur non précisée'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.addVehicleButtonSecondary}
                    onPress={openVehicleForm}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
                    <Text style={styles.addVehicleButtonSecondaryText}>Ajouter un autre véhicule</Text>
                  </TouchableOpacity>
                </>
              )}

            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
              <Text style={styles.infoText}>
                Les passagers pourront voir les détails de votre véhicule après avoir réservé.
              </Text>
            </View>

            <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => goToStep('datetime')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
                <Text style={styles.buttonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Étape 4: Places & Prix */}
        {step === 'pricing' && (
          <Animated.View entering={stepEntering} style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Places et prix</Text>

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
              style={[styles.card, styles.freeTripCard]}
              onPress={() => {
                setIsFreeTrip(!isFreeTrip);
                if (!isFreeTrip) {
                  setPrice('');
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.freeTripContent}>
                <Text style={styles.freeTripTitle}>
                  Trajet gratuit
                </Text>
                <Text style={styles.freeTripSubtitle}>
                  Proposer ce trajet gratuitement aux passagers
                </Text>
              </View>
              <View style={[styles.toggleSwitch, isFreeTrip && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, isFreeTrip && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.card,
                styles.passengerKycRequirementCard,
                requiresPassengerKyc && styles.passengerKycRequirementCardActive,
              ]}
              onPress={() => setRequiresPassengerKyc((current) => !current)}
              activeOpacity={0.84}
            >
              <View style={styles.passengerKycRequirementContent}>
                <View
                  style={[
                    styles.passengerKycRequirementIcon,
                    requiresPassengerKyc && styles.passengerKycRequirementIconActive,
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={20}
                    color={requiresPassengerKyc ? Colors.white : Colors.primary}
                  />
                </View>
                <View style={styles.passengerKycRequirementCopy}>
                  <Text style={styles.freeTripTitle}>Passagers vérifiés uniquement</Text>
                  <Text style={styles.freeTripSubtitle}>
                    L’identité des passagers devra être vérifiée avant de réserver ou d’embarquer.
                  </Text>
                </View>
              </View>
              <View style={[styles.toggleSwitch, requiresPassengerKyc && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, requiresPassengerKyc && styles.toggleThumbActive]} />
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

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
              <Text style={styles.infoText}>
                Les passagers verront ces informations avant de réserver leur place.
              </Text>
            </View>

            <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => goToStep('vehicle')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: Spacing.md }]} onPress={handleNextStep}>
                <Text style={styles.buttonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Étape 5: Confirmation */}
        {step === 'confirm' && (
          <Animated.View entering={stepEntering} style={styles.stepContainer}>
            <View style={[styles.iconContainer, styles.confirmIntro]}>
              <View style={[styles.iconCircle, styles.iconCircleGreen, styles.confirmIntroIcon]}>
                <Ionicons name="checkmark" size={24} color={Colors.success} />
              </View>
              <View style={styles.confirmIntroText}>
                <Text style={[styles.stepTitle, styles.confirmIntroTitle]}>Confirmation</Text>
                <Text style={[styles.stepSubtitle, styles.confirmIntroSubtitle]} numberOfLines={1}>
                Vérifiez les informations avant de publier
                </Text>
              </View>
            </View>

            <View style={[styles.publishMapPreview, styles.confirmMapPreview]}>
              {publicationSuccess === null ? (
                <MapView
                  style={styles.publishMapPreviewMap}
                  provider={PUBLISH_MAP_PROVIDER}
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
                      title="Départ"
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
                    <Polyline coordinates={routeCoordinates} strokeColor={Colors.primary} strokeWidth={5} />
                  ) : null}
                </MapView>
              ) : (
                <View style={styles.publishMapPreviewMap} />
              )}
              <View pointerEvents="none" style={styles.publishMapPreviewShade} />
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
                      ? "Calcul de l'itinéraire"
                      : routeCoordinates.length > 1
                        ? 'Itinéraire Google'
                        : 'Route à recalculer'}
                  </Text>
                </View>
              ) : null}
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
                      {departureReference.trim() ? (
                        <Text style={styles.confirmRouteAddress}>{departureReference.trim()}</Text>
                      ) : null}
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
                      {arrivalReference.trim() ? (
                        <Text style={styles.confirmRouteAddress}>{arrivalReference.trim()}</Text>
                      ) : null}
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
                  {isRecurringTrip ? (
                    <>
                      <View style={styles.confirmDetailRow}>
                        <View style={styles.confirmDetailLeft}>
                          <Ionicons name="repeat" size={18} color={Colors.gray[600]} />
                          <Text style={styles.confirmDetailLabel}>Répétition</Text>
                        </View>
                        <Text style={styles.confirmDetailValue}>
                          {recurringDaysSummary || 'À définir'}
                        </Text>
                      </View>
                      <View style={styles.confirmDetailRow}>
                        <View style={styles.confirmDetailLeft}>
                          <Ionicons name="calendar-outline" size={18} color={Colors.gray[600]} />
                          <Text style={styles.confirmDetailLabel}>Date de fin</Text>
                        </View>
                        <Text style={styles.confirmDetailValue}>{formattedRecurringEndDate}</Text>
                      </View>
                    </>
                  ) : null}
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
                  <View style={styles.confirmDetailRow}>
                    <View style={styles.confirmDetailLeft}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={Colors.gray[600]} />
                      <Text style={styles.confirmDetailLabel}>Identité des passagers</Text>
                    </View>
                    <Text
                      style={[
                        styles.confirmDetailValue,
                        requiresPassengerKyc && { color: Colors.primary },
                      ]}
                    >
                      {requiresPassengerKyc ? 'Requis' : 'Non requis'}
                    </Text>
                  </View>
                  {description ? (
                    <View style={[styles.confirmDetailRow, styles.confirmDetailRowMultiline]}>
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

            <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => goToStep('pricing')}
              >
                <Text style={styles.buttonSecondaryText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  { flex: 1, marginLeft: Spacing.md },
                  (isSubmittingTrip || !isPublishIdentityVerified) && styles.buttonDisabled,
                ]}
                onPress={handlePublish}
                disabled={isSubmittingTrip || !isPublishIdentityVerified}
              >
                {isSubmittingTrip ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>
                    {isPublishIdentityVerified
                      ? isRecurringTrip
                        ? 'Publier les trajets'
                        : 'Publier'
                      : 'Identité à vérifier'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>

        <View
          style={[
            styles.fixedBottomBar,
            step !== 'route' && styles.fixedBottomBarRow,
            { paddingBottom: Spacing.lg },
          ]}
        >
          {previousStep && (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary, styles.fixedFooterBackButton]}
              onPress={() => goToStep(previousStep)}
              disabled={isSubmittingTrip}
            >
              <Text style={styles.buttonSecondaryText}>Retour</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.button,
              styles.fixedButton,
              step !== 'route' && styles.fixedFooterPrimaryButton,
              footerPrimaryDisabled && styles.buttonDisabled,
            ]}
            onPress={handleFooterPrimary}
            disabled={footerPrimaryDisabled}
          >
            {step === 'confirm' && isSubmittingTrip ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>{footerPrimaryLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
        initialSearchQuery={locationPickerInitialQuery}
        onClose={closeLocationPicker}
        onSelect={handleLocationSelected}
      />

      {publicationSuccess !== null && (
        <View style={styles.publicationSuccessOverlay}>
          <View style={styles.publicationSuccessCard}>
            <View style={styles.publicationSuccessIcon}>
              <Ionicons name="checkmark" size={38} color={Colors.white} />
            </View>
            <Text style={styles.publicationSuccessTitle}>
              {publicationSuccess?.recurring ? 'Trajets programmés' : 'Trajet publié'}
            </Text>
            <Text style={styles.publicationSuccessMessage}>
              {publicationSuccess?.recurring
                ? 'Vos trajets ont bien été programmés pour les jours sélectionnés.'
                : 'Votre trajet a bien été publié. Il est maintenant visible par les passagers.'}
            </Text>
            <TouchableOpacity
              style={styles.publicationSuccessPrimaryButton}
              onPress={() => finishPublicationSuccess('home')}
            >
              <Text style={styles.publicationSuccessPrimaryText}>Retour à l’accueil</Text>
            </TouchableOpacity>
            <View style={styles.publicationSuccessSecondaryRow}>
              <TouchableOpacity
                style={styles.publicationSuccessSecondaryButton}
                onPress={() => finishPublicationSuccess('another')}
              >
                <Text style={styles.publicationSuccessSecondaryText}>Publier un autre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.publicationSuccessSecondaryButton}
                onPress={() => finishPublicationSuccess('trips')}
              >
                <Text style={styles.publicationSuccessSecondaryText}>Mes trajets</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal
        visible={Platform.OS === 'ios' && iosPickerMode !== null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={closeIosPicker}
      >
        <View style={styles.dateTimeModalOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={closeIosPicker}
            accessibilityLabel="Fermer le sélecteur"
          />
          <View style={styles.dateTimeModalCard}>
            <View style={styles.dateTimeModalHeader}>
              <View style={styles.dateTimeModalIcon}>
                <Ionicons
                  name={iosPickerMode === 'time' ? 'time' : 'calendar'}
                  size={22}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.dateTimeModalHeaderText}>
                <Text style={styles.dateTimeModalTitle}>
                  {iosPickerTarget === 'recurringEndDate'
                    ? 'Date de fin'
                    : iosPickerMode === 'time'
                      ? 'Heure de départ'
                      : 'Date de départ'}
                </Text>
                <Text style={styles.dateTimeModalSubtitle}>
                  {iosPickerMode === 'time'
                    ? 'Choisissez une heure précise'
                    : 'Choisissez une date dans le calendrier'}
                </Text>
              </View>
            </View>

            {iosPickerMode && (
              <IOSDateTimePicker
                key={`${iosPickerTarget}-${iosPickerMode}`}
                value={iosPickerValue}
                mode={iosPickerMode}
                display="spinner"
                locale="fr-FR"
                themeVariant="light"
                accentColor={Colors.primary}
                textColor={Colors.gray[900]}
                minuteInterval={5}
                minimumDate={
                  iosPickerMode === 'date'
                    ? iosPickerTarget === 'recurringEndDate'
                      ? departureDateTime ?? new Date()
                      : new Date()
                    : undefined
                }
                onChange={handleIosPickerChange}
                style={styles.dateTimeModalPicker}
              />
            )}

            <View style={styles.dateTimeModalActions}>
              <TouchableOpacity
                style={[styles.dateTimeModalButton, styles.dateTimeModalCancelButton]}
                onPress={closeIosPicker}
              >
                <Text style={styles.dateTimeModalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateTimeModalButton, styles.dateTimeModalConfirmButton]}
                onPress={confirmIosPicker}
              >
                <Text style={styles.dateTimeModalConfirmText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
              Pour publier des trajets, vous devez d&apos;abord activer votre compte conducteur et ajouter un véhicule dans votre profil.
            </Text>
            <View style={[styles.driverModalButtons, { paddingBottom: Math.max(insets.bottom, 0) }]}>
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
                  router.push({
                    pathname: '/profile',
                    params: { openDriverOnboarding: '1' },
                  } as any);
                }}
              >
                <Text style={styles.driverModalButtonPrimaryText}>Devenir conducteur</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

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
                Publiez vos trajets en toute confiance en confirmant votre identité. Celà prend
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

            <View style={[styles.kycModalActions, { paddingBottom: Math.max(insets.bottom, 0) }]}>
              <TouchableOpacity
                style={[styles.kycPrimaryButton, isKycBusy && styles.kycPrimaryButtonDisabled]}
                onPress={handleStartKyc}
                disabled={isKycBusy}
              >
                {isKycBusy ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Text style={styles.kycPrimaryButtonText}>Commencer avec Didit</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.kycSecondaryButton} onPress={closeKycModal}>
                <Text style={styles.kycSecondaryButtonText}>Plus tard</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Vehicle Creation Modal */}
      <VehicleFormModal
        visible={showVehicleForm}
        {...vehicleModalCopy}
        vehicleType={vehicleType}
        brand={vehicleBrand}
        model={vehicleModel}
        color={vehicleColor}
        licensePlate={vehicleLicensePlate}
        onVehicleTypeChange={(value) => {
          setVehicleType(value);
          setVehicleFormError(null);
        }}
        onBrandChange={(value) => {
          setVehicleBrand(value);
          setVehicleFormError(null);
        }}
        onModelChange={(value) => {
          setVehicleModel(value);
          setVehicleFormError(null);
        }}
        onColorChange={(value) => {
          setVehicleColor(value);
          setVehicleFormError(null);
        }}
        onLicensePlateChange={(value) => {
          setVehicleLicensePlate(value);
          setVehicleFormError(null);
        }}
        onClose={closeVehicleForm}
        onSubmit={handleCreateVehicle}
        submitting={isCreatingVehicle || isFinalizingVehicleCreation}
        errorMessage={vehicleFormError}
      />
    </FormScreen>
  );
}


