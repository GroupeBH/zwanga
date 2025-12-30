import { KycWizardModal, type KycCaptureResult } from '@/components/KycWizardModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
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
import { useGetKycStatusQuery, useUploadKycMutation } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';
import { selectTripById, selectUser } from '@/store/selectors';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import type { BookingStatus, GeoPoint } from '@/types';
import { formatTime } from '@/utils/dateHelpers';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { getRouteInfo, type RouteInfo, isPointOnRoute, splitRouteByProgress } from '@/utils/routeHelpers';
import LocationPickerModal, { type MapLocationSelection } from '@/components/LocationPickerModal';
import { shareTrip, shareTripViaWhatsApp } from '@/utils/shareHelpers';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

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
};

export default function TripDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? (params.id as string) : '';
  const trackParam = params.track === 'true' || params.track === true; // Permet le suivi via lien partagé
  
  // Récupérer le trajet depuis l'API si pas dans le store
  const {
    data: tripFromApi,
    isLoading: tripLoading,
    isFetching: tripFetching,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, { skip: !tripId });
  
  // Utiliser le trajet de l'API en priorité, sinon celui du store
  const tripFromStore = useAppSelector((state) => selectTripById(tripId)(state));
  const trip = tripFromApi || tripFromStore;
  
  const user = useAppSelector(selectUser);
  const { checkIdentity, isIdentityVerified } = useIdentityCheck();
  const { showDialog } = useDialog();
  const driverPhone = trip?.driver?.phone ?? null;
  // console.log('driverPhone', driverPhone);
  const isTripDriver = Boolean(trip && user && trip.driverId === user.id);
  const {
    data: myBookings,
    isLoading: myBookingsLoading,
    isFetching: myBookingsFetching,
    refetch: refetchMyBookings,
  } = useGetMyBookingsQuery();
  const {
    data: tripBookings,
    isLoading: tripBookingsLoading,
  } = useGetTripBookingsQuery(tripId, { skip: !tripId });
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
  const [bookingSeats, setBookingSeats] = useState('1');
  const [bookingModalError, setBookingModalError] = useState('');
  const [passengerDestination, setPassengerDestination] = useState<MapLocationSelection | null>(null);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [isValidatingDestination, setIsValidatingDestination] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{ visible: boolean; seats: number }>({
    visible: false,
    seats: 0,
  });
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [driverReviewsModalVisible, setDriverReviewsModalVisible] = useState(false);
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
  const [kycFrontImage, setKycFrontImage] = useState<string | null>(null);
  const [kycBackImage, setKycBackImage] = useState<string | null>(null);
  const [kycSelfieImage, setKycSelfieImage] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const {
    data: kycStatus,
    refetch: refetchKycStatus,
  } = useGetKycStatusQuery();
  const [uploadKyc, { isLoading: uploadingKyc }] = useUploadKycMutation();
  const { data: driverReviews } = useGetReviewsQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });
  const { data: driverAverageData } = useGetAverageRatingQuery(trip?.driverId ?? '', {
    skip: !trip?.driverId,
  });
  const driverReviewCount = driverReviews?.length ?? 0;
  const driverReviewAverage =
    driverAverageData?.averageRating ??
    (driverReviewCount && driverReviews
      ? driverReviews.reduce((sum, review) => sum + review.rating, 0) / driverReviewCount
      : trip?.driverRating ?? 0);

  const refreshBookingLists = () => {
    refetchMyBookings();
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
          (booking.status === 'pending' || booking.status === 'accepted'),
      ) ?? null
    );
  }, [myBookings, trip]);
  const hasAcceptedBooking = activeBooking?.status === 'accepted';
  // Permettre le suivi si : conducteur, passager accepté, ou via lien partagé (track=true)
  const canTrackTrip = Boolean(trip && user && (isTripDriver || hasAcceptedBooking || trackParam));

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
  }, [trip?.id, canTrackTrip]);

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
  const openBookingModal = () => {
    // KYC désactivé pour la réservation - permettre la réservation sans vérification
    setBookingSeats('1');
    setBookingModalError('');
    setPassengerDestination(null);
    setBookingModalVisible(true);
  };

  const closeBookingModal = () => {
    if (isBooking) {
      return;
    }
    setBookingModalVisible(false);
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
      // Limiter à 2 places maximum par utilisateur et au nombre de places disponibles
      const maxSeats = Math.min(2, seatLimit);
      const next = Math.min(Math.max(fallback + delta, 1), maxSeats);
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

    // Vérifier si la valeur est supérieure à 2
    if (seatsNum > 2) {
      setBookingModalError('Un seul utilisateur ne peut pas réserver plus de deux places.');
      // Limiter à 2 places maximum
      setBookingSeats('2');
      return;
    }

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
    if (Number.isNaN(seatsValue) || seatsValue <= 0) {
      setBookingModalError('Veuillez indiquer un nombre de places valide.');
      return;
    }
    // Vérifier la limite de 2 places par utilisateur
    if (seatsValue > 2) {
      setBookingModalError('Un seul utilisateur ne peut pas réserver plus de deux places.');
      return;
    }
    if (seatsValue > seatLimit) {
      setBookingModalError(
        `Il reste seulement ${seatLimit} place${seatLimit > 1 ? 's' : ''} pour ce trajet.`,
      );
      return;
    }

    // Valider la destination si elle est fournie
    if (passengerDestination) {
      setIsValidatingDestination(true);
      setBookingModalError('');

      try {
        // Vérifier que la destination est sur le trajet
        if (!routeCoordinates || routeCoordinates.length < 2) {
          setBookingModalError('Impossible de valider la destination. Veuillez réessayer.');
          setIsValidatingDestination(false);
          return;
        }

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
      await createBooking({
        tripId: trip.id,
        numberOfSeats: seatsValue,
        passengerDestination: passengerDestination?.title || passengerDestination?.address,
        passengerDestinationCoordinates: passengerDestination
          ? {
              latitude: passengerDestination.latitude,
              longitude: passengerDestination.longitude,
            }
          : undefined,
      }).unwrap();
      setBookingModalVisible(false);
      setBookingModalError('');
      setPassengerDestination(null);
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
            Ce trajet n'existe plus ou a été supprimé par son propriétaire.
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
          <TouchableOpacity
            onPress={() => setShareModalVisible(true)}
            style={styles.shareButton}
          >
            <Ionicons name="share-outline" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Carte interactive */}
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
                <>
                  {/* Remaining route (gray) */}
                  {trip?.status === 'ongoing' && routeSplit.remainingCoordinates.length > 1 && (
                    <Polyline
                      coordinates={routeSplit.remainingCoordinates}
                      strokeColor={Colors.gray[400]}
                      strokeWidth={4}
                      lineDashPattern={[5, 5]}
                    />
                  )}
                  {/* Traveled route (colored) */}
                  {trip?.status === 'ongoing' && routeSplit.traveledCoordinates.length > 1 ? (
                    <Polyline
                      coordinates={routeSplit.traveledCoordinates}
                      strokeColor={Colors.primary}
                      strokeWidth={4}
                    />
                  ) : (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={Colors.primary}
                      strokeWidth={4}
                    />
                  )}
                </>
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

              {currentCoordinate && (
                <Marker
                  coordinate={currentCoordinate}
                >
                  <Animated.View style={pulseStyle}>
                    <View style={styles.markerCurrentCircle}>
                      <Ionicons name="car-sport" size={18} color={Colors.white} />
                    </View>
                  </Animated.View>
                </Marker>
              )}

              {/* Destinations des passagers */}
              {tripBookings
                ?.filter(
                  (booking) =>
                    booking.status === 'accepted' &&
                    booking.passengerDestinationCoordinates &&
                    booking.passengerDestinationCoordinates.latitude &&
                    booking.passengerDestinationCoordinates.longitude,
                )
                .map((booking, index) => {
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
                  <>
                    {/* Remaining route (gray) */}
                    {trip?.status === 'ongoing' && routeSplit.remainingCoordinates.length > 1 && (
                      <Polyline
                        coordinates={routeSplit.remainingCoordinates}
                        strokeColor={Colors.gray[400]}
                        strokeWidth={5}
                        lineDashPattern={[5, 5]}
                      />
                    )}
                    {/* Traveled route (colored) */}
                    {trip?.status === 'ongoing' && routeSplit.traveledCoordinates.length > 1 ? (
                      <Polyline
                        coordinates={routeSplit.traveledCoordinates}
                        strokeColor={Colors.primary}
                        strokeWidth={5}
                      />
                    ) : (
                      <Polyline
                        coordinates={routeCoordinates}
                        strokeColor={Colors.primary}
                        strokeWidth={5}
                      />
                    )}
                  </>
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
                      <Text>{trip.departure.address}</Text>
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
                      <Text>{trip.arrival.address}</Text>
                    </View>
                  </Callout>
                </Marker>

                {currentCoordinate && (
                  <Marker
                    coordinate={currentCoordinate}
                  >
                    <Animated.View style={pulseStyle}>
                      <View style={styles.markerCurrentCircle}>
                        <Ionicons name="car-sport" size={20} color={Colors.white} />
                      </View>
                    </Animated.View>
                    <Callout>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Position actuelle</Text>
                      </View>
                    </Callout>
                  </Marker>
                )}

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

        {canTrackTrip && (
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
              {trip.status === 'ongoing' && (
                <Text style={styles.progressText}>{progress}% complété</Text>
              )}
            </View>

            {trip.status === 'ongoing' && (
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
        <View style={styles.section}>
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
                <Text style={styles.routeName}>{trip.departure.name}</Text>
                <Text style={styles.routeAddress}>{trip.departure.address}</Text>
                <Text style={styles.routeTime}>
                  Départ: {formatTime(trip.departureTime)}
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
                <Text style={styles.routeName}>{trip.arrival.name}</Text>
                <Text style={styles.routeAddress}>{trip.arrival.address}</Text>
                <Text style={styles.routeTime}>
                  Arrivée: {calculatedArrivalTime ? formatTime(calculatedArrivalTime.toISOString()) : formatTime(trip.arrivalTime)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Informations du conducteur */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>CONDUCTEUR</Text>

            <TouchableOpacity
              style={styles.driverInfo}
              onPress={() => {
                if (trip.driverId) {
                  router.push(`/driver/${trip.driverId}`);
                }
              }}
              activeOpacity={0.7}
            >
              {trip.driverAvatar ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedImageUri(trip.driverAvatar!);
                    setImageModalVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: trip.driverAvatar }}
                    style={styles.driverAvatar}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.driverAvatar}>
                  <Ionicons name="person" size={32} color={Colors.gray[500]} />
                </View>
              )}
              <View style={styles.driverDetails}>
                <View style={styles.driverNameRow}>
                  <Text style={styles.driverName}>{trip.driverName}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                </View>
                <View style={styles.driverMeta}>
                  <Ionicons name="star" size={16} color={Colors.secondary} />
                  <Text style={styles.driverRating}>{driverReviewAverage.toFixed(1)}</Text>
                  <View style={styles.driverDot} />
                  <Text style={styles.driverVehicle}>
                    {trip.vehicle 
                      ? `${trip.vehicle.brand} ${trip.vehicle.model}`
                      : trip.vehicleInfo}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.driverReviewLink}
                  onPress={(e) => {
                    e.stopPropagation();
                    setDriverReviewsModalVisible(true);
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
                    <Ionicons name="chatbubble" size={20} color={Colors.primary} />
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
                  } else {
                    showDialog({
                      variant: 'info',
                      title: 'Numéro manquant',
                      message: 'Le numéro de téléphone du conducteur n\'est pas disponible.',
                    });
                  }
                }}
              >
                <Ionicons
                  name="call"
                  size={20}
                  color={driverPhone ? Colors.success : Colors.gray[400]}
                />
                <Text
                  style={[
                    styles.driverActionText,
                    { color: driverPhone ? Colors.success : Colors.gray[500] },
                  ]}
                >
                  Appeler
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Détails */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>DÉTAILS</Text>

            <View style={styles.detailsList}>
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="people" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Places disponibles</Text>
                </View>
                <Text style={styles.detailValue}>
                  {trip.availableSeats}/{trip.totalSeats}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons name="cash" size={20} color={Colors.gray[600]} />
                  <Text style={styles.detailLabel}>Prix</Text>
                </View>
                <Text style={[styles.detailValue, { color: Colors.success }]}>
                  {trip.price === 0 ? 'Gratuit' : `${trip.price} FC`}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Ionicons 
                    name={
                      trip.vehicleType === 'moto' 
                        ? 'bicycle' 
                        : trip.vehicleType === 'tricycle'
                        ? 'car-sport'
                        : 'car'
                    } 
                    size={20} 
                    color={Colors.gray[600]} 
                  />
                  <Text style={styles.detailLabel}>Véhicule</Text>
                </View>
                <View style={styles.vehicleInfoContainer}>
                  {trip.vehicle ? (
                    <>
                      <Text style={styles.detailValue}>
                        {trip.vehicle.brand} {trip.vehicle.model}
                      </Text>
                      <Text style={styles.vehicleDetails}>
                        {trip.vehicle.color} • {trip.vehicle.licensePlate}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.detailValue}>
                        {trip.vehicleType === 'moto' 
                          ? 'Moto' 
                          : trip.vehicleType === 'tricycle'
                          ? 'Tricycle'
                          : 'Voiture'}
                      </Text>
                      {trip.vehicleInfo && trip.vehicleInfo !== 'Informations véhicule fournies par le conducteur' && (
                        <Text style={styles.vehicleDetails}>{trip.vehicleInfo}</Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Passagers */}
        {tripBookings && tripBookings.length > 0 && (
          <View style={styles.section}>
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
          </View>
        )}

        {/* Actions */}
        {(() => {
          // Vérifier si le trajet est expiré (date de départ passée)
          const isExpired = trip.departureTime && new Date(trip.departureTime) < new Date();
          // Vérifier si le trajet peut être réservé (pas complété, pas annulé, pas expiré)
          const canBook = trip.status !== 'completed' && 
                         trip.status !== 'cancelled' && 
                         !isExpired &&
                         (trip.status === 'upcoming' || (trip.status === 'ongoing' && availableSeats > 0));
          
          return canBook;
        })() && (
          <View style={styles.actionsContainer}>
            {activeBooking && activeBookingStatus ? (
              <View style={styles.bookingCard}>
                <View style={styles.bookingCardHeader}>
                  <View>
                    <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                    <Text style={styles.bookingCardSubtitle}>
                      {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' '}
                      • {trip.price === 0 ? 'Gratuit' : `${trip.price} FC / place`}
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

                <View style={styles.bookingCardInfo}>
                  <View style={styles.bookingInfoItem}>
                    <Text style={styles.bookingInfoLabel}>Montant estimé</Text>
                    <Text style={styles.bookingInfoValue}>
                      {trip.price === 0 ? 'Gratuit' : `${activeBooking.numberOfSeats * trip.price} FC`}
                    </Text>
                  </View>
                  <View style={styles.bookingInfoItem}>
                    <Text style={styles.bookingInfoLabel}>Statut</Text>
                    <Text style={styles.bookingInfoValue}>{activeBookingStatus.label}</Text>
                  </View>
                </View>

                {/* Indicateur de confirmation en attente */}
                {activeBooking.status === 'accepted' && (
                  <>
                    {activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                      <View style={styles.confirmationBanner}>
                        <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                        <Text style={styles.confirmationBannerText}>
                          Le conducteur a confirmé votre prise en charge. Veuillez confirmer également.
                        </Text>
                      </View>
                    )}
                    {activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger && (
                      <View style={styles.confirmationBanner}>
                        <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />
                        <Text style={styles.confirmationBannerText}>
                          Le conducteur a confirmé votre dépose. Veuillez confirmer également.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                <View style={styles.bookingActionsRow}>
                  {/* Bouton "Confirmer la prise en charge" - Quand le driver a confirmé mais pas le passager */}
                  {activeBooking.status === 'accepted' && activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger && (
                    <TouchableOpacity
                      style={[styles.bookingActionButton, styles.bookingActionConfirm]}
                      onPress={handleConfirmPickup}
                      disabled={isConfirmingPickup}
                    >
                      {isConfirmingPickup ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                          <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>
                            Confirmer prise en charge
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Bouton "Confirmer la dépose" - Quand le driver a confirmé mais pas le passager */}
                  {activeBooking.status === 'accepted' && activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger && (
                    <TouchableOpacity
                      style={[styles.bookingActionButton, styles.bookingActionConfirm]}
                      onPress={handleConfirmDropoff}
                      disabled={isConfirmingDropoff}
                    >
                      {isConfirmingDropoff ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                          <Text style={[styles.bookingActionText, styles.bookingActionConfirmText]}>
                            Confirmer dépose
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Bouton "Noter le conducteur" - Après confirmation de dépose */}
                  {activeBooking.status === 'completed' && activeBooking.droppedOffConfirmedByPassenger && trip?.id && (
                    <TouchableOpacity
                      style={[styles.bookingActionButton, styles.bookingActionRate]}
                      onPress={() => router.push(`/rate/${trip.id}`)}
                    >
                      <Ionicons name="star" size={18} color={Colors.secondary} />
                      <Text style={[styles.bookingActionText, styles.bookingActionRateText]}>
                        Noter le conducteur
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Bouton "Appeler" - Seulement si pas de confirmation en attente */}
                  {activeBooking.status === 'accepted' && driverPhone && 
                   !(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                   !(activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger) && (
                    <TouchableOpacity
                      style={[styles.bookingActionButton, styles.bookingActionCall]}
                      onPress={() => setContactModalVisible(true)}
                    >
                      <Ionicons name="call" size={18} color={Colors.success} />
                      <Text style={[styles.bookingActionText, styles.bookingActionCallText]}>
                        Appeler
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* Bouton "Annuler" - Seulement si pas de confirmation en attente */}
                  {!(activeBooking.pickedUp && !activeBooking.pickedUpConfirmedByPassenger) &&
                   !(activeBooking.droppedOff && !activeBooking.droppedOffConfirmedByPassenger) && (
                    <TouchableOpacity
                      style={[styles.bookingActionButton, styles.bookingActionDanger]}
                      onPress={confirmCancelBooking}
                      disabled={isCancellingBooking}
                    >
                      {isCancellingBooking ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <>
                          <Ionicons name="close-circle" size={18} color={Colors.danger} />
                          <Text style={[styles.bookingActionText, styles.bookingActionDangerText]}>
                            Annuler la réservation
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {myBookingsFetching && (
                  <View style={styles.bookingRefreshingRow}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.bookingRefreshingText}>Actualisation…</Text>
                  </View>
                )}
              </View>
            ) : (
              <>
                <View style={styles.bookingHintCard}>
                  <View style={styles.bookingHintIcon}>
                    <Ionicons 
                      name={trip.status === 'ongoing' ? "car-sport" : "information-circle"} 
                      size={20} 
                      color={trip.status === 'ongoing' ? Colors.success : Colors.primary} 
                    />
                  </View>
                  <View style={styles.bookingHintContent}>
                    <Text style={styles.bookingHintTitle}>
                      {trip.status === 'ongoing' 
                        ? `Trajet en cours • Il reste ${availableSeats} place${availableSeats > 1 ? 's' : ''} disponibles`
                        : availableSeats > 0
                        ? `Il reste ${availableSeats} place${availableSeats > 1 ? 's' : ''} disponibles`
                        : 'Ce trajet est complet'}
                    </Text>
                    <Text style={styles.bookingHintSubtitle}>
                      {trip.price === 0 ? 'Prix par place : Gratuit' : `Prix par place : ${trip.price} FC`}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    (availableSeats <= 0 || myBookingsLoading) &&
                    styles.actionButtonDisabled,
                  ]}
                  onPress={activeBooking ? () => {} : openBookingModal}
                  disabled={(availableSeats <= 0 || myBookingsLoading) && !activeBooking}
                >
                  {myBookingsLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      {activeBooking ? 'Voir' : 'Réserver ce trajet'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {(() => {
          // Vérifier si le trajet est expiré (date de départ passée)
          const isExpired = trip.departureTime && new Date(trip.departureTime) < new Date();
          // Afficher cette section pour les trajets complétés, annulés ou expirés
          return trip.status === 'completed' || trip.status === 'cancelled' || isExpired;
        })() && (
          <View style={styles.actionsContainer}>
            {/* Afficher la carte de réservation si on a une réservation complétée */}
            {activeBooking && activeBooking.status === 'completed' && activeBooking.droppedOffConfirmedByPassenger ? (
              <View style={styles.bookingCard}>
                <View style={styles.bookingCardHeader}>
                  <View>
                    <Text style={styles.bookingCardTitle}>Ma réservation</Text>
                    <Text style={styles.bookingCardSubtitle}>
                      {activeBooking.numberOfSeats} place{activeBooking.numberOfSeats > 1 ? 's' : ''}{' '}
                      • {trip.price === 0 ? 'Gratuit' : `${trip.price} FC / place`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.bookingStatusBadge,
                      { backgroundColor: activeBookingStatus?.background },
                    ]}
                  >
                    <Text style={[styles.bookingStatusText, { color: activeBookingStatus?.color }]}>
                      {activeBookingStatus?.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingActionsRow}>
                  {/* Bouton "Noter le conducteur" - Après confirmation de dépose */}
                  {activeBooking.status === 'completed' && activeBooking.droppedOffConfirmedByPassenger && trip?.id && (
                    <TouchableOpacity
                      style={[styles.bookingActionButton, styles.bookingActionRate]}
                      onPress={() => router.push(`/rate/${trip.id}`)}
                    >
                      <Ionicons name="star" size={18} color={Colors.secondary} />
                      <Text style={[styles.bookingActionText, styles.bookingActionRateText]}>
                        Noter le conducteur
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/rate/${trip.id}`)}
              >
                <Text style={styles.actionButtonText}>Évaluer le trajet</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <Modal animationType="fade" transparent visible={bookingModalVisible}>
        <View style={styles.bookingModalOverlay}>
          <View style={styles.bookingModalCard}>
            <Text style={styles.bookingModalTitle}>Réserver ce trajet</Text>
            <Text style={styles.bookingModalDescription}>
              Choisissez le nombre de places à réserver.
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
              Maximum 2 places par utilisateur{seatLimit < 2 ? ` (${seatLimit} disponible${seatLimit > 1 ? 's' : ''})` : ''}
            </Text>

            {/* Destination du passager */}
            <View style={styles.bookingDestinationSection}>
              <Text style={styles.bookingDestinationLabel}>Ma destination (optionnel)</Text>
              <TouchableOpacity
                style={[
                  styles.bookingDestinationButton,
                  passengerDestination && styles.bookingDestinationButtonSelected,
                ]}
                onPress={() => setShowDestinationPicker(true)}
                disabled={isBooking || isValidatingDestination || isValidatingDestination}
              >
                <Ionicons
                  name={passengerDestination ? 'location' : 'location-outline'}
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
                    : 'Sélectionner ma destination'}
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
                Si votre destination diffère de l'arrivée du trajet, sélectionnez-la ici. Elle doit être située sur l'itinéraire.
              </Text>
            </View>

            <Text style={styles.bookingModalPrice}>
              Total estimé :{' '}
              <Text style={styles.bookingModalPriceValue}>
                {estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal} FC`}
              </Text>
            </Text>

            {bookingModalError ? (
              <Text style={styles.bookingModalError}>{bookingModalError}</Text>
            ) : null}

            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={closeBookingModal}
                disabled={isBooking}
              >
                <Text style={styles.bookingModalButtonSecondaryText}>Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={handleConfirmBooking}
                disabled={isBooking || isValidatingDestination}
              >
                {isBooking || isValidatingDestination ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.bookingModalButtonPrimaryText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <LocationPickerModal
        visible={showDestinationPicker}
        title="Sélectionner ma destination"
        initialLocation={passengerDestination}
        onClose={() => setShowDestinationPicker(false)}
        onSelect={(location) => {
          setPassengerDestination(location);
          setShowDestinationPicker(false);
          setBookingModalError('');
        }}
      />

      <Modal animationType="fade" transparent visible={bookingSuccess.visible}>
        <View style={styles.feedbackModalOverlay}>
          <View style={styles.feedbackModalCard}>
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
                  styles.feedbackModalButtonSpacing,
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
        visible={driverReviewsModalVisible}
        onRequestClose={() => setDriverReviewsModalVisible(false)}
      >
        <View style={styles.reviewsModalOverlay}>
          <Animated.View entering={FadeInDown} style={styles.reviewsModalCard}>
            <View style={styles.reviewsModalHeader}>
              <Text style={styles.reviewsModalTitle}>Avis sur {trip?.driverName}</Text>
              <TouchableOpacity onPress={() => setDriverReviewsModalVisible(false)}>
                <Ionicons name="close" size={20} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.reviewsModalContent}
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
              showsVerticalScrollIndicator={false}
            >
              {driverReviewCount === 0 ? (
                <Text style={styles.reviewsEmptyText}>Pas encore d'avis pour ce conducteur.</Text>
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
          <Animated.View entering={FadeInDown} style={styles.contactModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.contactModalHeader}>
              <View style={styles.contactModalIconWrapper}>
                <View style={styles.contactModalIconBadge}>
                  <Ionicons name="call" size={32} color={Colors.primary} />
                </View>
              </View>
              <Text style={styles.contactModalTitle}>
                Contacter {trip?.driverName || 'le conducteur'}
              </Text>
              <Text style={styles.contactModalSubtitle}>
                Choisissez comment contacter le conducteur
              </Text>
            </View>

            <View style={styles.contactModalActions}>
              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonCall]}
                onPress={async () => {
                  setContactModalVisible(false);
                  await openPhoneCall(driverPhone!, (errorMsg) => {
                    showDialog({
                      variant: 'danger',
                      title: 'Erreur',
                      message: errorMsg,
                    });
                  });
                }}
              >
                <View style={styles.contactModalButtonIcon}>
                  <Ionicons name="call" size={24} color={Colors.success} />
                </View>
                <View style={styles.contactModalButtonContent}>
                  <Text style={styles.contactModalButtonTitle}>Appeler</Text>
                  <Text style={styles.contactModalButtonSubtitle}>Ouvrir l'application d'appel</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

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
          <Animated.View entering={FadeInDown} style={styles.contactModalCard} onStartShouldSetResponder={() => true}>
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
                  try {
                    await shareTrip(
                      trip.id,
                      trip.departure.name,
                      trip.arrival.name
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
                  <Text style={styles.contactModalButtonSubtitle}>Partager via l'application de votre choix</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.contactModalButton, styles.contactModalButtonWhatsApp]}
                onPress={async () => {
                  setShareModalVisible(false);
                  try {
                    await shareTripViaWhatsApp(
                      trip.id,
                      undefined,
                      trip.departure.name,
                      trip.arrival.name
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
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  shareButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
  },
  mapContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  mapPreview: {
    height: 220,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.gray[200],
    ...CommonStyles.shadowSm,
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  mapOverlayText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  markerStartCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerEndCircle: {
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCurrentCircle: {
    width: 40,
    height: 40,
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
  markerPassengerDestCircle: {
    width: 28,
    height: 28,
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowMd,
  },
  expandButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
  },
  expandButtonInner: {
    width: 40,
    height: 40,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowLg,
  },
  mapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: Spacing.md,
    justifyContent: 'center',
  },
  mapModalContent: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  fullscreenMap: {
    width: '100%',
    height: '100%',
  },
  closeMapButton: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.xl,
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackingBanner: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...CommonStyles.shadowSm,
  },
  trackingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.md,
  },
  trackingStatusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: Spacing.md,
  },
  trackingStatusDotActive: {
    backgroundColor: Colors.success,
  },
  trackingStatusDotIdle: {
    backgroundColor: Colors.gray[400],
  },
  trackingTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  trackingSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: 2,
  },
  trackingRefreshButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  statusCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
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
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  statusLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  progressText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.info,
  },
  etaText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  routeIconContainer: {
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  routeIconStart: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconEnd: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDivider: {
    width: 2,
    height: 48,
    backgroundColor: Colors.gray[300],
  },
  routeContent: {
    flex: 1,
  },
  routeName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
    fontSize: FontSizes.base,
  },
  routeAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  routeTime: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  driverAvatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.lg,
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
    marginBottom: Spacing.xs,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.lg,
    flex: 1,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  driverDot: {
    width: 4,
    height: 4,
    backgroundColor: Colors.gray[400],
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.sm,
  },
  driverVehicle: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  driverActions: {
    flexDirection: 'row',
  },
  driverActionButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  driverActionButtonGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    marginRight: 0,
  },
  driverActionText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
  },
  driverReviewLink: {
    marginTop: Spacing.xs,
  },
  driverReviewLinkText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  driverReviewLinkTextDisabled: {
    color: Colors.gray[400],
  },
  detailsList: {
    marginTop: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    color: Colors.gray[700],
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
  },
  detailValue: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  vehicleInfoContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  vehicleTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleDetails: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
    textAlign: 'right',
    maxWidth: '100%',
  },
  actionsContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.danger,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  bookingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  bookingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  bookingCardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingCardSubtitle: {
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  bookingStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  bookingStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  bookingCardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  bookingInfoItem: {
    flex: 1,
  },
  bookingInfoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  bookingInfoValue: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingActionsRow: {
    flexDirection: 'row',
  },
  bookingActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  bookingActionText: {
    marginLeft: Spacing.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  bookingActionCall: {
    borderColor: 'rgba(46, 204, 113, 0.3)',
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
  },
  bookingActionCallText: {
    color: Colors.success,
  },
  bookingActionDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  bookingActionDangerText: {
    color: Colors.danger,
  },
  confirmationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(247, 184, 1, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  confirmationBannerText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  bookingActionConfirm: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  bookingActionConfirmText: {
    color: Colors.white,
  },
  bookingActionRate: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
    borderColor: 'rgba(247, 184, 1, 0.3)',
  },
  bookingActionRateText: {
    color: Colors.secondary,
  },
  bookingRefreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  bookingRefreshingText: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginLeft: Spacing.sm,
  },
  bookingHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  bookingHintIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  bookingHintContent: {
    flex: 1,
  },
  bookingHintTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingHintSubtitle: {
    marginTop: Spacing.xs,
    color: Colors.gray[600],
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  bookingModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...CommonStyles.shadowLg,
  },
  bookingModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  bookingModalDescription: {
    color: Colors.gray[600],
    marginBottom: Spacing.lg,
  },
  bookingSeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  bookingSeatButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingSeatInput: {
    flex: 1,
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    textAlign: 'center',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  bookingModalHint: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  bookingModalPrice: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  bookingModalPriceValue: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  bookingModalError: {
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  bookingModalActions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  bookingModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  bookingModalButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  bookingModalButtonSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  bookingModalButtonPrimary: {
    backgroundColor: Colors.primary,
    marginRight: 0,
  },
  bookingModalButtonPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  bookingDestinationSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bookingDestinationLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
    marginBottom: Spacing.xs,
  },
  bookingDestinationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    minHeight: 48,
  },
  bookingDestinationButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  bookingDestinationButtonText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  bookingDestinationButtonTextSelected: {
    color: Colors.gray[900],
    fontWeight: FontWeights.medium,
  },
  bookingDestinationRemoveButton: {
    marginLeft: Spacing.xs,
    padding: Spacing.xs,
  },
  bookingDestinationHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  reviewsModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    maxHeight: '85%',
    padding: Spacing.lg,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  reviewsModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  reviewsModalContent: {
    flex: 1,
  },
  reviewsEmptyText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  reviewItem: {
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewAuthor: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  reviewDate: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reviewRatingText: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  reviewComment: {
    color: Colors.gray[700],
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
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
  feedbackModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  feedbackModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...CommonStyles.shadowLg,
  },
  feedbackModalIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  feedbackModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  feedbackModalText: {
    textAlign: 'center',
    color: Colors.gray[600],
    marginBottom: Spacing.lg,
  },
  feedbackModalActions: {
    flexDirection: 'row',
    width: '100%',
  },
  feedbackModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  feedbackModalButtonSpacing: {
    marginRight: Spacing.sm,
  },
  feedbackModalSecondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  feedbackModalPrimary: {
    backgroundColor: Colors.primary,
  },
  feedbackModalSecondaryText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  feedbackModalPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  passengersContainer: {
    marginTop: Spacing.md,
  },
  passengerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  passengerAvatar: {
    width: 48,
    height: 48,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  passengerSeats: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  noPassengersText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    padding: Spacing.sm,
  },
  imageModalImage: {
    width: '100%',
    height: '100%',
  },
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  contactModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
  },
  contactModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  contactModalIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  contactModalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  contactModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  contactModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  contactModalActions: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  contactModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  contactModalButtonCall: {
    borderColor: 'rgba(46, 204, 113, 0.3)',
    backgroundColor: 'rgba(46, 204, 113, 0.05)',
  },
  contactModalButtonWhatsApp: {
    borderColor: 'rgba(37, 211, 102, 0.3)',
    backgroundColor: 'rgba(37, 211, 102, 0.05)',
  },
  contactModalButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  contactModalButtonContent: {
    flex: 1,
  },
  contactModalButtonTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: 2,
  },
  contactModalButtonSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  contactModalCancelButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  contactModalCancelText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[600],
  },
});
