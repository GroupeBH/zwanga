import { useTripDetailData } from './useTripDetailData';
import { useTripDetailBookingState } from './useTripDetailBookingState';
import type { Booking } from '@/types';
import { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from '@/utils/reanimated';
import React, { useCallback, useEffect, useMemo } from 'react';
import type { Trip, User, Review } from '@/types';

interface Params {
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  refetchTrip: ReturnType<typeof useTripDetailData>['refetchTrip'];
  refetchMyBookings: ReturnType<typeof useTripDetailData>['refetchMyBookings'];
  refetchTripBookings: ReturnType<typeof useTripDetailData>['refetchTripBookings'];
  refetchKycStatus: ReturnType<typeof useTripDetailBookingState>['refetchKycStatus'];
  driverReviews: Review[] | undefined;
  driverAverageData: { userId: string; averageRating: number; } | undefined;
  trip: Trip | undefined;
  presentedTripDetailAutoProgressKeysRef: React.RefObject<Set<string>>;
  highestTripDetailAutoProgressPriorityRef: React.RefObject<Map<string, number>>;
  tripDetailBookingStateRef: React.RefObject<Map<string, { pickupConfirmed: boolean; dropoffConfirmed: boolean; }>>;
  tripId: string;
  shouldShowTripGuide: boolean;
  setTripGuideVisible: React.Dispatch<React.SetStateAction<boolean>>;
  completeTripGuide: () => Promise<void>;
  isTripDriver: boolean;
  stopWatchingRef: React.RefObject<() => void>;
  requestLocationRef: React.RefObject<() => Promise<void>>;
  myBookings: Booking[] | undefined;
  user: User | null;
  trackParam: boolean;
}

export function useTripDetailActivity({
  setRefreshing,
  refetchTrip,
  refetchMyBookings,
  refetchTripBookings,
  refetchKycStatus,
  driverReviews,
  driverAverageData,
  trip,
  presentedTripDetailAutoProgressKeysRef,
  highestTripDetailAutoProgressPriorityRef,
  tripDetailBookingStateRef,
  tripId,
  shouldShowTripGuide,
  setTripGuideVisible,
  completeTripGuide,
  isTripDriver,
  stopWatchingRef,
  requestLocationRef,
  myBookings,
  user,
  trackParam,
}: Params) {
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

  return {
    activeBooking,
    bookingForTrip,
    canTrackTrip,
    refreshBookingLists,
    onRefresh,
    driverReviewAverage,
    driverReviewCount,
    dismissTripGuide,
  };
}
