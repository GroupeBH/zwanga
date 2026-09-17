import { useTripDetailData } from './useTripDetailData';
import { useTripDetailBookingState } from './useTripDetailBookingState';
import type { Booking, Trip, User, Review } from '@/types';
import React, { useCallback, useEffect, useMemo } from 'react';

interface Params {
  isScreenActive: boolean;
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
  isScreenActive,
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
  }, [refetchTrip, refetchMyBookings, refetchTripBookings, refetchKycStatus, setRefreshing]);
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
  }, [tripId, presentedTripDetailAutoProgressKeysRef, highestTripDetailAutoProgressPriorityRef, tripDetailBookingStateRef]);

  useEffect(() => {
    if (isScreenActive && shouldShowTripGuide) {
      setTripGuideVisible(true);
    }
  }, [isScreenActive, shouldShowTripGuide, setTripGuideVisible]);

  const dismissTripGuide = () => {
    setTripGuideVisible(false);
    completeTripGuide();
  };

  const shouldWatchDriver = isScreenActive && isTripDriver && trip?.status === 'ongoing';
  useEffect(() => {
    const stopWatching = stopWatchingRef.current;
    if (!shouldWatchDriver) {
      stopWatching?.();
      return;
    }
    requestLocationRef.current?.();
    return () => {
      stopWatching?.();
    };
  }, [shouldWatchDriver, tripId, requestLocationRef, stopWatchingRef]);

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
    isScreenActive &&
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
