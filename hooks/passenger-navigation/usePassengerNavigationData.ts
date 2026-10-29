import { useDialog } from '@/components/ui/DialogProvider';
import { useOfflineRideData } from '@/hooks/navigation/useOfflineRideData';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { useNavigationReadData } from '@/hooks/navigation/useNavigationReadData';
import {
  useCancelBookingMutation,
  useGetBookingByIdQuery,
  useRequestPassengerTripInterruptionMutation,
  useUpdatePassengerLocationMutation,
} from '@/store/api/bookingApi';
import { useCreateTripShareLinkMutation } from '@/store/api/trackingApi';
import {
  useConfirmDriverTripInterruptionMutation,
  useGetTripByIdQuery,
  useRejectDriverTripInterruptionMutation,
} from '@/store/api/tripApi';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDriverLocationFallback } from './useDriverLocationFallback';
import { useSyncArrivedPaymentBooking } from '@/hooks/arrival-payment/useSyncArrivedPaymentBooking';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { applyDriverInterruptionResponse } from '@/store/api/trip/interruptionResponseCache';
import type { Trip } from '@/types';
import { useCallback } from 'react';



export function usePassengerNavigationData() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const dispatch = useAppDispatch();
  const passengerId = useAppSelector(state => state.auth.user?.id);
  const isOnline = useAppSelector(state => state.zwangaApi.config.online);
  const insets = useSafeAreaInsets();
  const bookingId = typeof id === 'string' ? id : '';
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const isScreenActive = isFocused && isAppActive;
  const readsEnabled = isScreenActive && isOnline && !!passengerId;

  // Récupérer la réservation et le trajet
  const bookingRead = useGetBookingByIdQuery(bookingId, displayReadOptions(readsEnabled && !!bookingId, 60_000));
  const { isLoading: bookingLoading, isFetching: bookingFetching } = bookingRead;
  const { data: liveBooking, error: bookingError } = useNavigationReadData(`${passengerId}:booking:${bookingId}`, bookingRead, isOnline);
  const refetchBooking = useDisplayRefetch(readsEnabled && !!bookingId, `${passengerId}:${bookingId}`, bookingRead.refetch);
  const { data: booking, offline: offlineBooking } = useOfflineRideData(`booking:${bookingId}`, liveBooking, bookingError, liveBooking?.status === 'accepted');
  useSyncArrivedPaymentBooking(liveBooking, isScreenActive);
  const tripId = booking?.tripId || '';
  const tripRead = useGetTripByIdQuery(tripId, displayReadOptions(readsEnabled && !!tripId, 30_000));
  const { isLoading: tripLoading, isFetching: tripFetching } = tripRead;
  const { data: liveTrip, error: tripError } = useNavigationReadData(`${passengerId}:trip:${tripId}`, tripRead, isOnline);
  const refetchTrip = useDisplayRefetch(readsEnabled && !!tripId, `${passengerId}:${tripId}`, tripRead.refetch);
  const { data: trip, offline: offlineTrip } = useOfflineRideData(`trip:${tripId}`, liveTrip, tripError, liveTrip?.status === 'ongoing');
  const isTripOngoing = trip?.status === 'ongoing';
  const driverLocationSnapshot = useDriverLocationFallback(tripId, isScreenActive && isOnline && isTripOngoing);
  const commitDriverInterruptionResponse = useCallback((response: Trip, requestId: string) => {
    if (passengerId) dispatch(applyDriverInterruptionResponse(response, { tripId, bookingId, passengerId, requestId }));
  }, [bookingId, dispatch, passengerId, tripId]);

  const [updatePassengerLocation] = useUpdatePassengerLocationMutation();
  const [cancelBooking, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [requestPassengerTripInterruption, { isLoading: isRequestingPassengerInterruption }] =
    useRequestPassengerTripInterruptionMutation();
  const [confirmDriverTripInterruption, { isLoading: isConfirmingDriverInterruption }] =
    useConfirmDriverTripInterruptionMutation();
  const [rejectDriverTripInterruption, { isLoading: isRejectingDriverInterruption }] =
    useRejectDriverTripInterruptionMutation();
  const [createTripShareLink, { isLoading: isCreatingTripShareLink }] =
    useCreateTripShareLinkMutation();

  return {
    passengerId,
    bookingFetching,
    tripFetching,
    bookingId,
    isScreenActive,
    isOnline,
    isTripOngoing,
    insets,
    router,
    isFocused,
    trip,
    booking,
    tripId,
    refetchBooking,
    showDialog,
    driverLocationSnapshot,
    refetchTrip,
    updatePassengerLocation,
    createTripShareLink,
    cancelBooking,
    isCancellingBooking,
    requestPassengerTripInterruption,
    isRequestingPassengerInterruption,
    confirmDriverTripInterruption,
    commitDriverInterruptionResponse,
    rejectDriverTripInterruption,
    bookingLoading,
    tripLoading,
    offlineBooking,
    offlineTrip,
    isCreatingTripShareLink,
    isConfirmingDriverInterruption,
    isRejectingDriverInterruption,
  };
}
