import { useDialog } from '@/components/ui/DialogProvider';
import { useOfflineRideData } from '@/hooks/navigation/useOfflineRideData';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useNavigationRequestGuard } from '@/hooks/navigation/useNavigationRequestGuard';
import {
  useAcceptBookingMutation,
  useCancelBookingMutation,
  useConfirmPassengerTripInterruptionMutation,
  useGetTripBookingsQuery,
  useRejectPassengerTripInterruptionMutation,
  useRejectBookingMutation,
} from '@/store/api/bookingApi';
import { useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import { useLazyGetDriverTripRevenueSummaryQuery } from '@/store/api/driverSettlementsApi';
import {
  useCancelDriverTripInterruptionMutation,
  useCompleteTripMutation,
  useGetTripByIdQuery,
  useLazyGetDriverLocationQuery,
  usePauseTripMutation,
  useRequestDriverTripInterruptionMutation,
  useStartTripMutation,
  useUpdateDriverLocationMutation,
} from '@/store/api/tripApi';
import { reconcileAmbiguousMutation } from '@/utils/mutationReconciliation';
import { getTripLocationCoordinate, isCoordinateInKinshasaBounds } from '@/utils/tripCoordinates';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { applyPassengerInterruptionResponse } from '@/store/api/booking/passengerInterruptionResponseCache';
import { applyDriverBookingDecision, type DriverBookingDecision } from '@/store/api/booking/driverDecisionCache';
import type { Booking } from '@/types';



export function useDriverNavigationData() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const dispatch = useAppDispatch();
  const driverId = useAppSelector(state => state.auth.user?.id);
  const insets = useSafeAreaInsets();
  const tripId = typeof id === 'string' ? id : '';
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const isScreenActive = isFocused && isAppActive;

  const { data: liveTrip, error: tripError, isLoading, isFetching: isTripFetching, refetch: refetchTrip } = useGetTripByIdQuery(tripId, {
    skip: !tripId,
    skipPollingIfUnfocused: true,
  });
  const { data: trip, offline: offlineTrip } = useOfflineRideData(`trip:${tripId}`, liveTrip, tripError, liveTrip?.status === 'ongoing');
  const isTripOngoing = trip?.status === 'ongoing';
  const { data: liveBookings, error: bookingsError, isLoading: bookingsLoading, refetch: refetchBookings } = useGetTripBookingsQuery(
    tripId,
    {
      skip: !tripId,
      pollingInterval: isScreenActive && isTripOngoing ? 20_000 : 0,
      skipPollingIfUnfocused: true,
    },
  );
  const [getDirections] = useGetDirectionsMutation();
  const { data: bookings, offline: offlineBookings } = useOfflineRideData(`trip-bookings:${tripId}`, liveBookings, bookingsError, isTripOngoing);
  const { begin: beginRouteRequest, cancel: cancelRouteRequest } = useNavigationRequestGuard(isScreenActive, tripId);
  const { begin: beginLocationRequest, cancel: cancelLocationRequest } =
    useNavigationRequestGuard(isScreenActive && isTripOngoing, tripId);
  const [acceptBooking, { isLoading: isAcceptingBooking }] = useAcceptBookingMutation();
  const [rejectBooking, { isLoading: isRejectingBooking }] = useRejectBookingMutation();
  const [cancelBooking, { isLoading: isCancellingPickupBypassBooking }] = useCancelBookingMutation();
  const [completeTrip] = useCompleteTripMutation();
  const [getDriverTripRevenueSummary] = useLazyGetDriverTripRevenueSummaryQuery();
  const [pauseTrip, { isLoading: isPausingTrip }] = usePauseTripMutation();
  const [requestDriverTripInterruption, { isLoading: isRequestingDriverInterruption }] =
    useRequestDriverTripInterruptionMutation();
  const [cancelDriverTripInterruption, { isLoading: isCancellingDriverInterruption }] =
    useCancelDriverTripInterruptionMutation();
  const [
    confirmPassengerTripInterruption,
    { isLoading: isConfirmingPassengerInterruption },
  ] = useConfirmPassengerTripInterruptionMutation();
  const [
    rejectPassengerTripInterruption,
    { isLoading: isRejectingPassengerInterruption },
  ] = useRejectPassengerTripInterruptionMutation();
  const [startTrip, { isLoading: isRestartingTrip }] = useStartTripMutation();
  const [updateDriverLocation] = useUpdateDriverLocationMutation();
  const [getDriverLocationSnapshot] = useLazyGetDriverLocationQuery();
  const [createTripShareLink, { isLoading: isCreatingTripShareLink }] =
    useCreateTripShareLinkMutation();
  const commitPassengerInterruptionResponse = useCallback((response: Booking, source: Booking) => {
    if (driverId) dispatch(applyPassengerInterruptionResponse(response, source, driverId));
  }, [dispatch, driverId]);
  const commitBookingDecision = useCallback((source: Booking, status: DriverBookingDecision, response?: Booking) => {
    if (driverId) dispatch(applyDriverBookingDecision(source, status, driverId, response));
  }, [dispatch, driverId]);
  const reconcileBookingStatus = useCallback(
    async (error: unknown, bookingId: string, expectedStatuses: readonly string[]) =>
      reconcileAmbiguousMutation({
        error,
        loadSnapshot: async () => {
          const result = await refetchBookings();
          return result.data?.find((booking) => booking.id === bookingId) ?? null;
        },
        isApplied: (booking) => expectedStatuses.includes(booking.status),
      }),
    [refetchBookings],
  );
  const reconcileTripStatus = useCallback(
    async (error: unknown, expectedStatuses: readonly string[]) =>
      reconcileAmbiguousMutation({
        error,
        loadSnapshot: async () => (await refetchTrip()).data ?? null,
        isApplied: (latestTrip) => expectedStatuses.includes(latestTrip.status),
      }),
    [refetchTrip],
  );
  const tripDepartureCoordinate = useMemo(
    () =>
      getTripLocationCoordinate({
        lat: trip?.departure?.lat,
        lng: trip?.departure?.lng,
        hasCoordinates: trip?.departure?.hasCoordinates,
      }),
    [trip?.departure?.hasCoordinates, trip?.departure?.lat, trip?.departure?.lng],
  );
  const tripArrivalCoordinate = useMemo(
    () =>
      getTripLocationCoordinate({
        lat: trip?.arrival?.lat,
        lng: trip?.arrival?.lng,
        hasCoordinates: trip?.arrival?.hasCoordinates,
      }),
    [trip?.arrival?.hasCoordinates, trip?.arrival?.lat, trip?.arrival?.lng],
  );
  const isKinshasaNavigationTrip = Boolean(
    tripDepartureCoordinate &&
      tripArrivalCoordinate &&
      isCoordinateInKinshasaBounds(tripDepartureCoordinate) &&
      isCoordinateInKinshasaBounds(tripArrivalCoordinate),
  );

  useEffect(() => {
    if (!__DEV__ || !trip?.id) {
      return;
    }

    console.log('[DriverNavigation] route endpoint coordinates', {
      tripId,
      departure: {
        raw: {
          lat: trip?.departure?.lat,
          lng: trip?.departure?.lng,
          hasCoordinates: trip?.departure?.hasCoordinates,
        },
        normalized: tripDepartureCoordinate,
      },
      arrival: {
        raw: {
          lat: trip?.arrival?.lat,
          lng: trip?.arrival?.lng,
          hasCoordinates: trip?.arrival?.hasCoordinates,
        },
        normalized: tripArrivalCoordinate,
      },
      isKinshasaNavigationTrip,
    });
  }, [
    isKinshasaNavigationTrip,
    trip?.arrival?.hasCoordinates,
    trip?.arrival?.lat,
    trip?.arrival?.lng,
    trip?.departure?.hasCoordinates,
    trip?.departure?.lat,
    trip?.departure?.lng,
    trip?.id,
    tripArrivalCoordinate,
    tripDepartureCoordinate,
    tripId,
  ]);

  return {
    tripId,
    isScreenActive,
    tripDepartureCoordinate,
    bookings,
    isKinshasaNavigationTrip,
    tripArrivalCoordinate,
    trip,
    cancelRouteRequest,
    cancelLocationRequest,
    router,
    isTripOngoing,
    showDialog,
    getDriverTripRevenueSummary,
    completeTrip,
    reconcileTripStatus,
    refetchTrip,
    refetchBookings,
    getDriverLocationSnapshot,
    updateDriverLocation,
    isFocused,
    beginLocationRequest,
    beginRouteRequest,
    getDirections,
    acceptBooking,
    reconcileBookingStatus,
    rejectBooking,
    isConfirmingPassengerInterruption,
    confirmPassengerTripInterruption,
    commitPassengerInterruptionResponse,
    commitBookingDecision,
    isRejectingPassengerInterruption,
    rejectPassengerTripInterruption,
    cancelBooking,
    isRestartingTrip,
    isTripFetching,
    startTrip,
    pauseTrip,
    requestDriverTripInterruption,
    isPausingTrip,
    isRequestingDriverInterruption,
    isCancellingDriverInterruption,
    cancelDriverTripInterruption,
    createTripShareLink,
    isLoading,
    bookingsLoading,
    offlineTrip,
    offlineBookings,
    isAcceptingBooking,
    isRejectingBooking,
    isCreatingTripShareLink,
    insets,
    isCancellingPickupBypassBooking,
  };
}
