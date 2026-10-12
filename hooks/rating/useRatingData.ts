import { TabType, RateTargetType } from '../../features/rating/ratingTypes';
import { useDialog } from '@/components/ui/DialogProvider';
import { useGetMyBookingsForTripQuery, useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useCreateReviewMutation } from '@/store/api/reviewApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRatingLifecycle } from './useRatingLifecycle';
import { getPassengersToRate } from '@/features/rating/ratingEligibility';



export function useRatingData() {
  const active = useScreenIsActive();
  const router = useRouter();
  const params = useLocalSearchParams();
  const user = useAppSelector(selectUser);
  const tripId = typeof params.id === 'string' ? params.id : '';
  const passengerIdParam = typeof params.passengerId === 'string' ? params.passengerId : null;
  const ratingScopeKey = `rating:${user?.id ?? ''}:${tripId}`;
  const { captureRatingSession, beginLeaving, successReturnTimeoutRef } = useRatingLifecycle(ratingScopeKey, active);
  const submitInFlightRef = useRef(false);
  const hasInitializedTargetRef = useRef(false);
  const { data: trip } = useGetTripByIdQuery(tripId, { skip: !tripId || !active });
  const isTripDriver = Boolean(user?.id && trip?.driverId === user.id);
  const driverBookings = useGetTripBookingsQuery(tripId, {
    skip: !tripId || !isTripDriver || !active,
  });
  const passengerBookings = useGetMyBookingsForTripQuery(tripId, { skip: !active || !tripId || !trip || !user?.id || isTripDriver });
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
  const [ratedPassengerIds, setRatedPassengerIds] = useState<string[]>([]);
  const [ratingProgressMessage, setRatingProgressMessage] = useState<string | null>(null);
  const [rateTargetType, setRateTargetType] = useState<RateTargetType>(
    isTripDriver ? 'passenger' : passengerIdParam ? 'passenger' : 'driver'
  );
  const { showDialog } = useDialog();
  const [createReview, { isLoading: isSubmittingReview }] = useCreateReviewMutation();

  const goBackSafely = useCallback(() => {
    if (!beginLeaving()) return;
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)');
  }, [beginLeaving, router]);

  useEffect(() => {
    submitInFlightRef.current = false;
    hasInitializedTargetRef.current = false;
    setSubmitSuccessMessage(null);
    setRatedPassengerIds([]);
    setRatingProgressMessage(null);
  }, [ratingScopeKey]);

  const passengers = useMemo(() => isTripDriver
    ? getPassengersToRate(tripBookings, tripId).filter(passenger => !ratedPassengerIds.includes(passenger.id)) : [],
  [isTripDriver, tripBookings, tripId, ratedPassengerIds]);

  useEffect(() => {
    if (hasInitializedTargetRef.current || !trip || !user?.id) {
      return;
    }

    hasInitializedTargetRef.current = true;
    if (trip.driverId === user.id) {
      setRateTargetType('passenger');
      setSelectedPassenger(passengers.find(passenger => passenger.id === passengerIdParam)?.id ?? passengers[0]?.id ?? null);
      return;
    }

    setRateTargetType('driver');
    setSelectedPassenger(null);
  }, [passengerIdParam, passengers, trip, user?.id]);

  // Complete a late initial selection without overriding a driver's explicit choice.
  useEffect(() => {
    if (isTripDriver && !selectedPassenger && passengers.length > 0) {
      setSelectedPassenger(passengers.find(passenger => passenger.id === passengerIdParam)?.id ?? passengers[0].id);
    }
  }, [isTripDriver, passengerIdParam, passengers, selectedPassenger]);

  const onRatingSaved = useCallback((ratedId: string) => {
    if (!isTripDriver) return false;
    setRatedPassengerIds(ids => ids.includes(ratedId) ? ids : [...ids, ratedId]);
    const next = passengers.find(passenger => passenger.id !== ratedId);
    if (!next) return false;
    setSelectedPassenger(next.id);
    setRating(0); setComment(''); setSelectedTags([]);
    setSubmitSuccessMessage(null);
    setRatingProgressMessage('Note enregistrée. Vous pouvez noter le passager suivant.');
    submitInFlightRef.current = false;
    return true;
  }, [isTripDriver, passengers]);

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
    onRatingSaved,
    ratingProgressMessage,
    active,
    ratingScopeKey,
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
    captureRatingSession,
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
