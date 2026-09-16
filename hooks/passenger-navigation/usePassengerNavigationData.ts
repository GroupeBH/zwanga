import { useDialog } from '@/components/ui/DialogProvider';
import { useOfflineRideData } from '@/hooks/navigation/useOfflineRideData';
import { useAppIsActive } from '@/hooks/useAppIsActive';
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



export function usePassengerNavigationData() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const bookingId = typeof id === 'string' ? id : '';
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const isScreenActive = isFocused && isAppActive;

  // Récupérer la réservation et le trajet
  const { data: liveBooking, error: bookingError, isLoading: bookingLoading, refetch: refetchBooking } = useGetBookingByIdQuery(bookingId, {
    skip: !bookingId,
    pollingInterval: isScreenActive ? 60_000 : 0,
    skipPollingIfUnfocused: true,
  });
  const { data: booking, offline: offlineBooking } = useOfflineRideData(`booking:${bookingId}`, liveBooking, bookingError, liveBooking?.status === 'accepted');
  const tripId = booking?.tripId || '';
  const { data: liveTrip, error: tripError, isLoading: tripLoading, refetch: refetchTrip } = useGetTripByIdQuery(tripId, {
    skip: !tripId,
    pollingInterval: isScreenActive ? 30_000 : 0,
    skipPollingIfUnfocused: true,
  });
  const { data: trip, offline: offlineTrip } = useOfflineRideData(`trip:${tripId}`, liveTrip, tripError, liveTrip?.status === 'ongoing');
  const isTripOngoing = trip?.status === 'ongoing';
  const driverLocationSnapshot = useDriverLocationFallback(tripId, isScreenActive && isTripOngoing);

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
    bookingId,
    isScreenActive,
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
