import AddressEntryModeSelector, { type AddressInputMode } from '@/components/AddressEntryModeSelector';
import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import LocationPickerModal, { type MapLocationSelection } from '@/components/LocationPickerModal';
import TripSecurityPanel from '@/components/trip/TripSecurityPanel';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { trackEvent } from '@/services/analytics';
import { useUserLocation } from '@/hooks/useUserLocation';
import { trackingSocket } from '@/services/trackingSocket';
import {
  useCancelBookingMutation,
  useConfirmDropoffByPassengerMutation,
  useConfirmPickupByPassengerMutation,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useGetTripBookingsQuery,
} from '@/store/api/bookingApi';
import { useCreateConversationMutation } from '@/store/api/messageApi';
import { useGetAverageRatingQuery, useGetReviewsQuery } from '@/store/api/reviewApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useGetKycStatusQuery, useUploadKycMutation } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectTripById, selectUser } from '@/store/selectors';
import type { BookingStatus, GeoPoint } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { openWhatsApp } from '@/utils/phoneHelpers';
import { getRouteInfo, type RouteInfo } from '@/utils/routeApi';
import { isPointOnRoute, splitRouteByProgress } from '@/utils/routeHelpers';
import { shareTrip, shareTripViaWhatsApp } from '@/utils/shareHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const pointToLatLng = (point?: GeoPoint | null) => {
  if (!point?.coordinates || point.coordinates.length < 2) {
    return null;
  }
  const [longitude, latitude] = point.coordinates;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

const arrayToLatLng = (coordinates?: [number, number] | null) => {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }
  const [longitude, latitude] = coordinates;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

const LANDMARK_PLACEHOLDER = 'Ex: devant la station, portail bleu, entr\u00E9e principale';

const getLocationText = (selection: MapLocationSelection | null, manualAddress: string) =>
  (manualAddress.trim() || selection?.title || selection?.address || '').trim();

const getLocationCoordinatesObject = (selection: MapLocationSelection | null) => {
  if (!selection || !Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude)) {
    return undefined;
  }
  return {
    latitude: selection.latitude,
    longitude: selection.longitude,
  };
};

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.2)',
  },
  accepted: {
    label: 'Confirmée',
    color: Colors.success,
    background: 'rgba(46, 204, 113, 0.18)',
  },
  rejected: {
    label: 'Refusée',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.16)',
  },
  cancelled: {
    label: 'Annulée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
  completed: {
    label: 'Terminée',
    color: Colors.gray[600],
    background: 'rgba(107, 114, 128, 0.18)',
  },
  expired: {
    label: '',
    color: '',
    background: ''
  }
};

export default function TripDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tripId = typeof params.id === 'string' ? (params.id as string) : '';
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
    pollingInterval: tripFromStore?.status === 'ongoing'
      ? 5000 // 5 secondes pour les trajets en cours
      : tripFromStore?.status === 'upcoming'
      ? 30000 // 30 secondes pour les trajets à venir
      : 0, // Pas de polling pour les trajets terminés/annulés
    refetchOnFocus: true, // Rafraîchir quand l'utilisateur revient dans l'app
    refetchOnReconnect: true, // Rafraîchir après une reconnexion réseau
  });

  // Utiliser le trajet de l'API en priorité, sinon celui du store
  const trip = tripFromApi || tripFromStore;

  const user = useAppSelector(selectUser);
  const { showDialog } = useDialog();
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
    pollingInterval: trip?.status === 'ongoing' ? 10000 : trip?.status === 'upcoming' ? 30000 : 0, // 10s en cours, 30s à venir
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: tripBookings,
    isLoading: tripBookingsLoading,
    refetch: refetchTripBookings,
  } = useGetTripBookingsQuery(tripId, { 
    skip: !tripId,
    // Polling pour les réservations du trajet
    pollingInterval: trip?.status === 'ongoing' ? 10000 : trip?.status === 'upcoming' ? 30000 : 0,
    refetchOnFocus: true,
    refetchOnReconnect: true,
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
  useEffect(() => {
    setLiveDriverCoordinate(initialLiveCoordinate);
  }, [initialLiveCoordinate]);
  useEffect(() => {
    setLiveDriverUpdatedAt(trip?.lastLocationUpdateAt ?? null);
  }, [trip?.lastLocationUpdateAt]);
  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();
  const [cancelBookingMutation, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [confirmPickupByPassenger, { isLoading: isConfirmingPickup }] = useConfirmPickupByPassengerMutation();
  const [confirmDropoffByPassenger, { isLoading: isConfirmingDropoff }] = useConfirmDropoffByPassengerMutation();
  const [createConversation, { isLoading: isCreatingConversation }] = useCreateConversationMutation();
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1); // 1: places, 2: récupération, 3: destination
  const [bookingSeats, setBookingSeats] = useState('1');
  const [bookingModalError, setBookingModalError] = useState('');
  const [passengerOrigin, setPassengerOrigin] = useState<MapLocationSelection | null>(null);
  const [passengerOriginManualAddress, setPassengerOriginManualAddress] = useState('');
  const [passengerOriginReference, setPassengerOriginReference] = useState('');
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [passengerDestination, setPassengerDestination] = useState<MapLocationSelection | null>(null);
  const [passengerDestinationManualAddress, setPassengerDestinationManualAddress] = useState('');
  const [passengerDestinationReference, setPassengerDestinationReference] = useState('');
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [bookingAddressInputMode, setBookingAddressInputMode] = useState<AddressInputMode>('map');
  const [shouldAutofillPassengerOrigin, setShouldAutofillPassengerOrigin] = useState(false);
  const [isValidatingDestination, setIsValidatingDestination] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{ visible: boolean; seats: number }>({
    visible: false,
    seats: 0,
  });
  const [mapModalVisible, setMapModalVisible] = useState(false);
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
  const [kycWizardVisible, setKycWizardVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [kycFrontImage, setKycFrontImage] = useState<string | null>(null);
  const [kycBackImage, setKycBackImage] = useState<string | null>(null);
  const [kycSelfieImage, setKycSelfieImage] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const {
    data: kycStatus,
    isLoading: kycStatusLoading,
    isFetching: kycStatusFetching,
    refetch: refetchKycStatus,
  } = useGetKycStatusQuery();
  const [uploadKyc, { isLoading: uploadingKyc }] = useUploadKycMutation();
  const { data: driverReviews } = useGetReviewsQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });
  const { data: driverAverageData } = useGetAverageRatingQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });

  const [refreshing, setRefreshing] = useState(false);

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
  const driverReviewAverage =
    driverAverageData?.averageRating ??
    (driverReviewCount && driverReviews
      ? driverReviews.reduce((sum, review) => sum + review.rating, 0) / driverReviewCount
      : trip?.driverRating ?? 0);

  const refreshBookingLists = () => {
    refetchMyBookings();
    refetchTripBookings();
  };

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

    return () => {
      isMounted = false;
      trackingSocket.leaveTrip(trip.id);
      unsubscribeLocation();
      unsubscribeErrors();
    };
  }, [trip?.id, trip?.status, canTrackTrip]);

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

  const availableSeats = trip ? Math.max(trip.availableSeats, 0) : 0;
  const seatLimit = Math.max(availableSeats, 1);
  const progress = trip?.progress || 0;
  const trackingStatusTitle = liveDriverCoordinate ? 'Suivi en direct' : 'Position estimée';
  const trackingStatusSubtitle = useMemo(() => {
    if (trackingError) {
      return trackingError;
    }
    if (!liveDriverCoordinate) {
      return isTripDriver
        ? 'Partage automatique activé dès que la localisation est disponible.'
        : 'Le conducteur n’a pas encore partagé sa position.';
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
    if (!trip) return 'Informations vehicule indisponibles.';
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
    return trip.vehicleInfo || 'Informations vehicule indisponibles.';
  }, [trip]);
  const showPassengerVehicleReminder =
    !isTripDriver &&
    Boolean(activeBooking && (activeBooking.status === 'pending' || activeBooking.status === 'accepted'));
  const showDriverVehicleReminder = isTripDriver && (trip?.status === 'upcoming' || trip?.status === 'ongoing');
  const showPassengerSecurityAccess = !isTripDriver;
  const passengerSecurityQuickHint = !activeBooking
    ? 'Ajoutez d abord vos contacts dans Profil > Parametres > Securite, puis choisissez qui notifier pour ce trajet.'
    : activeBooking.status === 'pending'
      ? 'Reservation en attente: preparez vos contacts d urgence puis selectionnez ceux a notifier des que disponible.'
      : activeBooking.status === 'accepted'
        ? 'Avant de monter, ouvrez la securite du trajet pour choisir les proches a notifier.'
        : 'Ouvrez la securite du trajet pour ajuster qui est notifie.';
  const passengerSecurityButtonLabel = canAccessTripSecurity
    ? 'Ouvrir la securite du trajet'
    : 'Connectez-vous pour la securite';
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
    const latitude = Number(trip?.arrival?.lat);
    const longitude = Number(trip?.arrival?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      title: trip?.arrival?.name || 'Arrivee du trajet',
      address: trip?.arrival?.address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
  }, [trip?.arrival?.address, trip?.arrival?.lat, trip?.arrival?.lng, trip?.arrival?.name]);
  const isKycApproved = kycStatus?.status === 'approved';
  const isKycPending = kycStatus?.status === 'pending';
  const isKycRejected = kycStatus?.status === 'rejected';
  const isKycStatusBusy = kycStatusLoading || kycStatusFetching;
  const kycBookingLockLabel = isKycStatusBusy
    ? 'Verification KYC en cours...'
    : isKycPending
      ? 'KYC en cours de verification'
      : isKycRejected
        ? 'KYC refuse - reprendre'
        : 'KYC requis pour reserver';

  const ensureKycForBooking = () => {
    if (isKycApproved) {
      return true;
    }

    if (isKycStatusBusy) {
      showDialog({
        variant: 'info',
        title: 'Verification KYC en cours',
        message: 'Nous verifions votre statut KYC. Reessayez dans quelques secondes.',
      });
      return false;
    }

    if (isKycPending) {
      showDialog({
        variant: 'info',
        title: 'KYC en attente',
        message:
          'Vos documents sont en cours de verification. Vous pourrez reserver ce trajet apres validation du KYC.',
        actions: [
          { label: 'Compris', variant: 'ghost' },
          { label: 'Voir mon statut', variant: 'primary', onPress: () => router.push('/profile') },
        ],
      });
      return false;
    }

    if (isKycRejected) {
      showDialog({
        variant: 'warning',
        title: 'KYC requis',
        message:
          'Votre verification KYC a ete rejetee. Merci de reprendre le parcours KYC pour reserver ce trajet.',
        actions: [
          { label: 'Plus tard', variant: 'ghost' },
          { label: 'Reprendre KYC', variant: 'primary', onPress: () => setKycWizardVisible(true) },
        ],
      });
      return false;
    }

    showDialog({
      variant: 'warning',
      title: 'KYC requis',
      message: 'Pour reserver un trajet, vous devez verifier votre identite (piece + selfie).',
      actions: [
        { label: 'Plus tard', variant: 'ghost' },
        { label: 'Commencer KYC', variant: 'primary', onPress: () => setKycWizardVisible(true) },
      ],
    });
    return false;
  };

  const openBookingModal = () => {
    if (!ensureKycForBooking()) {
      return;
    }
    const autoOrigin = defaultPassengerOriginSelection;
    setBookingSeats('1');
    setBookingModalError('');
    setPassengerOrigin(autoOrigin);
    setPassengerOriginManualAddress(autoOrigin?.title || autoOrigin?.address || '');
    setPassengerOriginReference('');
    setPassengerDestination(defaultPassengerDestinationSelection);
    setPassengerDestinationManualAddress(
      defaultPassengerDestinationSelection?.title || defaultPassengerDestinationSelection?.address || '',
    );
    setPassengerDestinationReference('');
    setBookingAddressInputMode('map');
    setShouldAutofillPassengerOrigin(!autoOrigin);
    setBookingStep(1);
    setBookingModalVisible(true);
    if (!autoOrigin) {
      void requestDriverLocationPermission();
    }
  };

  const openTripSecurityModal = () => {
    if (!canAccessTripSecurity) {
      showDialog({
        variant: 'info',
        title: 'Securite indisponible',
        message: 'Connectez-vous pour gerer vos proches et le suivi securite.',
      });
      return;
    }
    void refetchTrip();
    void refetchMyBookings();
    void refetchTripBookings();
    setSecurityModalVisible(true);
  };

  const openEmergencyContacts = () => {
    if (!user) {
      showDialog({
        variant: 'info',
        title: 'Connexion requise',
        message: 'Connectez-vous pour gerer vos contacts d urgence.',
      });
      return;
    }
    router.push('/security');
  };

  const closeBookingModal = () => {
    if (isBooking) {
      return;
    }
    setBookingModalVisible(false);
    setBookingStep(1);
    setShouldAutofillPassengerOrigin(false);
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
    setPassengerOriginManualAddress(defaultPassengerOriginSelection.title || defaultPassengerOriginSelection.address);
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
      setBookingModalError('');
      setBookingStep(2);
    } else if (bookingStep === 2) {
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
      const payload: {
        participantIds: string[];
        bookingId?: string;
      } = {
        participantIds: [trip.driverId],
      };

      if (activeBooking?.id) {
        payload.bookingId = activeBooking.id;
      }

      const conversation = await createConversation(payload).unwrap();
      void trackEvent('conversation_opened', {
        source_screen: 'trip_details',
        trip_id: trip.id,
        has_booking: Boolean(activeBooking?.id),
      });
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: conversation.id,
          title: trip.driverName,
        },
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        "Impossible d'ouvrir la conversation pour le moment.";
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
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
    if (!ensureKycForBooking()) {
      setBookingModalError('Votre KYC doit etre valide avant de reserver ce trajet.');
      return;
    }
    const seatsValue = parseInt(bookingSeats, 10);
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

    const tripArrivalLatitude = Number(trip.arrival?.lat);
    const tripArrivalLongitude = Number(trip.arrival?.lng);
    const passengerOriginText =
      bookingAddressInputMode === 'manual'
        ? passengerOriginManualAddress.trim()
        : getLocationText(passengerOrigin, '');
    const passengerDestinationText =
      bookingAddressInputMode === 'manual'
        ? passengerDestinationManualAddress.trim()
        : getLocationText(passengerDestination, '');
    const defaultArrivalText = (trip.arrival?.name || trip.arrival?.address || '').trim();
    const hasTripArrivalCoordinates =
      Number.isFinite(tripArrivalLatitude) && Number.isFinite(tripArrivalLongitude);
    const isDefaultTripArrivalDestination = Boolean(
      passengerDestination &&
      hasTripArrivalCoordinates &&
      Math.abs(passengerDestination.latitude - tripArrivalLatitude) < 0.000001 &&
      Math.abs(passengerDestination.longitude - tripArrivalLongitude) < 0.000001,
    );
    const hasCustomPassengerDestination = Boolean(
      (passengerDestination && !isDefaultTripArrivalDestination) ||
        (passengerDestinationText && passengerDestinationText !== defaultArrivalText) ||
        passengerDestinationReference.trim(),
    );

    // Valider la destination seulement si le passager a choisi une destination personnalisée
    if (
      bookingAddressInputMode === 'map' &&
      hasCustomPassengerDestination &&
      passengerDestination &&
      routeCoordinates &&
      routeCoordinates.length >= 2
    ) {
      setIsValidatingDestination(true);
      setBookingModalError('');

      try {
        const destinationPoint = {
          latitude: passengerDestination.latitude,
          longitude: passengerDestination.longitude,
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
        passengerOriginReference: passengerOriginReference.trim() || undefined,
        passengerOriginCoordinates:
          bookingAddressInputMode === 'map' ? getLocationCoordinatesObject(passengerOrigin) : undefined,
        passengerDestination: hasCustomPassengerDestination
          ? passengerDestinationText || undefined
          : undefined,
        passengerDestinationReference: passengerDestinationReference.trim() || undefined,
        passengerDestinationCoordinates: hasCustomPassengerDestination
          ? bookingAddressInputMode === 'map'
            ? getLocationCoordinatesObject(passengerDestination)
            : undefined
          : undefined,
      }).unwrap();
      void trackEvent('booking_created', {
        trip_id: trip.id,
        booking_id: booking.id,
        seats: seatsValue,
        has_custom_destination: hasCustomPassengerDestination,
        has_custom_origin: Boolean(passengerOrigin),
      });
      setBookingModalVisible(false);
      setBookingModalError('');
      setPassengerOrigin(null);
      setPassengerOriginManualAddress('');
      setPassengerOriginReference('');
      setPassengerDestination(null);
      setPassengerDestinationManualAddress('');
      setPassengerDestinationReference('');
      setShouldAutofillPassengerOrigin(false);
      setBookingStep(1);
      openBookingSuccessModal(seatsValue);
      refreshBookingLists();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de créer la réservation pour le moment.';
      setBookingModalError(Array.isArray(message) ? message.join('\n') : message);
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
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible d’annuler la réservation pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
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

  const handleConfirmPickup = async () => {
    if (!activeBooking) {
      return;
    }
    try {
      await confirmPickupByPassenger(activeBooking.id).unwrap();
      void trackEvent('booking_pickup_confirmed', {
        booking_id: activeBooking.id,
        trip_id: activeBooking.tripId,
        source_screen: 'trip_details',
      });
      showDialog({
        variant: 'success',
        title: 'Confirmation réussie',
        message: 'Vous avez confirmé votre prise en charge.',
      });
      refreshBookingLists();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de confirmer la prise en charge pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleConfirmDropoff = async () => {
    if (!activeBooking) {
      return;
    }
    try {
      await confirmDropoffByPassenger(activeBooking.id).unwrap();
      void trackEvent('booking_dropoff_confirmed', {
        booking_id: activeBooking.id,
        trip_id: activeBooking.tripId,
        source_screen: 'trip_details',
      });
      showDialog({
        variant: 'success',
        title: 'Confirmation réussie',
        message: 'Vous avez confirmé votre dépose. La réservation est maintenant complétée.',
      });
      refreshBookingLists();
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible de confirmer la dépose pour le moment.';
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const closeKycWizard = () => {
    if (kycSubmitting || uploadingKyc) {
      return;
    }
    setKycWizardVisible(false);
  };

  const buildKycFormData = (files?: Partial<KycCaptureResult>) => {
    const formData = new FormData();
    const appendFile = (field: 'cniFront' | 'cniBack' | 'selfie', uri: string | null | undefined) => {
      if (!uri) return;
      const extensionMatch = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
      const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : extension === 'heic'
              ? 'image/heic'
              : 'image/jpeg';
      formData.append(field, {
        uri,
        type: mimeType,
        name: `${field}-${Date.now()}.${extension === 'jpg' ? 'jpg' : extension}`,
      } as any);
    };

    appendFile('cniFront', files?.front ?? kycFrontImage);
    appendFile('cniBack', files?.back ?? kycBackImage);
    appendFile('selfie', files?.selfie ?? kycSelfieImage);

    return formData;
  };

  const handleSubmitKyc = async (documents?: Partial<KycCaptureResult>) => {
    const front = documents?.front ?? kycFrontImage;
    const back = documents?.back ?? kycBackImage;
    const selfie = documents?.selfie ?? kycSelfieImage;

    if (!front || !back || !selfie) {
      showDialog({
        variant: 'warning',
        title: 'Documents requis',
        message: 'Merci de fournir les deux faces de votre pièce ainsi qu\'un selfie.',
      });
      return;
    }
    try {
      setKycSubmitting(true);
      const formData = buildKycFormData({ front, back, selfie });
      const result = await uploadKyc(formData).unwrap();
      setKycWizardVisible(false);

      // Refetch immédiatement pour obtenir le statut mis à jour
      await refetchKycStatus();

      // Vérifier le statut retourné par le backend
      const kycStatusAfterUpload = result?.status;

      if (kycStatusAfterUpload === 'approved') {
        // KYC approuvé immédiatement (validation automatique réussie)
        showDialog({
          variant: 'success',
          title: 'KYC validé avec succès !',
          message: 'Votre identité a été vérifiée automatiquement. Vous pouvez maintenant réserver ce trajet.',
        });
      } else if (kycStatusAfterUpload === 'rejected') {
        // KYC rejeté (validation automatique échouée)
        const rejectionReason = result?.rejectionReason || 'Votre demande KYC a été rejetée.';
        showDialog({
          variant: 'danger',
          title: 'KYC rejeté',
          message: rejectionReason,
        });
      } else {
        // KYC en attente (validation manuelle requise)
        showDialog({
          variant: 'success',
          title: 'Documents envoyés',
          message: 'Vos documents sont en cours de vérification. Nous vous informerons dès que la vérification sera terminée.',
        });
      }
    } catch (error: any) {
      // Gérer les erreurs détaillées du backend
      let errorMessage = error?.data?.message ?? error?.error ?? 'Impossible de soumettre les documents pour le moment.';

      // Si le message est une chaîne, la traiter directement
      if (typeof errorMessage === 'string') {
        // Le backend peut retourner des messages multi-lignes avec des détails
        errorMessage = errorMessage;
      } else if (Array.isArray(errorMessage)) {
        errorMessage = errorMessage.join('\n');
      }

      showDialog({
        variant: 'danger',
        title: 'Erreur KYC',
        message: errorMessage,
      });
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleKycWizardComplete = async (payload: KycCaptureResult) => {
    setKycFrontImage(payload.front);
    setKycBackImage(payload.back);
    setKycSelfieImage(payload.selfie);
    await handleSubmitKyc(payload);
  };

  const isKycBusy = kycSubmitting || uploadingKyc;

  const estimatedTotal = useMemo(() => {
    const seatsValue = parseInt(bookingSeats, 10);
    if (Number.isNaN(seatsValue) || seatsValue <= 0 || !trip) {
      return 0;
    }
    return trip.price === 0 ? 0 : seatsValue * trip.price;
  }, [bookingSeats, trip?.price]);

  const statusConfig = {
    upcoming: { color: Colors.secondary, bgColor: 'rgba(247, 184, 1, 0.1)', label: 'À venir' },
    ongoing: { color: Colors.info, bgColor: 'rgba(52, 152, 219, 0.1)', label: 'En cours' },
    completed: { color: Colors.success, bgColor: 'rgba(46, 204, 113, 0.1)', label: 'Terminé' },
    cancelled: { color: Colors.gray[600], bgColor: Colors.gray[200], label: 'Annulé' },
  };

  const config = trip ? statusConfig[trip.status as keyof typeof statusConfig] : statusConfig.upcoming;

  const departureCoordinate = useMemo(
    () => {
      if (!trip?.departure?.lat || !trip?.departure?.lng) {
        return { latitude: 0, longitude: 0 };
      }
      return {
        latitude: trip.departure.lat,
        longitude: trip.departure.lng,
      };
    },
    [trip?.departure?.lat, trip?.departure?.lng],
  );

  const arrivalCoordinate = useMemo(
    () => {
      if (!trip?.arrival?.lat || !trip?.arrival?.lng) {
        return { latitude: 0, longitude: 0 };
      }
      return {
        latitude: trip.arrival.lat,
        longitude: trip.arrival.lng,
      };
    },
    [trip?.arrival?.lat, trip?.arrival?.lng],
  );

  // Load route coordinates and info when trip changes
  useEffect(() => {
    if (!trip) {
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
  }, [departureCoordinate, arrivalCoordinate, trip?.id, trip?.departureTime]);

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
    const latitudeCenter = (departureCoordinate.latitude + arrivalCoordinate.latitude) / 2;
    const longitudeCenter = (departureCoordinate.longitude + arrivalCoordinate.longitude) / 2;
    const latitudeDelta =
      Math.max(Math.abs(departureCoordinate.latitude - arrivalCoordinate.latitude), 0.05) * 1.6;
    const longitudeDelta =
      Math.max(Math.abs(departureCoordinate.longitude - arrivalCoordinate.longitude), 0.05) * 1.6;

    return {
      latitude: latitudeCenter,
      longitude: longitudeCenter,
      latitudeDelta,
      longitudeDelta,
    };
  }, [arrivalCoordinate, departureCoordinate]);

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
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
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
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails du trajet</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={openTripSecurityModal}
              style={[styles.shareButton, !canAccessTripSecurity && styles.shareButtonDisabled]}
              disabled={!canAccessTripSecurity}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color={canAccessTripSecurity ? Colors.primary : Colors.gray[400]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShareModalVisible(true)}
              style={styles.shareButton}
            >
              <Ionicons name="share-outline" size={24} color={Colors.primary} />
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
        {/* Carte interactive - masquée quand le trajet est en cours */}
        {trip?.status !== 'ongoing' && (
          <TouchableOpacity
            style={styles.mapContainer}
            onPress={() => setMapModalVisible(true)}
            activeOpacity={0.95}
          >
            <View style={styles.mapPreview}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.mapView}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={mapRegion}
              >
                {/* Route polyline */}
                {routeCoordinates && routeCoordinates.length > 0 ? (
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor={Colors.primary}
                    strokeWidth={4}
                  />
                ) : (
                  <Polyline
                    coordinates={[departureCoordinate, arrivalCoordinate]}
                    strokeColor={Colors.primary}
                    strokeWidth={4}
                    lineDashPattern={[1, 1]}
                  />
                )}

                <Marker
                  coordinate={departureCoordinate}
                >
                  <View style={styles.markerStartCircle}>
                    <Ionicons name="location" size={18} color={Colors.white} />
                  </View>
                </Marker>

                <Marker
                  coordinate={arrivalCoordinate}
                >
                  <View style={styles.markerEndCircle}>
                    <Ionicons name="navigate" size={18} color={Colors.white} />
                  </View>
                </Marker>

                {/* Destinations des passagers */}
                {tripBookings
                  ?.filter(
                    (booking) =>
                      booking.status === 'accepted' &&
                      booking.passengerDestinationCoordinates &&
                      booking.passengerDestinationCoordinates.latitude &&
                      booking.passengerDestinationCoordinates.longitude,
                  )
                  .map((booking) => {
                    const destCoords = booking.passengerDestinationCoordinates!;
                    return (
                      <Marker
                        key={`passenger-dest-${booking.id}`}
                        coordinate={{
                          latitude: destCoords.latitude,
                          longitude: destCoords.longitude,
                        }}
                      >
                        <View style={styles.markerPassengerDestCircle}>
                          <Ionicons name="person" size={14} color={Colors.white} />
                        </View>
                      </Marker>
                    );
                  })}
              </MapView>

              <View style={styles.mapOverlay}>
                <Text style={styles.mapOverlayText}>Touchez pour agrandir</Text>
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
        {trip?.status !== 'ongoing' && (
          <Modal visible={mapModalVisible} animationType="fade" transparent onRequestClose={() => setMapModalVisible(false)}>
            <View style={styles.mapModalOverlay}>
              <View style={styles.mapModalContent}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.fullscreenMap}
                  mapType="standard"
                  initialRegion={mapRegion}
                >
                  {/* Route polyline */}
                  {routeCoordinates && routeCoordinates.length > 0 ? (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={Colors.primary}
                      strokeWidth={5}
                    />
                  ) : (
                    <Polyline
                      coordinates={[departureCoordinate, arrivalCoordinate]}
                      strokeColor={Colors.primary}
                      strokeWidth={5}
                    />
                  )}

                  <Marker
                    coordinate={departureCoordinate}
                  >
                    <View style={styles.markerStartCircle}>
                      <Ionicons name="location" size={20} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Départ</Text>
                        <Text>{trip?.departure.address}</Text>
                      </View>
                    </Callout>
                  </Marker>

                  <Marker
                    coordinate={arrivalCoordinate}
                  >
                    <View style={styles.markerEndCircle}>
                      <Ionicons name="navigate" size={20} color={Colors.white} />
                    </View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Arrivée</Text>
                        <Text>{trip?.arrival?.address}</Text>
                      </View>
                    </Callout>
                  </Marker>

                  {/* Destinations des passagers */}
                  {tripBookings
                    ?.filter(
                      (booking) =>
                        booking.status === 'accepted' &&
                        booking.passengerDestinationCoordinates &&
                        booking.passengerDestinationCoordinates.latitude &&
                        booking.passengerDestinationCoordinates.longitude,
                    )
                    .map((booking) => {
                      const destCoords = booking.passengerDestinationCoordinates!;
                      return (
                        <Marker
                          key={`passenger-dest-fullscreen-${booking.id}`}
                          coordinate={{
                            latitude: destCoords.latitude,
                            longitude: destCoords.longitude,
                          }}
                        >
                          <View style={styles.markerPassengerDestCircle}>
                            <Ionicons name="person" size={16} color={Colors.white} />
                          </View>
                          <Callout>
                            <View>
                              <Text style={{ fontWeight: 'bold' }}>{booking.passengerDestination || booking.passengerName || 'Destination passager'}</Text>
                              <Text>{booking.passengerName || 'Passager'}</Text>
                            </View>
                          </Callout>
                        </Marker>
                      );
                    })}
                </MapView>

                <TouchableOpacity style={styles.closeMapButton} onPress={() => setMapModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

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

        {/* Statut du trajet */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusCard, { backgroundColor: config.bgColor }]}>
            <View style={styles.statusHeader}>
              <View style={styles.statusHeaderLeft}>
                <View style={[styles.statusDot, { backgroundColor: config.color }]} />
                <Text style={styles.statusLabel}>{config.label}</Text>
              </View>
              {trip?.status === 'ongoing' && (
                <Text style={styles.progressText}>{progress}% complété</Text>
              )}
            </View>

            {trip?.status === 'ongoing' && (
              <>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.etaText}>
                  Arrivée estimée: {estimatedArrivalTime ? formatTime(estimatedArrivalTime.toISOString()) : calculatedArrivalTime ? formatTime(calculatedArrivalTime.toISOString()) : formatTime(trip.arrivalTime)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Itinéraire */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ITINÉRAIRE</Text>

            <View style={styles.routeContainer}>
              <View style={styles.routeIconContainer}>
                <View style={styles.routeIconStart}>
                  <Ionicons name="location" size={16} color={Colors.success} />
                </View>
                <View style={styles.routeDivider} />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeName}>{trip?.departure.name}</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{trip?.departure.address}</Text>
                <Text style={styles.routeTime}>
                  Départ: {trip?.departureTime ? formatTime(trip.departureTime) : ''}
                </Text>
              </View>
            </View>

            <View style={styles.routeContainer}>
              <View style={styles.routeIconContainer}>
                <View style={styles.routeIconEnd}>
                  <Ionicons name="navigate" size={16} color={Colors.primary} />
                </View>
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeName}>{trip?.arrival.name}</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{trip?.arrival.address}</Text>
                <Text style={styles.routeTime}>
                  Arrivée: {calculatedArrivalTime ? formatTime(calculatedArrivalTime.toISOString()) : (trip?.arrivalTime ? formatTime(trip.arrivalTime!) : '')}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Informations du conducteur */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>CONDUCTEUR</Text>

            <TouchableOpacity
              style={styles.driverInfo}
              onPress={() => {
                if (trip?.driverId) {
                  router.push({
                    pathname: '/driver/[id]',
                    params: { id: trip.driverId }
                  });
                }
              }}
              activeOpacity={0.7}
            >
              {trip?.driverAvatar ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedImageUri(trip?.driverAvatar!);
                    setImageModalVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: trip?.driverAvatar }}
                    style={styles.driverAvatar}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.driverAvatar}>
                  <Ionicons name="person" size={28} color={Colors.gray[400]} />
                </View>
              )}
              <View style={styles.driverDetails}>
                <View style={styles.driverNameRow}>
                  <Text style={styles.driverName} numberOfLines={1}>{trip?.driverName}</Text>
                  {(trip?.driver?.premiumBadge || trip?.driver?.premiumBadgeEnabled) && (
                    <View style={styles.driverProBadge}>
                      <Ionicons name="shield-checkmark" size={12} color={Colors.white} />
                      <Text style={styles.driverProBadgeText}>Pro</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} />
                </View>
                <View style={styles.driverMeta}>
                  <Ionicons name="star" size={14} color={Colors.secondary} />
                  <Text style={styles.driverRating}>{driverReviewAverage.toFixed(1)}</Text>
                  <View style={styles.driverDot} />
                  <Text style={styles.driverVehicle} numberOfLines={1}>
                    {trip?.vehicle
                      ? `${trip.vehicle.brand} ${trip.vehicle.model}`
                      : trip?.vehicleInfo}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.driverReviewLink}
                  onPress={(e) => {
                    e.stopPropagation();
                    setReviewsModalVisible(true);
                  }}
                  disabled={driverReviewCount === 0}
                >
                  <Text
                    style={[
                      styles.driverReviewLinkText,
                      driverReviewCount === 0 && styles.driverReviewLinkTextDisabled,
                    ]}
                  >
                    {driverReviewCount > 0
                      ? `${driverReviewCount} avis`
                      : 'Pas encore d\'avis'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            <View style={styles.driverActions}>
              <TouchableOpacity
                style={styles.driverActionButton}
                onPress={handleContactDriver}
                disabled={isCreatingConversation}
              >
                {isCreatingConversation ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="chatbubble-ellipses" size={18} color={Colors.primary} />
                    <Text style={styles.driverActionText}>Message</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.driverActionButton, styles.driverActionButtonGreen]}
                disabled={!driverPhone}
                onPress={() => {
                  if (driverPhone) {
                    setContactModalVisible(true);
                  }
                }}
              >
                <Ionicons
                  name="logo-whatsapp"
                  size={18}
                  color={driverPhone ? '#25D366' : Colors.gray[300]}
                />
                <Text
                  style={[
                    styles.driverActionText,
                    { color: driverPhone ? '#25D366' : Colors.gray[400] },
                  ]}
                >
                  WhatsApp
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Détails */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>DÉTAILS</Text>

            <View style={styles.detailsList}>
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="people" size={20} color={availableSeats <= 0 ? Colors.danger : Colors.primary} />
                  <Text style={styles.detailLabel}>Places disponibles</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {availableSeats <= 0 && (
                    <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                  )}
                  <Text style={[
                    styles.detailValue,
                    availableSeats <= 0 && { color: Colors.danger, fontWeight: FontWeights.bold }
                  ]}>
                    {availableSeats <= 0 ? 'Complet' : `${trip?.availableSeats}/${trip?.totalSeats}`}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="cash" size={20} color={Colors.success} />
                  <Text style={styles.detailLabel}>Prix</Text>
                </View>
                <Text style={[styles.detailValue, { color: Colors.success }]}>
                  {trip?.price === 0 ? 'Gratuit' : `${trip?.price} FC`}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons
                    name={
                      trip?.vehicleType === 'moto'
                        ? 'bicycle'
                        : trip?.vehicleType === 'tricycle'
                          ? 'car-sport'
                          : 'car'
                    }
                    size={20}
                    color={Colors.gray[600]}
                  />
                  <Text style={styles.detailLabel}>Véhicule</Text>
                </View>
                <View style={styles.vehicleInfoContainer}>
                  {trip?.vehicle ? (
                    <>
                      <Text style={styles.detailValue}>
                        {trip?.vehicle.brand} {trip?.vehicle.model}
                      </Text>
                      <Text style={styles.vehicleDetails}>
                        {trip?.vehicle.color} • {trip?.vehicle.licensePlate}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.detailValue}>
                        {trip?.vehicleType === 'moto'
                          ? 'Moto'
                          : trip?.vehicleType === 'tricycle'
                            ? 'Tricycle'
                            : 'Voiture'}
                      </Text>
                      {trip?.vehicleInfo && trip?.vehicleInfo !== 'Informations véhicule fournies par le conducteur' && (
                        <Text style={styles.vehicleDetails}>{trip?.vehicleInfo}</Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        {showPassengerSecurityAccess && (
          <Animated.View entering={FadeInDown.delay(460)} style={styles.section}>
            <View style={[styles.sectionCard, styles.passengerSecurityCard]}>
              <View style={styles.passengerSecurityHeader}>
                <View style={styles.passengerSecurityIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.passengerSecurityHeaderCopy}>
                  <Text style={styles.passengerSecurityTitle}>SECURITE PASSAGER</Text>
                  <Text style={styles.passengerSecuritySubtitle}>
                    Proches, suivi live et alerte en un seul endroit.
                  </Text>
                </View>
              </View>
              <Text style={styles.passengerSecurityHintText}>{passengerSecurityQuickHint}</Text>
              <TouchableOpacity
                style={[
                  styles.passengerSecurityButton,
                  !canAccessTripSecurity && styles.passengerSecurityButtonDisabled,
                ]}
                onPress={openTripSecurityModal}
                disabled={!canAccessTripSecurity}
                activeOpacity={0.9}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={18}
                  color={canAccessTripSecurity ? Colors.white : Colors.gray[500]}
                />
                <Text
                  style={[
                    styles.passengerSecurityButtonText,
                    !canAccessTripSecurity && styles.passengerSecurityButtonTextDisabled,
                  ]}
                >
                  {passengerSecurityButtonLabel}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={canAccessTripSecurity ? Colors.white : Colors.gray[500]}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.passengerSecuritySecondaryButton}
                onPress={openEmergencyContacts}
                activeOpacity={0.9}
              >
                <Ionicons name="people-outline" size={16} color={Colors.primary} />
                <Text style={styles.passengerSecuritySecondaryButtonText}>
                  Ajouter ou gerer mes contacts d urgence
                </Text>
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
              <View style={styles.securityReminderHeader}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.secondary} />
                <Text style={styles.securityReminderTitle}>Verification avant embarquement</Text>
              </View>
              <Text style={styles.securityReminderText}>
                Avant de monter, verifiez que le vehicule devant vous correspond exactement a celui du trajet.
              </Text>
              <View style={styles.securityReminderVehicleBox}>
                <Text style={styles.securityReminderVehicleLabel}>Vehicule attendu</Text>
                <Text style={styles.securityReminderVehicleValue}>{tripVehicleIdentity}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {showDriverVehicleReminder && (
          <Animated.View entering={FadeInDown.delay(560)} style={styles.section}>
            <View style={[styles.sectionCard, styles.securityReminderCard]}>
              <View style={styles.securityReminderHeader}>
                <Ionicons name="car-sport" size={20} color={Colors.primary} />
                <Text style={styles.securityReminderTitle}>Rappel securite conducteur</Text>
              </View>
              <Text style={styles.securityReminderText}>
                Assurez-vous de conduire le vehicule indique ci-dessous. Si vous changez de vehicule, mettez a jour le trajet avant de recuperer un passager.
              </Text>
              <View style={styles.securityReminderVehicleBox}>
                <Text style={styles.securityReminderVehicleLabel}>Vehicule declare</Text>
                <Text style={styles.securityReminderVehicleValue}>{tripVehicleIdentity}</Text>
              </View>
              <TouchableOpacity
                style={styles.driverSecurityActionButton}
                onPress={openTripSecurityModal}
                activeOpacity={0.9}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
                <Text style={styles.driverSecurityActionButtonText}>
                  Choisir qui notifier sur ce trajet
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Sticky Footer for Actions */}
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        {(() => {
          // Vérifier si le trajet est expiré (date de départ passée)
          const isExpired = trip?.departureTime && new Date(trip?.departureTime) < new Date();
          // Vérifier si le trajet peut être réservé (pas complété, pas annulé, pas expiré)
          const canBook = trip?.status !== 'completed' &&
            trip?.status !== 'cancelled' &&
            !isExpired &&
            (
              trip?.status === 'upcoming' ||
              (trip?.status === 'ongoing' && (availableSeats > 0 || Boolean(activeBooking && activeBookingStatus)))
            );

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
                        <View>
                          <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                          <Text style={styles.bookingCardSubtitle}>
                            {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' • '}{trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.bookingStatusBadge,
                            { backgroundColor: activeBookingStatus.background },
                          ]}
                        >
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
                                Confirmation de prise en charge requise
                              </Text>
                            </View>
                          )}
                          {activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger && (
                            <View style={styles.confirmationBanner}>
                              <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                              <Text style={styles.confirmationBannerText}>
                                Confirmation de dépose requise
                              </Text>
                            </View>
                          )}
                        </>
                      )}

                      <View style={styles.bookingActionsRow}>
                        {activeBooking.status === 'accepted' && activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                          <TouchableOpacity
                            style={[styles.bookingActionButton, styles.bookingActionConfirm]}
                            onPress={handleConfirmPickup}
                            disabled={isConfirmingPickup}
                          >
                            {isConfirmingPickup ? <ActivityIndicator size="small" color={Colors.white} /> : (
                              <>
                                <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                                <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>
                                  Confirmer prise en charge
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {activeBooking.status === 'accepted' && activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger && (
                          <TouchableOpacity
                            style={[styles.bookingActionButton, styles.bookingActionConfirm]}
                            onPress={handleConfirmDropoff}
                            disabled={isConfirmingDropoff}
                          >
                            {isConfirmingDropoff ? <ActivityIndicator size="small" color={Colors.white} /> : (
                              <>
                                <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                                <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>Confirmer dépose</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {/* Bouton Navigation - visible quand le trajet est en cours */}
                        {activeBooking.status === 'accepted' && trip.status === 'ongoing' &&
                          !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                          !(activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger) && (
                            <TouchableOpacity
                              style={[styles.bookingActionButton, styles.bookingActionNavigation]}
                              onPress={() => router.push(`/booking/navigate/${activeBooking.id}`)}
                            >
                              <Ionicons name="navigate" size={18} color={Colors.white} />
                              <Text style={[styles.bookingActionText, styles.bookingActionNavigationText]}>Suivre</Text>
                            </TouchableOpacity>
                          )}

                        {activeBooking.status === 'accepted' && driverPhone &&
                          !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                          !(activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger) && (
                            <TouchableOpacity
                              style={[styles.bookingActionButton, styles.bookingActionCall]}
                              onPress={() => setContactModalVisible(true)}
                            >
                              <Ionicons name="logo-whatsapp" size={18} color={'#25D366'} />
                              <Text style={[styles.bookingActionText, styles.bookingActionCallText]}>WhatsApp</Text>
                            </TouchableOpacity>
                          )}

                        {!(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                          !(activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger) && (
                            <TouchableOpacity
                              style={[styles.bookingActionButton, styles.bookingActionDanger]}
                              onPress={confirmCancelBooking}
                              disabled={isCancellingBooking}
                            >
                              {isCancellingBooking ? <ActivityIndicator size="small" color={Colors.danger} /> : (
                                <>
                                  <Ionicons name="close-circle" size={18} color={Colors.danger} />
                                  <Text style={[styles.bookingActionText, styles.bookingActionDangerText]}>Annuler</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                      </View>
                      {!isTripDriver && (
                        <TouchableOpacity
                          style={[
                            styles.bookingSecurityQuickButton,
                            !canAccessTripSecurity && styles.bookingSecurityQuickButtonDisabled,
                          ]}
                          onPress={openTripSecurityModal}
                          disabled={!canAccessTripSecurity}
                          activeOpacity={0.9}
                        >
                          <View style={styles.bookingSecurityQuickIcon}>
                            <Ionicons
                              name="shield-checkmark-outline"
                              size={18}
                              color={canAccessTripSecurity ? Colors.primary : Colors.gray[400]}
                            />
                          </View>
                          <View style={styles.bookingSecurityQuickCopy}>
                            <Text
                              style={[
                                styles.bookingSecurityQuickTitle,
                                !canAccessTripSecurity && styles.bookingSecurityQuickTitleDisabled,
                              ]}
                            >
                              Securite du trajet
                            </Text>
                            <Text style={styles.bookingSecurityQuickSubtitle}>
                              Choisir proches, activer suivi, envoyer alerte
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={canAccessTripSecurity ? Colors.primary : Colors.gray[400]}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                ) : availableSeats <= 0 ? (
                  <View style={[styles.actionButton, styles.actionButtonDisabled]}>
                    <Ionicons name="close-circle" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>Complet • Plus de places disponibles</Text>
                  </View>
                ) : !isKycApproved ? (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonKycRequired]}
                    onPress={ensureKycForBooking}
                  >
                    <Ionicons name="shield-checkmark-outline" size={20} color={Colors.white} />
                    <Text style={styles.actionButtonText}>{kycBookingLockLabel}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={openBookingModal}
                  >
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

      <Modal
        visible={securityModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSecurityModalVisible(false)}
      >
        <View style={styles.securityModalOverlay}>
          <TouchableOpacity
            style={styles.securityModalBackdrop}
            activeOpacity={1}
            onPress={() => setSecurityModalVisible(false)}
          />
          <View
            style={[
              styles.securityModalContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
          >
            <View style={styles.securityModalHeader}>
              <Text style={styles.securityModalTitle}>Securite du trajet</Text>
              <TouchableOpacity
                style={styles.securityModalCloseButton}
                onPress={() => setSecurityModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>
            {trip ? (
              <ScrollView
                style={styles.securityModalBody}
                contentContainerStyle={styles.securityModalBodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <TripSecurityPanel
                  tripId={trip.id}
                  role={tripSecurityRole}
                  tripStatus={trip.status}
                  bookingId={tripSecurityBookingId}
                  openSelectorByDefault={securityModalVisible}
                  compact
                />
              </ScrollView>
            ) : (
              <View style={styles.securityModalLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.securityModalLoadingText}>Chargement securite...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={bookingModalVisible}>
        <View style={styles.bookingModalOverlay}>
          <View style={[styles.bookingModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            {/* Step Indicator */}
            <View style={styles.bookingStepIndicator}>
              <View style={[styles.bookingStepDot, bookingStep >= 1 && styles.bookingStepDotActive]} />
              <View style={[styles.bookingStepLine, bookingStep >= 2 && styles.bookingStepLineActive]} />
              <View style={[styles.bookingStepDot, bookingStep >= 2 && styles.bookingStepDotActive]} />
              <View style={[styles.bookingStepLine, bookingStep >= 3 && styles.bookingStepLineActive]} />
              <View style={[styles.bookingStepDot, bookingStep >= 3 && styles.bookingStepDotActive]} />
            </View>

            {/* Step 1: Nombre de places */}
            {bookingStep === 1 && (
              <>
                <Text style={styles.bookingModalTitle}>Nombre de places</Text>
                <Text style={styles.bookingModalDescription}>
                  Combien de places souhaitez-vous réserver ?
                </Text>

                <View style={styles.bookingSeatRow}>
                  <TouchableOpacity
                    style={styles.bookingSeatButton}
                    onPress={() => adjustBookingSeats(-1)}
                    disabled={isBooking}
                  >
                    <Ionicons name="remove" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.bookingSeatInput}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor={Colors.gray[400]}
                    value={bookingSeats}
                    onChangeText={handleBookingSeatsChange}
                    editable={!isBooking}
                    maxLength={1}
                  />
                  <TouchableOpacity
                    style={styles.bookingSeatButton}
                    onPress={() => adjustBookingSeats(1)}
                    disabled={isBooking}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.bookingModalHint}>
                  {seatLimit} place{seatLimit > 1 ? 's' : ''} disponible{seatLimit > 1 ? 's' : ''}
                </Text>

                <Text style={styles.bookingModalPrice}>
                  Total estimé :{' '}
                  <Text style={styles.bookingModalPriceValue}>
                    {estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal} FC`}
                  </Text>
                </Text>
              </>
            )}

            {/* Step 2: Point de récupération */}
            {bookingStep === 2 && (
              <>
                <Text style={styles.bookingModalTitle}>Point de récupération</Text>
                <Text style={styles.bookingModalDescription}>
                  Choisissez d’abord la méthode. Elle servira aussi pour votre destination.
                </Text>

                <View style={styles.bookingDestinationSection}>
                  <AddressEntryModeSelector
                    mode={bookingAddressInputMode}
                    onChange={setBookingAddressInputMode}
                    title="Comment renseigner les adresses ?"
                    hint="Un seul choix pour la prise en charge et la destination."
                    style={styles.bookingAddressModeSelector}
                  />
                  {bookingAddressInputMode === 'map' && (
                  <>
                  <Text style={styles.bookingChoiceLabel}>Point de prise en charge</Text>
                  <TouchableOpacity
                    style={[
                      styles.bookingDestinationButton,
                      passengerOrigin && styles.bookingDestinationButtonSelected,
                    ]}
                    onPress={() => setShowOriginPicker(true)}
                    disabled={isBooking}
                  >
                    <Ionicons
                      name={passengerOrigin ? 'location' : 'location-outline'}
                      size={18}
                      color={passengerOrigin ? Colors.secondary : Colors.gray[600]}
                    />
                    <Text
                      style={[
                        styles.bookingDestinationButtonText,
                        passengerOrigin && styles.bookingDestinationButtonTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {passengerOrigin
                        ? passengerOrigin.title || passengerOrigin.address
                        : 'Choisir sur la carte ou utiliser ma position'}
                    </Text>
                    {passengerOrigin && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setPassengerOrigin(null);
                          setShouldAutofillPassengerOrigin(false);
                        }}
                        style={styles.bookingDestinationRemoveButton}
                      >
                        <Ionicons name="close-circle" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.bookingDestinationHint}>
                    Si vous ne changez rien, le départ du trajet sera utilisé : {trip?.departure?.address}
                  </Text>
                  </>
                  )}
                  <View style={styles.bookingManualHeader}>
                    <Ionicons name="create-outline" size={16} color={Colors.primary} />
                    <Text style={styles.bookingChoiceLabel}>
                      {bookingAddressInputMode === 'manual' ? 'Adresse de départ' : 'Repère de départ (optionnel)'}
                    </Text>
                  </View>
                  {bookingAddressInputMode === 'manual' && (
                    <TextInput
                      style={styles.bookingManualInput}
                      value={passengerOriginManualAddress}
                      onChangeText={setPassengerOriginManualAddress}
                      placeholder="Ex: avenue Kasa-Vubu, Bandal"
                      placeholderTextColor={Colors.gray[400]}
                      editable={!isBooking}
                    />
                  )}
                  {bookingAddressInputMode === 'manual' && (
                    <Text style={styles.bookingFieldLabel}>Repère de départ (optionnel)</Text>
                  )}
                  <TextInput
                    style={styles.bookingManualInput}
                    value={passengerOriginReference}
                    onChangeText={setPassengerOriginReference}
                    placeholder={LANDMARK_PLACEHOLDER}
                    placeholderTextColor={Colors.gray[400]}
                    editable={!isBooking}
                  />
                </View>
              </>
            )}

            {/* Step 3: Destination */}
            {bookingStep === 3 && (
              <>
                <Text style={styles.bookingModalTitle}>Ma destination</Text>
                <Text style={styles.bookingModalDescription}>
                  Même méthode que la prise en charge. Vous pouvez garder l’arrivée du trajet.
                </Text>

                <View style={styles.bookingDestinationSection}>
                  <View style={styles.bookingModeSummary}>
                    <Ionicons
                      name={bookingAddressInputMode === 'map' ? 'map-outline' : 'create-outline'}
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.bookingModeSummaryText}>
                      Mode choisi : {bookingAddressInputMode === 'map' ? 'Choisir sur la carte' : 'Saisie manuelle'}
                    </Text>
                  </View>
                  {bookingAddressInputMode === 'map' && (
                  <>
                  <Text style={styles.bookingChoiceLabel}>Point d’arrivée</Text>
                  <TouchableOpacity
                    style={[
                      styles.bookingDestinationButton,
                      passengerDestination && styles.bookingDestinationButtonSelected,
                    ]}
                    onPress={() => setShowDestinationPicker(true)}
                    disabled={isBooking || isValidatingDestination}
                  >
                    <Ionicons
                      name={passengerDestination ? 'flag' : 'flag-outline'}
                      size={18}
                      color={passengerDestination ? Colors.primary : Colors.gray[600]}
                    />
                    <Text
                      style={[
                        styles.bookingDestinationButtonText,
                        passengerDestination && styles.bookingDestinationButtonTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {passengerDestination
                        ? passengerDestination.title || passengerDestination.address
                        : 'Choisir sur la carte'}
                    </Text>
                    {passengerDestination && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setPassengerDestination(null);
                        }}
                        style={styles.bookingDestinationRemoveButton}
                      >
                        <Ionicons name="close-circle" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.bookingDestinationHint}>
                    Si vous laissez vide, l&apos;arrivée du trajet sera utilisée : {trip?.arrival?.address}
                  </Text>
                  </>
                  )}
                  <View style={styles.bookingManualHeader}>
                    <Ionicons name="create-outline" size={16} color={Colors.primary} />
                    <Text style={styles.bookingChoiceLabel}>
                      {bookingAddressInputMode === 'manual' ? 'Adresse d’arrivée' : 'Repère d’arrivée (optionnel)'}
                    </Text>
                  </View>
                  {bookingAddressInputMode === 'manual' && (
                    <TextInput
                      style={styles.bookingManualInput}
                      value={passengerDestinationManualAddress}
                      onChangeText={setPassengerDestinationManualAddress}
                      placeholder="Ex: rond-point Victoire"
                      placeholderTextColor={Colors.gray[400]}
                      editable={!isBooking && !isValidatingDestination}
                    />
                  )}
                  {bookingAddressInputMode === 'manual' && (
                    <Text style={styles.bookingFieldLabel}>Repère d’arrivée (optionnel)</Text>
                  )}
                  <TextInput
                    style={styles.bookingManualInput}
                    value={passengerDestinationReference}
                    onChangeText={setPassengerDestinationReference}
                    placeholder={LANDMARK_PLACEHOLDER}
                    placeholderTextColor={Colors.gray[400]}
                    editable={!isBooking && !isValidatingDestination}
                  />
                </View>

                {/* Récapitulatif */}
                <View style={styles.bookingSummary}>
                  <Text style={styles.bookingSummaryTitle}>Récapitulatif</Text>
                  <View style={styles.bookingSummaryRow}>
                    <Ionicons name="people" size={16} color={Colors.gray[600]} />
                    <Text style={styles.bookingSummaryText}>{bookingSeats} place{parseInt(bookingSeats) > 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.bookingSummaryRow}>
                    <Ionicons name="location" size={16} color={Colors.secondary} />
                    <Text style={styles.bookingSummaryText} numberOfLines={1}>
                      {passengerOriginManualAddress.trim() || passengerOrigin?.title || passengerOrigin?.address || trip?.departure?.address}
                    </Text>
                  </View>
                  {passengerOriginReference.trim() ? (
                    <View style={styles.bookingSummaryRow}>
                      <Ionicons name="trail-sign" size={16} color={Colors.secondary} />
                      <Text style={styles.bookingSummaryText} numberOfLines={1}>
                        {passengerOriginReference.trim()}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.bookingSummaryRow}>
                    <Ionicons name="flag" size={16} color={Colors.primary} />
                    <Text style={styles.bookingSummaryText} numberOfLines={1}>
                      {passengerDestinationManualAddress.trim() || passengerDestination?.title || passengerDestination?.address || trip?.arrival?.address}
                    </Text>
                  </View>
                  {passengerDestinationReference.trim() ? (
                    <View style={styles.bookingSummaryRow}>
                      <Ionicons name="trail-sign" size={16} color={Colors.primary} />
                      <Text style={styles.bookingSummaryText} numberOfLines={1}>
                        {passengerDestinationReference.trim()}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.bookingSummaryRow}>
                    <Ionicons name="cash" size={16} color={Colors.success} />
                    <Text style={styles.bookingSummaryText}>
                      {estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal} FC`}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {bookingModalError ? (
              <Text style={styles.bookingModalError}>{bookingModalError}</Text>
            ) : null}

            <View style={styles.bookingModalActions}>
              {bookingStep === 1 ? (
                <TouchableOpacity
                  style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                  onPress={closeBookingModal}
                  disabled={isBooking}
                >
                  <Text style={styles.bookingModalButtonSecondaryText}>Annuler</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                  onPress={goToPreviousBookingStep}
                  disabled={isBooking}
                >
                  <Ionicons name="arrow-back" size={18} color={Colors.gray[700]} style={{ marginRight: 4 }} />
                  <Text style={styles.bookingModalButtonSecondaryText}>Retour</Text>
                </TouchableOpacity>
              )}
              
              {bookingStep < 3 ? (
                <TouchableOpacity
                  style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                  onPress={goToNextBookingStep}
                  disabled={isBooking}
                >
                  <Text style={styles.bookingModalButtonPrimaryText}>Suivant</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                  onPress={handleConfirmBooking}
                  disabled={isBooking || isValidatingDestination || !isKycApproved || isKycStatusBusy}
                >
                  {isBooking || isValidatingDestination ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.bookingModalButtonPrimaryText}>
                      {isKycApproved ? 'Confirmer' : 'KYC requis'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Picker pour le point de récupération */}
      <LocationPickerModal
        visible={showOriginPicker}
        title="Mon point de récupération"
        initialLocation={passengerOrigin}
        routeCoordinates={routeCoordinates || undefined}
        restrictToRoute={true}
        onClose={() => setShowOriginPicker(false)}
        onSelect={(location) => {
          setBookingAddressInputMode('map');
          setPassengerOrigin(location);
          setPassengerOriginManualAddress(location.title || location.address);
          setShouldAutofillPassengerOrigin(false);
          setShowOriginPicker(false);
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
        onClose={() => setShowDestinationPicker(false)}
        onSelect={(location) => {
          setBookingAddressInputMode('map');
          setPassengerDestination(location);
          setPassengerDestinationManualAddress(location.title || location.address);
          setShowDestinationPicker(false);
          setBookingModalError('');
        }}
      />

      <Modal animationType="fade" transparent visible={bookingSuccess.visible}>
        <View style={styles.feedbackModalOverlay}>
          <View style={[styles.feedbackModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            <View style={styles.feedbackModalIcon}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.white} />
            </View>
            <Text style={styles.feedbackModalTitle}>Demande envoyée</Text>
            <Text style={styles.feedbackModalText}>
              Votre réservation de {bookingSuccess.seats} place
              {bookingSuccess.seats > 1 ? 's' : ''} est en attente de confirmation du conducteur.
            </Text>
            <View style={styles.feedbackModalActions}>
              <TouchableOpacity
                style={[
                  styles.feedbackModalButton,
                  styles.feedbackModalSecondary,
                  styles.feedbackModalButton,
                ]}
                onPress={closeBookingSuccessModal}
              >
                <Text style={styles.feedbackModalSecondaryText}>Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedbackModalButton, styles.feedbackModalPrimary]}
                onPress={handleViewBookings}
              >
                <Text style={styles.feedbackModalPrimaryText}>Mes réservations</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={reviewsModalVisible}
        onRequestClose={() => setReviewsModalVisible(false)}
      >
        <View style={styles.reviewsModalOverlay}>
          <Animated.View entering={FadeInDown} style={[styles.reviewsModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            <View style={styles.reviewsModalHeader}>
              <Text style={styles.reviewsModalTitle}>Avis sur {trip?.driverName}</Text>
              <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
                <Ionicons name="close" size={20} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.reviewsModalContent}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
              showsVerticalScrollIndicator={false}
            >
              {driverReviewCount === 0 ? (
                <Text style={styles.reviewsEmptyText}>Pas encore d&apos;avis pour ce conducteur.</Text>
              ) : (
                driverReviews?.map((review) => (
                  <View key={review.id} style={styles.reviewItem}>
                    <View style={styles.reviewItemHeader}>
                      <Text style={styles.reviewAuthor}>{review.fromUserName ?? 'Utilisateur'}</Text>
                      <View style={styles.reviewRating}>
                        <Ionicons name="star" size={16} color={Colors.secondary} />
                        <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                    <Text style={styles.reviewDate}>
                      {new Date(review.createdAt).toLocaleDateString('fr-FR')}
                    </Text>
                    {review.comment ? (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <TutorialOverlay
        visible={tripGuideVisible}
        title="Découvrez ce trajet"
        message="Suivez la progression du conducteur, contactez-le ou réservez vos places depuis cet écran."
        onDismiss={dismissTripGuide}
      />

      <KycWizardModal
        visible={kycWizardVisible}
        onClose={closeKycWizard}
        isSubmitting={isKycBusy}
        initialValues={{
          front: kycFrontImage,
          back: kycBackImage,
          selfie: kycSelfieImage,
        }}
        onComplete={handleKycWizardComplete}
      />

      {/* Image Modal */}
      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={styles.imageModalCloseButton}
            onPress={() => setImageModalVisible(false)}
          >
            <Ionicons name="close" size={32} color={Colors.white} />
          </TouchableOpacity>
          {selectedImageUri && (
            <Image
              source={{ uri: selectedImageUri }}
              style={styles.imageModalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Contact Modal */}
      <Modal
        visible={contactModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setContactModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.contactModalOverlay}
          activeOpacity={1}
          onPress={() => setContactModalVisible(false)}
        >
          <Animated.View entering={FadeInDown} style={[styles.contactModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.contactModalHeader}>
              <View style={styles.contactModalIconWrapper}>
                <View style={styles.contactModalIconBadge}>
                  <Ionicons name="logo-whatsapp" size={32} color="#25D366" />
                </View>
              </View>
              <Text style={styles.contactModalTitle}>
                Contacter {trip?.driverName || 'le conducteur'}
              </Text>
              <Text style={styles.contactModalSubtitle}>
                Contact via WhatsApp uniquement
              </Text>
            </View>

            <View style={styles.contactModalActions}>
              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonWhatsApp]}
                onPress={async () => {
                  setContactModalVisible(false);
                  await openWhatsApp(driverPhone!, (errorMsg) => {
                    showDialog({
                      variant: 'danger',
                      title: 'Erreur',
                      message: errorMsg,
                    });
                  });
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>WhatsApp</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Envoyer un message WhatsApp</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.contactModalCancelButton}
              onPress={() => setContactModalVisible(false)}
            >
              <Text style={styles.contactModalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Share Modal */}
      <Modal
        visible={shareModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setShareModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.contactModalOverlay}
          activeOpacity={1}
          onPress={() => setShareModalVisible(false)}
        >
          <Animated.View entering={FadeInDown} style={[styles.contactModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.contactModalHeader}>
              <View style={styles.contactModalIconWrapper}>
                <View style={styles.contactModalIconBadge}>
                  <Ionicons name="share-social" size={32} color={Colors.primary} />
                </View>
              </View>
              <Text style={styles.contactModalTitle}>Partager le trajet</Text>
              <Text style={styles.contactModalSubtitle}>
                Partagez le lien pour permettre à vos contacts de suivre votre trajet en temps réel
              </Text>
            </View>

            <View style={styles.contactModalActions}>
              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonCall]}
                onPress={async () => {
                  setShareModalVisible(false);
                  if (!trip?.id) {
                    showDialog({
                      variant: 'danger',
                      title: 'Erreur',
                      message: 'Impossible de partager le trajet: identifiant manquant',
                    });
                    return;
                  }
                  try {
                    await shareTrip(
                      trip.id,
                      trip?.departure.name,
                      trip?.arrival.name
                    );
                  } catch (error: any) {
                    showDialog({
                      variant: 'danger',
                      title: 'Erreur',
                      message: error?.message || 'Impossible de partager le trajet',
                    });
                  }
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="share-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>Partager</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Partager via l&apos;application de votre choix</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonWhatsApp]}
                onPress={async () => {
                  setShareModalVisible(false);
                  if (!trip?.id) return;
                  try {
                    await shareTripViaWhatsApp(
                      trip.id,
                      undefined,
                      trip?.departure.name,
                      trip?.arrival.name
                    );
                  } catch (error: any) {
                    showDialog({
                      variant: 'danger',
                      title: 'Erreur',
                      message: error?.message || 'Impossible de partager via WhatsApp',
                    });
                  }
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>WhatsApp</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Partager directement sur WhatsApp</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.contactModalCancelButton}
              onPress={() => setShareModalVisible(false)}
            >
              <Text style={styles.contactModalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyStateTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  emptyStateText: {
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[600],
  },
  emptyText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  shareButton: {
    padding: 8,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.full,
  },
  shareButtonDisabled: {
    backgroundColor: Colors.gray[100],
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 100, // Space for sticky footer
  },
  mapContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  mapPreview: {
    height: 240,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.gray[200],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  mapOverlayText: {
    color: Colors.gray[800],
    fontSize: 12,
    fontWeight: FontWeights.semibold,
  },
  markerStartCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
  },
  markerEndCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
  },
  markerCurrentCircle: {
    width: 44,
    height: 44,
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.white,
    elevation: 5,
    shadowColor: Colors.info,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  markerPassengerDestCircle: {
    width: 28,
    height: 28,
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  expandButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
  },
  expandButtonInner: {
    width: 44,
    height: 44,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
  },
  mapModalContent: {
    flex: 1,
    marginVertical: 40,
    marginHorizontal: 16,
    borderRadius: 32,
    overflow: 'hidden',
  },
  fullscreenMap: {
    width: '100%',
    height: '100%',
  },
  closeMapButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  trackingBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.info + '08',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.info + '20',
  },
  trackingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.md,
  },
  trackingStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.md,
  },
  trackingStatusDotActive: {
    backgroundColor: Colors.success,
  },
  trackingStatusDotIdle: {
    backgroundColor: Colors.gray[400],
  },
  trackingTitle: {
    fontSize: 14,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  trackingSubtitle: {
    fontSize: 12,
    color: Colors.gray[600],
    marginTop: 2,
  },
  trackingRefreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  statusContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  statusCard: {
    borderRadius: 20,
    padding: Spacing.lg,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  statusHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.sm,
  },
  statusLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 14,
  },
  progressText: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.info,
  },
  etaText: {
    fontSize: 12,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
    marginBottom: Spacing.lg,
    letterSpacing: 1,
  },
  passengerSecurityCard: {
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '08',
  },
  passengerSecurityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  passengerSecurityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    marginRight: Spacing.sm,
  },
  passengerSecurityHeaderCopy: {
    flex: 1,
  },
  passengerSecurityTitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    letterSpacing: 0.4,
  },
  passengerSecuritySubtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  passengerSecurityHintText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  passengerSecurityButton: {
    minHeight: 50,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
  },
  passengerSecurityButtonDisabled: {
    backgroundColor: Colors.gray[200],
  },
  passengerSecurityButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  passengerSecurityButtonTextDisabled: {
    color: Colors.gray[600],
  },
  passengerSecuritySecondaryButton: {
    marginTop: Spacing.sm,
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
  },
  passengerSecuritySecondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  securityReminderCard: {
    borderColor: Colors.secondary + '35',
    backgroundColor: Colors.secondary + '08',
  },
  securityReminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  securityReminderTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  securityReminderText: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  securityReminderVehicleBox: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    gap: 2,
  },
  securityReminderVehicleLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  securityReminderVehicleValue: {
    fontSize: FontSizes.sm,
    color: Colors.gray[900],
    fontWeight: FontWeights.semibold,
  },
  driverSecurityActionButton: {
    marginTop: Spacing.sm,
    minHeight: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
  },
  driverSecurityActionButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeIconContainer: {
    alignItems: 'center',
    marginRight: Spacing.md,
    width: 32,
  },
  routeIconStart: {
    width: 28,
    height: 28,
    backgroundColor: Colors.success + '15',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconEnd: {
    width: 28,
    height: 28,
    backgroundColor: Colors.primary + '15',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDivider: {
    width: 2,
    height: 44,
    backgroundColor: Colors.gray[100],
    marginVertical: 4,
  },
  routeContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  routeName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 16,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 13,
    color: Colors.gray[500],
    lineHeight: 18,
  },
  routeTime: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
    marginTop: 6,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    borderRadius: 20,
    marginBottom: Spacing.lg,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    backgroundColor: Colors.gray[200],
    borderRadius: 18,
    marginRight: Spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverDetails: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 17,
    flex: 1,
  },
  driverProBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  driverProBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    marginLeft: 4,
    fontSize: 14,
  },
  driverDot: {
    width: 3,
    height: 3,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  driverVehicle: {
    color: Colors.gray[500],
    fontSize: 13,
  },
  driverActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  driverActionButton: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  driverActionButtonGreen: {
    borderColor: Colors.success + '30',
  },
  driverActionText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.bold,
    marginLeft: 8,
    fontSize: 14,
  },
  driverReviewLink: {
    marginTop: 4,
  },
  driverReviewLinkText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  driverReviewLinkTextDisabled: {
    color: Colors.gray[400],
  },
  detailsList: {
    gap: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    borderRadius: 16,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  detailLabel: {
    color: Colors.gray[500],
    fontSize: 14,
    fontWeight: FontWeights.medium,
  },
  detailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 15,
  },
  vehicleInfoContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  vehicleDetails: {
    fontSize: 12,
    color: Colors.gray[500],
    marginTop: 2,
    textAlign: 'right',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    // paddingBottom is set dynamically via useSafeAreaInsets
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  actionsContainer: {
    // Container inside sticky footer
  },
  actionButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: FontWeights.bold,
  },
  actionButtonDisabled: {
    backgroundColor: Colors.gray[300],
    elevation: 0,
    shadowOpacity: 0,
  },
  actionButtonKycRequired: {
    backgroundColor: Colors.gray[800],
    shadowColor: Colors.gray[800],
    shadowOpacity: 0.18,
  },
  bookingCard: {
    backgroundColor: Colors.white,
  },
  bookingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  bookingCardTitle: {
    fontSize: 16,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingCardSubtitle: {
    fontSize: 13,
    color: Colors.gray[500],
    marginTop: 2,
  },
  bookingStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  bookingStatusText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  bookingCardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    borderRadius: 14,
  },
  bookingInfoItem: {
    flex: 1,
  },
  bookingInfoLabel: {
    fontSize: 10,
    color: Colors.gray[400],
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: FontWeights.bold,
  },
  bookingInfoValue: {
    fontSize: 14,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bookingActionButton: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  bookingActionText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: FontWeights.bold,
  },
  bookingActionNavigation: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  bookingActionNavigationText: {
    color: Colors.white,
  },
  bookingActionCall: {
    borderColor: Colors.success + '30',
    backgroundColor: Colors.success + '08',
  },
  bookingActionCallText: {
    color: Colors.success,
  },
  bookingActionDanger: {
    borderColor: Colors.danger + '30',
    backgroundColor: Colors.danger + '08',
  },
  bookingActionDangerText: {
    color: Colors.danger,
  },
  bookingSecurityQuickButton: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    borderRadius: 14,
    backgroundColor: Colors.primary + '08',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookingSecurityQuickButtonDisabled: {
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[100],
  },
  bookingSecurityQuickIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  bookingSecurityQuickCopy: {
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  bookingSecurityQuickTitle: {
    fontSize: 13,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  bookingSecurityQuickTitleDisabled: {
    color: Colors.gray[500],
  },
  bookingSecurityQuickSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.gray[600],
  },
  confirmationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary + '15',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  confirmationBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.gray[800],
    fontWeight: FontWeights.bold,
  },
  bookingActionConfirm: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  bookingActionConfirmText: {
    color: Colors.white,
  },
  bookingActionRate: {
    backgroundColor: Colors.secondary + '15',
    borderColor: Colors.secondary + '30',
  },
  bookingActionRateText: {
    color: Colors.secondary,
  },
  bookingRefreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  bookingRefreshingText: {
    color: Colors.gray[400],
    fontSize: 12,
    marginLeft: 8,
  },
  bookingHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bookingHintIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  bookingHintContent: {
    flex: 1,
  },
  bookingHintTitle: {
    fontSize: 14,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingHintSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.gray[500],
  },
  securityModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  securityModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  securityModalContent: {
    backgroundColor: Colors.gray[50],
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: '86%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  securityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  securityModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  securityModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityModalBody: {
    flex: 1,
  },
  securityModalBodyContent: {
    paddingBottom: Spacing.sm,
  },
  securityModalLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  securityModalLoadingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  bookingModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  bookingStepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  bookingStepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.gray[200],
  },
  bookingStepDotActive: {
    backgroundColor: Colors.primary,
  },
  bookingStepLine: {
    width: 40,
    height: 2,
    backgroundColor: Colors.gray[200],
    marginHorizontal: 4,
  },
  bookingStepLineActive: {
    backgroundColor: Colors.primary,
  },
  bookingSummary: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  bookingSummaryTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  bookingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 6,
  },
  bookingSummaryText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  bookingModalTitle: {
    fontSize: 22,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 8,
  },
  bookingModalDescription: {
    fontSize: 14,
    color: Colors.gray[500],
    marginBottom: Spacing.xl,
  },
  bookingSeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bookingSeatButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  bookingSeatInput: {
    flex: 1,
    height: 56,
    marginHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '05',
    borderRadius: 16,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingModalHint: {
    color: Colors.gray[400],
    fontSize: 12,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  bookingModalPrice: {
    fontSize: 16,
    color: Colors.gray[800],
    marginBottom: Spacing.lg,
    fontWeight: FontWeights.medium,
  },
  bookingModalPriceValue: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    fontSize: 18,
  },
  bookingModalError: {
    color: Colors.danger,
    marginBottom: Spacing.md,
    fontSize: 13,
    fontWeight: FontWeights.medium,
  },
  bookingModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  bookingModalButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingModalButtonSecondary: {
    backgroundColor: Colors.gray[100],
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  bookingDestinationSection: {
    marginBottom: Spacing.xl,
  },
  bookingChoiceLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  bookingAddressModeSelector: {
    marginBottom: Spacing.md,
  },
  bookingModeSummary: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    backgroundColor: Colors.primary + '08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  bookingModeSummaryText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  bookingManualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  bookingFieldLabel: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
  },
  bookingDestinationLabel: {
    fontSize: 14,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: 12,
  },
  bookingDestinationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.gray[100],
    borderRadius: 16,
    padding: Spacing.md,
    backgroundColor: Colors.gray[50],
    minHeight: 56,
  },
  bookingDestinationButtonSelected: {
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '08',
  },
  bookingDestinationButtonText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: Colors.gray[500],
  },
  bookingDestinationButtonTextSelected: {
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  bookingDestinationRemoveButton: {
    marginLeft: 8,
    padding: 4,
  },
  bookingDestinationHint: {
    fontSize: 12,
    color: Colors.gray[400],
    marginTop: 8,
    lineHeight: 18,
  },
  bookingManualInput: {
    minHeight: 46,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  reviewsModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '85%',
    minHeight: '50%',
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  reviewsModalTitle: {
    fontSize: 20,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsModalContent: {
    flex: 1,
  },
  reviewsEmptyText: {
    color: Colors.gray[400],
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  reviewItem: {
    backgroundColor: Colors.gray[50],
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewAuthor: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 15,
  },
  reviewDate: {
    color: Colors.gray[400],
    fontSize: 12,
    marginBottom: 12,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  reviewRatingText: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    fontSize: 12,
  },
  reviewComment: {
    color: Colors.gray[700],
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  feedbackModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  feedbackModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    elevation: 8,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  feedbackModalTitle: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 12,
    textAlign: 'center',
  },
  feedbackModalText: {
    textAlign: 'center',
    color: Colors.gray[500],
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  feedbackModalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
  },
  feedbackModalButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackModalSecondary: {
    backgroundColor: Colors.gray[100],
  },
  feedbackModalPrimary: {
    backgroundColor: Colors.primary,
  },
  feedbackModalSecondaryText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.bold,
  },
  feedbackModalPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  passengersContainer: {
    gap: Spacing.md,
  },
  passengerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
    borderRadius: 16,
  },
  passengerAvatar: {
    width: 44,
    height: 44,
    backgroundColor: Colors.gray[200],
    borderRadius: 14,
    marginRight: Spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: 15,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  passengerSeats: {
    fontSize: 12,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  noPassengersText: {
    fontSize: 13,
    color: Colors.gray[400],
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageModalImage: {
    width: '100%',
    height: '100%',
  },
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  contactModalCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: Spacing.xl,
    // paddingBottom est défini dynamiquement avec insets.bottom
  },
  contactModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  contactModalIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  contactModalIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  contactModalTitle: {
    fontSize: 20,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: 8,
  },
  contactModalSubtitle: {
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  contactModalActions: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  contactModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  contactModalButtonCall: {
    borderColor: Colors.success + '20',
    backgroundColor: Colors.success + '05',
  },
  contactModalButtonWhatsApp: {
    borderColor: '#25D366' + '20',
    backgroundColor: '#25D366' + '05',
  },
  contactModalButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  contactModalButtonContent: {
    flex: 1,
  },
  contactModalButtonTitle: {
    fontSize: 16,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  contactModalButtonSubtitle: {
    fontSize: 12,
    color: Colors.gray[500],
  },
  contactModalCancelButton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  contactModalCancelText: {
    fontSize: 16,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
  },

  driverManageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  driverManageSubtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverBookingLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  driverBookingLoaderText: {
    marginLeft: Spacing.sm,
    color: Colors.gray[500],
  },
  driverBookingEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  driverBookingEmptyTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginTop: Spacing.sm,
  },
  driverBookingEmptyText: {
    textAlign: 'center',
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  driverBookingCard: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  driverBookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  driverBookingAvatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  driverBookingInfo: {
    flex: 1,
  },
  driverBookingName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  driverBookingMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.07)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  reasonText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSizes.sm,
    marginLeft: Spacing.xs,
  },
  driverBookingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  driverDecisionRow: {
    flexDirection: 'row',
  },
  driverDecisionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  driverDecisionButtonSpacing: {
    marginRight: Spacing.sm,
  },
  driverDecisionAccept: {
    backgroundColor: Colors.primary,
  },
  driverDecisionReject: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  driverDecisionText: {
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  driverDecisionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverDecisionGhostText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.xs,
  },
});

