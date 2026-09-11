import { useScreenIsActive } from '@/hooks/useAppIsActive';
import type { AddressInputMode } from '@/components/AddressEntryModeSelector';
import LocationPickerModal, { MapLocationSelection } from '@/components/LocationPickerModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useGetTripByIdQuery, useStartTripMutation } from '@/store/api/tripApi';
import {
  useAcceptTripRequestMutation,
  useCancelTripRequestMutation,
  useGetTripRequestVehicleOptionsMutation,
  useGetTripRequestByIdQuery,
  useStartTripFromRequestMutation,
  useUpdateTripRequestMutation,
  type TripRequestVehiclePriceOption,
} from '@/store/api/tripRequestApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import type { TripRequestVehicleType, VehicleType } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import {
  createBecomeDriverAction,
  createSubscribeToZwangaProAction,
  getApiErrorMessage,
  isDailyPublicationLimitError,
  isDriverRequiredError,
  isPassengerKycRequiredError,
} from '@/utils/errorHelpers';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { getRouteCoordinates } from '@/utils/routeApi';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import type { LatLng, Region } from 'react-native-maps';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
} from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type RequestRouteMapData = {
  arrivalCoordinate: LatLng;
  departureCoordinate: LatLng;
  fallbackCoordinates: LatLng[];
  initialRegion: Region;
};

type RouteOverridePickerTarget =
  | 'directDeparture'
  | 'directArrival';

const LANDMARK_PLACEHOLDER = 'Ex: devant la station, portail bleu, entr\u00E9e principale';
const TRIP_REQUEST_VEHICLE_LABELS: Record<TripRequestVehicleType, string> = {
  car: 'Voiture',
  motorcycle_2_wheels: 'Moto à 2 roues',
  motorcycle_3_wheels: 'Moto à 3 roues',
};
const TRIP_REQUEST_VEHICLE_ICONS: Record<
  TripRequestVehicleType,
  keyof typeof Ionicons.glyphMap
> = {
  car: 'car-sport',
  motorcycle_2_wheels: 'bicycle',
  motorcycle_3_wheels: 'car-outline',
};

function normalizeTripRequestVehicleType(
  type?: TripRequestVehicleType | VehicleType | null,
): TripRequestVehicleType {
  switch (type) {
    case 'motorcycle_2_wheels':
    case 'moto':
      return 'motorcycle_2_wheels';
    case 'motorcycle_3_wheels':
    case 'tricycle':
      return 'motorcycle_3_wheels';
    case 'car':
    default:
      return 'car';
  }
}

const EDIT_SCHEDULE_SUGGESTION_LEAD_MS = 5 * 60 * 1000;
const EDIT_SCHEDULE_MIN_WINDOW_MS = 30 * 60 * 1000;

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function getScheduleWindowDuration(minDate: Date | null, maxDate: Date | null) {
  if (!isValidDate(minDate) || !isValidDate(maxDate)) {
    return EDIT_SCHEDULE_MIN_WINDOW_MS;
  }

  return Math.max(
    maxDate.getTime() - minDate.getTime(),
    EDIT_SCHEDULE_MIN_WINDOW_MS,
  );
}

function getEditScheduleError(minDate: Date | null, maxDate: Date | null) {
  if (!isValidDate(minDate) || !isValidDate(maxDate)) {
    return 'Choisissez une date et une heure de d\u00e9part valides.';
  }
  if (minDate.getTime() <= Date.now()) {
    return 'L\u2019heure de d\u00e9part doit \u00eatre dans le futur.';
  }
  if (maxDate.getTime() <= minDate.getTime()) {
    return 'L\u2019heure de fin du cr\u00e9neau doit suivre l\u2019heure de d\u00e9part.';
  }

  return null;
}

function formatCdfPrice(value: number) {
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FC`;
}

type CollapsibleRouteMapProps = {
  arrivalName: string;
  departureName: string;
  mapData: RequestRouteMapData | null;
  routeCoordinates: LatLng[];
};

function CollapsibleRouteMap({
  arrivalName,
  departureName,
  mapData,
  routeCoordinates,
}: CollapsibleRouteMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const mapRef = useRef<MapView>(null);

  const fitMapToRoute = useCallback(() => {
    if (!mapData) return;

    const visibleCoordinates =
      routeCoordinates.length > 1 ? routeCoordinates : mapData.fallbackCoordinates;

    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(visibleCoordinates, {
        edgePadding: { top: 34, right: 34, bottom: 34, left: 34 },
        animated: false,
      });
    });
  }, [mapData, routeCoordinates]);

  useEffect(() => {
    if (isExpanded) {
      fitMapToRoute();
    }
  }, [fitMapToRoute, isExpanded]);

  const toggleMap = useCallback(() => {
    setIsExpanded((currentValue) => !currentValue);
  }, []);

  if (!mapData) {
    return (
      <View
        accessibilityLabel="Carte indisponible pour ce trajet"
        style={[styles.driverMapIconButton, styles.driverMapIconButtonDisabled]}
      >
        <Ionicons name="map-outline" size={16} color={Colors.gray[400]} />
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? 'Masquer la carte du trajet' : 'Afficher la carte du trajet'}
        accessibilityState={{ expanded: isExpanded }}
        onPress={toggleMap}
        style={({ pressed }) => [
          styles.driverMapIconButton,
          isExpanded && styles.driverMapIconButtonActive,
          pressed && styles.driverMapIconButtonPressed,
        ]}
      >
        <Ionicons
          name={isExpanded ? 'map' : 'map-outline'}
          size={20}
          color={isExpanded ? Colors.white : Colors.primaryLight}
        />
      </Pressable>

      {isExpanded && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(160)}
          style={styles.driverInlineMapFrame}
        >
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.driverInlineMap}
            mapType="standard"
            initialRegion={mapData.initialRegion}
            onMapReady={fitMapToRoute}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            <Polyline
              coordinates={routeCoordinates.length > 0 ? routeCoordinates : mapData.fallbackCoordinates}
              strokeColor={Colors.primary}
              strokeWidth={5}
              lineDashPattern={routeCoordinates.length > 0 ? undefined : [4, 4]}
            />
            <Marker
              coordinate={mapData.departureCoordinate}
              title="Départ"
              description={departureName}
            >
              <View style={[styles.driverMapMarker, styles.driverMapMarkerDeparture]}>
                <View style={styles.driverMapMarkerCore} />
              </View>
            </Marker>
            <Marker
              coordinate={mapData.arrivalCoordinate}
              title="Destination"
              description={arrivalName}
            >
              <View style={[styles.driverMapMarker, styles.driverMapMarkerArrival]}>
                <Ionicons name="flag" size={13} color={Colors.white} />
              </View>
            </Marker>
          </MapView>
          <View pointerEvents="none" style={styles.driverMapCaption}>
            <Ionicons name="navigate" size={12} color={Colors.primaryDark} />
            <Text style={styles.driverMapCaptionText}>Itinéraire demandé</Text>
          </View>
        </Animated.View>
      )}
    </>
  );
}

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

export default function TripRequestDetailsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);
  const openDriverOnboarding = useCallback(() => {
    router.push({
      pathname: '/profile',
      params: { openDriverOnboarding: '1' },
    } as any);
  }, [router]);
  const params = useLocalSearchParams<{ id: string; editSchedule?: string }>();
  const { showDialog } = useDialog();
  
  // Extraire l'ID correctement (peut être un tableau avec Expo Router)
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const editScheduleParam = Array.isArray(params.editSchedule)
    ? params.editSchedule[0]
    : params.editSchedule;
  const shouldOpenScheduleEditor = editScheduleParam === '1';
  const isCreateRouteAlias = id === 'index';
  
  const { data: currentUser } = useGetCurrentUserQuery();
  const isDriverAccount = Boolean(
    currentUser?.isDriver ||
      currentUser?.role === 'driver' ||
      currentUser?.role === 'both',
  );
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();
  
  // État pour le polling interval dynamique
  const [pollingInterval, setPollingInterval] = useState(45_000);
  
  const { data: tripRequest, isLoading, error, refetch, isError } = useGetTripRequestByIdQuery(id || '', {
    skip: !id || isCreateRouteAlias,
    pollingInterval: isScreenActive ? pollingInterval : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const { data: assignedTrip } = useGetTripByIdQuery(tripRequest?.tripId || '', {
    skip: !tripRequest?.tripId,
    pollingInterval: isScreenActive ? (tripRequest?.status === 'driver_selected' ? 30_000 : 0) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (isCreateRouteAlias) {
      router.replace(getTripRequestCreateHref());
    }
  }, [isCreateRouteAlias, router]);

  // Mettre à jour le polling interval en fonction du statut de la demande
  React.useEffect(() => {
    if (tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received') {
      setPollingInterval(30000); // 30 secondes pour les demandes actives
    } else if (tripRequest?.status === 'driver_selected') {
      setPollingInterval(15000); // Suivre rapidement le démarrage pour masquer l'annulation
    } else {
      setPollingInterval(0); // Pas de polling si annulé ou expiré
    }
  }, [tripRequest?.status]);

  // Debug: Log pour voir ce qui se passe
  React.useEffect(() => {
    if (id && !isCreateRouteAlias) {
      console.log('[TripRequestDetails] Loading trip request with ID:', id);
    }
    if (error) {
      console.error('[TripRequestDetails] Error loading trip request:', error);
      console.error('[TripRequestDetails] Error details:', JSON.stringify(error, null, 2));
    }
    if (tripRequest) {
      console.log('[TripRequestDetails] Trip request loaded:', tripRequest.id);
    }
  }, [id, error, tripRequest, isCreateRouteAlias]);

  // Debug: Log pour voir ce qui se passe
  React.useEffect(() => {
    if (id && !isCreateRouteAlias) {
      console.log('[TripRequestDetails] Loading trip request with ID:', id);
    }
    if (error) {
      console.error('[TripRequestDetails] Error loading trip request:', error);
    }
    if (tripRequest) {
      console.log('[TripRequestDetails] Trip request loaded:', tripRequest.id);
    }
  }, [id, error, tripRequest, isCreateRouteAlias]);
  const { data: vehicles = [] } = useGetVehiclesQuery(undefined, {
    skip: !isDriverAccount,
  });
  
  // Filtrer pour n'afficher que les véhicules actifs
  const activeVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => vehicle.isActive !== false);
  }, [vehicles]);
  const requestedVehicleType = normalizeTripRequestVehicleType(
    tripRequest?.vehicleType,
  );
  const compatibleActiveVehicles = useMemo(
    () =>
      activeVehicles.filter(
        (vehicle) =>
          normalizeTripRequestVehicleType(vehicle.type) === requestedVehicleType,
      ),
    [activeVehicles, requestedVehicleType],
  );
  
  const [acceptTripRequest, { isLoading: isAcceptingTripRequest }] = useAcceptTripRequestMutation();
  const [cancelRequest, { isLoading: isCancelling }] = useCancelTripRequestMutation();
  const [updateTripRequest, { isLoading: isUpdating }] = useUpdateTripRequestMutation();
  const [
    getEditVehicleOptions,
    { isLoading: isEditVehicleOptionsLoading, isError: isEditVehicleOptionsError },
  ] = useGetTripRequestVehicleOptionsMutation();
  const [startTripFromRequest, { isLoading: isStartingTripFromRequest }] = useStartTripFromRequestMutation();
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.warn('Error refreshing trip request data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // États pour le formulaire de modification
  const [showEditForm, setShowEditForm] = useState(false);
  const [editDepartureLocation, setEditDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [editArrivalLocation, setEditArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editDepartureReference, setEditDepartureReference] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editArrivalReference, setEditArrivalReference] = useState('');
  const [editAddressInputMode, setEditAddressInputMode] = useState<AddressInputMode>('map');
  const [editDepartureDateMin, setEditDepartureDateMin] = useState<Date | null>(null);
  const [editDepartureDateMax, setEditDepartureDateMax] = useState<Date | null>(null);
  const [editNumberOfSeats, setEditNumberOfSeats] = useState('');
  const [editVehicleType, setEditVehicleType] = useState<TripRequestVehicleType>('car');
  const [editVehicleOptions, setEditVehicleOptions] = useState<TripRequestVehiclePriceOption[]>([]);
  const [editVehiclePriceMultiplier, setEditVehiclePriceMultiplier] = useState(1);
  const [editVehicleOptionsRetry, setEditVehicleOptionsRetry] = useState(0);
  const [editHasEditedBudget, setEditHasEditedBudget] = useState(false);
  const [editMaxPricePerSeat, setEditMaxPricePerSeat] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIosPickerModeMin, setEditIosPickerModeMin] = useState<'date' | 'time' | null>(null);
  const [editIosPickerModeMax, setEditIosPickerModeMax] = useState<'date' | 'time' | null>(null);
  const [editActivePicker, setEditActivePicker] = useState<'departure' | 'arrival' | null>(null);
  const [editLocationPickerType, setEditLocationPickerType] = useState<'departure' | 'arrival' | null>(null);
  const editPickerTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editPickerRestorePendingRef = useRef(false);
  const overdueScheduleEditorOpenedRef = useRef(false);
  const directPickerTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directPickerRestorePendingRef = useRef(false);

  useEffect(() => () => {
    if (editPickerTransitionTimerRef.current) {
      clearTimeout(editPickerTransitionTimerRef.current);
    }
    if (directPickerTransitionTimerRef.current) {
      clearTimeout(directPickerTransitionTimerRef.current);
    }
  }, []);

  const [directAcceptVehicleId, setDirectAcceptVehicleId] = useState<string>('');
  const [showDirectAcceptModal, setShowDirectAcceptModal] = useState(false);
  const [directAcceptDepartureLocation, setDirectAcceptDepartureLocation] = useState<MapLocationSelection | null>(null);
  const [directAcceptDepartureReference, setDirectAcceptDepartureReference] = useState('');
  const [directAcceptArrivalLocation, setDirectAcceptArrivalLocation] = useState<MapLocationSelection | null>(null);
  const [directAcceptArrivalReference, setDirectAcceptArrivalReference] = useState('');
  const [routeOverridePickerTarget, setRouteOverridePickerTarget] = useState<RouteOverridePickerTarget | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[] | null>(null);
  const [, setIsLoadingRoute] = useState(false);
  const [areDirectOptionsExpanded, setAreDirectOptionsExpanded] = useState(false);
  const [directAcceptRequiresPassengerKyc, setDirectAcceptRequiresPassengerKyc] = useState(false);

  useEffect(() => {
    setDirectAcceptRequiresPassengerKyc(false);
  }, [tripRequest?.id]);

  const directAcceptVehicle = useMemo(
    () =>
      compatibleActiveVehicles.find(
        (vehicle) => vehicle.id === directAcceptVehicleId,
      ) ?? null,
    [compatibleActiveVehicles, directAcceptVehicleId],
  );

  useEffect(() => {
    setDirectAcceptVehicleId((currentVehicleId) => {
      if (compatibleActiveVehicles.some((vehicle) => vehicle.id === currentVehicleId)) {
        return currentVehicleId;
      }

      return compatibleActiveVehicles.length === 1 ? compatibleActiveVehicles[0].id : '';
    });
  }, [compatibleActiveVehicles]);

  const directAcceptDepartureDate = useMemo(() => {
    if (!tripRequest) return null;

    const minDate = new Date(tripRequest.departureDateMin);
    const maxDate = new Date(tripRequest.departureDateMax);
    const now = new Date();
    const preferredDate = minDate > now ? minDate : now;

    return preferredDate <= maxDate ? preferredDate : maxDate;
  }, [tripRequest]);

  // Charger les coordonnées de la route réelle
  useEffect(() => {
    const loadRoute = async () => {
      if (!tripRequest?.departure?.lat || !tripRequest?.departure?.lng || 
          !tripRequest?.arrival?.lat || !tripRequest?.arrival?.lng) {
        return;
      }

      setIsLoadingRoute(true);
      try {
        const departureCoordinate = {
          latitude: tripRequest.departure.lat,
          longitude: tripRequest.departure.lng,
        };
        const arrivalCoordinate = {
          latitude: tripRequest.arrival.lat,
          longitude: tripRequest.arrival.lng,
        };

        const coordinates = await getRouteCoordinates(departureCoordinate, arrivalCoordinate);
        if (coordinates && coordinates.length > 0) {
          setRouteCoordinates(coordinates);
        } else {
          // Fallback sur ligne droite si l'API échoue
          setRouteCoordinates([
            departureCoordinate,
            arrivalCoordinate,
          ]);
        }
      } catch (error) {
        console.warn('Error loading route for trip request:', error);
        // Fallback sur ligne droite en cas d'erreur
        if (tripRequest?.departure?.lat && tripRequest?.departure?.lng && 
            tripRequest?.arrival?.lat && tripRequest?.arrival?.lng) {
          setRouteCoordinates([
            { latitude: tripRequest.departure.lat, longitude: tripRequest.departure.lng },
            { latitude: tripRequest.arrival.lat, longitude: tripRequest.arrival.lng },
          ]);
        }
      } finally {
        setIsLoadingRoute(false);
      }
    };

    loadRoute();
  }, [tripRequest?.departure?.lat, tripRequest?.departure?.lng, tripRequest?.arrival?.lat, tripRequest?.arrival?.lng]);

  const isOwner = useMemo(
    () => tripRequest && currentUser && tripRequest.passengerId === currentUser.id,
    [tripRequest, currentUser]
  );

  // Vérifier si la demande peut être modifiée
  const canEdit = useMemo(() => {
    if (!isOwner || !tripRequest) return false;
    // Ne peut pas modifier si une offre a été acceptée ou si un driver a été sélectionné
    if (tripRequest.status === 'driver_selected' || tripRequest.selectedDriverId) return false;
    // Ne peut modifier que si le statut est 'pending' ou 'offers_received'
    return tripRequest.status === 'pending' || tripRequest.status === 'offers_received';
  }, [isOwner, tripRequest]);

  const canCancel = useMemo(() => {
    if (!isOwner || !tripRequest) return false;

    const isActiveRequest =
      tripRequest.status === 'pending' ||
      tripRequest.status === 'offers_received' ||
      tripRequest.status === 'driver_selected';
    if (!isActiveRequest) return false;

    return (
      !tripRequest.tripId ||
      (assignedTrip?.status === 'upcoming' && !assignedTrip.startedAt)
    );
  }, [assignedTrip?.startedAt, assignedTrip?.status, isOwner, tripRequest]);

  const hasExistingOffer = useMemo(() => {
    if (!tripRequest?.offers || !currentUser) return false;
    return tripRequest.offers.some(
      (offer) => offer.driverId === currentUser.id && offer.status === 'pending'
    );
  }, [tripRequest, currentUser]);

  // Vérifier s'il y a une offre acceptée
  const hasAcceptedOffer = useMemo(() => {
    if (!tripRequest?.offers) return false;
    return tripRequest.offers.some((offer) => offer.status === 'accepted');
  }, [tripRequest?.offers]);

  const canAcceptRequest = useMemo(() => {
    if (!isDriverAccount || !isIdentityVerified || isOwner || hasExistingOffer) {
      return false;
    }

    // Permettre l'acceptation directe tant qu'aucun conducteur n'a été retenu.
    const isRequestOpen = tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received';
    if (!isRequestOpen) {
      return false;
    }

    // Vérifier aussi s'il y a déjà une offre acceptée (même si le statut n'est pas encore 'driver_selected')
    // Cela correspond à la logique backend qui filtre les demandes avec des offres acceptées
    if (hasAcceptedOffer) {
      return false;
    }

    return true;
  }, [
    hasAcceptedOffer,
    hasExistingOffer,
    isDriverAccount,
    isIdentityVerified,
    isOwner,
    tripRequest?.status,
  ]);

  const myOffer = useMemo(() => {
    if (!tripRequest?.offers || !currentUser) return null;
    return tripRequest.offers.find((offer) => offer.driverId === currentUser.id);
  }, [tripRequest, currentUser]);

  const isCurrentDriverAssigned = useMemo(() => {
    if (!currentUser?.id) {
      return myOffer?.status === 'accepted';
    }

    if (tripRequest?.selectedDriverId) {
      return tripRequest.selectedDriverId === currentUser.id;
    }

    return myOffer?.status === 'accepted';
  }, [currentUser?.id, myOffer?.status, tripRequest?.selectedDriverId]);

  const canOpenAssignedTrip = useMemo(
    () => isCurrentDriverAssigned && !!tripRequest?.tripId,
    [isCurrentDriverAssigned, tripRequest?.tripId]
  );

  const canStartAssignedTrip = useMemo(
    () => isCurrentDriverAssigned && !tripRequest?.tripId,
    [isCurrentDriverAssigned, tripRequest?.tripId]
  );

  const canAcceptDirectly = useMemo(
    () => canAcceptRequest && compatibleActiveVehicles.length > 0,
    [canAcceptRequest, compatibleActiveVehicles.length],
  );

  const editDepartureAddress =
    editAddressInputMode === 'manual'
      ? editDepartureManualAddress.trim()
      : getLocationText(editDepartureLocation, editDepartureManualAddress);
  const editArrivalAddress =
    editAddressInputMode === 'manual'
      ? editArrivalManualAddress.trim()
      : getLocationText(editArrivalLocation, editArrivalManualAddress);
  const parsedEditNumberOfSeats = Number.parseInt(editNumberOfSeats, 10);
  const selectedEditVehicleOption = editVehicleOptions.find(
    (option) => option.vehicleType === editVehicleType,
  );
  const isEditVehicleSelectionValid = Boolean(
    selectedEditVehicleOption?.availableForRequestedSeats,
  );
  const editScheduleError = getEditScheduleError(
    editDepartureDateMin,
    editDepartureDateMax,
  );
  const isEditFormValid = Boolean(
    editDepartureAddress &&
    editArrivalAddress &&
    !editScheduleError &&
    Number.isFinite(parsedEditNumberOfSeats) &&
    parsedEditNumberOfSeats >= 1 &&
    parsedEditNumberOfSeats <= 2 &&
    isEditVehicleSelectionValid,
  );

  useEffect(() => {
    if (!showEditForm || !tripRequest?.id) return;

    if (
      !editDepartureAddress ||
      !editArrivalAddress ||
      !Number.isFinite(parsedEditNumberOfSeats) ||
      parsedEditNumberOfSeats < 1 ||
      parsedEditNumberOfSeats > 2
    ) {
      setEditVehicleOptions([]);
      setEditVehiclePriceMultiplier(1);
      return;
    }

    let isCurrent = true;
    setEditVehicleOptions([]);

    const timer = setTimeout(() => {
      getEditVehicleOptions({
        departureLocation: editDepartureAddress,
        departureReference: editDepartureReference.trim() || undefined,
        departureCoordinates:
          editAddressInputMode === 'map' ? getLocationCoordinates(editDepartureLocation) : undefined,
        arrivalLocation: editArrivalAddress,
        arrivalReference: editArrivalReference.trim() || undefined,
        arrivalCoordinates:
          editAddressInputMode === 'map' ? getLocationCoordinates(editArrivalLocation) : undefined,
        numberOfSeats: parsedEditNumberOfSeats,
      })
        .unwrap()
        .then((response) => {
          if (!isCurrent) return;

          setEditVehicleOptions(response.options);
          setEditVehiclePriceMultiplier(response.weatherImpact.priceMultiplier);
        })
        .catch((requestError) => {
          if (!isCurrent) return;
          console.warn('Impossible de récupérer les tarifs pour la modification', requestError);
          setEditVehicleOptions([]);
          setEditVehiclePriceMultiplier(1);
        });
    }, 350);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [
    editAddressInputMode,
    editArrivalAddress,
    editArrivalLocation,
    editArrivalReference,
    editDepartureAddress,
    editDepartureLocation,
    editDepartureReference,
    editVehicleOptionsRetry,
    getEditVehicleOptions,
    parsedEditNumberOfSeats,
    showEditForm,
    tripRequest?.id,
  ]);

  useEffect(() => {
    if (
      editHasEditedBudget ||
      editVehicleType === tripRequest?.vehicleType
    ) {
      return;
    }

    const selectedOption = editVehicleOptions.find(
      (option) => option.vehicleType === editVehicleType,
    );
    if (!selectedOption) return;

    setEditMaxPricePerSeat(
      selectedOption.recommendedPricePerSeat === null
        ? ''
        : String(selectedOption.recommendedPricePerSeat),
    );
  }, [
    editHasEditedBudget,
    editVehicleOptions,
    editVehicleType,
    tripRequest?.vehicleType,
  ]);

  const closeDirectAcceptModal = useCallback(() => {
    setShowDirectAcceptModal(false);
  }, []);

  const openDirectRouteOverridePicker = (target: RouteOverridePickerTarget) => {
    Keyboard.dismiss();
    directPickerRestorePendingRef.current = false;
    if (directPickerTransitionTimerRef.current) {
      clearTimeout(directPickerTransitionTimerRef.current);
    }
    setShowDirectAcceptModal(false);
    directPickerTransitionTimerRef.current = setTimeout(() => {
      setRouteOverridePickerTarget(target);
      directPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const restoreDirectAcceptModalAfterLocationPicker = () => {
    if (directPickerRestorePendingRef.current) return;
    directPickerRestorePendingRef.current = true;
    if (directPickerTransitionTimerRef.current) {
      clearTimeout(directPickerTransitionTimerRef.current);
    }
    setRouteOverridePickerTarget(null);
    directPickerTransitionTimerRef.current = setTimeout(() => {
      setShowDirectAcceptModal(true);
      directPickerRestorePendingRef.current = false;
      directPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const handleRouteOverrideSelected = (location: MapLocationSelection) => {
    switch (routeOverridePickerTarget) {
      case 'directDeparture':
        setDirectAcceptDepartureLocation(location);
        break;
      case 'directArrival':
        setDirectAcceptArrivalLocation(location);
        break;
      default:
        break;
    }
    restoreDirectAcceptModalAfterLocationPicker();
  };

  // Fonctions pour appliquer uniquement la date ou l'heure
  const applyDatePart = (date: Date, currentDate: Date) => {
    const next = new Date(currentDate);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
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

  const updateEditDepartureDateMin = (newDate: Date) => {
    const previousWindowDuration = getScheduleWindowDuration(
      editDepartureDateMin,
      editDepartureDateMax,
    );
    setEditDepartureDateMin(newDate);
    setEditDepartureDateMax(
      new Date(newDate.getTime() + previousWindowDuration),
    );
  };

  const updateEditDepartureDateMax = (newDate: Date) => {
    if (
      isValidDate(editDepartureDateMin) &&
      newDate.getTime() <= editDepartureDateMin.getTime()
    ) {
      setEditDepartureDateMax(
        new Date(
          editDepartureDateMin.getTime() + EDIT_SCHEDULE_MIN_WINDOW_MS,
        ),
      );
      return;
    }

    setEditDepartureDateMax(newDate);
  };

  // Fonctions pour les date pickers du formulaire de modification
  const openEditDateOrTimePickerMin = (mode: 'date' | 'time') => {
    if (!editDepartureDateMin) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: editDepartureDateMin,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, editDepartureDateMin) 
            : applyTimePart(selectedDate, editDepartureDateMin);
          updateEditDepartureDateMin(newDate);
        },
      });
    } else {
      setEditIosPickerModeMin(mode);
    }
  };

  const openEditDateOrTimePickerMax = (mode: 'date' | 'time') => {
    if (!editDepartureDateMax) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: editDepartureDateMax,
        is24Hour: true,
        minimumDate: mode === 'date' && editDepartureDateMin ? editDepartureDateMin : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          const newDate = mode === 'date' 
            ? applyDatePart(selectedDate, editDepartureDateMax) 
            : applyTimePart(selectedDate, editDepartureDateMax);
          updateEditDepartureDateMax(newDate);
        },
      });
    } else {
      setEditIosPickerModeMax(mode);
    }
  };

  const handleEditIosPickerChangeMin = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !editIosPickerModeMin || !editDepartureDateMin) return;
    const newDate = editIosPickerModeMin === 'date' 
      ? applyDatePart(selectedDate, editDepartureDateMin) 
      : applyTimePart(selectedDate, editDepartureDateMin);
    updateEditDepartureDateMin(newDate);
    setEditIosPickerModeMin(null);
  };

  const handleEditIosPickerChangeMax = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || !editIosPickerModeMax || !editDepartureDateMax) return;
    const newDate = editIosPickerModeMax === 'date' 
      ? applyDatePart(selectedDate, editDepartureDateMax) 
      : applyTimePart(selectedDate, editDepartureDateMax);
    updateEditDepartureDateMax(newDate);
    setEditIosPickerModeMax(null);
  };

  const handleStartTripFromRequest = async () => {
    if (!tripRequest || !id) return;

    showDialog({
      title: 'Démarrer le trajet',
      message: 'Vous allez créer un trajet et une réservation automatique pour le passager. Le trajet démarrera immédiatement. Continuer ?',
      variant: 'info',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Démarrer',
          variant: 'primary',
          onPress: async () => {
            try {
              const result = await startTripFromRequest(id).unwrap();
              showDialog({
                title: 'Trajet démarré',
                message: 'Le trajet a été créé et démarré avec succès. Le passager a été automatiquement réservé.',
                variant: 'success',
                actions: [
                  {
                    label: 'Voir le trajet',
                    variant: 'primary',
                    onPress: () => {
                      refetch();
                      router.push(`/trip/manage/${result.trip.id}`);
                    },
                  },
                  { label: 'OK', variant: 'ghost', onPress: () => refetch() },
                ],
              });
            } catch (error: any) {
              const isQuotaError = isDailyPublicationLimitError(error);

              showDialog({
                title: isQuotaError ? 'Abonnement conducteur requis' : 'Erreur',
                actions: isQuotaError
                  ? [
                      { label: 'Plus tard', variant: 'ghost' },
                      createSubscribeToZwangaProAction(router),
                    ]
                  : undefined,
                message: getApiErrorMessage(error, 'Impossible de démarrer le trajet.'),
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  const handleDirectAcceptTripRequest = async (startImmediately: boolean) => {
    if (!tripRequest || !id || !directAcceptDepartureDate) return;
    if (compatibleActiveVehicles.length === 0) {
      setShowDirectAcceptModal(false);
      showDialog({
        title: 'Véhicule non disponible',
        message: `Cette demande nécessite le type ${TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}. Aucun de vos véhicules actifs ne correspond pour le moment.`,
        variant: 'warning',
        actions: [{ label: 'Fermer', variant: 'ghost' }],
      });
      return;
    }
    if (!directAcceptVehicle) {
      showDialog({
        title: 'Choisissez un véhicule',
        message: 'Sélectionnez le véhicule que vous utiliserez pour transporter le passager.',
        variant: 'warning',
      });
      return;
    }

    const payload: {
      vehicleId: string;
      departureDate?: string;
      departureReference?: string;
      departureCoordinates?: [number, number];
      arrivalReference?: string;
      arrivalCoordinates?: [number, number];
      requiresPassengerKyc?: boolean;
    } = {
      vehicleId: directAcceptVehicle.id,
      departureDate: directAcceptDepartureDate.toISOString(),
      requiresPassengerKyc: directAcceptRequiresPassengerKyc,
    };

    const directDepartureCoordinates = getLocationCoordinates(directAcceptDepartureLocation);
    const directArrivalCoordinates = getLocationCoordinates(directAcceptArrivalLocation);
    if (directAcceptDepartureReference.trim()) {
      payload.departureReference = directAcceptDepartureReference.trim();
    }
    if (directDepartureCoordinates) {
      payload.departureCoordinates = directDepartureCoordinates;
    }
    if (directAcceptArrivalReference.trim()) {
      payload.arrivalReference = directAcceptArrivalReference.trim();
    }
    if (directArrivalCoordinates) {
      payload.arrivalCoordinates = directArrivalCoordinates;
    }

    try {
      const result = await acceptTripRequest({
        tripRequestId: id,
        payload,
      }).unwrap();
      setShowDirectAcceptModal(false);

      if (startImmediately) {
        try {
          await startTrip(result.trip.id).unwrap();

          showDialog({
            title: 'Trajet d\u00E9marr\u00E9',
            message: 'La demande a \u00E9t\u00E9 accept\u00E9e et le trajet a d\u00E9marr\u00E9. Le passager a d\u00E9j\u00E0 \u00E9t\u00E9 r\u00E9serv\u00E9 automatiquement.',
            variant: 'success',
            actions: [
              {
                label: 'Ouvrir le trajet',
                variant: 'primary',
                onPress: () => {
                  refetch();
                  router.push(`/trip/manage/${result.trip.id}`);
                },
              },
              {
                label: 'Plus tard',
                variant: 'ghost',
                onPress: () => refetch(),
              },
            ],
          });
        } catch (startError: any) {
          const startErrorMessage = getApiErrorMessage(
            startError,
            'La demande est accept\u00E9e, mais le trajet n\u2019a pas pu d\u00E9marrer tout de suite.',
          );

          showDialog({
            title: 'Demande accept\u00E9e',
            message: `${startErrorMessage} Vous pouvez ouvrir le trajet pour le lancer depuis son \u00E9cran de gestion.`,
            variant: 'warning',
            actions: [
              {
                label: 'Ouvrir le trajet',
                variant: 'primary',
                onPress: () => {
                  refetch();
                  router.push(`/trip/manage/${result.trip.id}`);
                },
              },
              {
                label: 'Rester ici',
                variant: 'ghost',
                onPress: () => refetch(),
              },
            ],
          });
        }

        return;
      }

      showDialog({
        title: 'Demande accept\u00E9e',
        message: 'Le trajet a \u00E9t\u00E9 cr\u00E9\u00E9 imm\u00E9diatement et le passager a d\u00E9j\u00E0 \u00E9t\u00E9 r\u00E9serv\u00E9. Vous pouvez maintenant ouvrir le trajet quand vous \u00EAtes pr\u00EAt.',
        variant: 'success',
        actions: [
          {
            label: 'Ouvrir le trajet',
            variant: 'primary',
            onPress: () => {
              refetch();
              router.push(`/trip/manage/${result.trip.id}`);
            },
          },
          {
            label: 'Plus tard',
            variant: 'ghost',
            onPress: () => refetch(),
          },
        ],
      });
    } catch (error: any) {
      setShowDirectAcceptModal(false);
      const resolvedMessage = getApiErrorMessage(
        error,
        'Impossible d\u2019accepter cette demande pour le moment.',
      );
      const isQuotaError = isDailyPublicationLimitError(error);
      const isDriverError = isDriverRequiredError(error);
      const isPassengerKycError = isPassengerKycRequiredError(error);

      showDialog({
        title: isQuotaError
          ? 'Abonnement conducteur requis'
          : isPassengerKycError
            ? 'KYC passager requis'
            : 'Erreur',
        message: isPassengerKycError
          ? "Ce passager n'a pas encore un KYC approuvé. Acceptez sans exigence KYC, ou demandez-lui de finaliser sa vérification avant de continuer."
          : resolvedMessage,
        variant: isQuotaError || isPassengerKycError ? 'warning' : 'danger',
        actions: isQuotaError
          ? [
              { label: 'Plus tard', variant: 'ghost' },
              createSubscribeToZwangaProAction(router),
            ]
          : isPassengerKycError
          ? [{ label: 'Fermer', variant: 'ghost' }]
          : isDriverError
          ? [
              { label: 'Fermer', variant: 'ghost' },
              createBecomeDriverAction(router),
            ]
          : undefined,
      });
    }
  };

  const handleOpenDirectAcceptModal = () => {
    if (!tripRequest || !directAcceptDepartureDate) return;
    if (compatibleActiveVehicles.length === 0) {
      showDialog({
        title: 'Véhicule non disponible',
        message: `Cette demande nécessite le type ${TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}. Aucun de vos véhicules actifs ne correspond pour le moment.`,
        variant: 'warning',
        actions: [{ label: 'Fermer', variant: 'ghost' }],
      });
      return;
    }
    setAreDirectOptionsExpanded(false);
    setShowDirectAcceptModal(true);
  };

  const handleViewTrip = (tripId: string) => {
    if (!tripId) return;

    const targetRoute = isCurrentDriverAssigned ? `/trip/manage/${tripId}` as const : `/trip/${tripId}` as const;
    router.push(targetRoute);
  };

  const handleSelectEditVehicle = (option: TripRequestVehiclePriceOption) => {
    if (!option.availableForRequestedSeats) return;
    setEditVehicleType(option.vehicleType);
    setEditMaxPricePerSeat(
      option.recommendedPricePerSeat === null
        ? ''
        : String(option.recommendedPricePerSeat),
    );
    setEditHasEditedBudget(false);
  };

  // Initialiser le formulaire de modification avec les valeurs actuelles
  const initializeEditForm = (suggestUpdatedSchedule = false) => {
    if (!tripRequest) return;
    const hasMapCoordinates = tripRequest.departure.hasCoordinates && tripRequest.arrival.hasCoordinates;
    setEditAddressInputMode(hasMapCoordinates ? 'map' : 'manual');
    
    setEditDepartureLocation(
      tripRequest.departure.hasCoordinates
        ? {
            title: tripRequest.departure.name,
            address: tripRequest.departure.address || '',
            latitude: tripRequest.departure.lat,
            longitude: tripRequest.departure.lng,
          }
        : null,
    );
    setEditDepartureManualAddress(tripRequest.departure.name || tripRequest.departure.address || '');
    setEditDepartureReference(tripRequest.departure.reference || '');
    
    setEditArrivalLocation(
      tripRequest.arrival.hasCoordinates
        ? {
            title: tripRequest.arrival.name,
            address: tripRequest.arrival.address || '',
            latitude: tripRequest.arrival.lat,
            longitude: tripRequest.arrival.lng,
          }
        : null,
    );
    setEditArrivalManualAddress(tripRequest.arrival.name || tripRequest.arrival.address || '');
    setEditArrivalReference(tripRequest.arrival.reference || '');
    
    const currentDepartureDateMin = new Date(tripRequest.departureDateMin);
    const currentDepartureDateMax = new Date(tripRequest.departureDateMax);
    const currentScheduleIsInvalid =
      !isValidDate(currentDepartureDateMin) ||
      !isValidDate(currentDepartureDateMax) ||
      currentDepartureDateMin.getTime() <= Date.now() ||
      currentDepartureDateMax.getTime() <= currentDepartureDateMin.getTime();
    if (
      suggestUpdatedSchedule ||
      currentScheduleIsInvalid
    ) {
      const suggestedMin = new Date(
        Date.now() + EDIT_SCHEDULE_SUGGESTION_LEAD_MS,
      );
      suggestedMin.setSeconds(0, 0);
      const previousWindowDuration = getScheduleWindowDuration(
        currentDepartureDateMin,
        currentDepartureDateMax,
      );
      setEditDepartureDateMin(suggestedMin);
      setEditDepartureDateMax(
        new Date(suggestedMin.getTime() + previousWindowDuration),
      );
    } else {
      setEditDepartureDateMin(currentDepartureDateMin);
      setEditDepartureDateMax(currentDepartureDateMax);
    }
    setEditNumberOfSeats(tripRequest.numberOfSeats.toString());
    setEditVehicleType(requestedVehicleType);
    setEditVehicleOptions([]);
    setEditVehiclePriceMultiplier(1);
    setEditHasEditedBudget(false);
    setEditMaxPricePerSeat(tripRequest.maxPricePerSeat?.toString() || '');
    setEditDescription(tripRequest.description || '');
  };

  const handleOpenEditForm = () => {
    initializeEditForm();
    setShowEditForm(true);
  };

  useEffect(() => {
    if (
      !shouldOpenScheduleEditor ||
      overdueScheduleEditorOpenedRef.current ||
      !tripRequest ||
      currentUser?.id !== tripRequest.passengerId ||
      !['pending', 'offers_received'].includes(tripRequest.status)
    ) {
      return;
    }

    overdueScheduleEditorOpenedRef.current = true;
    initializeEditForm(true);
    setShowEditForm(true);
    // The initializer intentionally runs once for this navigation intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentUser?.id,
    shouldOpenScheduleEditor,
    tripRequest?.id,
    tripRequest?.passengerId,
    tripRequest?.status,
  ]);

  const openEditLocationPicker = (target: 'departure' | 'arrival') => {
    Keyboard.dismiss();
    editPickerRestorePendingRef.current = false;
    setShowEditForm(false);
    editPickerTransitionTimerRef.current = setTimeout(() => {
      setEditLocationPickerType(target);
      setEditActivePicker(target);
      editPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const restoreEditFormAfterLocationPicker = () => {
    if (editPickerRestorePendingRef.current) return;
    editPickerRestorePendingRef.current = true;
    setEditActivePicker(null);
    setEditLocationPickerType(null);
    editPickerTransitionTimerRef.current = setTimeout(() => {
      setShowEditForm(true);
      editPickerRestorePendingRef.current = false;
      editPickerTransitionTimerRef.current = null;
    }, Platform.OS === 'ios' ? 350 : 80);
  };

  const handleUpdateRequest = async () => {
    if (!id || !editDepartureAddress || !editArrivalAddress) {
      showDialog({
        title: 'Adresse requise',
        message: 'Indiquez une adresse de départ et une adresse d’arrivée, ou choisissez-les sur la carte.',
        variant: 'warning',
      });
      return;
    }
    const updatedDepartureDateMin = editDepartureDateMin;
    const updatedDepartureDateMax = editDepartureDateMax;
    if (
      !isValidDate(updatedDepartureDateMin) ||
      !isValidDate(updatedDepartureDateMax)
    ) {
      showDialog({
        title: 'Date invalide',
        message: 'Choisissez une date et une heure de d\u00e9part valides.',
        variant: 'warning',
      });
      return;
    }
    if (updatedDepartureDateMin.getTime() <= Date.now()) {
      showDialog({
        title: 'Heure pass\u00e9e',
        message: 'Choisissez une heure de d\u00e9part dans le futur.',
        variant: 'warning',
      });
      return;
    }
    if (
      updatedDepartureDateMax.getTime() <= updatedDepartureDateMin.getTime()
    ) {
      showDialog({
        title: 'Cr\u00e9neau invalide',
        message: 'L\u2019heure de fin doit suivre l\u2019heure de d\u00e9part.',
        variant: 'warning',
      });
      return;
    }
    if (
      !Number.isFinite(parsedEditNumberOfSeats) ||
      parsedEditNumberOfSeats < 1 ||
      parsedEditNumberOfSeats > 2
    ) {
      showDialog({
        title: 'Nombre de places invalide',
        message: 'Choisissez entre 1 et 2 places pour cette demande.',
        variant: 'warning',
      });
      return;
    }
    if (!selectedEditVehicleOption?.availableForRequestedSeats) {
      showDialog({
        title: 'Véhicule requis',
        message: 'Choisissez un type de véhicule disponible avant d\'enregistrer.',
        variant: 'warning',
      });
      return;
    }

    const parsedEditBudget = editMaxPricePerSeat.trim()
      ? Number.parseFloat(editMaxPricePerSeat)
      : undefined;
    if (
      parsedEditBudget !== undefined &&
      (!Number.isFinite(parsedEditBudget) || parsedEditBudget <= 0)
    ) {
      showDialog({
        title: 'Budget invalide',
        message: 'Le prix maximum par place doit être un montant positif.',
        variant: 'warning',
      });
      return;
    }

    const vehicleTypeChanged = editVehicleType !== tripRequest?.vehicleType;

    try {
      await updateTripRequest({
        id,
        payload: {
          departureLocation: editDepartureAddress,
          departureReference: editDepartureReference.trim() || undefined,
          departureCoordinates:
            editAddressInputMode === 'map' ? getLocationCoordinates(editDepartureLocation) : undefined,
          arrivalLocation: editArrivalAddress,
          arrivalReference: editArrivalReference.trim() || undefined,
          arrivalCoordinates:
            editAddressInputMode === 'map' ? getLocationCoordinates(editArrivalLocation) : undefined,
          departureDateMin: updatedDepartureDateMin.toISOString(),
          departureDateMax: updatedDepartureDateMax.toISOString(),
          numberOfSeats: parsedEditNumberOfSeats,
          vehicleType: editVehicleType,
          ...(
            parsedEditBudget !== undefined &&
            (editHasEditedBudget || !vehicleTypeChanged)
              ? { maxPricePerSeat: parsedEditBudget }
              : {}
          ),
          description: editDescription.trim() || undefined,
        },
      }).unwrap();

      setShowEditForm(false);
      refetch();

      setTimeout(() => {
        showDialog({
          title: 'Demande modifiée',
          message: `Votre demande utilise maintenant : ${TRIP_REQUEST_VEHICLE_LABELS[editVehicleType]}.`,
          variant: 'success',
        });
      }, Platform.OS === 'ios' ? 350 : 0);
    } catch (error: any) {
      showDialog({
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de modifier la demande.'),
        variant: 'danger',
      });
    }
  };

  const handleCancelRequest = async () => {
    if (!id) return;

    showDialog({
      title: 'Annuler la demande',
      message:
        tripRequest?.status === 'driver_selected'
          ? 'Un conducteur a déjà accepté cette demande. Voulez-vous vraiment annuler la demande, la réservation et le trajet associé ?'
          : 'Êtes-vous sûr de vouloir annuler cette demande ?',
      variant: 'danger',
      actions: [
        { label: 'Non', variant: 'secondary' },
        {
          label: 'Oui, annuler',
          variant: 'secondary',
          onPress: async () => {
            try {
              await cancelRequest(id).unwrap();
              showDialog({
                title: 'Demande annulée',
                message: 'Votre demande a été annulée avec succès',
                variant: 'success',
                actions: [{ label: 'OK', onPress: goHome }],
              });
            } catch (error: any) {
              showDialog({
                title: 'Erreur',
                message: getApiErrorMessage(error, 'Impossible d\'annuler la demande.'),
                variant: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || error) {
    const errorMessage = getApiErrorMessage(
      error,
      'Impossible de charger la demande pour le moment. Réessayez dans un instant.',
    );
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.danger} />
          <Text style={styles.emptyTitle}>Erreur</Text>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh" size={20} color={Colors.white} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!tripRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Demande introuvable</Text>
          <Text style={styles.emptyText}>
            La demande de trajet que vous recherchez n&apos;existe pas ou n&apos;est plus disponible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const request = tripRequest;
  const departureLat = tripRequest.departure?.lat;
  const departureLng = tripRequest.departure?.lng;
  const arrivalLat = tripRequest.arrival?.lat;
  const arrivalLng = tripRequest.arrival?.lng;
  let requestRouteMapData: RequestRouteMapData | null = null;

  if (
    typeof departureLat === 'number' &&
    typeof departureLng === 'number' &&
    typeof arrivalLat === 'number' &&
    typeof arrivalLng === 'number'
  ) {
    const departureCoordinate = { latitude: departureLat, longitude: departureLng };
    const arrivalCoordinate = { latitude: arrivalLat, longitude: arrivalLng };

    requestRouteMapData = {
      departureCoordinate,
      arrivalCoordinate,
      fallbackCoordinates: [departureCoordinate, arrivalCoordinate],
      initialRegion: {
        latitude: (departureLat + arrivalLat) / 2,
        longitude: (departureLng + arrivalLng) / 2,
        latitudeDelta: Math.max(Math.abs(departureLat - arrivalLat) * 1.45, 0.012),
        longitudeDelta: Math.max(Math.abs(departureLng - arrivalLng) * 1.45, 0.012),
      },
    };
  }

  const displayedRouteCoordinates = routeCoordinates ?? [];
  const statusConfigMap = {
    pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
    offers_received: { label: 'Réponses reçues', color: Colors.info, bg: Colors.info + '15' },
    driver_selected: { label: 'Conducteur choisi', color: Colors.success, bg: Colors.success + '15' },
    cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
    expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
  };
  const statusConfig = statusConfigMap[tripRequest.status] || statusConfigMap.pending;

  const pendingOffersCount = tripRequest.offers?.filter((offer) => offer.status === 'pending').length ?? 0;
  const ownerDisplayedBudget = tripRequest.selectedPricePerSeat ?? tripRequest.maxPricePerSeat;
  const heroStepIndex =
    tripRequest.tripId
      ? 3
      : tripRequest.status === 'driver_selected'
        ? 2
        : tripRequest.status === 'offers_received' || pendingOffersCount > 0
          ? 1
          : tripRequest.status === 'pending'
            ? 0
            : -1;
  const heroSteps = ['Demande', 'Réponses', 'Conducteur', 'Départ'];
  const ownerHero = (() => {
    if (tripRequest.tripId) {
      return {
        title: 'Votre course est prête',
        subtitle: 'Le trajet a déjà été créé. Vous pouvez maintenant suivre la course en direct.',
      };
    }
    if (tripRequest.status === 'driver_selected') {
      return {
        title: tripRequest.selectedDriverName
          ? `${tripRequest.selectedDriverName} prépare votre prise en charge`
          : 'Votre conducteur a été confirmé',
        subtitle: 'Restez disponible, la prise en charge va bientôt commencer.',
      };
    }
    if (tripRequest.status === 'offers_received' || pendingOffersCount > 0) {
      return {
        title:
          pendingOffersCount > 1
            ? `${pendingOffersCount} conducteurs ont répondu`
            : 'Un conducteur a répondu',
        subtitle: "Le conducteur retenu apparaîtra ici dès qu'il sera confirmé.",
      };
    }
    if (tripRequest.status === 'cancelled') {
      return {
        title: 'Votre demande est annulée',
        subtitle: "Cette demande n'est plus visible pour les conducteurs.",
      };
    }
    if (tripRequest.status === 'expired') {
      return {
        title: 'Votre demande a expiré',
        subtitle: "Aucun conducteur n'a répondu dans les deux heures. Vous pouvez relancer une nouvelle demande.",
      };
    }
    return {
      title: 'Nous cherchons un conducteur',
      subtitle: "Votre demande circule auprès des conducteurs et n'expirera après deux heures que si personne ne répond.",
    };
  })();
  const ownerHeroHintMessage =
    pendingOffersCount > 0
      ? 'Les réponses arrivent. Le conducteur retenu apparaîtra ici.'
      : "Vous serez alerté dès qu'un conducteur se manifeste.";
  const driverHero = (() => {
    if (canOpenAssignedTrip) {
      return {
        badge: 'Retenu',
        title: 'Vous pilotez cette course',
        subtitle: 'Le trajet est déjà prêt. Ouvrez-le pour suivre la course ou lancer votre prise en charge.',
      };
    }
    if (canStartAssignedTrip) {
      return {
        badge: 'Confirmé',
        title: 'Cette demande est pour vous',
        subtitle: 'Le passager est déjà réservé. Vous pouvez démarrer le trajet dès maintenant.',
      };
    }
    if (canAcceptDirectly) {
      return {
        badge: 'Immédiat',
        title: 'Vous pouvez accepter cette course maintenant',
        subtitle: 'Choisissez votre véhicule. Le trajet sera ensuite créé immédiatement pour le passager.',
      };
    }
    if (myOffer?.status === 'pending') {
      return {
        badge: 'En attente',
        title: 'Votre ancienne réponse est encore en attente',
        subtitle: 'Vous serez notifié dès que son statut évoluera.',
      };
    }
    if (myOffer?.status === 'rejected') {
      return {
        badge: 'Clôturé',
        title: 'Votre ancienne réponse n\'a pas été retenue',
        subtitle: 'Vous pouvez consulter d\'autres demandes disponibles depuis l\'accueil ou la liste des demandes.',
      };
    }
    if (!isDriverAccount) {
      return {
        badge: 'Profil',
        title: 'Activez votre profil conducteur',
        subtitle: 'Cette demande est ouverte, mais votre compte doit devenir conducteur pour l\'accepter.',
      };
    }
    if (!isIdentityVerified) {
      return {
        badge: 'KYC',
        title: 'Vérifiez votre identité pour accepter',
        subtitle: 'Une vérification rapide est nécessaire avant d\'accepter cette demande.',
      };
    }
    if (compatibleActiveVehicles.length === 0) {
      return {
        badge: 'Véhicule',
        title: `${TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]} requise pour cette course`,
        subtitle: 'Aucun de vos véhicules actifs ne correspond au type demandé.',
      };
    }
    return {
      badge: statusConfig.label,
      title: 'Cette demande n’est pas disponible',
      subtitle: 'Actualisez l’écran ou consultez une autre demande de trajet.',
    };
  })();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isOwner ? 'Votre demande' : 'Demande de trajet'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, !isOwner && styles.driverContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* En-tête avec statut */}
        {isOwner ? (
          <Animated.View
            entering={FadeInDown.duration(280)}
            layout={LinearTransition.duration(220)}
            style={[styles.ownerHeroCard, styles.ownerRequestHeroCard]}
          >
            <View style={styles.ownerHeroTopRow}>
              <View style={[styles.ownerHeroStatusBadge, { backgroundColor: statusConfig.bg }]}>
                <View style={[styles.ownerHeroStatusDot, { backgroundColor: statusConfig.color }]} />
                <Text style={[styles.ownerHeroStatusText, { color: statusConfig.color }]}>
                  {statusConfig.label}
                </Text>
              </View>
              {pendingOffersCount > 0 && !tripRequest.tripId && (
                <View style={styles.ownerHeroCounter}>
                  <Ionicons name="sparkles-outline" size={14} color={Colors.white} />
                  <Text style={styles.ownerHeroCounterText}>
                    {pendingOffersCount} réponse{pendingOffersCount > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.ownerHeroLead}>
              <View style={styles.ownerHeroLeadIcon}>
                <Ionicons
                  name={
                    tripRequest.tripId
                      ? 'navigate'
                      : pendingOffersCount > 0
                        ? 'chatbubbles'
                        : 'radio'
                  }
                  size={24}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.ownerHeroLeadCopy}>
                <Text style={styles.ownerHeroTitle} numberOfLines={2}>{ownerHero.title}</Text>
                <Text style={styles.ownerHeroSubtitle} numberOfLines={2}>{ownerHero.subtitle}</Text>
              </View>
            </View>

            <Animated.View layout={LinearTransition.duration(220)} style={styles.driverRouteCard}>
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, { backgroundColor: Colors.success }]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.driverRouteLabel}>Départ</Text>
                  <Text style={styles.driverRouteText} numberOfLines={1}>{tripRequest.departure.name}</Text>
                </View>
              </View>
              <View style={[styles.ownerHeroRouteLine, styles.driverRouteLine]} />
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, styles.ownerHeroRouteSquare]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.driverRouteLabel}>Destination</Text>
                  <Text style={styles.driverRouteText} numberOfLines={1}>{tripRequest.arrival.name}</Text>
                </View>
              </View>
              <CollapsibleRouteMap
                arrivalName={tripRequest.arrival.name}
                departureName={tripRequest.departure.name}
                mapData={requestRouteMapData}
                routeCoordinates={displayedRouteCoordinates}
              />
            </Animated.View>

            <View style={[styles.driverVehicleSpotlight, styles.ownerVehicleSpotlight]}>
              <View style={styles.driverVehicleIconShell}>
                <Ionicons
                  name={TRIP_REQUEST_VEHICLE_ICONS[requestedVehicleType]}
                  size={28}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.driverVehicleCopy}>
                <Text style={styles.driverVehicleEyebrow}>Véhicule demandé</Text>
                <Text style={styles.driverVehicleName}>
                  {TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}
                </Text>
                <Text style={styles.driverVehicleHint}>
                  Choisi pour {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.ownerVehicleChoiceIcon}>
                <Ionicons name="checkmark" size={16} color={Colors.primary} />
              </View>
            </View>

            <View style={styles.driverFactsRow}>
              <View style={styles.driverFact}>
                <Ionicons name="time-outline" size={18} color={Colors.primary} />
                <Text style={styles.driverFactLabel}>Départ souhaité</Text>
                <Text style={styles.driverFactValue} numberOfLines={2}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
              </View>
              <View style={styles.driverFactDivider} />
              <View style={styles.driverFact}>
                <Ionicons name="hourglass-outline" size={18} color={Colors.primary} />
                <Text style={styles.driverFactLabel}>Au plus tard</Text>
                <Text style={styles.driverFactValue} numberOfLines={2}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMax, true)}
                </Text>
              </View>
              {ownerDisplayedBudget ? (
                <>
                  <View style={styles.driverFactDivider} />
                  <View style={styles.driverFact}>
                    <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
                    <Text style={styles.driverFactLabel}>Budget</Text>
                    <Text style={styles.driverFactValue}>{formatCdfPrice(ownerDisplayedBudget)}</Text>
                  </View>
                </>
              ) : null}
            </View>

            {tripRequest.selectedDriverRequiresPassengerKyc ? (
              <View style={styles.ownerPassengerKycNotice}>
                <View style={styles.ownerPassengerKycNoticeIcon}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={Colors.primary} />
                </View>
                <View style={styles.ownerPassengerKycNoticeCopy}>
                  <Text style={styles.ownerPassengerKycNoticeTitle}>KYC passager requis</Text>
                  <Text style={styles.ownerPassengerKycNoticeText}>
                    Ce conducteur demande une vérification d&apos;identité approuvée avant la prise en charge.
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.ownerProgressPanel}>
              <View style={styles.ownerProgressHeader}>
                <Text style={styles.ownerProgressTitle}>Suivi de la demande</Text>
                <Text style={styles.ownerProgressCount}>
                  {heroStepIndex >= 0 ? `Étape ${heroStepIndex + 1} sur 4` : 'Demande clôturée'}
                </Text>
              </View>
              <View style={styles.ownerHeroSteps}>
                {heroSteps.map((step, index) => {
                  const active = heroStepIndex >= index;
                  return (
                    <View key={step} style={styles.ownerHeroStep}>
                      <View
                        style={[
                          styles.ownerHeroStepDot,
                          active && styles.ownerHeroStepDotActive,
                        ]}
                      />
                      <Text
                        style={[
                          styles.ownerHeroStepText,
                          active && styles.ownerHeroStepTextActive,
                        ]}
                      >
                        {step}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {tripRequest.tripId ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={() => handleViewTrip(tripRequest.tripId!)}
              >
                <Ionicons name="navigate-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Suivre la course</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ownerHeroHintRow}>
                <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
                <Text style={styles.ownerHeroHintText}>{ownerHeroHintMessage}</Text>
              </View>
            )}

            {(canEdit || canCancel) && (
              <View style={styles.ownerHeroActions}>
                {canEdit && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.ownerHeroGhostButton,
                      pressed && styles.ownerHeroButtonPressed,
                    ]}
                    onPress={handleOpenEditForm}
                  >
                    <Ionicons name="create-outline" size={16} color={Colors.primary} />
                    <Text style={styles.ownerHeroGhostButtonText}>Modifier</Text>
                  </Pressable>
                )}
                {canCancel && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.ownerHeroGhostButton,
                      styles.ownerHeroGhostButtonDanger,
                      pressed && styles.ownerHeroButtonPressed,
                      isCancelling && styles.ownerHeroButtonDisabled,
                    ]}
                    onPress={handleCancelRequest}
                    disabled={isCancelling}
                  >
                    {isCancelling ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <>
                        <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                        <Text style={[styles.ownerHeroGhostButtonText, styles.ownerHeroGhostButtonTextDanger]}>
                          Annuler
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.duration(280)}
            layout={LinearTransition.duration(220)}
            style={[styles.ownerHeroCard, styles.driverHeroCard]}
          >
            <View style={styles.ownerHeroTopRow}>
              <View style={styles.driverHeroStatusBadge}>
                <View style={styles.driverHeroStatusDot} />
                <Text style={styles.driverHeroStatusText}>{driverHero.badge}</Text>
              </View>
              {!!myOffer?.pricePerSeat && (
                <View style={styles.ownerHeroCounter}>
                  <Ionicons name="cash-outline" size={14} color={Colors.white} />
                  <Text style={styles.ownerHeroCounterText}>{myOffer.pricePerSeat} FC</Text>
                </View>
              )}
            </View>

            <View style={styles.driverHeroPassengerRow}>
              {tripRequest.passengerAvatar ? (
                <Image source={{ uri: tripRequest.passengerAvatar }} style={styles.driverHeroAvatar} />
              ) : (
                <View style={styles.driverHeroAvatar}>
                  <Ionicons name="person" size={18} color={Colors.white} />
                </View>
              )}
              <View style={styles.driverHeroPassengerInfo}>
                <Text style={styles.driverHeroPassengerLabel}>Demande de</Text>
                <Text style={styles.driverHeroPassengerName}>{tripRequest.passengerName}</Text>
              </View>
              <View style={styles.driverHeroRoleBadge}>
                <Ionicons name="person-circle-outline" size={14} color={Colors.gray[600]} />
                <Text style={styles.driverHeroRoleBadgeText}>Passager</Text>
              </View>
            </View>

            <Text style={styles.ownerHeroTitle} numberOfLines={2}>{driverHero.title}</Text>
            <Text style={styles.ownerHeroSubtitle} numberOfLines={2}>{driverHero.subtitle}</Text>

            <Animated.View layout={LinearTransition.duration(220)} style={styles.driverRouteCard}>
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, { backgroundColor: Colors.success }]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.driverRouteLabel}>Départ</Text>
                  <Text style={styles.driverRouteText} numberOfLines={1}>{tripRequest.departure.name}</Text>
                </View>
              </View>
              <View style={[styles.ownerHeroRouteLine, styles.driverRouteLine]} />
              <View style={styles.ownerHeroRouteRow}>
                <View style={[styles.ownerHeroRouteDot, styles.ownerHeroRouteSquare]} />
                <View style={styles.ownerHeroRouteInfo}>
                  <Text style={styles.driverRouteLabel}>Destination</Text>
                  <Text style={styles.driverRouteText} numberOfLines={1}>{tripRequest.arrival.name}</Text>
                </View>
              </View>

              <CollapsibleRouteMap
                arrivalName={tripRequest.arrival.name}
                departureName={tripRequest.departure.name}
                mapData={requestRouteMapData}
                routeCoordinates={displayedRouteCoordinates}
              />
            </Animated.View>

            <View style={styles.driverVehicleSpotlight}>
              <View style={styles.driverVehicleIconShell}>
                <Ionicons
                  name={TRIP_REQUEST_VEHICLE_ICONS[requestedVehicleType]}
                  size={28}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.driverVehicleCopy}>
                <Text style={styles.driverVehicleEyebrow}>Véhicule demandé</Text>
                <Text style={styles.driverVehicleName}>
                  {TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}
                </Text>
                <Text style={styles.driverVehicleHint}>Souhaité par le passager pour cette course</Text>
              </View>
              <View style={styles.driverVehicleCheck}>
                <Ionicons name="checkmark" size={16} color={Colors.white} />
              </View>
            </View>

            <View style={styles.driverFactsRow}>
              <View style={styles.driverFact}>
                <Ionicons name="time-outline" size={18} color={Colors.primary} />
                <Text style={styles.driverFactLabel}>Départ souhaité</Text>
                <Text style={styles.driverFactValue} numberOfLines={2}>
                  {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
                </Text>
              </View>
              <View style={styles.driverFactDivider} />
              <View style={styles.driverFact}>
                <Ionicons name="people-outline" size={18} color={Colors.primary} />
                <Text style={styles.driverFactLabel}>Passagers</Text>
                <Text style={styles.driverFactValue}>
                  {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
                </Text>
              </View>
              {tripRequest.maxPricePerSeat ? (
                <>
                  <View style={styles.driverFactDivider} />
                  <View style={styles.driverFact}>
                    <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
                    <Text style={styles.driverFactLabel}>Budget max.</Text>
                    <Text style={styles.driverFactValue}>{formatCdfPrice(tripRequest.maxPricePerSeat)}</Text>
                  </View>
                </>
              ) : null}
            </View>

            {canOpenAssignedTrip ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={() => handleViewTrip(tripRequest.tripId!)}
              >
                <Ionicons name="navigate-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Ouvrir le trajet</Text>
              </TouchableOpacity>
            ) : canStartAssignedTrip ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={handleStartTripFromRequest}
                disabled={isStartingTripFromRequest}
              >
                {isStartingTripFromRequest ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="play-circle-outline" size={18} color={Colors.white} />
                    <Text style={styles.ownerHeroPrimaryButtonText}>Démarrer le trajet</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : canAcceptDirectly ? (
              <TouchableOpacity
                style={styles.ownerHeroPrimaryButton}
                onPress={handleOpenDirectAcceptModal}
                disabled={isAcceptingTripRequest || isStartingTrip}
              >
                {isAcceptingTripRequest || isStartingTrip ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                    <Text style={styles.ownerHeroPrimaryButtonText}>Accepter la demande</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : !isDriverAccount ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={openDriverOnboarding}>
                <Ionicons name="car-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Devenir conducteur</Text>
              </TouchableOpacity>
            ) : !isIdentityVerified ? (
              <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={() => checkIdentity('publish')}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.white} />
                <Text style={styles.ownerHeroPrimaryButtonText}>Vérifier mon identité</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.ownerHeroHintRow}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.ownerHeroHintText}>
                  {compatibleActiveVehicles.length === 0
                    ? 'Aucun de vos véhicules actifs ne correspond au type demandé pour cette course.'
                    : 'Cette demande ne peut plus être acceptée. Actualisez l’écran pour obtenir son dernier statut.'}
                </Text>
              </View>
            )}
          </Animated.View>
        )}

        {false && (
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations utiles</Text>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Ionicons name="radio-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Demande publiée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(request.createdAt, false)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Date de départ souhaitée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(request.departureDateMin, true)}
                </Text>
                <Text style={styles.detailSubValue}>
                  Délai max: {formatDateWithRelativeLabel(request.departureDateMax, true)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Nombre de places</Text>
                <Text style={styles.detailValue}>{request.numberOfSeats}</Text>
              </View>
            </View>
            {request.maxPricePerSeat && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Prix maximum par place</Text>
                    <Text style={styles.detailValue}>{request.maxPricePerSeat} FC</Text>
                  </View>
                </View>
              </>
            )}
            {request.description && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{request.description}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
          </View>
        )}

        {tripRequest.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Note du passager</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailValue}>{tripRequest.description}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {tripRequest && (
          <Modal
            visible={showDirectAcceptModal}
            animationType="slide"
            transparent
            onRequestClose={closeDirectAcceptModal}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.editModalRoot}
            >
              <TouchableOpacity
                style={styles.editModalBackdrop}
                activeOpacity={1}
                onPress={closeDirectAcceptModal}
              />

              <View style={[styles.editModalCard, styles.directAcceptModalCard]}>
                <View style={styles.editModalHeader}>
                  <View style={styles.editModalHeaderContent}>
                    <View style={styles.directAcceptModalIcon}>
                      <Ionicons name="checkmark-circle-outline" size={20} color={Colors.primary} />
                    </View>
                    <View style={styles.directAcceptModalTitleCopy}>
                      <Text style={styles.editModalTitle}>Accepter la demande</Text>
                      <Text style={styles.editModalSubtitle}>Choisissez le véhicule utilisé</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.editModalCloseButton}
                    onPress={closeDirectAcceptModal}
                    accessibilityRole="button"
                    accessibilityLabel="Fermer"
                  >
                    <Ionicons name="close" size={20} color={Colors.gray[700]} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.editModalScrollView}
                  contentContainerStyle={styles.directAcceptModalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.directAcceptSummaryCard}>
                    <View style={styles.directAcceptSummaryRow}>
                      <Ionicons name="calendar-outline" size={17} color={Colors.primary} />
                      <Text style={styles.directAcceptSummaryText}>
                        {directAcceptDepartureDate
                          ? formatDateWithRelativeLabel(directAcceptDepartureDate.toISOString(), true)
                          : 'Départ à confirmer'}
                      </Text>
                    </View>
                    <View style={styles.directAcceptSummaryRow}>
                      <Ionicons name={TRIP_REQUEST_VEHICLE_ICONS[requestedVehicleType]} size={17} color={Colors.primary} />
                      <Text style={styles.directAcceptSummaryText}>
                        {TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]} demandée
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: directAcceptRequiresPassengerKyc }}
                    onPress={() => setDirectAcceptRequiresPassengerKyc((current) => !current)}
                    style={({ pressed }) => [
                      styles.directPassengerKycCard,
                      directAcceptRequiresPassengerKyc && styles.directPassengerKycCardActive,
                      pressed && styles.directPassengerKycCardPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.directPassengerKycIcon,
                        directAcceptRequiresPassengerKyc && styles.directPassengerKycIconActive,
                      ]}
                    >
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={19}
                        color={directAcceptRequiresPassengerKyc ? Colors.white : Colors.primary}
                      />
                    </View>
                    <View style={styles.directPassengerKycCopy}>
                      <Text style={styles.directPassengerKycTitle}>Exiger KYC passager</Text>
                      <Text style={styles.directPassengerKycSubtitle}>
                        Le passager devra avoir une vérification d&apos;identité approuvée avant que ce trajet continue.
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.directPassengerKycSwitch,
                        directAcceptRequiresPassengerKyc && styles.directPassengerKycSwitchActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.directPassengerKycThumb,
                          directAcceptRequiresPassengerKyc && styles.directPassengerKycThumbActive,
                        ]}
                      />
                    </View>
                  </Pressable>

                  <View style={styles.directVehiclePicker}>
                    <View style={styles.directVehiclePickerHeader}>
                      <View style={styles.directVehiclePickerIcon}>
                        <Ionicons name="car-sport-outline" size={18} color={Colors.primary} />
                      </View>
                      <View style={styles.directVehiclePickerCopy}>
                        <Text style={styles.directVehiclePickerTitle}>Véhicule pour ce trajet</Text>
                        <Text style={styles.directVehiclePickerSubtitle}>
                          {compatibleActiveVehicles.length > 1
                            ? 'Sélectionnez le véhicule que vous allez utiliser.'
                            : 'Ce véhicule sera communiqué au passager.'}
                        </Text>
                      </View>
                      <Text style={styles.directVehicleRequired}>REQUIS</Text>
                    </View>

                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.directVehicleList}
                    >
                      {compatibleActiveVehicles.map((vehicle) => {
                        const isSelected = directAcceptVehicleId === vehicle.id;
                        const vehicleType = normalizeTripRequestVehicleType(vehicle.type);

                        return (
                          <Pressable
                            key={vehicle.id}
                            accessibilityRole="radio"
                            accessibilityLabel={`${vehicle.brand} ${vehicle.model}, ${vehicle.color}, plaque ${vehicle.licensePlate}`}
                            accessibilityState={{ checked: isSelected }}
                            onPress={() => setDirectAcceptVehicleId(vehicle.id)}
                            style={({ pressed }) => [
                              styles.directVehicleCard,
                              isSelected && styles.directVehicleCardSelected,
                              pressed && styles.directVehicleCardPressed,
                            ]}
                          >
                            <View style={styles.directVehicleCardHeader}>
                              <Ionicons
                                name={TRIP_REQUEST_VEHICLE_ICONS[vehicleType]}
                                size={21}
                                color={isSelected ? Colors.primary : Colors.gray[600]}
                              />
                              <View
                                style={[
                                  styles.directVehicleRadio,
                                  isSelected && styles.directVehicleRadioSelected,
                                ]}
                              >
                                {isSelected && <Ionicons name="checkmark" size={13} color={Colors.white} />}
                              </View>
                            </View>
                            <Text style={styles.directVehicleName} numberOfLines={1}>
                              {vehicle.brand} {vehicle.model}
                            </Text>
                            <Text style={styles.directVehicleDetails} numberOfLines={1}>
                              {vehicle.color} • {vehicle.licensePlate}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {!directAcceptVehicle && (
                      <View style={styles.directVehicleHint}>
                        <Ionicons name="information-circle-outline" size={15} color={Colors.warning} />
                        <Text style={styles.directVehicleHintText}>
                          Sélectionnez un véhicule pour continuer.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.driverOverridePanel}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: areDirectOptionsExpanded }}
                      onPress={() => setAreDirectOptionsExpanded((isExpanded) => !isExpanded)}
                      style={({ pressed }) => [
                        styles.driverOverrideToggle,
                        pressed && styles.driverOverrideTogglePressed,
                      ]}
                    >
                      <View style={styles.driverOverrideToggleIcon}>
                        <Ionicons name="options-outline" size={18} color={Colors.primary} />
                      </View>
                      <View style={styles.driverOverrideToggleCopy}>
                        <Text style={styles.driverOverrideTitle}>Ajuster les points de rendez-vous</Text>
                        <Text style={styles.driverOverrideSubtitle}>Optionnel · seulement si nécessaire</Text>
                      </View>
                      <Ionicons
                        name={areDirectOptionsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.gray[600]}
                      />
                    </Pressable>
                    {areDirectOptionsExpanded && (
                      <Animated.View entering={FadeInDown.duration(200)} style={styles.driverOverrideFields}>
                        <TouchableOpacity
                          style={styles.driverOverrideButton}
                          onPress={() => openDirectRouteOverridePicker('directDeparture')}
                        >
                          <Ionicons name="location-outline" size={16} color={Colors.primary} />
                          <Text style={styles.driverOverrideButtonText}>
                            {directAcceptDepartureLocation?.title || 'Point de départ sur la carte'}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.driverOverrideInput}
                          placeholder={LANDMARK_PLACEHOLDER}
                          placeholderTextColor={Colors.gray[400]}
                          value={directAcceptDepartureReference}
                          onChangeText={setDirectAcceptDepartureReference}
                        />
                        <TouchableOpacity
                          style={styles.driverOverrideButton}
                          onPress={() => openDirectRouteOverridePicker('directArrival')}
                        >
                          <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
                          <Text style={styles.driverOverrideButtonText}>
                            {directAcceptArrivalLocation?.title || 'Point d’arrivée sur la carte'}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.driverOverrideInput}
                          placeholder={LANDMARK_PLACEHOLDER}
                          placeholderTextColor={Colors.gray[400]}
                          value={directAcceptArrivalReference}
                          onChangeText={setDirectAcceptArrivalReference}
                        />
                      </Animated.View>
                    )}
                  </View>
                </ScrollView>

                <View style={styles.directAcceptModalFooter}>
                  <TouchableOpacity
                    style={[
                      styles.directAcceptSecondaryButton,
                      (!directAcceptVehicle || isAcceptingTripRequest || isStartingTrip) &&
                        styles.directAcceptSecondaryButtonDisabled,
                    ]}
                    onPress={() => handleDirectAcceptTripRequest(false)}
                    disabled={!directAcceptVehicle || isAcceptingTripRequest || isStartingTrip}
                  >
                    <Text
                      style={[
                        styles.directAcceptSecondaryButtonText,
                        (!directAcceptVehicle || isAcceptingTripRequest || isStartingTrip) &&
                          styles.directAcceptButtonTextDisabled,
                      ]}
                    >
                      Accepter
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.directAcceptPrimaryButton,
                      (!directAcceptVehicle || isAcceptingTripRequest || isStartingTrip) &&
                        styles.directAcceptButtonDisabled,
                    ]}
                    onPress={() => handleDirectAcceptTripRequest(true)}
                    disabled={!directAcceptVehicle || isAcceptingTripRequest || isStartingTrip}
                  >
                    {isAcceptingTripRequest || isStartingTrip ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <>
                        <Ionicons name="play-circle-outline" size={18} color={Colors.white} />
                        <Text style={styles.directAcceptPrimaryButtonText}>Accepter et démarrer</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* Modal de modification de la demande */}
        {showEditForm && tripRequest && (
            <Modal
              visible={showEditForm}
              animationType="slide"
              transparent
              onRequestClose={() => setShowEditForm(false)}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.editModalRoot}
              >
                <TouchableOpacity
                  style={styles.editModalBackdrop}
                  activeOpacity={1}
                  onPress={() => setShowEditForm(false)}
                />
                
                <View style={styles.editModalCard}>
                  {/* En-tête */}
                  <View style={styles.editModalHeader}>
                    <View style={styles.editModalHeaderContent}>
                      <Ionicons name="create-outline" size={24} color={Colors.primary} />
                      <View>
                        <Text style={styles.editModalTitle}>Modifier la demande</Text>
                        <Text style={styles.editModalSubtitle}>Ajustez les détails avant de republier</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.editModalCloseButton}
                      onPress={() => setShowEditForm(false)}
                    >
                      <Ionicons name="close" size={24} color={Colors.gray[600]} />
                    </TouchableOpacity>
                  </View>

                  {/* Contenu Scrollable */}
                  <ScrollView
                    style={styles.editModalScrollView}
                    contentContainerStyle={styles.editModalScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {/* ── Section Itinéraire ── */}
                    <View style={styles.editSectionHeader}>
                      <View style={styles.editSectionIconWrap}>
                        <Ionicons name="map-outline" size={15} color={Colors.primary} />
                      </View>
                      <Text style={styles.editSectionTitle}>Itinéraire</Text>
                    </View>

                    {/* Mode selector */}
                    <View style={styles.editModeRow}>
                      <TouchableOpacity
                        style={[styles.editModeChip, editAddressInputMode === 'map' && styles.editModeChipActive]}
                        onPress={() => setEditAddressInputMode('map')}
                      >
                        <Ionicons name="map-outline" size={13} color={editAddressInputMode === 'map' ? Colors.primary : Colors.gray[500]} />
                        <Text style={[styles.editModeChipText, editAddressInputMode === 'map' && styles.editModeChipTextActive]}>Carte</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.editModeChip, editAddressInputMode === 'manual' && styles.editModeChipActive]}
                        onPress={() => setEditAddressInputMode('manual')}
                      >
                        <Ionicons name="create-outline" size={13} color={editAddressInputMode === 'manual' ? Colors.primary : Colors.gray[500]} />
                        <Text style={[styles.editModeChipText, editAddressInputMode === 'manual' && styles.editModeChipTextActive]}>Saisie manuelle</Text>
                      </TouchableOpacity>
                    </View>

                    {editAddressInputMode === 'manual' ? (
                      <View style={styles.editRouteCard}>
                        <View style={styles.editRouteManualItem}>
                          <View style={[styles.editRouteManualDot, { backgroundColor: Colors.success }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.editRouteManualLabel}>Départ</Text>
                            <TextInput
                              style={styles.editRouteManualInput}
                              placeholder="Adresse de départ"
                              placeholderTextColor={Colors.gray[400]}
                              value={editDepartureManualAddress}
                              onChangeText={setEditDepartureManualAddress}
                            />
                          </View>
                        </View>
                        <View style={styles.editRouteDividerLine} />
                        <View style={styles.editRouteManualItem}>
                          <View style={[styles.editRouteManualDot, { backgroundColor: Colors.primary }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.editRouteManualLabel}>Arrivée</Text>
                            <TextInput
                              style={styles.editRouteManualInput}
                              placeholder="Adresse d'arrivée"
                              placeholderTextColor={Colors.gray[400]}
                              value={editArrivalManualAddress}
                              onChangeText={setEditArrivalManualAddress}
                            />
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.editRouteCard}>
                        <TouchableOpacity
                          style={styles.editRouteMapBtn}
                          onPress={() => openEditLocationPicker('departure')}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.editRouteMapDot, { backgroundColor: Colors.success + '20' }]}>
                            <Ionicons name="location" size={16} color={Colors.success} />
                          </View>
                          <View style={styles.editRouteMapContent}>
                            <Text style={[styles.editRouteMapType, { color: Colors.success }]}>DÉPART</Text>
                            <Text style={styles.editRouteMapValue} numberOfLines={1}>
                              {editDepartureAddress || 'Sélectionner sur la carte'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                        </TouchableOpacity>

                        <View style={styles.editRouteDividerLine} />

                        <TouchableOpacity
                          style={styles.editRouteMapBtn}
                          onPress={() => openEditLocationPicker('arrival')}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.editRouteMapDot, { backgroundColor: Colors.primary + '18' }]}>
                            <Ionicons name="navigate" size={16} color={Colors.primary} />
                          </View>
                          <View style={styles.editRouteMapContent}>
                            <Text style={[styles.editRouteMapType, { color: Colors.primary }]}>ARRIVÉE</Text>
                            <Text style={styles.editRouteMapValue} numberOfLines={1}>
                              {editArrivalAddress || 'Sélectionner sur la carte'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Fenêtre horaire */}
                    <View style={styles.editSection}>
                      <View style={styles.editSectionHeader}>
                        <Ionicons name="calendar" size={20} color={Colors.warning} />
                        <Text style={styles.editSectionTitle}>Créneau de départ</Text>
                      </View>
                      
                      {/* Min */}
                      <View style={styles.editDateTimeRow}>
                        <Text style={styles.editDateTimeLabel}>Au plus tôt</Text>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMin('date')}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMin ? editDepartureDateMin.toLocaleDateString('fr-FR') : 'Date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMin('time')}>
                          <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMin ? editDepartureDateMin.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : 'Heure'}</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Max */}
                      <View style={styles.editDateTimeRow}>
                        <Text style={styles.editDateTimeLabel}>Au plus tard</Text>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMax('date')}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMax ? editDepartureDateMax.toLocaleDateString('fr-FR') : 'Date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editDateTimeButton} onPress={() => openEditDateOrTimePickerMax('time')}>
                          <Ionicons name="time-outline" size={16} color={Colors.gray[600]} />
                          <Text style={styles.editDateTimeText}>{editDepartureDateMax ? editDepartureDateMax.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : 'Heure'}</Text>
                        </TouchableOpacity>
                      </View>

                      {editScheduleError ? (
                        <Text style={styles.editScheduleError}>{editScheduleError}</Text>
                      ) : null}

                      {/* iOS Pickers intégrés */}
                      {Platform.OS === 'ios' && editIosPickerModeMin && editDepartureDateMin && (
                        <View style={styles.editIosPickerWrapper}>
                          <DateTimePicker value={editDepartureDateMin} mode={editIosPickerModeMin} display="spinner" onChange={handleEditIosPickerChangeMin} minimumDate={new Date()} />
                        </View>
                      )}
                      {Platform.OS === 'ios' && editIosPickerModeMax && editDepartureDateMax && (
                        <View style={styles.editIosPickerWrapper}>
                          <DateTimePicker value={editDepartureDateMax} mode={editIosPickerModeMax} display="spinner" onChange={handleEditIosPickerChangeMax} minimumDate={editDepartureDateMin || new Date()} />
                        </View>
                      )}
                    </View>

                    {/* Type de véhicule et estimation */}
                    <View style={styles.editSection}>
                      <View style={styles.editVehicleHeader}>
                        <View style={styles.editSectionHeaderCompact}>
                          <Ionicons name="car-sport-outline" size={20} color={Colors.primary} />
                          <View>
                            <Text style={styles.editSectionTitle}>Type de véhicule</Text>
                            <Text style={styles.editVehicleSubtitle}>Estimation par place</Text>
                          </View>
                        </View>
                        {editVehiclePriceMultiplier > 1 ? (
                          <View style={styles.editWeatherBadge}>
                            <Ionicons name="rainy-outline" size={12} color={Colors.primaryDark} />
                            <Text style={styles.editWeatherBadgeText}>
                              x{editVehiclePriceMultiplier.toFixed(1)}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {isEditVehicleOptionsLoading && editVehicleOptions.length === 0 ? (
                        <View style={styles.editVehicleLoading}>
                          <ActivityIndicator size="small" color={Colors.primary} />
                          <Text style={styles.editVehicleLoadingText}>Mise à jour des tarifs…</Text>
                        </View>
                      ) : null}

                      {!isEditVehicleOptionsLoading && isEditVehicleOptionsError && editVehicleOptions.length === 0 ? (
                        <View style={styles.editVehicleError}>
                          <Text style={styles.editVehicleErrorText}>Tarifs indisponibles.</Text>
                          <TouchableOpacity
                            style={styles.editVehicleRetry}
                            onPress={() => setEditVehicleOptionsRetry((value) => value + 1)}
                          >
                            <Text style={styles.editVehicleRetryText}>Réessayer</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      <View style={styles.editVehicleOptionsList}>
                        {editVehicleOptions.map((option) => {
                          const selected = option.vehicleType === editVehicleType;
                          const unavailable = !option.availableForRequestedSeats;
                          const price = option.recommendedPricePerSeat === null
                            ? 'À confirmer'
                            : formatCdfPrice(option.recommendedPricePerSeat);
                          const detail = unavailable
                            ? `Indisponible pour ${parsedEditNumberOfSeats} places`
                            : option.recommendedTotalPrice !== null && parsedEditNumberOfSeats > 1
                              ? `${formatCdfPrice(option.recommendedTotalPrice)} au total`
                              : `${formatCdfPrice(option.pricePerKmPerPassenger)} / km / pers.`;

                          return (
                            <TouchableOpacity
                              key={option.vehicleType}
                              style={[
                                styles.editVehicleOption,
                                selected && styles.editVehicleOptionSelected,
                                unavailable && styles.editVehicleOptionDisabled,
                              ]}
                              onPress={() => handleSelectEditVehicle(option)}
                              disabled={unavailable}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected, disabled: unavailable }}
                              activeOpacity={0.82}
                            >
                              <View style={[
                                styles.editVehicleIcon,
                                selected && styles.editVehicleIconSelected,
                              ]}>
                                <Ionicons
                                  name={TRIP_REQUEST_VEHICLE_ICONS[option.vehicleType]}
                                  size={20}
                                  color={unavailable ? Colors.gray[400] : selected ? Colors.primary : Colors.gray[700]}
                                />
                              </View>
                              <View style={styles.editVehicleCopy}>
                                <Text style={[
                                  styles.editVehicleName,
                                  unavailable && styles.editVehicleTextDisabled,
                                ]}>
                                  {option.displayName}
                                </Text>
                                <Text style={[
                                  styles.editVehicleMeta,
                                  unavailable && styles.editVehicleTextDisabled,
                                ]}>
                                  {detail}
                                </Text>
                              </View>
                              <View style={styles.editVehiclePriceBlock}>
                                <Text style={[
                                  styles.editVehiclePrice,
                                  unavailable && styles.editVehicleTextDisabled,
                                ]}>
                                  {price}
                                </Text>
                                {!unavailable ? <Text style={styles.editVehiclePriceUnit}>par place</Text> : null}
                              </View>
                              <Ionicons
                                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                size={20}
                                color={unavailable ? Colors.gray[300] : selected ? Colors.primary : Colors.gray[300]}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Capacité & Prix */}
                    <View style={styles.editSection}>
                      <View style={styles.editSectionHeader}>
                        <Ionicons name="people" size={20} color={Colors.info} />
                        <Text style={styles.editSectionTitle}>Capacité & Budget</Text>
                      </View>
                      <View style={styles.editRowInputs}>
                        <View style={{flex: 1}}>
                          <Text style={styles.editLabel}>Places demandées (facultatif)</Text>
                          <TextInput
                            style={styles.editInput}
                            keyboardType="numeric"
                            placeholder="Ex: 1"
                            value={editNumberOfSeats}
                            onChangeText={setEditNumberOfSeats}
                          />
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={styles.editLabel}>Prix max/place (FC)</Text>
                          <TextInput
                            style={styles.editInput}
                            keyboardType="numeric"
                            placeholder="Ex: 5000"
                            value={editMaxPricePerSeat}
                            onChangeText={(value) => {
                              setEditMaxPricePerSeat(value);
                              setEditHasEditedBudget(true);
                            }}
                          />
                        </View>
                      </View>
                    </View>

                    {/* Description */}
                    <View style={styles.editSection}>
                      <Text style={styles.editLabel}>Note pour le conducteur (optionnel)</Text>
                      <TextInput
                        style={[styles.editInput, styles.editTextArea]}
                        multiline
                        numberOfLines={4}
                        placeholder="Bagages, contraintes horaires, précisions..."
                        value={editDescription}
                        onChangeText={setEditDescription}
                      />
                    </View>
                  </ScrollView>

                  {/* Actions fixes en bas */}
                  <View style={styles.editModalFooter}>
                    <TouchableOpacity style={styles.editModalCancelButton} onPress={() => setShowEditForm(false)}>
                      <Text style={styles.editModalCancelText}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.editModalSaveButton,
                        (!isEditFormValid || isEditVehicleOptionsLoading) && styles.editModalSaveButtonDisabled
                      ]}
                      onPress={handleUpdateRequest}
                      disabled={isUpdating || isEditVehicleOptionsLoading || !isEditFormValid}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="save-outline" size={18} color={Colors.white} />
                          <Text style={styles.editModalSaveText}>Enregistrer</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          )}
        {/* Location Picker Modal pour la modification */}
        {editLocationPickerType && (
          <LocationPickerModal
            visible={editActivePicker !== null}
            onClose={restoreEditFormAfterLocationPicker}
            onSelect={(location) => {
              if (editLocationPickerType === 'departure') {
                setEditDepartureLocation(location);
                setEditDepartureManualAddress(location.title || location.address);
              } else {
                setEditArrivalLocation(location);
                setEditArrivalManualAddress(location.title || location.address);
              }
              setEditAddressInputMode('map');
              restoreEditFormAfterLocationPicker();
            }}
            initialLocation={
              editLocationPickerType === 'departure' ? editDepartureLocation : editArrivalLocation
            }
          />
        )}

        <LocationPickerModal
          visible={routeOverridePickerTarget !== null}
          onClose={restoreDirectAcceptModalAfterLocationPicker}
          onSelect={handleRouteOverrideSelected}
          initialLocation={
            routeOverridePickerTarget === 'directDeparture'
              ? directAcceptDepartureLocation
              : routeOverridePickerTarget === 'directArrival'
                ? directAcceptArrivalLocation
                : null
          }
          title={
            routeOverridePickerTarget === 'directArrival'
              ? 'Point d’arrivée'
              : 'Point de départ'
          }
        />

      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Styles pour le formulaire d'offre en deux étapes
  offerStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  offerStepContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  offerStepCircle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gray[300],
  },
  offerStepCircleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  offerStepNumber: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
  },
  offerStepNumberActive: {
    color: Colors.white,
  },
  offerStepLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  offerStepLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  offerStepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.gray[300],
    marginHorizontal: Spacing.md,
    maxWidth: 60,
  },
  offerStepLineActive: {
    backgroundColor: Colors.primary,
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  nextButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  offerBackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
  },
  offerBackButtonText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.base,
  },
  // Styles pour la preview
  previewContainer: {
    gap: Spacing.lg,
  },
  previewTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  acceptanceNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.info + '30',
    marginBottom: Spacing.md,
  },
  acceptanceNoticeText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.info,
    lineHeight: 20,
    fontWeight: FontWeights.medium,
  },
  previewSection: {
    marginBottom: Spacing.lg,
  },
  previewSectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.md,
  },
  previewVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.primary + '08',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  previewVehicleInfo: {
    flex: 1,
  },
  previewVehicleBrand: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  previewVehicleDetails: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  previewInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  previewInfoText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  previewTotalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    marginTop: Spacing.sm,
  },
  previewTotalLabel: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  previewTotalAmount: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  previewMessageCard: {
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  previewMessageText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    lineHeight: 22,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.gray[50],
  },
  driverContent: {
    backgroundColor: Colors.gray[50],
  },
  ownerHeroCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  ownerRequestHeroCard: {
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.xl,
    shadowColor: Colors.gray[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  driverHeroCard: {
    borderTopWidth: 4,
    borderColor: Colors.primary + '28',
    borderTopColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    shadowColor: Colors.gray[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  ownerHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverHeroStatusBadge: {
    minHeight: 30,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  driverHeroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  driverHeroStatusText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ownerHeroStatusBadge: {
    minHeight: 30,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ownerHeroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  ownerHeroStatusText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ownerHeroCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  ownerHeroCounterText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ownerHeroTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    lineHeight: 26,
  },
  ownerHeroSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  ownerHeroLead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  ownerHeroLeadIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerHeroLeadCopy: {
    flex: 1,
    minWidth: 0,
  },
  ownerHeroRouteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ownerHeroRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 5,
    backgroundColor: Colors.white,
  },
  ownerHeroRouteSquare: {
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  ownerHeroRouteInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    paddingRight: 46,
  },
  ownerHeroRouteLine: {
    width: 1,
    height: 18,
    backgroundColor: Colors.gray[200],
    marginLeft: 5,
    marginVertical: 6,
  },
  driverRouteCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.gray[900],
    overflow: 'hidden',
  },
  driverRouteLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  driverRouteText: {
    marginTop: 4,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.white,
    lineHeight: 22,
  },
  driverRouteLine: {
    backgroundColor: Colors.gray[600],
  },
  driverMapIconButton: {
    position: 'absolute',
    right: Spacing.sm,
    top: Spacing.sm,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMapIconButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  driverMapIconButtonPressed: {
    opacity: 0.72,
  },
  driverMapIconButtonDisabled: {
    borderColor: Colors.gray[700],
    backgroundColor: Colors.gray[800],
    opacity: 0.72,
  },
  driverInlineMapFrame: {
    height: 180,
    marginHorizontal: -Spacing.md,
    marginTop: Spacing.md,
    marginBottom: -Spacing.md,
    overflow: 'hidden',
    backgroundColor: Colors.gray[200],
  },
  driverInlineMap: {
    width: '100%',
    height: '100%',
  },
  driverMapCaption: {
    position: 'absolute',
    left: Spacing.md,
    top: Spacing.md,
    minHeight: 26,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    shadowColor: Colors.gray[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  driverMapCaptionText: {
    color: Colors.gray[800],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  driverMapMarker: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.full,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.gray[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  driverMapMarkerDeparture: {
    backgroundColor: Colors.success,
  },
  driverMapMarkerArrival: {
    backgroundColor: Colors.primary,
  },
  driverMapMarkerCore: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
  },
  driverVehicleSpotlight: {
    minHeight: 72,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    backgroundColor: Colors.primary + '08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ownerVehicleSpotlight: {
    backgroundColor: Colors.white,
    borderColor: Colors.gray[200],
  },
  driverVehicleIconShell: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  driverVehicleCopy: {
    flex: 1,
    minWidth: 0,
  },
  driverVehicleEyebrow: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  driverVehicleName: {
    marginTop: 2,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  driverVehicleHint: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 15,
  },
  driverVehicleCheck: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerVehicleChoiceIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverFactsRow: {
    minHeight: 78,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  driverFact: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: Spacing.xs,
    alignItems: 'flex-start',
  },
  driverFactDivider: {
    width: 1,
    marginHorizontal: Spacing.xs,
    backgroundColor: Colors.gray[200],
  },
  driverFactLabel: {
    marginTop: Spacing.xs,
    color: Colors.gray[500],
    fontSize: 10,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  driverFactValue: {
    marginTop: 3,
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    lineHeight: 18,
  },
  ownerPassengerKycNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '08',
    gap: Spacing.sm,
  },
  ownerPassengerKycNoticeIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  ownerPassengerKycNoticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  ownerPassengerKycNoticeTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ownerPassengerKycNoticeText: {
    marginTop: 3,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  directVehiclePicker: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.gray[200],
  },
  directVehiclePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  directVehiclePickerIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directVehiclePickerCopy: {
    flex: 1,
    minWidth: 0,
  },
  directVehiclePickerTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  directVehiclePickerSubtitle: {
    marginTop: 2,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  directVehicleRequired: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    color: Colors.primaryDark,
    backgroundColor: Colors.primary + '12',
    fontSize: 9,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  directVehicleList: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  directVehicleCard: {
    width: 158,
    minHeight: 96,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  directVehicleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  directVehicleCardPressed: {
    opacity: 0.78,
  },
  directVehicleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  directVehicleRadio: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  directVehicleRadioSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  directVehicleName: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  directVehicleDetails: {
    marginTop: 3,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
  },
  directVehicleHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  directVehicleHintText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.xs,
  },
  directPassengerKycCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  directPassengerKycCardActive: {
    borderColor: Colors.primary + '55',
    backgroundColor: Colors.primary + '08',
  },
  directPassengerKycCardPressed: {
    opacity: 0.82,
  },
  directPassengerKycIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '12',
  },
  directPassengerKycIconActive: {
    backgroundColor: Colors.primary,
  },
  directPassengerKycCopy: {
    flex: 1,
    minWidth: 0,
  },
  directPassengerKycTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  directPassengerKycSubtitle: {
    marginTop: 3,
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  directPassengerKycSwitch: {
    width: 42,
    height: 24,
    borderRadius: BorderRadius.full,
    padding: 2,
    justifyContent: 'center',
    backgroundColor: Colors.gray[300],
  },
  directPassengerKycSwitchActive: {
    backgroundColor: Colors.success,
  },
  directPassengerKycThumb: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignSelf: 'flex-start',
  },
  directPassengerKycThumbActive: {
    alignSelf: 'flex-end',
  },
  directAcceptModalIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directAcceptModalTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  directAcceptModalCard: {
    height: '85%',
    maxHeight: '85%',
  },
  directAcceptModalScrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  directAcceptSummaryCard: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  directAcceptSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  directAcceptSummaryText: {
    flex: 1,
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  directAcceptModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    backgroundColor: Colors.white,
  },
  directAcceptSecondaryButton: {
    flex: 1,
    minHeight: 48,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  directAcceptSecondaryButtonDisabled: {
    borderColor: Colors.gray[300],
    backgroundColor: Colors.gray[50],
  },
  directAcceptSecondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  directAcceptPrimaryButton: {
    flex: 1.35,
    minHeight: 48,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  directAcceptPrimaryButtonText: {
    flexShrink: 1,
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  directAcceptButtonDisabled: {
    backgroundColor: Colors.gray[400],
    opacity: 0.72,
  },
  directAcceptButtonTextDisabled: {
    color: Colors.gray[400],
  },
  ownerProgressPanel: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
  },
  ownerProgressHeader: {
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  ownerProgressTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ownerProgressCount: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  driverOverridePanel: {
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginBottom: 0,
    overflow: 'hidden',
  },
  driverOverrideToggle: {
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverOverrideTogglePressed: {
    backgroundColor: Colors.gray[100],
  },
  driverOverrideToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverOverrideToggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  driverOverrideTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  driverOverrideSubtitle: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  driverOverrideFields: {
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingTop: 0,
  },
  driverOverrideButton: {
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
  },
  driverOverrideButtonText: {
    flex: 1,
    color: Colors.gray[800],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  driverOverrideInput: {
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.md,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  ownerHeroSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  ownerHeroStep: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  ownerHeroStepDot: {
    width: '100%',
    height: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
  },
  ownerHeroStepDotActive: {
    backgroundColor: Colors.primary,
  },
  ownerHeroStepText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  ownerHeroStepTextActive: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.bold,
  },
  ownerHeroPrimaryButton: {
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  ownerHeroPrimaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  ownerHeroHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  ownerHeroHintText: {
    flex: 1,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  ownerHeroActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ownerHeroSecondaryActions: {
    marginTop: Spacing.sm,
  },
  ownerHeroGhostButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    backgroundColor: Colors.primary + '10',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  ownerHeroGhostButtonDanger: {
    backgroundColor: Colors.danger + '08',
    borderColor: Colors.danger + '24',
  },
  ownerHeroButtonPressed: {
    opacity: 0.72,
  },
  ownerHeroButtonDisabled: {
    opacity: 0.6,
  },
  ownerHeroGhostButtonText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  ownerHeroGhostButtonTextDanger: {
    color: Colors.danger,
  },
  driverHeroPassengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverHeroAvatar: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverHeroPassengerInfo: {
    flex: 1,
  },
  driverHeroRoleBadge: {
    minHeight: 28,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  driverHeroRoleBadgeText: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  driverHeroPassengerLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  driverHeroPassengerName: {
    marginTop: 2,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  editButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.danger,
    fontWeight: FontWeights.medium,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeaderWithBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  passengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  passengerDate: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  routeLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  routeText: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  routeDivider: {
    height: 1,
    backgroundColor: Colors.gray[200],
    marginVertical: Spacing.md,
    marginLeft: 28,
  },
  detailsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  detailLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  detailValue: {
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  detailSubValue: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginVertical: Spacing.md,
    marginLeft: 28,
  },
  offerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  offerCardPending: {
    borderColor: Colors.info,
    borderWidth: 1,
    backgroundColor: Colors.info + '08',
  },
  offerCardAccepted: {
    borderColor: Colors.success,
    borderWidth: 1,
    backgroundColor: Colors.success + '08',
  },
  offerCardRejected: {
    borderColor: Colors.danger,
    borderWidth: 1,
    backgroundColor: Colors.danger + '08',
  },
  offersCountBadge: {
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.full,
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  offersCountText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  offerAvatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  offerDriverText: {
    flex: 1,
    minWidth: 0,
  },
  offerDriverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverName: {
    flexShrink: 1,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  offerProBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  offerProBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  ratingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  offerDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  offerDetailText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  messageContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  messageText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontStyle: 'italic',
  },
  offerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  offerActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  acceptButton: {
    backgroundColor: Colors.success,
  },
  acceptButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  rejectButton: {
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  rejectButtonText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  successMessage: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.success + '20',
  },
  successMessageText: {
    fontSize: FontSizes.sm,
    color: Colors.success,
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.sm,
  },
  startTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
    minHeight: 46,
  },
  startTripButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  viewTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.xs,
  },
  viewTripButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.sm,
  },
  makeOfferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  makeOfferButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  offerFormCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  formTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  vehicleScrollView: {
    marginHorizontal: -Spacing.lg,
  },
  vehicleScrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  vehicleCard: {
    width: 140,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.xl,
    gap: Spacing.xs,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  vehicleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleCardBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardBrand: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehicleCardModel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  vehicleCardDetails: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  datetimeButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
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
    backgroundColor: Colors.white,
  },
  datetimeButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datetimeButtonContent: {
    flex: 1,
  },
  datetimeButtonLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    fontWeight: FontWeights.medium,
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
    backgroundColor: Colors.white,
  },
  iosPickerCloseButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  iosPickerCloseText: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  formHelperText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  locationButtonText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  dateTimeText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  input: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  referenceInput: {
    marginTop: Spacing.sm,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  priceHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.info + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  priceHintText: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    fontWeight: FontWeights.medium,
  },
  priceSuggestionsContainer: {
    marginBottom: Spacing.sm,
  },
  priceSuggestionsLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  priceSuggestions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  priceSuggestionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  priceSuggestionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priceSuggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  priceSuggestionTextActive: {
    color: Colors.white,
  },
  inputError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + '05',
  },
  errorText: {
    fontSize: FontSizes.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
  priceComparisonContainer: {
    marginTop: Spacing.sm,
  },
  priceComparisonBar: {
    height: 6,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  priceComparisonFill: {
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  priceComparisonText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  seatsSuggestionsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  seatsSuggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  seatsSuggestionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  seatsSuggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  seatsSuggestionTextActive: {
    color: Colors.white,
  },
  offerSummary: {
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  offerSummaryTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  offerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  offerSummaryText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  offerSummaryTotal: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    fontSize: FontSizes.base,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelFormButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelFormButtonText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  submitButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[400],
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalKeyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '100%',
    minHeight: '95%',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  modalContentInner: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalScrollView: {
    flexGrow: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  modalConfirmButton: {
    padding: Spacing.md,
    backgroundColor: Colors.primary,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  noOffersContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  noOffersIconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  noOffersTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  noOffersText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
    // === MODAL DE MODIFICATION ===
  editModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  editModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  editModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
    flexShrink: 1,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  editModalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  editModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  editModalSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  editModalCloseButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  editModalScrollView: {
    flexShrink: 1,
  },
  editModalScrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  editSection: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  editVehicleHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  editSectionHeaderCompact: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editVehicleSubtitle: {
    marginTop: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  editWeatherBadge: {
    minHeight: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
  },
  editWeatherBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
  },
  editVehicleLoading: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  editVehicleLoadingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  editVehicleError: {
    minHeight: 58,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.danger + '08',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  editVehicleErrorText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  editVehicleRetry: {
    minHeight: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  editVehicleRetryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  editVehicleOptionsList: {
    gap: Spacing.xs,
  },
  editVehicleOption: {
    minHeight: 66,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  editVehicleOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  editVehicleOptionDisabled: {
    borderColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
    opacity: 0.72,
  },
  editVehicleIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  editVehicleIconSelected: {
    backgroundColor: Colors.primary + '12',
  },
  editVehicleCopy: {
    flex: 1,
    minWidth: 0,
  },
  editVehicleName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  editVehicleMeta: {
    marginTop: 2,
    fontSize: 10,
    color: Colors.gray[500],
  },
  editVehiclePriceBlock: {
    alignItems: 'flex-end',
  },
  editVehiclePrice: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  editVehiclePriceUnit: {
    marginTop: 1,
    fontSize: 9,
    color: Colors.gray[500],
  },
  editVehicleTextDisabled: {
    color: Colors.gray[400],
  },
  editSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  editSectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  editInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  editInputButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  editInputButtonText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  editInputSecondary: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderColor: Colors.gray[300],
  },
  editLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  editDateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  editDateTimeLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  editDateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[100],
  },
  editDateTimeText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  editScheduleError: {
    marginTop: Spacing.sm,
    color: Colors.danger,
    fontSize: FontSizes.sm,
  },
  editIosPickerWrapper: {
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    overflow: 'hidden',
  },
  editRowInputs: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  editTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editModalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    backgroundColor: Colors.white,
  },
  editModalCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
  },
  editModalCancelText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
  },
  editModalSaveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  editModalSaveButtonDisabled: {
    backgroundColor: Colors.gray[300],
    opacity: 0.7,
  },
  editModalSaveText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  editSectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: 10,
    padding: 4,
    marginBottom: Spacing.md,
  },
  editModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  editModeChipActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  editModeChipText: {
    fontSize: 13,
    fontWeight: FontWeights.medium,
    color: Colors.gray[500],
  },
  editModeChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  editRouteCard: {
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  editRouteMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  editRouteMapDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  editRouteMapContent: {
    flex: 1,
    justifyContent: 'center',
  },
  editRouteMapType: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    marginBottom: 2,
  },
  editRouteMapValue: {
    fontSize: 14,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  editRouteDividerLine: {
    width: 1,
    height: 20,
    backgroundColor: Colors.gray[300],
    marginLeft: 16,
    marginVertical: 4,
  },
  editRouteManualItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editRouteManualDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.md,
    marginLeft: 10,
  },
  editRouteManualLabel: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  editRouteManualInput: {
    fontSize: 14,
    fontWeight: FontWeights.medium,
    color: Colors.gray[900],
    padding: 0,
    minHeight: 24,
  },
});
