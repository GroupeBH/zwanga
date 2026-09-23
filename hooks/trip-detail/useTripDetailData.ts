import { pointToLatLng } from '../../features/trip-detail/tripDetailModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useGetMyBookingsQuery, useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectConversations, selectTripById, selectUser } from '@/store/selectors';
import { useIsFocused } from '@react-navigation/native';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



export function useTripDetailData() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const isScreenActive = isFocused && isAppActive;
  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const tripId = typeof params.id === 'string' ? (params.id as string) : '';
  const openEditParamValue = Array.isArray(params.openEdit) ? params.openEdit[0] : params.openEdit;
  const shouldOpenEditFromParams = openEditParamValue === '1' || openEditParamValue === 'true';
  const openEditParamKey = `${tripId}:${openEditParamValue ?? ''}`;
  const trackParam = Array.isArray(params.track) ? params.track.includes('true') : params.track === 'true'; // Permet le suivi via lien partagé
  const tripFromStore = useAppSelector((state) => selectTripById(tripId)(state));

  // Récupérer le trajet depuis l'API si pas dans le store
  // Polling intelligent basé sur le statut du trajet
  const {
    data: tripFromApi,
    isLoading: tripLoading,
    refetch: refetchTrip,
  } = useGetTripByIdQuery(tripId, {
    skip: !tripId,
    // Polling automatique basé sur le statut du trajet
    pollingInterval: !isScreenActive ? 0 : tripFromStore?.status === 'ongoing'
      ? 15000 // 15 secondes pour les trajets en cours
      : tripFromStore?.status === 'upcoming'
        ? 60000 // 60 secondes pour les trajets à venir
        : 0, // Pas de polling pour les trajets terminés/annulés
    skipPollingIfUnfocused: true,
    refetchOnFocus: true, // Rafraîchir quand l'utilisateur revient dans l'app
    refetchOnMountOrArgChange: true, // Une notification peut annoncer un démarrage ou une interruption.
    refetchOnReconnect: false,
  });

  // Utiliser le trajet de l'API en priorité, sinon celui du store
  const trip = tripFromApi || tripFromStore;

  const user = useAppSelector(selectUser);
  const conversations = useAppSelector(selectConversations);
  const { showDialog } = useDialog();
  const { isIdentityVerified, checkIdentity } = useIdentityCheck();
  const driverPhone = trip?.driver?.phone ?? null;
  // console.log('driverPhone', driverPhone);
  const isTripDriver = Boolean(trip && user && trip.driverId === user.id);
  const {
    data: myBookings,
    refetch: refetchMyBookings,
  } = useGetMyBookingsQuery(undefined, {
    // Polling pour les réservations si le trajet est actif
    pollingInterval: !isScreenActive ? 0 : trip?.status === 'ongoing' ? 30_000 : trip?.status === 'upcoming' ? 60_000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const {
    data: driverTripBookings,
    refetch: refetchDriverTripBookings,
  } = useGetTripBookingsQuery(tripId, {
    skip: !tripId || !isTripDriver,
    // Polling pour les réservations du trajet
    pollingInterval: !isScreenActive ? 0 : trip?.status === 'ongoing' ? 30_000 : trip?.status === 'upcoming' ? 60_000 : 0,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  // This endpoint is driver-only. Passenger details use their own reservations.
  const tripBookings = useMemo(() => isTripDriver ? driverTripBookings : myBookings?.filter(booking => booking.tripId === tripId),
    [driverTripBookings, isTripDriver, myBookings, tripId]);
  const refetchTripBookings = useCallback(() => {
    if (isTripDriver && tripId) return refetchDriverTripBookings();
  }, [isTripDriver, refetchDriverTripBookings, tripId]);
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
  const presentedTripDetailAutoProgressKeysRef = useRef<Set<string>>(new Set());
  const highestTripDetailAutoProgressPriorityRef = useRef<Map<string, number>>(new Map());
  const tripDetailBookingStateRef = useRef<
    Map<
      string,
      {
        pickupConfirmed: boolean;
        dropoffConfirmed: boolean;
      }
    >
  >(new Map());
  useEffect(() => {
    setLiveDriverCoordinate(initialLiveCoordinate);
  }, [initialLiveCoordinate]);
  useEffect(() => {
    setLiveDriverUpdatedAt(trip?.lastLocationUpdateAt ?? null);
  }, [trip?.lastLocationUpdateAt]);

  return {
    trip,
    isTripDriver,
    shouldOpenEditFromParams,
    isFocused,
    isScreenActive,
    openEditParamKey,
    showDialog,
    refetchTrip,
    insets,
    tripId,
    refetchMyBookings,
    refetchTripBookings,
    presentedTripDetailAutoProgressKeysRef,
    highestTripDetailAutoProgressPriorityRef,
    tripDetailBookingStateRef,
    stopWatchingRef,
    requestLocationRef,
    myBookings,
    user,
    trackParam,
    tripBookings,
    setTrackingError,
    setLiveDriverUpdatedAt,
    setLiveDriverCoordinate,
    lastKnownLocation,
    liveDriverCoordinate,
    trackingError,
    liveDriverUpdatedAt,
    isIdentityVerified,
    checkIdentity,
    requestDriverLocationPermission,
    router,
    conversations,
    tripLoading,
    goHome,
    viewportHeight,
    driverPhone,
  };
}
