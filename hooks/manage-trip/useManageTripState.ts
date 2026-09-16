import { FeedbackState } from '../../features/manage-trip/manageTripModel';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDialog } from '@/components/ui/DialogProvider';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useUserLocation } from '@/hooks/useUserLocation';
import {
  useAcceptBookingMutation,
  useCancelBookingMutation,
  useGetTripBookingsQuery,
  useRejectBookingMutation,
} from '@/store/api/bookingApi';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import {
  useGetTripByIdQuery,
  usePauseTripMutation,
  useRequestDriverTripInterruptionMutation,
  useStartTripMutation,
  useUpdateTripMutation,
} from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { Booking } from '@/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export function useManageTripState() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tripId = typeof id === 'string' ? id : '';
  const user = useAppSelector(selectUser);
  const { isIdentityVerified } = useIdentityCheck();

  // Polling intelligent basé sur le statut du trajet
  const [pollingInterval, setPollingInterval] = useState<number>(0);

  const {
    data: trip,
    isLoading: tripLoading,
    isFetching: tripFetching,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, { 
    skip: !tripId,
    pollingInterval: isScreenActive ? pollingInterval : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: false,
  });

  // Mettre à jour l'intervalle de polling en fonction du statut du trajet
  // Note: polling réduit car la navigation gère le temps réel via WebSocket
  useEffect(() => {
    if (!trip) {
      setPollingInterval(0);
      return;
    }
    
    // Polling léger - la navigation gère le temps réel pour les trajets en cours
    if (trip.status === 'ongoing') {
      setPollingInterval(60000); // 60 secondes - juste pour sync occasionnel
    } else if (trip.status === 'upcoming') {
      setPollingInterval(60000); // 60 secondes pour les trajets à venir
    } else {
      setPollingInterval(0); // Pas de polling pour les trajets terminés/annulés
    }
  }, [trip?.status]);

  const isOwner = useMemo(() => !!trip && !!user && trip.driverId === user.id, [trip, user]);
  const { lastKnownLocation } = useUserLocation({
    autoRequest: Boolean(isScreenActive && isOwner && trip?.status === 'ongoing'),
    trackingProfile: 'navigation',
  });
  const {
    data: bookings,
    isLoading: bookingsLoading,
    isFetching: bookingsFetching,
    refetch: refetchBookings,
  } = useGetTripBookingsQuery(tripId, { 
    skip: !tripId,
    // Polling réduit - utiliser le refresh manuel ou refetchOnFocus
    pollingInterval: isScreenActive ? (trip?.status === 'upcoming' ? 60000 : 0) : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const [acceptBooking, { isLoading: isAccepting }] = useAcceptBookingMutation();
  const [rejectBooking, { isLoading: isRejecting }] = useRejectBookingMutation();
  const [cancelBooking, { isLoading: isCancellingBooking }] = useCancelBookingMutation();
  const [updateTripStatus, { isLoading: isUpdatingTripStatus }] = useUpdateTripMutation();
  const [updateTripRoute, { isLoading: isUpdatingRoute }] = useUpdateTripMutation();
  const [geocodeManualAddress] = useGeocodeMutation();
  const [startTrip, { isLoading: isStartingTrip }] = useStartTripMutation();
  const [pauseTrip, { isLoading: isPausingTrip }] = usePauseTripMutation();
  const [requestDriverTripInterruption, { isLoading: isRequestingDriverInterruption }] =
    useRequestDriverTripInterruptionMutation();

  // console.log("this bookings", bookings);

  const { showDialog } = useDialog();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [targetBooking, setTargetBooking] = useState<Booking | null>(null);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [locallyAcceptedBookingIds, setLocallyAcceptedBookingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [selectedPassengerPhone, setSelectedPassengerPhone] = useState<string | null>(null);
  const [selectedPassengerName, setSelectedPassengerName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [editRouteModalVisible, setEditRouteModalVisible] = useState(false);
  const [editDepartureAddress, setEditDepartureAddress] = useState('');
  const [editArrivalAddress, setEditArrivalAddress] = useState('');
  const [editRouteError, setEditRouteError] = useState('');
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);
  const presentedManageAutoProgressKeysRef = useRef<Set<string>>(new Set());
  const highestManageAutoProgressPriorityRef = useRef<Map<string, number>>(new Map());
  const lastManageDriverLocationSentAtRef = useRef(0);
  const bookingsRef = useRef<Booking[] | undefined>(undefined);
  const showDialogRef = useRef(showDialog);
  const refetchTripRef = useRef<(() => unknown) | null>(null);
  const refetchBookingsRef = useRef<(() => unknown) | null>(null);
  const isSavingRoute = isUpdatingRoute || isResolvingRoute;

  return {
    setRefreshing,
    refetchTrip,
    refetchBookings,
    setLocallyAcceptedBookingIds,
    bookings,
    locallyAcceptedBookingIds,
    bookingsRef,
    showDialogRef,
    showDialog,
    refetchTripRef,
    refetchBookingsRef,
    presentedManageAutoProgressKeysRef,
    highestManageAutoProgressPriorityRef,
    lastManageDriverLocationSentAtRef,
    tripId,
    isOwner,
    trip,
    lastKnownLocation,
    setSecurityModalVisible,
    setFeedback,
    setTargetBooking,
    setRejectReason,
    setRejectError,
    setRejectModalVisible,
    isRejecting,
    setProcessingBookingId,
    acceptBooking,
    targetBooking,
    rejectReason,
    rejectBooking,
    cancelBooking,
    setEditDepartureAddress,
    setEditArrivalAddress,
    setEditRouteError,
    setEditRouteModalVisible,
    isSavingRoute,
    geocodeManualAddress,
    editDepartureAddress,
    editArrivalAddress,
    setIsResolvingRoute,
    updateTripRoute,
    startTrip,
    pauseTrip,
    requestDriverTripInterruption,
    router,
    updateTripStatus,
    goHome,
    tripLoading,
    tripFetching,
    isIdentityVerified,
    bookingsFetching,
    feedback,
    refreshing,
    isAccepting,
    processingBookingId,
    setSelectedPassengerPhone,
    setSelectedPassengerName,
    setContactModalVisible,
    isCancellingBooking,
    insets,
    isStartingTrip,
    isUpdatingTripStatus,
    isPausingTrip,
    isRequestingDriverInterruption,
    securityModalVisible,
    editRouteModalVisible,
    editRouteError,
    rejectModalVisible,
    rejectError,
    contactModalVisible,
    selectedPassengerName,
    selectedPassengerPhone,
  };
}
