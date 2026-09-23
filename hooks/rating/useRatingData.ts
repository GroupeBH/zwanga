import { TabType, RateTargetType } from '../../features/rating/ratingTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyBookingsQuery, useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useCreateReviewMutation } from '@/store/api/reviewApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';



export function useRatingData() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const user = useAppSelector(selectUser);
  const tripId = typeof params.id === 'string' ? params.id : '';
  const passengerIdParam = typeof params.passengerId === 'string' ? params.passengerId : null;
  const isMountedRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const successReturnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedTargetRef = useRef(false);
  const { data: trip } = useGetTripByIdQuery(tripId, { skip: !tripId });
  const isTripDriver = Boolean(user?.id && trip?.driverId === user.id);
  const driverBookings = useGetTripBookingsQuery(tripId, {
    skip: !tripId || !isTripDriver,
  });
  const passengerBookings = useGetMyBookingsQuery(undefined, { skip: !tripId || !trip || !user?.id || isTripDriver });
  const tripBookings = useMemo(() => isTripDriver ? driverBookings.data
    : passengerBookings.data?.filter(booking => booking.tripId === tripId),
  [driverBookings.data, isTripDriver, passengerBookings.data, tripId]);
  const bookingsLoading = isTripDriver ? driverBookings.isLoading : passengerBookings.isLoading;
  const bookingsError = isTripDriver ? driverBookings.error : passengerBookings.error;
  const refetchBookings = () => {
    if (isTripDriver) return driverBookings.refetch();
    if (tripId && trip && user?.id) return passengerBookings.refetch();
  };

  // Déterminer si l'utilisateur est un passager du trajet
  const isTripPassenger = useMemo(() => {
    if (!tripBookings || !user?.id) return false;
    return tripBookings.some(
      (booking) => booking.passengerId === user.id && (booking.status === 'accepted' || booking.status === 'completed')
    );
  }, [tripBookings, user?.id]);

  const [activeTab, setActiveTab] = useState<TabType>('rate');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reportReason, setReportReason] = useState('');
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [selectedPassenger, setSelectedPassenger] = useState<string | null>(passengerIdParam);
  const [rateTargetType, setRateTargetType] = useState<RateTargetType>(
    isTripDriver ? 'passenger' : passengerIdParam ? 'passenger' : 'driver'
  );
  const { showDialog } = useDialog();
  const [createReview, { isLoading: isSubmittingReview }] = useCreateReviewMutation();

  const goBackSafely = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)');
  }, [router]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      submitInFlightRef.current = false;
      if (successReturnTimeoutRef.current) {
        clearTimeout(successReturnTimeoutRef.current);
        successReturnTimeoutRef.current = null;
      }
    };
  }, []);

  // Liste des passagers (excluant l'utilisateur actuel si c'est un passager)
  const passengers = useMemo(() => {
    const result: { id: string; name: string; seats: number }[] = [];
    
    // Pour le conducteur, utiliser les bookings en priorité (source la plus fiable)
    // Si on a des bookings, les utiliser
    if (tripBookings && tripBookings.length > 0) {
      tripBookings
        .filter((booking) => {
          const isAccepted = booking.status === 'completed' || booking.status === 'accepted';
          // Si l'utilisateur est un passager, exclure son propre booking
          if (isTripPassenger && booking.passengerId === user?.id) return false;
          // S'assurer que l'ID du passager est présent
          if (!booking.passengerId) return false;
          return isAccepted;
        })
        .forEach((booking) => {
          // Éviter les doublons
          if (!result.find(p => p.id === booking.passengerId)) {
            result.push({
              id: booking.passengerId,
              name: booking.passengerName ?? 'Passager',
              seats: booking.numberOfSeats,
            });
          }
        });
    }
    
    // Fallback : utiliser les passagers du trip si disponibles
    // Pour le conducteur, utiliser ce fallback si les bookings ne sont pas encore chargés ou sont vides
    if (trip?.passengers && trip.passengers.length > 0) {
      trip.passengers
        .filter((passenger) => {
          // Si l'utilisateur est un passager, exclure son propre profil
          if (isTripPassenger && passenger.id === user?.id) return false;
          // S'assurer que l'ID est présent
          if (!passenger.id) return false;
          // Éviter les doublons avec les bookings déjà ajoutés
          if (result.find(p => p.id === passenger.id)) return false;
          return true;
        })
        .forEach((passenger) => {
          result.push({
            id: passenger.id,
            name: passenger.name,
            seats: 1, // On ne connaît pas le nombre de places depuis trip.passengers
          });
        });
    }
    
    return result;
  }, [tripBookings, trip?.passengers, isTripPassenger, user?.id]);

  useEffect(() => {
    if (hasInitializedTargetRef.current || !trip || !user?.id) {
      return;
    }

    hasInitializedTargetRef.current = true;
    if (passengerIdParam) {
      setRateTargetType('passenger');
      setSelectedPassenger(passengerIdParam);
      return;
    }

    if (trip.driverId === user.id) {
      setRateTargetType('passenger');
      return;
    }

    setRateTargetType('driver');
    setSelectedPassenger(null);
  }, [passengerIdParam, trip, user?.id]);

  // Pré-sélectionner le passager si un passengerId est fourni dans l'URL
  useEffect(() => {
    if (passengerIdParam && passengers.length > 0) {
      const passengerExists = passengers.some(p => p.id === passengerIdParam);
      if (passengerExists && selectedPassenger !== passengerIdParam) {
        setSelectedPassenger(passengerIdParam);
        setRateTargetType('passenger');
      }
    }
  }, [passengerIdParam, passengers, selectedPassenger]);

  // Debug: Afficher les passagers récupérés (uniquement en développement)
  useEffect(() => {
    if (__DEV__ && isTripDriver) {
      console.log('Passagers récupérés pour notation:', passengers.map(p => ({ id: p.id, name: p.name })));
      console.log('Bookings disponibles:', tripBookings?.length ?? 0);
      console.log('Trip passengers disponibles:', trip?.passengers?.length ?? 0);
    }
  }, [passengers, tripBookings, trip?.passengers, isTripDriver]);

  // Tags différents selon si on évalue un conducteur ou un passager
  const rateTags = useMemo(() => {
    const isRatingDriver = rateTargetType === 'driver';
    return isRatingDriver
      ? [
          // Tags pour évaluer un conducteur
          { id: 'punctual', label: 'Ponctuel', icon: 'time' },
          { id: 'friendly', label: 'Sympathique', icon: 'happy' },
          { id: 'clean', label: 'Véhicule propre', icon: 'sparkles' },
          { id: 'safe', label: 'Conduite sûre', icon: 'shield-checkmark' },
          { id: 'respectful', label: 'Respectueux', icon: 'heart' },
          { id: 'professional', label: 'Professionnel', icon: 'briefcase' },
        ]
      : [
          // Tags pour évaluer un passager
          { id: 'punctual', label: 'Ponctuel', icon: 'time' },
          { id: 'friendly', label: 'Sympathique', icon: 'happy' },
          { id: 'respectful', label: 'Respectueux', icon: 'heart' },
          { id: 'communicative', label: 'Bon communicant', icon: 'chatbubbles' },
          { id: 'clean', label: 'Propre', icon: 'sparkles' },
          { id: 'cooperative', label: 'Coopératif', icon: 'people' },
        ];
  }, [rateTargetType]);

  const reportReasons = [
    { id: 'dangerous', label: 'Conduite dangereuse', icon: 'warning' },
    { id: 'rude', label: 'Comportement inapproprié', icon: 'alert-circle' },
    { id: 'dirty', label: 'Véhicule sale', icon: 'close-circle' },
    { id: 'late', label: 'Retard important', icon: 'time' },
    { id: 'no-show', label: 'Ne s\'est pas présenté', icon: 'ban' },
    { id: 'overcharge', label: 'Surfacturation', icon: 'cash' },
  ];

  return {
    selectedTags,
    setSelectedTags,
    submitInFlightRef,
    isSubmittingReview,
    setSubmitSuccessMessage,
    rating,
    showDialog,
    trip,
    tripId,
    rateTargetType,
    selectedPassenger,
    passengers,
    comment,
    createReview,
    isMountedRef,
    successReturnTimeoutRef,
    goBackSafely,
    reportReason,
    isTripDriver,
    isTripPassenger,
    activeTab,
    setActiveTab,
    setRateTargetType,
    setSelectedPassenger,
    bookingsLoading,
    bookingsError,
    refetchBookings,
    setRating,
    rateTags,
    setComment,
    submitSuccessMessage,
    reportReasons,
    setReportReason,
  };
}
