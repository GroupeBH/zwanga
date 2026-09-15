import { TripImageModal } from '../../features/trip-detail/TripImageModal';
import { TripContactModal } from '../../features/trip-detail/TripContactModal';
import { TripReviewsModal } from '../../features/trip-detail/TripReviewsModal';
import { TripSummary } from '../../features/trip-detail/TripSummary';
import { TripEditModal } from '../../features/trip-detail/TripEditModal';
import { TripBookingSuccessModal } from '../../features/trip-detail/TripBookingSuccessModal';
import { TripMapModal } from '../../features/trip-detail/TripMapModal';
import { TripBookingModal } from '../../features/trip-detail/TripBookingModal';
import { TripRelativesModal } from '../../features/trip-detail/TripRelativesModal';
import { TripSosModal } from '../../features/trip-detail/TripSosModal';
import { TripVehicleDetailsModal } from '../../features/trip-detail/TripVehicleDetailsModal';
import {
  pointToLatLng,
  arrayToLatLng,
  USE_CUSTOM_MAP_MARKERS,
  USE_ANDROID_MAP_MARKER_IMAGES,
  TRIP_DETAIL_MAP_PROVIDER,
  TRIP_DETAIL_MAP_MIN_DELTA,
  TRIP_DETAIL_MAP_MAX_DELTA,
  TRIP_DETAIL_MAP_PADDING,
  LOCATION_PICKER_OPEN_DELAY_MS,
  ANDROID_TRIP_DETAIL_MARKER_ANCHOR,
  androidTripDetailMarkerImages,
  DEFAULT_MAP_REGION,
  DRC_PAYMENT_PHONE_REGEX,
  TripDetailAutoProgressEvent,
  TRIP_DETAIL_AUTO_PROGRESS_PRIORITY,
  formatTripPaymentPhone,
  findDirectConversationWithUser,
  isValidMapCoordinate,
  getLocationText,
  getLocationCoordinatesObject,
  EditTripStep,
  getLocationCoordinatesTuple,
  BOOKING_STATUS_CONFIG,
} from '../../features/trip-detail/tripDetailModel';
import { styles } from '../../features/screen-styles/app/trip/detail/index';
import LocationPickerModal, { type MapLocationSelection } from '@/components/LocationPickerModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import { Colors, Spacing } from '@/constants/styles';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useUserLocation } from '@/hooks/useUserLocation';
import { trackEvent } from '@/services/analytics';
import { trackingSocket } from '@/services/trackingSocket';
import {
  useCancelBookingMutation,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useGetTripBookingsQuery,
  useInitiateBookingPaymentMutation,
} from '@/store/api/bookingApi';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useCreateConversationMutation, useLazyListConversationsQuery } from '@/store/api/messageApi';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import { useGetTripByIdQuery, useUpdateTripMutation } from '@/store/api/tripApi';
import { useGetKycStatusQuery } from '@/store/api/userApi';
import { useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useAppSelector } from '@/store/hooks';
import { selectConversations, selectTripById, selectUser } from '@/store/selectors';
import type { Booking, TripPaymentMode } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { getApiErrorMessage, isPassengerKycRequiredError, isExtraSeatsIdentityError } from '@/utils/errorHelpers';
import { usePassengerIdentityVerification } from '@/hooks/usePassengerIdentityVerification';
import { getPassengerSeatValidation } from '@/utils/passengerSeats';
import { buildManualGeocodeQuery, mapGeocodeResponseToSelection } from '@/utils/manualAddressGeocode';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from '@/utils/reanimated';
import { getRouteInfo, type RouteInfo } from '@/utils/routeApi';
import { isPointOnRoute, splitRouteByProgress } from '@/utils/routeHelpers';
import { openExternalUrlSafely } from '@/utils/safeExternalUrl';
import { shareTrip } from '@/utils/shareHelpers';
import { isCoordinateInKinshasaBounds, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TripDetailsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const tripId = typeof params.id === 'string' ? (params.id as string) : '';
  const openEditParamValue = Array.isArray(params.openEdit) ? params.openEdit[0] : params.openEdit;
  const shouldOpenEditFromParams = openEditParamValue === '1' || openEditParamValue === 'true';
  const openEditParamKey = `${tripId}:${openEditParamValue ?? ''}`;
  const trackParam = Array.isArray(params.track) ? params.track.includes('true') : params.track === 'true'; // Permet le suivi via lien partagé
  const tripFromStore = useAppSelector((state) => selectTripById(tripId)(state));

  // Récupérer le trajet depuis l'API si pas dans le store
  // Polling intelligent basé sur le statut du trajet
  const {
    data: tripFromApi,
    isLoading: tripLoading,
    isFetching: tripFetching,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, {
    skip: !tripId,
    // Polling automatique basé sur le statut du trajet
    pollingInterval: !isFocused ? 0 : tripFromStore?.status === 'ongoing'
      ? 15000 // 15 secondes pour les trajets en cours
      : tripFromStore?.status === 'upcoming'
        ? 60000 // 60 secondes pour les trajets à venir
        : 0, // Pas de polling pour les trajets terminés/annulés
    skipPollingIfUnfocused: true,
    refetchOnFocus: true, // Rafraîchir quand l'utilisateur revient dans l'app
    refetchOnMountOrArgChange: true, // Une notification peut annoncer un démarrage ou une interruption.
    refetchOnReconnect: false,
  });

  // Utiliser le trajet de l'API en priorité, sinon celui du store
  const trip = tripFromApi || tripFromStore;

  const user = useAppSelector(selectUser);
  const conversations = useAppSelector(selectConversations);
  const { showDialog } = useDialog();
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();
  const driverPhone = trip?.driver?.phone ?? null;
  // console.log('driverPhone', driverPhone);
  const isTripDriver = Boolean(trip && user && trip.driverId === user.id);
  const {
    data: myBookings,
    isLoading: myBookingsLoading,
    isFetching: myBookingsFetching,
    refetch: refetchMyBookings,
  } = useGetMyBookingsQuery(undefined, {
    // Polling pour les réservations si le trajet est actif
    pollingInterval: !isFocused ? 0 : trip?.status === 'ongoing' ? 30_000 : trip?.status === 'upcoming' ? 60_000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: tripBookings,
    isLoading: tripBookingsLoading,
    refetch: refetchTripBookings,
  } = useGetTripBookingsQuery(tripId, {
    skip: !tripId,
    // Polling pour les réservations du trajet
    pollingInterval: !isFocused ? 0 : trip?.status === 'ongoing' ? 30_000 : trip?.status === 'upcoming' ? 60_000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    lastKnownLocation,
    requestPermission: requestDriverLocationPermission,
    stopWatching: stopDriverLocationWatching,
  } = useUserLocation({ autoRequest: false });
  const requestLocationRef = useRef(requestDriverLocationPermission);
  const stopWatchingRef = useRef(stopDriverLocationWatching);
  useEffect(() => {
    requestLocationRef.current = requestDriverLocationPermission;
    stopWatchingRef.current = stopDriverLocationWatching;
  }, [requestDriverLocationPermission, stopDriverLocationWatching]);
  const initialLiveCoordinate = useMemo(() => pointToLatLng(trip?.currentLocation ?? null), [trip?.currentLocation]);
  const [liveDriverCoordinate, setLiveDriverCoordinate] = useState(initialLiveCoordinate);
  const [liveDriverUpdatedAt, setLiveDriverUpdatedAt] = useState<string | null>(trip?.lastLocationUpdateAt ?? null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const presentedTripDetailAutoProgressKeysRef = useRef<Set<string>>(new Set());
  const highestTripDetailAutoProgressPriorityRef = useRef<Map<string, number>>(new Map());
  const tripDetailBookingStateRef = useRef<
    Map<
      string,
      {
        pickupConfirmed: boolean;
        dropoffConfirmed: boolean;
      }
    >
  >(new Map());
  useEffect(() => {
    setLiveDriverCoordinate(initialLiveCoordinate);
  }, [initialLiveCoordinate]);
  useEffect(() => {
    setLiveDriverUpdatedAt(trip?.lastLocationUpdateAt ?? null);
  }, [trip?.lastLocationUpdateAt]);
  const [updateTripMutation, { isLoading: isSavingTrip }] = useUpdateTripMutation();
  const [geocodeManualAddress] = useGeocodeMutation();
  const { data: userVehicles = [], isLoading: editVehiclesLoading } = useGetVehiclesQuery();
  const activeEditVehicles = useMemo(
    () => userVehicles.filter((vehicle) => vehicle.isActive !== false),
    [userVehicles],
  );
  const [editTripModalVisible, setEditTripModalVisible] = useState(false);
  const [editStep, setEditStep] = useState<EditTripStep>(1);
  const [editSeats, setEditSeats] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editRequiresPassengerKyc, setEditRequiresPassengerKyc] = useState(false);
  const [editDateTime, setEditDateTime] = useState<Date | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);
  const [editRouteMode, setEditRouteMode] = useState<'map' | 'manual'>('map');
  const [editDepartureSelection, setEditDepartureSelection] = useState<MapLocationSelection | null>(null);
  const [editArrivalSelection, setEditArrivalSelection] = useState<MapLocationSelection | null>(null);
  const [editDepartureManualAddress, setEditDepartureManualAddress] = useState('');
  const [editArrivalManualAddress, setEditArrivalManualAddress] = useState('');
  const [editRoutePickerTarget, setEditRoutePickerTarget] = useState<'departure' | 'arrival' | null>(null);
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const openEditModalRef = useRef<() => void>(() => undefined);
  const handledOpenEditParamKeyRef = useRef<string | null>(null);

  const getDefaultFutureDate = () => {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    return base;
  };

  const getEditBaseDate = () => {
    if (editDateTime) {
      return new Date(editDateTime);
    }
    return getDefaultFutureDate();
  };

  const applyEditDatePart = (pickedDate: Date) => {
    const base = getEditBaseDate();
    const next = new Date(base);
    next.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
    return next;
  };

  const applyEditTimePart = (pickedDate: Date) => {
    const base = getEditBaseDate();
    const next = new Date(base);
    next.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
    return next;
  };

  const openDateOrTimePicker = (mode: 'date' | 'time') => {
    const value = getEditBaseDate();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date() : undefined,
        onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) {
            return;
          }
          setEditDateTime(mode === 'date' ? applyEditDatePart(selectedDate) : applyEditTimePart(selectedDate));
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
    setEditDateTime(
      iosPickerMode === 'date' ? applyEditDatePart(selectedDate) : applyEditTimePart(selectedDate),
    );
  };

  const closeIosPicker = () => setIosPickerMode(null);

  const openEditModal = () => {
    if (!trip || !isTripDriver) return;

    const departureLat = Number(trip.departure?.lat);
    const departureLng = Number(trip.departure?.lng);
    const arrivalLat = Number(trip.arrival?.lat);
    const arrivalLng = Number(trip.arrival?.lng);

    const departureSelection =
      Number.isFinite(departureLat) && Number.isFinite(departureLng)
        ? {
            title: trip.departure?.name || 'Départ',
            address:
              trip.departure?.address || `${departureLat.toFixed(5)}, ${departureLng.toFixed(5)}`,
            latitude: departureLat,
            longitude: departureLng,
          }
        : null;
    const arrivalSelection =
      Number.isFinite(arrivalLat) && Number.isFinite(arrivalLng)
        ? {
            title: trip.arrival?.name || 'Arrivée',
            address: trip.arrival?.address || `${arrivalLat.toFixed(5)}, ${arrivalLng.toFixed(5)}`,
            latitude: arrivalLat,
            longitude: arrivalLng,
          }
        : null;

    setEditSeats(String(trip.availableSeats));
    setEditPrice(String(trip.price));
    setEditRequiresPassengerKyc(Boolean(trip.requiresPassengerKyc));
    const parsedDate = trip.departureTime ? new Date(trip.departureTime) : null;
    setEditDateTime(parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : getDefaultFutureDate());
    setEditDepartureSelection(departureSelection);
    setEditArrivalSelection(arrivalSelection);
    setEditDepartureManualAddress((trip.departure?.address || trip.departure?.name || '').trim());
    setEditArrivalManualAddress((trip.arrival?.address || trip.arrival?.name || '').trim());
    setEditRouteMode(departureSelection && arrivalSelection ? 'map' : 'manual');
    setEditRoutePickerTarget(null);
    setEditVehicleId(trip.vehicle?.id ?? trip.vehicleId ?? null);
    setEditStep(1);
    setEditTripModalVisible(true);
  };

  const closeEditModal = () => {
    setEditTripModalVisible(false);
    setEditStep(1);
    setEditSeats('');
    setEditPrice('');
    setEditRequiresPassengerKyc(false);
    setEditDateTime(null);
    setIosPickerMode(null);
    setEditRouteMode('map');
    setEditDepartureSelection(null);
    setEditArrivalSelection(null);
    setEditDepartureManualAddress('');
    setEditArrivalManualAddress('');
    setEditRoutePickerTarget(null);
    setEditVehicleId(null);
  };

  useEffect(() => {
    openEditModalRef.current = openEditModal;
  });

  useEffect(() => {
    if (!shouldOpenEditFromParams) {
      handledOpenEditParamKeyRef.current = null;
      return;
    }

    if (
      !isFocused ||
      !trip ||
      !isTripDriver ||
      editTripModalVisible ||
      handledOpenEditParamKeyRef.current === openEditParamKey
    ) {
      return;
    }

    handledOpenEditParamKeyRef.current = openEditParamKey;

    if (trip.status !== 'upcoming' && trip.status !== 'ongoing') {
      showDialog({
        variant: 'warning',
        title: 'Modification indisponible',
        message: 'Ce trajet ne peut plus être modifié.',
      });
      return;
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      openEditModalRef.current();
    });

    return () => {
      interaction.cancel?.();
    };
  }, [
    editTripModalVisible,
    isFocused,
    isTripDriver,
    openEditParamKey,
    shouldOpenEditFromParams,
    showDialog,
    trip,
  ]);

  const swapEditRoutePoints = () => {
    setEditDepartureSelection(editArrivalSelection);
    setEditArrivalSelection(editDepartureSelection);
    setEditDepartureManualAddress(editArrivalManualAddress);
    setEditArrivalManualAddress(editDepartureManualAddress);
  };

  const openEditRoutePicker = (target: 'departure' | 'arrival') => {
    Keyboard.dismiss();
    setEditTripModalVisible(false);
    setTimeout(() => {
      setEditRoutePickerTarget(target);
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  const restoreEditModalAfterRoutePicker = () => {
    setEditRoutePickerTarget(null);
    setTimeout(() => {
      setEditTripModalVisible(true);
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  const resolveManualAddressSelection = useCallback(
    async (address: string, label: string) => {
      const trimmedAddress = address.trim();
      if (!trimmedAddress) {
        return null;
      }

      try {
        const response = await geocodeManualAddress({
          address: buildManualGeocodeQuery(trimmedAddress),
          region: 'cd',
        }).unwrap();
        return mapGeocodeResponseToSelection(trimmedAddress, response);
      } catch (error) {
        console.warn(`Manual ${label} geocode failed`, error);
        return null;
      }
    },
    [geocodeManualAddress],
  );

  const handleContinueEditTrip = () => {
    const departureAddress =
      editRouteMode === 'manual'
        ? editDepartureManualAddress.trim()
        : getLocationText(editDepartureSelection, '');
    const arrivalAddress =
      editRouteMode === 'manual'
        ? editArrivalManualAddress.trim()
        : getLocationText(editArrivalSelection, '');

    if (!departureAddress || !arrivalAddress) {
      showDialog({
        variant: 'warning',
        title: 'Adresses requises',
        message: 'Indiquez un départ et une arrivée avant de continuer.',
      });
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showDialog({
        variant: 'warning',
        title: 'Trajet invalide',
        message: "Le départ et l'arrivée doivent être différents.",
      });
      return;
    }

    Keyboard.dismiss();
    setIosPickerMode(null);
    setEditStep(2);
  };

  const handleBackToEditRoute = () => {
    Keyboard.dismiss();
    setIosPickerMode(null);
    setEditStep(1);
  };

  const handleSaveTrip = async () => {
    if (!trip || !editDateTime || !isTripDriver) {
      showDialog({
        variant: 'warning',
        title: 'Action non autorisee',
        message: 'Seul le conducteur de ce trajet peut le modifier.',
      });
      return;
    }

    if (!editVehicleId) {
      showDialog({
        variant: 'warning',
        title: 'Véhicule requis',
        message: 'Sélectionnez le véhicule utilisé pour ce trajet.',
      });
      return;
    }

    const seatsValue = parseInt(editSeats, 10);
    const priceValue = trip.tripRequestId ? trip.price : parseFloat(editPrice);
    if (Number.isNaN(seatsValue) || Number.isNaN(priceValue) || seatsValue <= 0 || priceValue < 0) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: 'Veuillez vérifier le nombre de places et le prix.',
      });
      return;
    }

    const departureAddress =
      editRouteMode === 'manual'
        ? editDepartureManualAddress.trim()
        : getLocationText(editDepartureSelection, '');
    const arrivalAddress =
      editRouteMode === 'manual'
        ? editArrivalManualAddress.trim()
        : getLocationText(editArrivalSelection, '');

    if (!departureAddress || !arrivalAddress) {
      showDialog({
        variant: 'warning',
        title: 'Adresses requises',
        message: "Indiquez un départ et une arrivée avant d'enregistrer.",
      });
      return;
    }

    if (departureAddress.toLowerCase() === arrivalAddress.toLowerCase()) {
      showDialog({
        variant: 'warning',
        title: 'Trajet invalide',
        message: "Le départ et l'arrivée doivent être différents.",
      });
      return;
    }

    const currentDepartureAddress = (trip.departure?.address || trip.departure?.name || '').trim();
    const currentArrivalAddress = (trip.arrival?.address || trip.arrival?.name || '').trim();
    const departureAddressChanged = departureAddress !== currentDepartureAddress;
    const arrivalAddressChanged = arrivalAddress !== currentArrivalAddress;
    let resolvedDepartureSelection = editDepartureSelection;
    let resolvedArrivalSelection = editArrivalSelection;

    if (editRouteMode === 'manual') {
      if (departureAddressChanged || !getLocationCoordinatesTuple(resolvedDepartureSelection)) {
        const selection = await resolveManualAddressSelection(departureAddress, 'departure');
        if (!selection) {
          showDialog({
            variant: 'warning',
            title: 'Départ introuvable',
            message: 'Impossible de localiser cette adresse de départ. Vérifiez le texte ou choisissez le point sur la carte.',
          });
          return;
        }
        resolvedDepartureSelection = selection;
        setEditDepartureSelection(selection);
      }

      if (arrivalAddressChanged || !getLocationCoordinatesTuple(resolvedArrivalSelection)) {
        const selection = await resolveManualAddressSelection(arrivalAddress, 'arrival');
        if (!selection) {
          showDialog({
            variant: 'warning',
            title: 'Arrivée introuvable',
            message: "Impossible de localiser cette adresse d'arrivée. Vérifiez le texte ou choisissez le point sur la carte.",
          });
          return;
        }
        resolvedArrivalSelection = selection;
        setEditArrivalSelection(selection);
      }
    }

    const updates: {
      totalSeats: number;
      pricePerSeat?: number;
      departureDate: string;
      departureLocation?: string;
      arrivalLocation?: string;
      departureCoordinates?: [number, number];
      arrivalCoordinates?: [number, number];
      vehicleId?: string;
      requiresPassengerKyc?: boolean;
    } = {
      totalSeats: seatsValue,
      ...(trip.tripRequestId ? {} : { pricePerSeat: priceValue }),
      departureDate: editDateTime.toISOString(),
      vehicleId: editVehicleId,
      requiresPassengerKyc: editRequiresPassengerKyc,
    };

    if (departureAddressChanged) {
      updates.departureLocation = departureAddress;
    }
    if (arrivalAddressChanged) {
      updates.arrivalLocation = arrivalAddress;
    }

    const departureTuple = getLocationCoordinatesTuple(resolvedDepartureSelection);
    const arrivalTuple = getLocationCoordinatesTuple(resolvedArrivalSelection);
    const currentDepartureLat = Number(trip.departure?.lat);
    const currentDepartureLng = Number(trip.departure?.lng);
    const currentArrivalLat = Number(trip.arrival?.lat);
    const currentArrivalLng = Number(trip.arrival?.lng);

    if (
      departureTuple &&
      (departureAddressChanged ||
        !Number.isFinite(currentDepartureLat) ||
        !Number.isFinite(currentDepartureLng) ||
        Math.abs(departureTuple[1] - currentDepartureLat) > 0.000001 ||
        Math.abs(departureTuple[0] - currentDepartureLng) > 0.000001)
    ) {
      updates.departureCoordinates = departureTuple;
    }

    if (
      arrivalTuple &&
      (arrivalAddressChanged ||
        !Number.isFinite(currentArrivalLat) ||
        !Number.isFinite(currentArrivalLng) ||
        Math.abs(arrivalTuple[1] - currentArrivalLat) > 0.000001 ||
        Math.abs(arrivalTuple[0] - currentArrivalLng) > 0.000001)
    ) {
      updates.arrivalCoordinates = arrivalTuple;
    }

    try {
      await updateTripMutation({
        id: trip.id,
        updates,
      }).unwrap();
      showDialog({ variant: 'success', title: 'Succès', message: 'Le trajet a été mis à jour.' });
      closeEditModal();
      refetchTrip();
    } catch (error: any) {
      const isPassengerKycError = isPassengerKycRequiredError(error);
      showDialog({
        variant: isPassengerKycError ? 'warning' : 'danger',
        title: isPassengerKycError ? 'Identité des passagers à vérifier' : 'Erreur',
        message: isPassengerKycError
          ? "Certains passagers de ce trajet n'ont pas encore vérifié leur identité. Gardez cette exigence désactivée, ou demandez-leur de terminer leur vérification avant de l'activer."
          : getApiErrorMessage(error, 'Impossible de mettre à jour ce trajet pour le moment.'),
      });
    }
  };

  const formattedEditDate = useMemo(() => {
    if (!editDateTime) return 'Choisir la date';
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(editDateTime);
  }, [editDateTime]);

  const formattedEditTime = useMemo(() => {
    if (!editDateTime) return 'Choisir l\'heure';
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(editDateTime);
  }, [editDateTime]);

  const editDepartureDisplay = useMemo(() => {
    if (editRouteMode === 'manual') {
      return editDepartureManualAddress.trim() || 'Renseigner le départ';
    }
    return (
      editDepartureSelection?.title ||
      editDepartureSelection?.address ||
      editDepartureManualAddress.trim() ||
      'Choisir le point de départ'
    );
  }, [editDepartureManualAddress, editDepartureSelection, editRouteMode]);

  const editArrivalDisplay = useMemo(() => {
    if (editRouteMode === 'manual') {
      return editArrivalManualAddress.trim() || "Renseigner l'arrivée";
    }
    return (
      editArrivalSelection?.title ||
      editArrivalSelection?.address ||
      editArrivalManualAddress.trim() ||
      "Choisir le point d'arrivée"
    );
  }, [editArrivalManualAddress, editArrivalSelection, editRouteMode]);

  const editModalBottomPadding = Platform.OS === 'android' ? 16 : Math.max(insets.bottom, 16) + 8;

  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();
  const [initiateBookingPayment, { isLoading: isInitiatingBookingPayment }] =
    useInitiateBookingPaymentMutation();
  const [cancelBookingMutation, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [createConversation, { isLoading: isCreatingConversation }] = useCreateConversationMutation();
  const [loadConversations, { isFetching: isLookingUpConversation }] = useLazyListConversationsQuery();
  const isOpeningConversation = isCreatingConversation || isLookingUpConversation;
  const [createTripShareLink, { isLoading: isCreatingTripShareLink }] = useCreateTripShareLinkMutation();
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1); // 1: places, 2: points, 3: preview
  const [bookingSeats, setBookingSeats] = useState('1');
  const [bookingPaymentMode, setBookingPaymentMode] =
    useState<TripPaymentMode>('cash');
  const [bookingModalError, setBookingModalError] = useState('');
  const [passengerOrigin, setPassengerOrigin] = useState<MapLocationSelection | null>(null);
  const [passengerOriginManualAddress, setPassengerOriginManualAddress] = useState('');
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [passengerDestination, setPassengerDestination] = useState<MapLocationSelection | null>(null);
  const [passengerDestinationManualAddress, setPassengerDestinationManualAddress] = useState('');
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [shouldAutofillPassengerOrigin, setShouldAutofillPassengerOrigin] = useState(false);
  const [isValidatingDestination, setIsValidatingDestination] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{ visible: boolean; seats: number }>({
    visible: false,
    seats: 0,
  });
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [isDetailMapReady, setIsDetailMapReady] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [selectedReviewUserId, setSelectedReviewUserId] = useState<string | null>(null);
  const [selectedReviewUserName, setSelectedReviewUserName] = useState<string | null>(null);
  const { shouldShow: shouldShowTripGuide, complete: completeTripGuide } =
    useTutorialGuide('trip_detail_screen');
  const [tripGuideVisible, setTripGuideVisible] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }> | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState<Date | null>(null);
  const [calculatedArrivalTime, setCalculatedArrivalTime] = useState<Date | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [vehicleDetailModalVisible, setVehicleDetailModalVisible] = useState(false);
  const securityModalTransitionRef = useRef(false);
  const securityModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refetch: refetchKycStatus } = useGetKycStatusQuery();
  const { data: driverReviews } = useGetReviewsQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });
  const { data: driverAverageData } = useGetAverageRatingQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setIsDetailMapReady(false);
      setMapModalVisible(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      // Give the previous screen's native map one frame to detach after the
      // navigation animation. Mounting both maps together can terminate iOS.
      timeoutId = setTimeout(() => {
        if (!cancelled) setIsDetailMapReady(true);
      }, Platform.OS === 'ios' ? 420 : 120);
    });

    return () => {
      cancelled = true;
      interactionTask.cancel();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isFocused, tripId]);

  useEffect(() => () => {
    if (securityModalTimerRef.current) clearTimeout(securityModalTimerRef.current);
    if (sosModalTimerRef.current) clearTimeout(sosModalTimerRef.current);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchTrip(),
        refetchMyBookings(),
        refetchTripBookings(),
        refetchKycStatus(),
      ]);
    } catch (error) {
      console.warn('Error refreshing trip data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchTrip, refetchMyBookings, refetchTripBookings, refetchKycStatus]);
  const driverReviewCount = driverReviews?.length ?? 0;
  const rawDriverReviewAverage =
    driverAverageData?.averageRating ??
    (driverReviewCount && driverReviews
      ? driverReviews.reduce((sum, review) => sum + review.rating, 0) / driverReviewCount
      : trip?.driverRating ?? 0);
  const parsedDriverReviewAverage = Number(rawDriverReviewAverage);
  const driverReviewAverage = Number.isFinite(parsedDriverReviewAverage)
    ? parsedDriverReviewAverage
    : 0;

  const refreshBookingLists = () => {
    refetchMyBookings();
    refetchTripBookings();
  };

  useEffect(() => {
    presentedTripDetailAutoProgressKeysRef.current.clear();
    highestTripDetailAutoProgressPriorityRef.current.clear();
    tripDetailBookingStateRef.current.clear();
  }, [tripId]);

  useEffect(() => {
    if (shouldShowTripGuide) {
      setTripGuideVisible(true);
    }
  }, [shouldShowTripGuide]);

  const dismissTripGuide = () => {
    setTripGuideVisible(false);
    completeTripGuide();
  };

  const pulseAnim = useSharedValue(1);

  // console.log('trip', trip);

  useEffect(() => {
    if (trip?.status === 'ongoing') {
      pulseAnim.value = withRepeat(
        withTiming(1.2, { duration: 1000 }),
        -1,
        true
      );
    }
  }, [trip?.status]);

  useEffect(() => {
    if (!trip || !isTripDriver || trip.status !== 'ongoing') {
      stopWatchingRef.current?.();
      return;
    }
    requestLocationRef.current?.();
    return () => {
      stopWatchingRef.current?.();
    };
  }, [trip?.id, trip?.status, isTripDriver]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const activeBooking = useMemo(() => {
    if (!trip || !myBookings) {
      return null;
    }
    return (
      myBookings.find(
        (booking: any) =>
          booking.tripId === trip.id &&
          (booking.status === 'pending' || booking.status === 'accepted' || booking.status === 'completed'),
      ) ?? null
    );
  }, [myBookings, trip]);
  const bookingForTrip = useMemo(() => {
    if (!trip || !myBookings) {
      return null;
    }
    return myBookings.find((booking: any) => booking.tripId === trip.id) ?? null;
  }, [myBookings, trip]);
  const hasAcceptedBooking = activeBooking?.status === 'accepted';
  // Activer le suivi live uniquement pour un trajet en cours.
  const canTrackTrip = Boolean(
    trip &&
    trip.status === 'ongoing' &&
    user &&
    (isTripDriver || hasAcceptedBooking || trackParam)
  );

  const getTripDetailPassengerName = useCallback(
    (bookingId: string) => {
      const matchedBooking =
        tripBookings?.find((booking) => booking.id === bookingId) ??
        myBookings?.find((booking) => booking.id === bookingId) ??
        null;

      return matchedBooking?.passengerName || 'Le passager';
    },
    [myBookings, tripBookings],
  );

  const presentTripDetailAutoProgressEvent = useCallback(
    (event: TripDetailAutoProgressEvent) => {
      if (!trip || !user) {
        return;
      }

      if (event.type === 'driver_near_destination' || event.type === 'driver_arrived_destination') {
        if (!isTripDriver) {
          return;
        }

        const key = `${trip.id}:${event.type}`;
        if (presentedTripDetailAutoProgressKeysRef.current.has(key)) {
          return;
        }

        const roundedDistance =
          typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
            ? Math.max(1, Math.round(event.distanceMeters))
            : null;
        const isTripCompletedEvent = event.type === 'driver_arrived_destination';
        const distanceText = roundedDistance
          ? isTripCompletedEvent
            ? ` Arrivée détectée a ${roundedDistance} m.`
            : ` Distance détectée: ${roundedDistance} m.`
          : '';
        const isReachedZone =
          !isTripCompletedEvent && roundedDistance !== null && roundedDistance <= 10;

        presentedTripDetailAutoProgressKeysRef.current.add(key);
        showDialog({
          variant: isTripCompletedEvent ? 'success' : 'info',
          icon: 'flag',
          title: isTripCompletedEvent
            ? 'Trajet terminé'
            : isReachedZone
              ? 'Destination finale atteinte'
              : 'Destination finale proche',
          message: isTripCompletedEvent
            ? `Vous avez atteint la destination finale.${distanceText}`
            : isReachedZone
              ? `Le point d'arrivée du trajet est atteint. Le trajet sera terminé automatiquement dans 10 minutes si le véhicule reste sur place.${distanceText}`
              : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
        });
        return;
      }

      if (!event.bookingId) {
        return;
      }

      const passengerBookingId = activeBooking?.id ?? bookingForTrip?.id ?? null;
      const isPassengerEvent = passengerBookingId === event.bookingId;

      if (!isTripDriver && !isPassengerEvent) {
        return;
      }

      if (event.type === 'driver_near_pickup' && !isPassengerEvent) {
        return;
      }

      if (event.type === 'passenger_ready_pickup' && !isTripDriver) {
        return;
      }

      const key = `${trip.id}:${event.type}:${event.bookingId}`;
      if (presentedTripDetailAutoProgressKeysRef.current.has(key)) {
        return;
      }

      const nextPriority = TRIP_DETAIL_AUTO_PROGRESS_PRIORITY[event.type];
      const highestPriorityForBooking =
        highestTripDetailAutoProgressPriorityRef.current.get(event.bookingId) ?? -1;
      if (highestPriorityForBooking > nextPriority) {
        return;
      }

      const passengerName = getTripDetailPassengerName(event.bookingId);
      const roundedDistance =
        typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
          ? Math.max(10, Math.round(event.distanceMeters / 10) * 10)
          : null;
      const distanceText = roundedDistance ? ` Distance détectée: environ ${roundedDistance} m.` : '';

      const dialogByType: Record<
        Exclude<
          TripDetailAutoProgressEvent['type'],
          'driver_near_destination' | 'driver_arrived_destination'
        >,
        {
          variant: 'info' | 'success' | 'warning' | 'danger';
          icon: keyof typeof Ionicons.glyphMap;
          title: string;
          message: string;
        }
      > = {
        driver_near_pickup: {
          variant: 'info',
          icon: 'car-sport',
          title: 'Le conducteur sera bient\u00f4t l\u00e0',
          message: `Le conducteur sera bient\u00f4t au point de r\u00e9cup\u00e9ration.${distanceText}`,
        },
        driver_arrived_pickup: {
          variant: 'info',
          icon: 'location',
          title: isTripDriver ? 'Point de r\u00e9cup\u00e9ration atteint' : 'Le conducteur est l\u00e0',
          message: isTripDriver
            ? `Vous \u00eates arriv\u00e9 au point de r\u00e9cup\u00e9ration de ${passengerName}.`
            : 'Le conducteur est arriv\u00e9 au point de r\u00e9cup\u00e9ration. Vous pouvez vous signaler.',
        },
        parties_nearby: {
          variant: 'info',
          icon: 'people',
          title: isTripDriver ? 'Passager pr\u00eat \u00e0 embarquer' : 'Vous \u00eates au point',
          message: isTripDriver
            ? `${passengerName} est l\u00e0 et pr\u00eat \u00e0 \u00eatre embarqu\u00e9.`
            : 'Vous \u00eates au point de r\u00e9cup\u00e9ration. Signalez-vous au conducteur si vous \u00eates pr\u00eat.',
        },
        passenger_ready_pickup: {
          variant: 'success',
          icon: 'hand-left',
          title: "Le passager s'est signal\u00e9",
          message: `${passengerName} indique qu'il est au point de r\u00e9cup\u00e9ration.`,
        },
        pickup_confirmed: {
          variant: 'success',
          icon: 'checkmark-circle',
          title: isTripDriver ? 'Passager embarqu\u00e9' : 'Prise en charge confirm\u00e9e',
          message: isTripDriver
            ? `${passengerName} a \u00e9t\u00e9 embarqu\u00e9. Vous pouvez continuer vers sa destination.`
            : 'Votre prise en charge est confirm\u00e9e. Vous \u00eates maintenant en route vers votre destination.',
        },
        passenger_no_show: {
          variant: 'info',
          icon: 'person-remove',
          title: isTripDriver ? 'Passager non embarqu\u00e9' : 'Non-embarquement d\u00e9tect\u00e9',
          message: isTripDriver
            ? `${passengerName} n'a pas \u00e9t\u00e9 embarqu\u00e9. La r\u00e9servation est cl\u00f4tur\u00e9e sans paiement.`
            : "Votre embarquement n'a pas \u00e9t\u00e9 d\u00e9tect\u00e9. Aucun paiement n'est effectu\u00e9.",
        },
        passenger_boarding_uncertain: {
          variant: 'warning',
          icon: 'help-circle',
          title: 'Embarquement non confirmé',
          message: isTripDriver
            ? `Le trajet est arrivé à destination sans preuve GPS suffisante de l'embarquement de ${passengerName}. La réservation est clôturée sans paiement.`
            : "Le trajet est arrivé à destination sans preuve GPS suffisante de votre embarquement. Aucun paiement n'est effectué.",
        },
        passenger_near_destination: {
          variant: 'info',
          icon: 'flag',
          title: isTripDriver ? 'Destination passager proche' : 'Votre arrivée approche',
          message: isTripDriver
            ? `Le point d'arrivée de ${passengerName} va être atteint.${distanceText}`
            : `Votre point d'arrivée va être atteint.${distanceText}`,
        },
        dropoff_confirmed: {
          variant: 'success',
          icon: 'flag',
          title: isTripDriver ? 'Destination atteinte' : 'Arriv\u00e9e confirm\u00e9e',
          message: isTripDriver
            ? `Nous sommes arriv\u00e9s au point de destination de ${passengerName}.`
            : 'Votre arriv\u00e9e \u00e0 destination est confirm\u00e9e.',
        },
      };

      const dialog = dialogByType[event.type];
      presentedTripDetailAutoProgressKeysRef.current.add(key);
      highestTripDetailAutoProgressPriorityRef.current.set(event.bookingId, nextPriority);
      showDialog(dialog);
    },
    [
      activeBooking?.id,
      bookingForTrip?.id,
      getTripDetailPassengerName,
      isTripDriver,
      showDialog,
      trip,
      user,
    ],
  );

  useEffect(() => {
    if (!trip || !canTrackTrip) {
      return;
    }

    const relevantBookings: Booking[] = isTripDriver
      ? tripBookings ?? []
      : ([activeBooking ?? bookingForTrip].filter(Boolean) as Booking[]);

    if (relevantBookings.length === 0) {
      return;
    }

    const nextState = new Map(tripDetailBookingStateRef.current);

    relevantBookings.forEach((booking) => {
      const pickupConfirmed = Boolean(booking.pickedUp && booking.pickedUpConfirmedByPassenger);
      const dropoffConfirmed = Boolean(
        booking.droppedOff || booking.droppedOffConfirmedByPassenger || booking.status === 'completed',
      );
      const previous = tripDetailBookingStateRef.current.get(booking.id);

      if (previous) {
        if (!previous.pickupConfirmed && pickupConfirmed) {
          presentTripDetailAutoProgressEvent({
            type: 'pickup_confirmed',
            bookingId: booking.id,
            tripId: booking.tripId,
            passengerId: booking.passengerId,
            detectedAt: new Date().toISOString(),
          });
        }

        if (!previous.dropoffConfirmed && dropoffConfirmed) {
          presentTripDetailAutoProgressEvent({
            type: 'dropoff_confirmed',
            bookingId: booking.id,
            tripId: booking.tripId,
            passengerId: booking.passengerId,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      nextState.set(booking.id, { pickupConfirmed, dropoffConfirmed });
    });

    tripDetailBookingStateRef.current = nextState;
  }, [
    activeBooking,
    bookingForTrip,
    canTrackTrip,
    isTripDriver,
    presentTripDetailAutoProgressEvent,
    trip,
    tripBookings,
  ]);

  useEffect(() => {
    if (!trip || !canTrackTrip) {
      setTrackingError(null);
      return;
    }
    let isMounted = true;
    trackingSocket
      .joinTrip(trip.id)
      .then(() => trackingSocket.requestDriverLocation(trip.id))
      .catch(() => { });

    const unsubscribeLocation = trackingSocket.subscribeToDriverLocation((payload) => {
      if (!isMounted || payload.tripId !== trip.id) {
        return;
      }
      const nextCoordinate = arrayToLatLng(payload.coordinates ?? null);
      setLiveDriverUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      if (nextCoordinate) {
        setLiveDriverCoordinate(nextCoordinate);
        setTrackingError(null);
      } else {
        setLiveDriverCoordinate(null);
      }
    });

    const unsubscribeErrors = trackingSocket.subscribeToErrors((message) => {
      if (isMounted) {
        setTrackingError(message);
      }
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (!isMounted || payload.tripId !== trip.id || payload.events.length === 0) {
        return;
      }

      [...payload.events]
        .sort(
          (first, second) =>
            TRIP_DETAIL_AUTO_PROGRESS_PRIORITY[first.type] -
            TRIP_DETAIL_AUTO_PROGRESS_PRIORITY[second.type],
        )
        .forEach((event) => {
          presentTripDetailAutoProgressEvent(event);
        });

      void refetchTrip();
      void refetchMyBookings();
      void refetchTripBookings();
    });

    return () => {
      isMounted = false;
      trackingSocket.leaveTrip(trip.id);
      unsubscribeLocation();
      unsubscribeErrors();
      unsubscribeAutoProgress();
    };
  }, [
    trip?.id,
    trip?.status,
    canTrackTrip,
    presentTripDetailAutoProgressEvent,
    refetchMyBookings,
    refetchTrip,
    refetchTripBookings,
  ]);

  useEffect(() => {
    if (!trip || !isTripDriver || trip.status !== 'ongoing') {
      return;
    }
    const coords = lastKnownLocation?.coords;
    if (!coords) {
      return;
    }
    trackingSocket.updateDriverLocation(trip.id, [Number(coords.longitude), Number(coords.latitude)]);
  }, [
    trip?.id,
    trip?.status,
    isTripDriver,
    lastKnownLocation?.coords?.latitude,
    lastKnownLocation?.coords?.longitude,
  ]);

  const availableSeats = trip && Number.isFinite(trip.availableSeats) ? Math.max(0, Math.floor(trip.availableSeats)) : 0;
  const seatLimit = availableSeats;
  const openPassengerIdentityVerification = usePassengerIdentityVerification(
    () => setBookingModalVisible(false),
    () => setBookingModalVisible(true),
  );
  const progress = trip?.progress || 0;
  const trackingStatusTitle = liveDriverCoordinate ? 'Suivi en direct' : 'Position estimée';
  const trackingStatusSubtitle = useMemo(() => {
    if (trackingError) {
      return trackingError;
    }
    if (!liveDriverCoordinate) {
      return isTripDriver
        ? 'Partage automatique activé dès que la localisation est disponible.'
        : "Le conducteur n’a pas encore partagé sa position.";
    }
    if (!liveDriverUpdatedAt) {
      return 'Mise à jour en cours...';
    }
    const timestamp = new Date(liveDriverUpdatedAt).getTime();
    if (Number.isNaN(timestamp)) {
      return `Mise à jour à ${new Date(liveDriverUpdatedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    const diffMs = Date.now() - timestamp;
    if (diffMs < 60 * 1000) {
      return 'Mis à jour il y a quelques secondes';
    }
    if (diffMs < 60 * 60 * 1000) {
      const mins = Math.floor(diffMs / (60 * 1000));
      return `Mis à jour il y a ${mins} min`;
    }
    return `Mis à jour à ${new Date(liveDriverUpdatedAt).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, [isTripDriver, liveDriverCoordinate, liveDriverUpdatedAt, trackingError]);
  const activeBookingStatus = activeBooking && activeBooking.status in BOOKING_STATUS_CONFIG
    ? BOOKING_STATUS_CONFIG[activeBooking.status as keyof typeof BOOKING_STATUS_CONFIG]
    : null;
  const canAccessTripSecurity = Boolean(trip && user);
  const tripSecurityRole: 'driver' | 'passenger' = isTripDriver ? 'driver' : 'passenger';
  const tripSecurityBookingId = isTripDriver ? undefined : (activeBooking?.id ?? bookingForTrip?.id);
  const tripVehicleIdentity = useMemo(() => {
    if (!trip) return 'Informations véhicule indisponibles.';
    if (trip.vehicle) {
      const parts = [`${trip.vehicle.brand} ${trip.vehicle.model}`.trim()];
      if (trip.vehicle.color) {
        parts.push(trip.vehicle.color);
      }
      if (trip.vehicle.licensePlate) {
        parts.push(`Plaque ${trip.vehicle.licensePlate}`);
      }
      return parts.filter(Boolean).join(' • ');
    }
    return trip.vehicleInfo || 'Informations véhicule indisponibles.';
  }, [trip]);
  const showPassengerVehicleReminder =
    !isTripDriver &&
    Boolean(activeBooking && (activeBooking.status === 'pending' || activeBooking.status === 'accepted'));
  const showDriverVehicleReminder = isTripDriver && (trip?.status === 'upcoming' || trip?.status === 'ongoing');
  const showPassengerSecurityAccess = !isTripDriver;
  const isPassengerSecurityLocked = showPassengerSecurityAccess && !activeBooking;
  const passengerTrustedContactsHint = !activeBooking
    ? 'Après réservation'
    : activeBooking.status === 'pending'
      ? 'Après acceptation'
      : activeBooking.status === 'accepted'
        ? 'Ajouter ou choisir'
        : 'Modifier la liste';
  const trustedContactsActionLabel = canAccessTripSecurity
    ? 'Ajouter / notifier mes proches'
    : 'Connectez-vous';
  const defaultPassengerOriginSelection = useMemo<MapLocationSelection | null>(() => {
    const latitude = Number(lastKnownLocation?.coords?.latitude);
    const longitude = Number(lastKnownLocation?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      title: 'Ma position actuelle',
      address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
  }, [lastKnownLocation?.coords?.latitude, lastKnownLocation?.coords?.longitude]);
  const defaultPassengerDestinationSelection = useMemo<MapLocationSelection | null>(() => {
    const coordinate = normalizeTripMapCoordinate(trip?.arrival?.lat, trip?.arrival?.lng);
    if (!coordinate) {
      return null;
    }
    return {
      title: trip?.arrival?.name || trip?.arrival?.address || 'Arrivée du trajet',
      address:
        trip?.arrival?.address ||
        `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };
  }, [trip?.arrival?.address, trip?.arrival?.lat, trip?.arrival?.lng, trip?.arrival?.name]);
  const passengerOriginDisplay = useMemo(
    () =>
      getLocationText(passengerOrigin, passengerOriginManualAddress) ||
      trip?.departure?.address ||
      trip?.departure?.name ||
      '',
    [passengerOrigin, passengerOriginManualAddress, trip?.departure?.address, trip?.departure?.name],
  );
  const passengerDestinationDisplay = useMemo(
    () =>
      getLocationText(passengerDestination, passengerDestinationManualAddress) ||
      trip?.arrival?.address ||
      trip?.arrival?.name ||
      '',
    [passengerDestination, passengerDestinationManualAddress, trip?.arrival?.address, trip?.arrival?.name],
  );
  const openBookingModal = () => {
    if (trip?.requiresPassengerKyc && !isIdentityVerified) {
      checkIdentity('book');
      return;
    }

    const autoOrigin = defaultPassengerOriginSelection;
    setBookingSeats('1');
    setBookingPaymentMode('cash');
    setBookingModalError('');
    setPassengerOrigin(autoOrigin);
    setPassengerOriginManualAddress('');
    setPassengerDestination(defaultPassengerDestinationSelection);
    setPassengerDestinationManualAddress('');
    setShouldAutofillPassengerOrigin(!autoOrigin);
    setBookingStep(1);
    setBookingModalVisible(true);
    if (!autoOrigin) {
      void requestDriverLocationPermission();
    }
  };

  const openSosModal = () => {
    if (sosModalTimerRef.current) {
      clearTimeout(sosModalTimerRef.current);
      sosModalTimerRef.current = null;
    }
    setIsDetailMapReady(false);
    setSosModalVisible(true);
  };

  const closeSosModal = () => {
    setSosModalVisible(false);
    if (sosModalTimerRef.current) {
      clearTimeout(sosModalTimerRef.current);
    }
    sosModalTimerRef.current = setTimeout(() => {
      if (isFocused && !securityModalVisible) setIsDetailMapReady(true);
      sosModalTimerRef.current = null;
    }, 300);
  };

  const openTripSecurityModal = () => {
    if (!canAccessTripSecurity) {
      showDialog({
        variant: 'info',
        title: 'Sécurité indisponible',
        message: 'Connectez-vous pour gérer vos proches et le suivi de sécurité.',
      });
      return;
    }
    void refetchTrip();
    void refetchMyBookings();
    void refetchTripBookings();
    if (securityModalTransitionRef.current) return;

    securityModalTransitionRef.current = true;
    setIsDetailMapReady(false);
    securityModalTimerRef.current = setTimeout(() => {
      setSecurityModalVisible(true);
      securityModalTransitionRef.current = false;
      securityModalTimerRef.current = null;
    }, 100);
  };

  const closeTripSecurityModal = () => {
    if (securityModalTransitionRef.current) return;

    securityModalTransitionRef.current = true;
    setSecurityModalVisible(false);
    securityModalTimerRef.current = setTimeout(() => {
      if (isFocused) setIsDetailMapReady(true);
      securityModalTransitionRef.current = false;
      securityModalTimerRef.current = null;
    }, 400);
  };

  const closeBookingModal = () => {
    if (isBooking) {
      return;
    }
    setBookingModalVisible(false);
    setBookingStep(1);
    setShouldAutofillPassengerOrigin(false);
    setPassengerOriginManualAddress('');
    setPassengerDestinationManualAddress('');
  };

  const openBookingLocationPicker = (target: 'origin' | 'destination') => {
    Keyboard.dismiss();
    setBookingModalVisible(false);
    setTimeout(() => {
      if (target === 'origin') {
        setShowOriginPicker(true);
      } else {
        setShowDestinationPicker(true);
      }
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  const restoreBookingModalAfterLocationPicker = () => {
    setShowOriginPicker(false);
    setShowDestinationPicker(false);
    setTimeout(() => {
      setBookingModalVisible(true);
    }, LOCATION_PICKER_OPEN_DELAY_MS);
  };

  useEffect(() => {
    if (
      !bookingModalVisible ||
      !shouldAutofillPassengerOrigin ||
      passengerOrigin ||
      !defaultPassengerOriginSelection
    ) {
      return;
    }
    setPassengerOrigin(defaultPassengerOriginSelection);
    setShouldAutofillPassengerOrigin(false);
  }, [
    bookingModalVisible,
    shouldAutofillPassengerOrigin,
    passengerOrigin,
    defaultPassengerOriginSelection,
  ]);

  const goToNextBookingStep = () => {
    if (bookingStep === 1) {
      // Valider le nombre de places avant de continuer
      const seatsValue = parseInt(bookingSeats, 10);
      if (isNaN(seatsValue) || seatsValue < 1) {
        setBookingModalError('Veuillez entrer un nombre de places valide');
        return;
      }
      if (seatsValue > seatLimit) {
        setBookingModalError(`Maximum ${seatLimit} place(s) disponible(s)`);
        return;
      }
      const seatError = getPassengerSeatValidation(seatsValue, isIdentityVerified, seatLimit);
      if (seatError) {
        setBookingModalError(seatError.message);
        return;
      }
      setBookingModalError('');
      setBookingStep(2);
    } else if (bookingStep === 2) {
      setBookingModalError('');
      setBookingStep(3);
    }
  };

  const goToPreviousBookingStep = () => {
    if (bookingStep === 2) {
      setBookingStep(1);
    } else if (bookingStep === 3) {
      setBookingStep(2);
    }
  };

  const openBookingSuccessModal = (seats: number) => {
    setBookingSuccess({ visible: true, seats });
  };

  const closeBookingSuccessModal = () => {
    if (isBooking) {
      return;
    }
    setBookingSuccess({ visible: false, seats: 0 });
  };

  const handleViewBookings = () => {
    closeBookingSuccessModal();
    router.push('/bookings');
  };

  const handleContactDriver = async () => {
    if (!trip || !user || trip.driverId === user.id) {
      return;
    }

    try {
      const localConversation = findDirectConversationWithUser(conversations, user.id, trip.driverId);
      const remoteConversations = localConversation
        ? undefined
        : (await loadConversations({ page: 1, limit: 100 }).unwrap()).data;
      const existingConversation =
        localConversation ??
        findDirectConversationWithUser(remoteConversations, user.id, trip.driverId);
      const conversation =
        existingConversation ??
        (await createConversation({
          participantIds: [trip.driverId],
        }).unwrap());

      void trackEvent('conversation_opened', {
        source_screen: 'trip_details',
        trip_id: trip.id,
        has_booking: Boolean(activeBooking?.id),
        reused_existing_conversation: Boolean(existingConversation),
      });
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: conversation.id,
          title: trip.driverName,
        },
      });
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, "Impossible d'ouvrir la conversation pour le moment."),
      });
    }
  };

  const handleShareTrip = useCallback(async () => {
    if (!trip?.id || isCreatingTripShareLink) {
      return;
    }

    try {
      const response = await createTripShareLink({
        tripId: trip.id,
        bookingId: activeBooking?.id,
        message: 'Voici le lien pour suivre mon trajet Zwanga en temps réel.',
      }).unwrap();

      await shareTrip(
        response.publicUrl,
        trip.departure?.name ?? trip.departure?.address,
        trip.arrival?.name ?? trip.arrival?.address,
      );
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Partage impossible',
        message: getApiErrorMessage(error, 'Impossible de créer le lien web de suivi.'),
      });
    }
  }, [
    activeBooking?.id,
    createTripShareLink,
    isCreatingTripShareLink,
    showDialog,
    trip?.arrival?.address,
    trip?.arrival?.name,
    trip?.departure?.address,
    trip?.departure?.name,
    trip?.id,
  ]);

  const startElectronicPaymentForBooking = async (booking: Booking) => {
    if (!ELECTRONIC_PAYMENTS_ENABLED) {
      return;
    }

    if (
      booking.status !== 'completed' &&
      !booking.droppedOff &&
      !booking.droppedOffConfirmedByPassenger
    ) {
      showDialog({
        variant: 'info',
        title: "Paiement à l'arrivée",
        message: "Le paiement sera disponible après votre arrivée à destination.",
      });
      return;
    }

    const phone = formatTripPaymentPhone(user?.phone);
    if (!phone || !DRC_PAYMENT_PHONE_REGEX.test(phone)) {
      showDialog({
        variant: 'warning',
        title: 'Numéro Mobile Money requis',
        message:
          'Ajoutez un numéro congolais valide dans votre profil avant de lancer le paiement FlexPay.',
      });
      return;
    }

    try {
      const response = await initiateBookingPayment({
        bookingId: booking.id,
        method: 'mobile_money',
        phone,
      }).unwrap();

      if (response.payment.paymentUrl) {
        await openExternalUrlSafely(response.payment.paymentUrl, { logLabel: 'TripBookingPayment' });
      }

      showDialog({
        variant:
          response.payment.status === 'succeeded' ? 'success' : 'info',
        title:
          response.payment.status === 'succeeded'
            ? 'Paiement confirmé'
            : 'Paiement lance',
        message: getApiErrorMessage(
          { message: response.payment.message },
          'Confirmez la demande FlexPay sur votre téléphone.',
        ),
      });
      refreshBookingLists();
      return response;
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Paiement impossible',
        message: getApiErrorMessage(error, 'Impossible de lancer le paiement pour le moment.'),
      });
    }
  };

  const handlePayActiveBooking = async () => {
    if (
      !activeBooking ||
      !ELECTRONIC_PAYMENTS_ENABLED ||
      activeBooking.paymentMode !== 'electronic' ||
      isInitiatingBookingPayment
    ) {
      return;
    }

    await startElectronicPaymentForBooking(activeBooking);
  };

  const adjustBookingSeats = (delta: number) => {
    setBookingSeats((prev) => {
      const current = parseInt(prev, 10);
      const fallback = Number.isNaN(current) ? 1 : current;
      // Limiter au nombre de places disponibles
      const next = Math.min(Math.max(fallback + delta, 1), seatLimit);
      return String(next);
    });
  };

  const handleBookingSeatsChange = (value: string) => {
    // Permettre seulement les chiffres
    const numericValue = value.replace(/[^0-9]/g, '');

    if (numericValue === '') {
      setBookingSeats('');
      setBookingModalError('');
      return;
    }

    const seatsNum = parseInt(numericValue, 10);

    // Vérifier si la valeur dépasse les places disponibles
    if (seatsNum > seatLimit) {
      setBookingModalError(
        `Il ne reste que ${seatLimit} place${seatLimit > 1 ? 's' : ''} disponible${seatLimit > 1 ? 's' : ''}.`,
      );
      setBookingSeats(String(seatLimit));
      return;
    }

    // Valeur valide
    setBookingSeats(numericValue);
    setBookingModalError('');
  };

  const handleConfirmBooking = async () => {
    if (isBooking || !trip || isValidatingDestination) {
      return;
    }
    const seatsValue = parseInt(bookingSeats, 10);
    const seatError = getPassengerSeatValidation(seatsValue, isIdentityVerified, seatLimit);
    if (seatError) {
      setBookingModalError(seatError.message);
      setBookingStep(1);
      return;
    }
    if (Number.isNaN(seatsValue) || seatsValue <= 0) {
      setBookingModalError('Veuillez indiquer un nombre de places valide.');
      return;
    }
    // Vérifier si le nombre de places dépasse les places disponibles
    if (seatsValue > seatLimit) {
      setBookingModalError(
        `Il reste seulement ${seatLimit} place${seatLimit > 1 ? 's' : ''} pour ce trajet.`,
      );
      return;
    }

    setBookingModalError('');

    const manualPassengerOrigin = passengerOriginManualAddress.trim();
    const manualPassengerDestination = passengerDestinationManualAddress.trim();
    let resolvedPassengerOrigin = passengerOrigin;
    let resolvedPassengerDestination = passengerDestination;
    const shouldResolveManualPassengerPoints = Boolean(
      manualPassengerOrigin || manualPassengerDestination,
    );

    if (shouldResolveManualPassengerPoints) {
      setIsValidatingDestination(true);
    }

    if (manualPassengerOrigin) {
      const selection = await resolveManualAddressSelection(manualPassengerOrigin, 'passenger origin');
      if (!selection) {
        setIsValidatingDestination(false);
        setBookingModalError(
          'Impossible de localiser ce point de départ. Vérifiez le texte ou choisissez-le sur la carte.',
        );
        return;
      }
      resolvedPassengerOrigin = selection;
      setPassengerOrigin(selection);
    }

    if (manualPassengerDestination) {
      const selection = await resolveManualAddressSelection(
        manualPassengerDestination,
        'passenger destination',
      );
      if (!selection) {
        setIsValidatingDestination(false);
        setBookingModalError(
          "Impossible de localiser ce point d'arrivée. Vérifiez le texte ou choisissez-le sur la carte.",
        );
        return;
      }
      resolvedPassengerDestination = selection;
      setPassengerDestination(selection);
    }

    if (shouldResolveManualPassengerPoints) {
      setIsValidatingDestination(false);
    }

    const tripDepartureCoordinate = normalizeTripMapCoordinate(
      trip.departure?.lat,
      trip.departure?.lng,
    );
    const tripArrivalCoordinate = normalizeTripMapCoordinate(trip.arrival?.lat, trip.arrival?.lng);
    const isTripInsideKinshasa = Boolean(
      tripDepartureCoordinate &&
        tripArrivalCoordinate &&
        isCoordinateInKinshasaBounds(tripDepartureCoordinate) &&
        isCoordinateInKinshasaBounds(tripArrivalCoordinate),
    );

    if (
      isTripInsideKinshasa &&
      resolvedPassengerOrigin &&
      !isCoordinateInKinshasaBounds(resolvedPassengerOrigin)
    ) {
      setBookingModalError(
        'Le point de prise en charge detecté est hors Kinshasa. Choisissez-le sur la carte ou precisez la commune.',
      );
      return;
    }

    if (
      isTripInsideKinshasa &&
      resolvedPassengerDestination &&
      !isCoordinateInKinshasaBounds(resolvedPassengerDestination)
    ) {
      setBookingModalError(
        "La destination detectée est hors Kinshasa. Choisissez-la sur la carte ou precisez la commune.",
      );
      return;
    }

    const passengerOriginText = getLocationText(resolvedPassengerOrigin, manualPassengerOrigin);
    const passengerDestinationText = getLocationText(
      resolvedPassengerDestination,
      manualPassengerDestination,
    );
    const hasTripArrivalCoordinates = Boolean(tripArrivalCoordinate);
    const isDefaultTripArrivalDestination = Boolean(
      resolvedPassengerDestination &&
      hasTripArrivalCoordinates &&
      tripArrivalCoordinate &&
      Math.abs(resolvedPassengerDestination.latitude - tripArrivalCoordinate.latitude) < 0.000001 &&
      Math.abs(resolvedPassengerDestination.longitude - tripArrivalCoordinate.longitude) < 0.000001,
    );
    const hasCustomPassengerDestination = Boolean(
      (manualPassengerDestination || resolvedPassengerDestination) && !isDefaultTripArrivalDestination,
    );

    // Valider la destination seulement si le passager a choisi une destination personnalisée
    if (
      hasCustomPassengerDestination &&
      resolvedPassengerDestination &&
      routeCoordinates &&
      routeCoordinates.length >= 2
    ) {
      setIsValidatingDestination(true);
      setBookingModalError('');

      try {
        const destinationPoint = {
          latitude: resolvedPassengerDestination.latitude,
          longitude: resolvedPassengerDestination.longitude,
        };

        const isOnRoute = isPointOnRoute(destinationPoint, routeCoordinates, 5); // 5km de tolérance

        if (!isOnRoute) {
          setBookingModalError(
            'La destination sélectionnée n\'est pas sur le trajet. Veuillez choisir une destination située sur l\'itinéraire.',
          );
          setIsValidatingDestination(false);
          return;
        }
      } catch (error) {
        console.warn('Error validating destination:', error);
        setBookingModalError('Erreur lors de la validation de la destination. Veuillez réessayer.');
        setIsValidatingDestination(false);
        return;
      }

      setIsValidatingDestination(false);
    }

    try {
      const booking = await createBooking({
        tripId: trip.id,
        numberOfSeats: seatsValue,
        passengerOrigin: passengerOriginText || undefined,
        passengerOriginCoordinates: getLocationCoordinatesObject(resolvedPassengerOrigin),
        passengerDestination: hasCustomPassengerDestination
          ? passengerDestinationText || undefined
          : undefined,
        passengerDestinationCoordinates: hasCustomPassengerDestination
          ? getLocationCoordinatesObject(resolvedPassengerDestination)
          : undefined,
        paymentMode: estimatedTotal > 0 ? bookingPaymentMode : undefined,
      }).unwrap();
      void trackEvent('booking_created', {
        trip_id: trip.id,
        booking_id: booking.id,
        seats: seatsValue,
        has_custom_destination: hasCustomPassengerDestination,
        has_custom_origin: Boolean(passengerOriginText || resolvedPassengerOrigin),
        payment_mode: estimatedTotal > 0 ? bookingPaymentMode : null,
      });
      setBookingModalVisible(false);
      setBookingModalError('');
      setPassengerOrigin(null);
      setPassengerOriginManualAddress('');
      setPassengerDestination(null);
      setPassengerDestinationManualAddress('');
      setShouldAutofillPassengerOrigin(false);
      setBookingStep(1);
      openBookingSuccessModal(seatsValue);
      refreshBookingLists();
    } catch (error: any) {
      if (isPassengerKycRequiredError(error)) {
        void refetchKycStatus();
        setBookingModalError(getApiErrorMessage(error, 'Vérifiez votre identité avant de continuer.'));
        openPassengerIdentityVerification(isExtraSeatsIdentityError(error) ? 'extra_seats' : 'book');
        return;
      }

      setBookingModalError(
        getApiErrorMessage(error, 'Impossible de créer la réservation pour le moment.'),
      );
    }
  };

  const handleCancelBooking = async () => {
    if (!activeBooking) {
      return;
    }
    try {
      await cancelBookingMutation(activeBooking.id).unwrap();
      void trackEvent('booking_cancelled', {
        booking_id: activeBooking.id,
        trip_id: activeBooking.tripId,
        source_screen: 'trip_details',
      });
      showDialog({
        variant: 'success',
        title: 'Réservation annulée',
        message: 'Votre réservation a été annulée avec succès.',
      });
      refreshBookingLists();
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible d’annuler la réservation pour le moment.'),
      });
    }
  };

  const confirmCancelBooking = () => {
    if (!activeBooking) {
      return;
    }
    showDialog({
      variant: 'warning',
      title: 'Annuler la réservation',
      message: 'Souhaitez-vous vraiment annuler cette réservation ?',
      actions: [
        { label: 'Garder', variant: 'ghost' },
        { label: 'Oui, annuler', variant: 'primary', onPress: () => handleCancelBooking() },
      ],
    });
  };


  const estimatedTotal = useMemo(() => {
    const seatsValue = parseInt(bookingSeats, 10);
    if (Number.isNaN(seatsValue) || seatsValue <= 0 || !trip) {
      return 0;
    }
    return trip.price === 0 ? 0 : seatsValue * trip.price;
  }, [bookingSeats, trip?.price]);
  const activeBookingPaymentAmount = useMemo(() => {
    if (!activeBooking) return 0;
    const storedAmount = Number(activeBooking.paymentAmount ?? 0);
    if (Number.isFinite(storedAmount) && storedAmount > 0) return storedAmount;
    const tripPrice = Number(trip?.price ?? 0);
    return tripPrice > 0 ? activeBooking.numberOfSeats * tripPrice : 0;
  }, [activeBooking, trip?.price]);
  const canPayActiveBooking = Boolean(
      activeBooking &&
      ELECTRONIC_PAYMENTS_ENABLED &&
      (activeBooking.status === 'completed' ||
        activeBooking.droppedOff ||
        activeBooking.droppedOffConfirmedByPassenger) &&
      activeBooking.paymentMode === 'electronic' &&
      activeBookingPaymentAmount > 0 &&
      activeBooking.paymentStatus !== 'succeeded' &&
      activeBooking.paymentStatus !== 'not_required',
  );

  const statusConfig = {
    upcoming: { color: Colors.secondary, bgColor: 'rgba(247, 184, 1, 0.1)', label: 'À venir' },
    ongoing: { color: Colors.info, bgColor: 'rgba(52, 152, 219, 0.1)', label: 'En cours' },
    completed: { color: Colors.success, bgColor: 'rgba(46, 204, 113, 0.1)', label: 'Terminé' },
    cancelled: { color: Colors.gray[600], bgColor: Colors.gray[200], label: 'Annulé' },
  };

  const config = trip
    ? statusConfig[trip.status as keyof typeof statusConfig] ?? statusConfig.upcoming
    : statusConfig.upcoming;

  const departureCoordinate = useMemo(
    () => {
      const coordinate = normalizeTripMapCoordinate(trip?.departure?.lat, trip?.departure?.lng);
      if (!coordinate) {
        return { latitude: 0, longitude: 0 };
      }
      return coordinate;
    },
    [trip?.departure?.lat, trip?.departure?.lng],
  );

  const arrivalCoordinate = useMemo(
    () => {
      const coordinate = normalizeTripMapCoordinate(trip?.arrival?.lat, trip?.arrival?.lng);
      if (!coordinate) {
        return { latitude: 0, longitude: 0 };
      }
      return coordinate;
    },
    [trip?.arrival?.lat, trip?.arrival?.lng],
  );

  useEffect(() => {
    if (!trip?.id) {
      return;
    }

    console.log('[TripDetails] route endpoint coordinates', {
      tripId: trip?.id,
      departure: {
        raw: {
          lat: trip?.departure?.lat,
          lng: trip?.departure?.lng,
          hasCoordinates: trip?.departure?.hasCoordinates,
        },
        normalized: departureCoordinate,
      },
      arrival: {
        raw: {
          lat: trip?.arrival?.lat,
          lng: trip?.arrival?.lng,
          hasCoordinates: trip?.arrival?.hasCoordinates,
        },
        normalized: arrivalCoordinate,
      },
    });
  }, [
    arrivalCoordinate,
    departureCoordinate,
    trip?.arrival?.hasCoordinates,
    trip?.arrival?.lat,
    trip?.arrival?.lng,
    trip?.departure?.hasCoordinates,
    trip?.departure?.lat,
    trip?.departure?.lng,
    trip?.id,
  ]);

  const hasValidRouteEndpoints = useMemo(
    () => Boolean(trip && isValidMapCoordinate(departureCoordinate) && isValidMapCoordinate(arrivalCoordinate)),
    [arrivalCoordinate, departureCoordinate, trip],
  );

  // Load route coordinates and info when trip changes
  useEffect(() => {
    if (!trip || !hasValidRouteEndpoints) {
      setRouteCoordinates(null);
      setRouteInfo(null);
      setCalculatedArrivalTime(null);
      setIsLoadingRoute(false);
      return;
    }
    setIsLoadingRoute(true);
    getRouteInfo(departureCoordinate, arrivalCoordinate)
      .then((info) => {
        setRouteCoordinates(info.coordinates);
        setRouteInfo(info);

        // Calculate arrival time based on departure time + route duration
        if (info.duration > 0 && trip.departureTime) {
          const departureDate = new Date(trip.departureTime);
          const arrivalDate = new Date(departureDate.getTime() + info.duration * 1000);
          setCalculatedArrivalTime(arrivalDate);
        } else {
          setCalculatedArrivalTime(null);
        }

        setIsLoadingRoute(false);
      })
      .catch(() => {
        // Fallback to straight line if route API fails
        setRouteCoordinates([departureCoordinate, arrivalCoordinate]);
        setCalculatedArrivalTime(null);
        setIsLoadingRoute(false);
      });
  }, [departureCoordinate, arrivalCoordinate, hasValidRouteEndpoints, trip?.id, trip?.departureTime]);

  // Calculate estimated coordinate based on progress
  const estimatedCoordinate = useMemo(() => {
    if (!trip || trip.status !== 'ongoing' || typeof progress !== 'number') {
      return null;
    }
    const ratio = Math.min(Math.max(progress, 0), 100) / 100;
    return {
      latitude: departureCoordinate.latitude + (arrivalCoordinate.latitude - departureCoordinate.latitude) * ratio,
      longitude:
        departureCoordinate.longitude + (arrivalCoordinate.longitude - departureCoordinate.longitude) * ratio,
    };
  }, [arrivalCoordinate, departureCoordinate, progress, trip?.status]);

  // Calculate current coordinate for ETA calculation
  const currentCoordinate = liveDriverCoordinate ?? estimatedCoordinate;

  // Split route into traveled and remaining portions when trip is ongoing
  const routeSplit = useMemo(() => {
    if (!routeCoordinates || routeCoordinates.length < 2 || trip?.status !== 'ongoing' || !currentCoordinate) {
      return {
        traveledCoordinates: [],
        remainingCoordinates: routeCoordinates || [],
      };
    }
    return splitRouteByProgress(currentCoordinate, routeCoordinates);
  }, [routeCoordinates, trip?.status, currentCoordinate]);

  const routeMapCoordinates = useMemo(() => {
    const validRouteCoordinates = (routeCoordinates ?? []).filter(isValidMapCoordinate);
    if (validRouteCoordinates.length >= 2) {
      return validRouteCoordinates;
    }
    return hasValidRouteEndpoints ? [departureCoordinate, arrivalCoordinate] : [];
  }, [arrivalCoordinate, departureCoordinate, hasValidRouteEndpoints, routeCoordinates]);

  const hasDetailedRouteMapCoordinates = (routeCoordinates ?? []).filter(isValidMapCoordinate).length >= 2;

  const passengerDestinationMarkers = useMemo(() => {
    const markers: {
      id: string;
      coordinate: { latitude: number; longitude: number };
      title: string;
      description: string;
    }[] = [];

    tripBookings
      ?.filter((booking) => booking.status === 'accepted' && booking.passengerDestinationCoordinates)
      .forEach((booking) => {
        const destination = booking.passengerDestinationCoordinates;
        const coordinate = {
          latitude: Number(destination?.latitude),
          longitude: Number(destination?.longitude),
        };
        if (!isValidMapCoordinate(coordinate)) {
          return;
        }
        markers.push({
          id: String(booking.id),
          coordinate,
          title: booking.passengerDestination || booking.passengerName || 'Destination passager',
          description: booking.passengerName || 'Passager',
        });
      });

    return markers;
  }, [tripBookings]);

  // Calculate estimated arrival time based on current position
  useEffect(() => {
    if (!trip || !routeInfo || trip.status !== 'ongoing' || !currentCoordinate) {
      setEstimatedArrivalTime(null);
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const calculateETA = () => {
      // Calculate remaining route from current position to destination
      getRouteInfo(currentCoordinate, arrivalCoordinate)
        .then((remainingRouteInfo) => {
          if (!isMounted) return;
          const remainingDurationSeconds = remainingRouteInfo.duration;
          const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
          setEstimatedArrivalTime(estimatedArrival);
        })
        .catch(() => {
          if (!isMounted) return;
          // Fallback: use progress to estimate remaining time
          if (routeInfo.duration > 0 && typeof progress === 'number') {
            const remainingProgress = (100 - Math.min(Math.max(progress, 0), 100)) / 100;
            const remainingDurationSeconds = routeInfo.duration * remainingProgress;
            const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);
            setEstimatedArrivalTime(estimatedArrival);
          } else {
            setEstimatedArrivalTime(null);
          }
        });
    };

    // Debounce: wait 5 seconds after position change before calculating
    timeoutId = setTimeout(calculateETA, 5000);

    // Also calculate immediately if this is the first time
    calculateETA();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [trip?.status, routeInfo, currentCoordinate, arrivalCoordinate, progress]);

  const mapRegion = useMemo(() => {
    if (!hasValidRouteEndpoints) {
      return DEFAULT_MAP_REGION;
    }
    const routeFocusCoordinate =
      routeMapCoordinates.length > 2
        ? routeMapCoordinates[Math.floor(routeMapCoordinates.length / 2)]
        : null;
    const latitudeCenter =
      routeFocusCoordinate?.latitude ?? (departureCoordinate.latitude + arrivalCoordinate.latitude) / 2;
    const longitudeCenter =
      routeFocusCoordinate?.longitude ?? (departureCoordinate.longitude + arrivalCoordinate.longitude) / 2;
    const rawLatitudeDelta =
      Math.abs(departureCoordinate.latitude - arrivalCoordinate.latitude) * TRIP_DETAIL_MAP_PADDING;
    const rawLongitudeDelta =
      Math.abs(departureCoordinate.longitude - arrivalCoordinate.longitude) * TRIP_DETAIL_MAP_PADDING;
    const latitudeDelta = Math.min(
      Math.max(rawLatitudeDelta, TRIP_DETAIL_MAP_MIN_DELTA),
      TRIP_DETAIL_MAP_MAX_DELTA,
    );
    const longitudeDelta = Math.min(
      Math.max(rawLongitudeDelta, TRIP_DETAIL_MAP_MIN_DELTA),
      TRIP_DETAIL_MAP_MAX_DELTA,
    );

    return {
      latitude: latitudeCenter,
      longitude: longitudeCenter,
      latitudeDelta,
      longitudeDelta,
    };
  }, [arrivalCoordinate, departureCoordinate, hasValidRouteEndpoints, routeMapCoordinates]);

  const hasRenderableTripMap = trip?.status !== 'ongoing' && hasValidRouteEndpoints;
  const canRenderTripMap = hasRenderableTripMap && isDetailMapReady;
  const tripDepartureName = trip?.departure?.name || trip?.departure?.address || 'Départ';
  const tripArrivalName = trip?.arrival?.name || trip?.arrival?.address || 'Arrivée';
  const tripDepartureAddress = trip?.departure?.address || tripDepartureName;
  const tripArrivalAddress = trip?.arrival?.address || tripArrivalName;
  const tripDepartureTimeLabel = trip?.departureTime ? formatDateTime(trip.departureTime) : '--:--';
  const tripArrivalTimeLabel = calculatedArrivalTime
    ? formatDateTime(calculatedArrivalTime.toISOString())
    : trip?.arrivalTime
      ? formatDateTime(trip.arrivalTime)
      : '--:--';
  const tripPriceLabel = trip?.price === 0 ? 'Gratuit' : `${trip?.price ?? 0} FC`;
  const tripSeatsLabel =
    availableSeats <= 0 ? 'Complet' : `${availableSeats} place${availableSeats > 1 ? 's' : ''}`;
  const tripRouteDistanceLabel = routeInfo?.distance
    ? `${Math.max(routeInfo.distance / 1000, 0.1).toFixed(1)} km`
    : 'Trajet';
  const tripVehicleTypeLabel = trip?.vehicle
    ? getRegisteredVehicleTypeLabel(trip.vehicle.type)
    : trip?.vehicleType === 'moto'
      ? 'Moto'
      : trip?.vehicleType === 'tricycle'
        ? 'Tricycle'
        : 'Voiture';
  const tripVehicleLabel = trip?.vehicle
    ? `${trip.vehicle.brand} ${trip.vehicle.model}`.trim() || tripVehicleTypeLabel
    : tripVehicleTypeLabel;
  const tripVehicleMetaLabel = trip?.vehicle
    ? [trip.vehicle.color, trip.vehicle.licensePlate].filter(Boolean).join(' • ')
    : trip?.vehicleInfo && trip.vehicleInfo !== 'Informations véhicule fournies par le conducteur'
      ? trip.vehicleInfo
      : 'Véhicule confirmé après réservation';
  const tripVehicleIconName: keyof typeof Ionicons.glyphMap =
    trip?.vehicle?.type === 'motorcycle_2_wheels' || trip?.vehicleType === 'moto'
      ? 'bicycle'
      : trip?.vehicle?.type === 'motorcycle_3_wheels' || trip?.vehicleType === 'tricycle'
        ? 'car-sport'
        : 'car';
  const tripVehicleSeatLabel = trip
    ? `${trip.totalSeats} place${trip.totalSeats > 1 ? 's' : ''} au total`
    : null;
  const tripVehicleLicensePlate = trip?.vehicle?.licensePlate?.trim() || null;
  const tripVehicleStatusLabel = trip?.vehicle
    ? trip.vehicle.isActive === false
      ? 'Indisponible'
      : 'Actif'
    : null;
  const tripVehicleDetailRows: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string | null;
  }[] = [
    { icon: 'business-outline', label: 'Marque', value: trip?.vehicle?.brand },
    { icon: 'car-outline', label: 'Modèle', value: trip?.vehicle?.model },
    { icon: 'color-palette-outline', label: 'Couleur', value: trip?.vehicle?.color },
    { icon: 'people-outline', label: 'Places', value: tripVehicleSeatLabel },
    {
      icon: 'information-circle-outline',
      label: 'Information',
      value: !trip?.vehicle && trip?.vehicleInfo ? trip.vehicleInfo : null,
    },
  ];
  const visibleTripVehicleDetailRows = tripVehicleDetailRows.filter(
    (row): row is { icon: keyof typeof Ionicons.glyphMap; label: string; value: string } =>
      Boolean(row.value),
  );
  const headerFloatingOffset = Math.max(insets.top, 12) + 10;

  // Early return AFTER all hooks to avoid hook order violation
  if (tripLoading && !trip) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.emptyStateContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptyStateTitle}>Chargement du trajet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trip && !tripLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons name="car-sport" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.emptyStateTitle}>Trajet introuvable</Text>
          <Text style={styles.emptyStateText}>
            Ce trajet n&apos;existe plus ou a été supprimé par son propriétaire.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={goHome}>
            <Ionicons name="arrow-back" size={16} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View
        pointerEvents="box-none"
        style={[
          styles.header,
          hasRenderableTripMap && styles.headerFloating,
          hasRenderableTripMap && { paddingTop: headerFloatingOffset },
        ]}
      >
        <View pointerEvents="box-none" style={styles.headerTop}>
          <TouchableOpacity
            onPress={goHome}
            style={styles.headerCircleButton}
            activeOpacity={0.85}
            hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, hasRenderableTripMap && styles.headerTitleFloating]}>
            Détails du trajet
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={openTripSecurityModal}
              style={[styles.shareButton, !canAccessTripSecurity && styles.shareButtonDisabled]}
              disabled={!canAccessTripSecurity}
              activeOpacity={0.85}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color={canAccessTripSecurity ? Colors.primary : Colors.gray[400]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleShareTrip()}
              style={[
                styles.shareButton,
                isCreatingTripShareLink && styles.shareButtonDisabled,
              ]}
              disabled={isCreatingTripShareLink}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Partager le trajet"
            >
              {isCreatingTripShareLink ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {hasRenderableTripMap && !isDetailMapReady && (
          <View style={styles.mapContainer}>
            <View
              style={[
                styles.mapPreview,
                styles.mapLoadingPlaceholder,
                { height: Math.min(214, Math.max(172, viewportHeight * 0.27)) },
              ]}
            >
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.mapLoadingText}>Préparation de la carte...</Text>
            </View>
          </View>
        )}

        {/* Carte interactive - masquée quand le trajet est en cours */}
        {canRenderTripMap && !mapModalVisible && (
          <TouchableOpacity
            style={styles.mapContainer}
            onPress={() => setMapModalVisible(true)}
            activeOpacity={0.95}
          >
            <View style={[styles.mapPreview, { height: Math.min(214, Math.max(172, viewportHeight * 0.27)) }]}>
              <MapView
                provider={TRIP_DETAIL_MAP_PROVIDER}
                style={styles.mapView}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                region={mapRegion}
              >
                {routeMapCoordinates.length >= 2 && (
                  <Polyline
                    coordinates={routeMapCoordinates}
                    strokeColor={Colors.primary}
                    strokeWidth={4}
                    lineDashPattern={hasDetailedRouteMapCoordinates ? undefined : [1, 1]}
                  />
                )}

                <Marker
                  coordinate={departureCoordinate}
                  anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
                  image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.departure : undefined}
                  pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.success}
                  title="Départ"
                  description={trip?.departure?.address}
                  tracksViewChanges={false}
                >
                  {USE_CUSTOM_MAP_MARKERS ? (
                    <View style={styles.markerStartCircle}>
                      <Ionicons name="location" size={18} color={Colors.white} />
                    </View>
                  ) : null}
                </Marker>

                <Marker
                  coordinate={arrivalCoordinate}
                  anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
                  image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.arrival : undefined}
                  pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.primary}
                  title="Arrivée"
                  description={trip?.arrival?.address}
                  tracksViewChanges={false}
                >
                  {USE_CUSTOM_MAP_MARKERS ? (
                    <View style={styles.markerEndCircle}>
                      <Ionicons name="navigate" size={18} color={Colors.white} />
                    </View>
                  ) : null}
                </Marker>

                {/* Destinations des passagers */}
                {passengerDestinationMarkers.map((marker) => (
                  <Marker
                    key={`passenger-dest-${marker.id}`}
                    coordinate={marker.coordinate}
                    anchor={USE_ANDROID_MAP_MARKER_IMAGES ? ANDROID_TRIP_DETAIL_MARKER_ANCHOR : undefined}
                    image={USE_ANDROID_MAP_MARKER_IMAGES ? androidTripDetailMarkerImages.passenger : undefined}
                    pinColor={USE_ANDROID_MAP_MARKER_IMAGES ? undefined : Colors.secondary}
                    title={marker.title}
                    description={marker.description}
                    tracksViewChanges={false}
                  >
                    {USE_CUSTOM_MAP_MARKERS ? (
                      <View style={styles.markerPassengerDestCircle}>
                        <Ionicons name="person" size={14} color={Colors.white} />
                      </View>
                    ) : null}
                  </Marker>
                ))}
              </MapView>

              <View style={styles.mapOverlay}>
                <View>
                  <Text style={styles.mapOverlayLabel}>DÉPART</Text>
                  <Text style={styles.mapOverlayValue}>{tripDepartureTimeLabel}</Text>
                </View>
                <View style={styles.mapOverlayDivider} />
                <Text style={styles.mapOverlayText}>Agrandir</Text>
              </View>

              <View style={styles.expandButton}>
                <View style={styles.expandButtonInner}>
                  <Ionicons name="expand" size={20} color={Colors.gray[700]} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Modal carte plein écran - masqué quand le trajet est en cours */}
        {canRenderTripMap && mapModalVisible && (
          <TripMapModal
            mapModalVisible={mapModalVisible}
            setMapModalVisible={setMapModalVisible}
            insets={insets}
            mapRegion={mapRegion}
            routeMapCoordinates={routeMapCoordinates}
            hasDetailedRouteMapCoordinates={hasDetailedRouteMapCoordinates}
            departureCoordinate={departureCoordinate}
            trip={trip}
            arrivalCoordinate={arrivalCoordinate}
            passengerDestinationMarkers={passengerDestinationMarkers}
          />
        )}

        <View style={[styles.tripDetailSheet, !hasRenderableTripMap && styles.tripDetailSheetNoMap]}>
          <View style={styles.tripSheetHandle} />

          <TripSummary
            config={config}
            tripDepartureName={tripDepartureName}
            tripArrivalName={tripArrivalName}
            tripPriceLabel={tripPriceLabel}
            trip={trip}
            tripDepartureTimeLabel={tripDepartureTimeLabel}
            tripArrivalTimeLabel={tripArrivalTimeLabel}
            tripSeatsLabel={tripSeatsLabel}
            tripRouteDistanceLabel={tripRouteDistanceLabel}
            progress={progress}
            estimatedArrivalTime={estimatedArrivalTime}
            router={router}
            driverReviewAverage={driverReviewAverage}
            setVehicleDetailModalVisible={setVehicleDetailModalVisible}
            tripVehicleIconName={tripVehicleIconName}
            tripVehicleLabel={tripVehicleLabel}
            tripVehicleMetaLabel={tripVehicleMetaLabel}
            handleContactDriver={handleContactDriver}
            isOpeningConversation={isOpeningConversation}
            driverPhone={driverPhone}
            setContactModalVisible={setContactModalVisible}
          />

        {canTrackTrip && trip?.status !== 'ongoing' && (
          <View style={styles.trackingBanner}>
            <View style={styles.trackingBannerLeft}>
              <View
                style={[
                  styles.trackingStatusDot,
                  liveDriverCoordinate ? styles.trackingStatusDotActive : styles.trackingStatusDotIdle,
                ]}
              />
              <View>
                <Text style={styles.trackingTitle}>{trackingStatusTitle}</Text>
                <Text style={styles.trackingSubtitle}>{trackingStatusSubtitle}</Text>
              </View>
            </View>
            {!isTripDriver && (
              <TouchableOpacity
                style={styles.trackingRefreshButton}
                onPress={() => {
                  if (trip) {
                    trackingSocket.requestDriverLocation(trip.id);
                  }
                }}
              >
                <Ionicons name="refresh" size={16} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {showPassengerSecurityAccess && (
          <Animated.View entering={FadeInDown.delay(460)} style={styles.section}>
            <View style={[styles.sectionCard, styles.tripSafetyPassengerCard]}>
              <TouchableOpacity
                style={[
                  styles.tripSafetyCompactSosButton,
                  isPassengerSecurityLocked && styles.tripSafetyCompactButtonBlurred,
                ]}
                onPress={openSosModal}
                disabled={isPassengerSecurityLocked}
                activeOpacity={0.9}
              >
                <Ionicons
                  name="call"
                  size={18}
                  color={isPassengerSecurityLocked ? Colors.gray[400] : Colors.white}
                />
                <Text
                  style={[
                    styles.tripSafetyCompactSosText,
                    isPassengerSecurityLocked && styles.tripSafetyCompactTextBlurred,
                  ]}
                >
                  SOS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tripSafetyCompactTrustedButton,
                  (!canAccessTripSecurity || isPassengerSecurityLocked) &&
                    styles.tripSafetyCompactTrustedDisabled,
                  isPassengerSecurityLocked && styles.tripSafetyCompactButtonBlurred,
                ]}
                onPress={openTripSecurityModal}
                disabled={!canAccessTripSecurity || isPassengerSecurityLocked}
                activeOpacity={0.9}
              >
                <View style={styles.tripSafetyCompactTrustedIcon}>
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={
                      canAccessTripSecurity && !isPassengerSecurityLocked
                        ? Colors.primary
                        : Colors.gray[500]
                    }
                  />
                </View>
                <View style={styles.tripSafetyCompactTrustedCopy}>
                  <Text
                    style={[
                      styles.tripSafetyCompactTrustedTitle,
                      (!canAccessTripSecurity || isPassengerSecurityLocked) &&
                        styles.tripSafetyActionTitleDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    {trustedContactsActionLabel}
                  </Text>
                  <Text
                    style={[
                      styles.tripSafetyCompactTrustedSubtitle,
                      (!canAccessTripSecurity || isPassengerSecurityLocked) &&
                        styles.tripSafetyActionSubtitleDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    {canAccessTripSecurity ? passengerTrustedContactsHint : 'Connexion requise'}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={
                    canAccessTripSecurity && !isPassengerSecurityLocked
                      ? Colors.primary
                      : Colors.gray[500]
                  }
                />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Passagers */}
        {tripBookings && tripBookings.length > 0 && (
          <Animated.View entering={FadeInDown.delay(500)} style={styles.section}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>PASSAGERS</Text>
              <View style={styles.passengersContainer}>
                {tripBookings
                  .filter((booking) => booking.status === 'accepted')
                  .map((booking) => (
                    <TouchableOpacity
                      key={booking.id}
                      style={styles.passengerItem}
                      onPress={() => router.push(`/passenger/${booking.passengerId}`)}
                      activeOpacity={0.7}
                    >
                      {booking.passengerAvatar ? (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setSelectedImageUri(booking.passengerAvatar!);
                            setImageModalVisible(true);
                          }}
                        >
                          <Image
                            source={{ uri: booking.passengerAvatar }}
                            style={styles.passengerAvatar}
                          />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.passengerAvatar}>
                          <Ionicons name="person" size={20} color={Colors.gray[500]} />
                        </View>
                      )}
                      <View style={styles.passengerInfo}>
                        <Text style={styles.passengerName}>
                          {booking.passengerName || 'Passager'}
                        </Text>
                        <Text style={styles.passengerSeats}>
                          {booking.numberOfSeats} place{booking.numberOfSeats > 1 ? 's' : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                    </TouchableOpacity>
                  ))}
                {tripBookings.filter((booking) => booking.status === 'accepted').length === 0 && (
                  <Text style={styles.noPassengersText}>Aucun passager confirmé</Text>
                )}
              </View>
            </View>
          </Animated.View>
        )}

        {showPassengerVehicleReminder && (
          <Animated.View entering={FadeInDown.delay(550)} style={styles.section}>
            <View style={[styles.sectionCard, styles.securityReminderCard]}>
              {/* <View style={styles.securityReminderHeader}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
                <Text style={styles.securityReminderTitle}>Vérification avant embarquement</Text>
              </View> */}
              <Text style={styles.securityReminderText}>
                Avant de monter, vérifiez que le véhicule devant vous correspond exactement à celui du trajet.
              </Text>
              {/* <View style={styles.securityReminderVehicleBox}>
                <Text style={styles.securityReminderVehicleLabel}>Véhicule attendu</Text>
                <Text style={styles.securityReminderVehicleValue}>{tripVehicleIdentity}</Text>
              </View> */}
            </View>
          </Animated.View>
        )}

        {showDriverVehicleReminder && (
          <Animated.View entering={FadeInDown.delay(560)} style={styles.section}>
            <View style={[styles.sectionCard, styles.tripSafetyCard]}>
              <View style={styles.tripSafetyHeader}>
                <View style={styles.tripSafetyIconWrap}>
                  <Ionicons name="car-sport" size={20} color={Colors.primary} />
                </View>
                <View style={styles.tripSafetyHeaderCopy}>
                  <Text style={styles.tripSafetyTitle}>Sécurité du trajet</Text>
                  <Text style={styles.tripSafetySubtitle}>
                    Utilisez le véhicule prévu et gardez vos proches informés.
                  </Text>
                </View>
              </View>

              <View style={styles.tripSafetyNotice}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.tripSafetyNoticeText} numberOfLines={2}>
                  Véhicule prévu : {tripVehicleIdentity}
                </Text>
              </View>

              <View style={styles.tripSafetyActions}>
                <TouchableOpacity
                  style={[styles.tripSafetyActionButton, styles.tripSafetySosButton]}
                  onPress={openSosModal}
                  activeOpacity={0.9}
                >
                  <View style={[styles.tripSafetyActionIcon, styles.tripSafetySosIcon]}>
                    <Ionicons name="call" size={18} color={Colors.danger} />
                  </View>
                  <View style={styles.tripSafetyActionCopy}>
                    <Text style={[styles.tripSafetyActionTitle, styles.tripSafetySosTitle]}>SOS</Text>
                    <Text style={[styles.tripSafetyActionSubtitle, styles.tripSafetySosSubtitle]} numberOfLines={1}>
                      Police et urgences
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.white} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tripSafetyActionButton, styles.tripSafetyTrustedButton]}
                  onPress={openTripSecurityModal}
                  activeOpacity={0.9}
                >
                  <View style={styles.tripSafetyActionIcon}>
                    <Ionicons name="people-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.tripSafetyActionCopy}>
                    <Text style={styles.tripSafetyActionTitle} numberOfLines={2}>
                      Ajouter / notifier mes proches
                    </Text>
                    <Text style={styles.tripSafetyActionSubtitle} numberOfLines={1}>
                      Choisir qui reçoit les alertes.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
        </View>
      </ScrollView>

      {/* Sticky Footer for Actions */}
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
        {(() => {
          // Vérifier si le trajet est expiré (date de départ passée)
          const isExpired =
            trip?.status !== 'ongoing' &&
            trip?.departureTime &&
            new Date(trip?.departureTime) < new Date();
          // Vérifier si le trajet peut être réservé (pas complété, pas annulé, pas expiré)
          const canBook = trip?.status !== 'completed' &&
            trip?.status !== 'cancelled' &&
            !isExpired &&
            (
              trip?.status === 'upcoming' ||
              (trip?.status === 'ongoing' && (availableSeats > 0 || Boolean(activeBooking && activeBookingStatus)))
            );

          if (isTripDriver) {
            return (
              <View style={[styles.actionsContainer, { flexDirection: 'row', gap: Spacing.sm }]}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.primary, flex: 1 }]}
                  onPress={() => router.push(`/trip/manage/${trip?.id}`)}
                >
                  <Ionicons name="settings-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonText}>Gérer le trajet</Text>
                </TouchableOpacity>
                {(trip?.status === 'upcoming' || trip?.status === 'ongoing') && !isExpired && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: Colors.secondary, flex: 1 }]}
                    onPress={openEditModal}
                  >
                    <Ionicons name="create-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonText}>Modifier</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          if (canBook) {
            return (
              <View style={styles.actionsContainer}>
                {activeBooking && activeBookingStatus ? (
                  activeBooking.status === 'completed' ? (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: Colors.secondary }]}
                      onPress={() => router.push(`/rate/${trip.id}`)}
                    >
                      <Ionicons name="star" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                      <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.bookingCard}>
                      <View style={styles.bookingCardHeader}>
                        <View style={styles.bookingHeaderIdentity}>
                          <View style={styles.bookingHeaderIcon}>
                            <Ionicons name="ticket-outline" size={20} color={Colors.primary} />
                          </View>
                          <View style={styles.bookingHeaderCopy}>
                            <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                            <Text style={styles.bookingCardSubtitle}>
                              {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' • '}{trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.bookingStatusBadge,
                            { backgroundColor: activeBookingStatus.background },
                          ]}
                        >
                          <View
                            style={[
                              styles.bookingStatusDot,
                              { backgroundColor: activeBookingStatus.color },
                            ]}
                          />
                          <Text style={[styles.bookingStatusText, { color: activeBookingStatus.color }]}>
                            {activeBookingStatus.label}
                          </Text>
                        </View>
                      </View>

                      {/* Indicateur de confirmation en attente */}
                      {activeBooking.status === 'accepted' && (
                        <>
                          {activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                            <View style={styles.confirmationBanner}>
                              <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                              <Text style={styles.confirmationBannerText}>
                                Prise en charge détectée
                              </Text>
                            </View>
                          )}
                          {activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff && (
                            <View style={styles.confirmationBanner}>
                              <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                              <Text style={styles.confirmationBannerText}>
                                Arrivée détectée. Finalisation automatique en cours.
                              </Text>
                            </View>
                          )}
                        </>
                      )}

                      <View style={styles.bookingActionsStack}>
                        {canPayActiveBooking && (
                          <TouchableOpacity
                            style={[styles.bookingActionButton, styles.bookingActionPrimary, styles.bookingActionPayment]}
                            onPress={handlePayActiveBooking}
                            disabled={isInitiatingBookingPayment}
                          >
                            {isInitiatingBookingPayment ? (
                              <ActivityIndicator size="small" color={Colors.white} />
                            ) : (
                              <>
                                <Ionicons name="card-outline" size={18} color={Colors.white} />
                                <Text style={[styles.bookingActionText, styles.bookingActionPaymentText]}>
                                  Payer {activeBookingPaymentAmount} FC
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {activeBooking.status === 'accepted' && activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                          <View
                            style={[styles.bookingActionButton, styles.bookingActionPrimary, styles.bookingActionConfirm]}
                          >
                            <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                            <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>
                              À bord
                            </Text>
                          </View>
                        )}

                        {activeBooking.status === 'accepted' && activeBooking.pickedUp && activeBooking.pickedUpConfirmedByPassenger && !activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff && (
                          <View
                            style={[styles.bookingActionButton, styles.bookingActionPrimary, styles.bookingActionConfirm]}
                          >
                            <Ionicons name="flag" size={19} color={Colors.white} />
                            <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>Arrivée en cours</Text>

                          </View>
                        )}

                        <View style={styles.bookingSecondaryActionsRow}>
                          {/* Bouton Navigation - visible quand le trajet est en cours */}
                          {activeBooking.status === 'accepted' && trip.status === 'ongoing' &&
                            !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                            !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                              <TouchableOpacity
                                activeOpacity={0.82}
                                style={[styles.bookingActionButton, styles.bookingActionSecondary, styles.bookingActionNavigation]}
                                onPress={() => router.push(`/booking/navigate/${activeBooking.id}`)}
                              >
                                <Ionicons name="navigate" size={18} color={Colors.white} />
                                <Text style={[styles.bookingActionText, styles.bookingActionNavigationText]}>Suivre</Text>
                              </TouchableOpacity>
                            )}

                          {activeBooking.status === 'accepted' && driverPhone &&
                            !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                            !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                              <TouchableOpacity
                                activeOpacity={0.82}
                                style={[styles.bookingActionButton, styles.bookingActionSecondary, styles.bookingActionCall]}
                                onPress={() => setContactModalVisible(true)}
                              >
                                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                                <Text style={[styles.bookingActionText, styles.bookingActionCallText]}>WhatsApp</Text>
                              </TouchableOpacity>
                            )}

                          {!(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                            !(activeBooking.droppedOffConfirmedByPassenger && !activeBooking.droppedOff) && (
                              <TouchableOpacity
                                activeOpacity={0.82}
                                style={[styles.bookingActionButton, styles.bookingActionSecondary, styles.bookingActionDanger]}
                                onPress={confirmCancelBooking}
                                disabled={isCancellingBooking}
                              >
                                {isCancellingBooking ? <ActivityIndicator size="small" color={Colors.danger} /> : (
                                  <>
                                    <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
                                    <Text style={[styles.bookingActionText, styles.bookingActionDangerText]}>Annuler</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
                        </View>
                      </View>
                    </View>
                  )
                ) : availableSeats <= 0 ? (
                  <View style={[styles.actionButton, styles.actionButtonDisabled]}>
                    <Ionicons name="close-circle" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Complet • Plus de places disponibles</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={openBookingModal}
                  >
                    <Ionicons name="car-sport-outline" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Réserver • {trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          // Trajets terminés ou expirés
          if (trip?.status === 'completed' || trip?.status === 'cancelled' || isExpired) {
            return (
              <View style={styles.actionsContainer}>
                {activeBooking && activeBooking.status === 'completed' && activeBooking.droppedOffConfirmedByPassenger ? (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: Colors.secondary }]}
                    onPress={() => router.push(`/rate/${trip?.id}`)}
                  >
                    <Ionicons name="star" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.actionButton, styles.actionButtonDisabled]}>
                    <Text style={styles.actionButtonText}>
                      {trip.status === 'completed' ? 'Trajet terminé' : trip.status === 'cancelled' ? 'Trajet annulé' : 'Trajet expiré'}
                    </Text>
                  </View>
                )}
              </View>
            );
          }

          return null;
        })()}
      </View>

      <TripVehicleDetailsModal
        vehicleDetailModalVisible={vehicleDetailModalVisible}
        setVehicleDetailModalVisible={setVehicleDetailModalVisible}
        insets={insets}
        trip={trip}
        tripVehicleIconName={tripVehicleIconName}
        tripVehicleLabel={tripVehicleLabel}
        tripVehicleTypeLabel={tripVehicleTypeLabel}
        tripVehicleStatusLabel={tripVehicleStatusLabel}
        tripVehicleLicensePlate={tripVehicleLicensePlate}
        visibleTripVehicleDetailRows={visibleTripVehicleDetailRows}
      />

      <TripSosModal
        sosModalVisible={sosModalVisible}
        closeSosModal={closeSosModal}
        insets={insets}
      />

      <TripRelativesModal
        securityModalVisible={securityModalVisible}
        closeTripSecurityModal={closeTripSecurityModal}
        insets={insets}
        trip={trip}
        tripSecurityRole={tripSecurityRole}
        tripSecurityBookingId={tripSecurityBookingId}
      />

      <TripBookingModal
        bookingModalVisible={bookingModalVisible}
        insets={insets}
        bookingStep={bookingStep}
        viewportHeight={viewportHeight}
        adjustBookingSeats={adjustBookingSeats}
        isBooking={isBooking}
        bookingSeats={bookingSeats}
        handleBookingSeatsChange={handleBookingSeatsChange}
        seatLimit={seatLimit}
        isIdentityVerified={isIdentityVerified}
        openPassengerIdentityVerification={openPassengerIdentityVerification}
        estimatedTotal={estimatedTotal}
        bookingPaymentMode={bookingPaymentMode}
        setBookingPaymentMode={setBookingPaymentMode}
        openBookingLocationPicker={openBookingLocationPicker}
        passengerOriginDisplay={passengerOriginDisplay}
        passengerOriginManualAddress={passengerOriginManualAddress}
        setPassengerOriginManualAddress={setPassengerOriginManualAddress}
        setShouldAutofillPassengerOrigin={setShouldAutofillPassengerOrigin}
        setPassengerOrigin={setPassengerOrigin}
        isValidatingDestination={isValidatingDestination}
        passengerDestinationDisplay={passengerDestinationDisplay}
        passengerDestinationManualAddress={passengerDestinationManualAddress}
        setPassengerDestinationManualAddress={setPassengerDestinationManualAddress}
        setPassengerDestination={setPassengerDestination}
        trip={trip}
        bookingModalError={bookingModalError}
        closeBookingModal={closeBookingModal}
        goToPreviousBookingStep={goToPreviousBookingStep}
        goToNextBookingStep={goToNextBookingStep}
        handleConfirmBooking={handleConfirmBooking}
      />

      {/* Location Picker pour le point de récupération */}
      <LocationPickerModal
        visible={showOriginPicker}
        title="Mon point de récupération"
        initialLocation={passengerOrigin}
        routeCoordinates={routeCoordinates || undefined}
        restrictToRoute={true}
        onClose={restoreBookingModalAfterLocationPicker}
        onSelect={(location) => {
          setPassengerOrigin(location);
          setPassengerOriginManualAddress('');
          setShouldAutofillPassengerOrigin(false);
          restoreBookingModalAfterLocationPicker();
          setBookingModalError('');
        }}
      />

      {/* Location Picker pour la destination */}
      <LocationPickerModal
        visible={showDestinationPicker}
        title="Ma destination sur le trajet"
        initialLocation={passengerDestination}
        routeCoordinates={routeCoordinates || undefined}
        restrictToRoute={true}
        onClose={restoreBookingModalAfterLocationPicker}
        onSelect={(location) => {
          setPassengerDestination(location);
          setPassengerDestinationManualAddress('');
          restoreBookingModalAfterLocationPicker();
          setBookingModalError('');
        }}
      />

      <TripBookingSuccessModal
        bookingSuccess={bookingSuccess}
        insets={insets}
        closeBookingSuccessModal={closeBookingSuccessModal}
        handleViewBookings={handleViewBookings}
      />

      <TripReviewsModal
        reviewsModalVisible={reviewsModalVisible}
        setReviewsModalVisible={setReviewsModalVisible}
        insets={insets}
        trip={trip}
        driverReviewCount={driverReviewCount}
        driverReviews={driverReviews}
      />

      <TutorialOverlay
        visible={tripGuideVisible}
        title="Découvrez ce trajet"
        message="Suivez la progression du conducteur, contactez-le ou réservez vos places depuis cet écran."
        onDismiss={dismissTripGuide}
      />

      {/* Image Modal */}
      <TripImageModal
        imageModalVisible={imageModalVisible}
        setImageModalVisible={setImageModalVisible}
        selectedImageUri={selectedImageUri}
      />

      {/* Contact Modal */}
      <TripContactModal
        contactModalVisible={contactModalVisible}
        setContactModalVisible={setContactModalVisible}
        insets={insets}
        trip={trip}
        driverPhone={driverPhone}
        showDialog={showDialog}
      />

      <TripEditModal
        editTripModalVisible={editTripModalVisible}
        closeEditModal={closeEditModal}
        editModalBottomPadding={editModalBottomPadding}
        trip={trip}
        editStep={editStep}
        swapEditRoutePoints={swapEditRoutePoints}
        editRouteMode={editRouteMode}
        setEditRouteMode={setEditRouteMode}
        editDepartureManualAddress={editDepartureManualAddress}
        setEditDepartureManualAddress={setEditDepartureManualAddress}
        editArrivalManualAddress={editArrivalManualAddress}
        setEditArrivalManualAddress={setEditArrivalManualAddress}
        handleContinueEditTrip={handleContinueEditTrip}
        openEditRoutePicker={openEditRoutePicker}
        editDepartureDisplay={editDepartureDisplay}
        editArrivalDisplay={editArrivalDisplay}
        editVehiclesLoading={editVehiclesLoading}
        activeEditVehicles={activeEditVehicles}
        editVehicleId={editVehicleId}
        setEditVehicleId={setEditVehicleId}
        openDateOrTimePicker={openDateOrTimePicker}
        formattedEditDate={formattedEditDate}
        formattedEditTime={formattedEditTime}
        iosPickerMode={iosPickerMode}
        getEditBaseDate={getEditBaseDate}
        handleIosPickerChange={handleIosPickerChange}
        closeIosPicker={closeIosPicker}
        editSeats={editSeats}
        setEditSeats={setEditSeats}
        editPrice={editPrice}
        setEditPrice={setEditPrice}
        editRequiresPassengerKyc={editRequiresPassengerKyc}
        setEditRequiresPassengerKyc={setEditRequiresPassengerKyc}
        handleBackToEditRoute={handleBackToEditRoute}
        isSavingTrip={isSavingTrip}
        handleSaveTrip={handleSaveTrip}
      />

      <LocationPickerModal
        visible={editRoutePickerTarget !== null}
        title={editRoutePickerTarget === 'departure' ? 'Choisir le départ' : "Choisir l'arrivée"}
        initialLocation={
          editRoutePickerTarget === 'departure' ? editDepartureSelection : editArrivalSelection
        }
        autoLocateOnOpen={false}
        onClose={restoreEditModalAfterRoutePicker}
        onSelect={(location) => {
          const target = editRoutePickerTarget;
          setEditRouteMode('map');
          if (target === 'departure') {
            setEditDepartureSelection(location);
            setEditDepartureManualAddress(location.title || location.address);
            restoreEditModalAfterRoutePicker();
            return;
          }
          if (target === 'arrival') {
            setEditArrivalSelection(location);
            setEditArrivalManualAddress(location.title || location.address);
          }
          restoreEditModalAfterRoutePicker();
        }}
      />
    </SafeAreaView>
  );
}

