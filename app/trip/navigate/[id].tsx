import { useDialog } from '@/components/ui/DialogProvider';
import {
  getVehicleTrackingMarkerImage,
  PASSENGER_TRACKING_MARKER_ANCHOR,
  PassengerTrackingMarker,
  type PassengerTrackingMarkerStatus,
  VEHICLE_TRACKING_MARKER_ANCHOR,
  VehicleTrackingMarker,
} from '@/components/TrackingMapMarkers';
import TripSecurityPanel from '@/components/trip/TripSecurityPanel';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import {
  trackingSocket,
  type BookingAutoProgressPayload,
  type PassengerLocationPayload,
} from '@/services/trackingSocket';
import {
  useGetTripBookingsQuery
} from '@/store/api/bookingApi';
import { TravelMode, useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import type { Booking } from '@/types';
import {
  areTripMapCoordinatesSame,
  getTripLocationCoordinate,
  normalizeTripMapCoordinate,
} from '@/utils/tripCoordinates';
import { calculateDistance, getRouteAlignedPosition } from '@/utils/routeHelpers';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageRequireSource,
} from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE, type MapMarker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

interface RouteStep {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  end_location: { lat: number; lng: number };
  html_instructions: string;
  maneuver?: string;
  polyline: { points: string };
  start_location: { lat: number; lng: number };
  travel_mode: string;
}

interface Waypoint {
  id: string;
  type: 'pickup' | 'dropoff';
  location: { lat: number; lng: number };
  address: string;
  passenger: {
    id: string;
    name: string;
    phone?: string;
  };
  booking: Booking;
  completed: boolean;
}

interface PassengerMapLocation {
  bookingId: string;
  coordinate: { latitude: number; longitude: number };
  isLive: boolean;
  passengerId: string;
  passengerName: string;
  status: PassengerTrackingMarkerStatus;
}

type RouteSectionFocus = 'next' | 'remaining';

type PickupNoticeEventType =
  | 'driver_arrived_pickup'
  | 'parties_nearby'
  | 'passenger_ready_pickup';

type BookingAutoProgressEvent = BookingAutoProgressPayload['events'][number];

interface PickupNotice {
  type: PickupNoticeEventType;
  waypoint: Waypoint;
  distanceMeters?: number;
  detectedAt?: string;
  expiresAt?: string;
  pickupWaitSeconds?: number;
}

interface TripEndNotice {
  distanceMeters?: number;
  detectedAt?: string;
}

type LivePassengerLocation = {
  coordinate: { latitude: number; longitude: number };
  updatedAt?: string | null;
};

const SPEECH_LANGUAGE = 'fr-FR';
const SPEECH_RATE = 0.95;
const SPEECH_MIN_INTERVAL_MS = 2500;
const MAX_LIVE_PASSENGER_MARKERS = Platform.OS === 'ios' ? 10 : 16;
const USE_ANDROID_NAVIGATION_MARKER_IMAGES = Platform.OS === 'android';
const ANDROID_PIN_MARKER_ANCHOR = { x: 0.5, y: 0.88 };
const DRIVER_PICKUP_ARRIVAL_DISTANCE_KM = 0.05;
const PASSENGER_READY_DISTANCE_KM = 0.005;
const MOVING_TOGETHER_DISTANCE_KM = 0.025;
const MOVING_TOGETHER_PICKUP_EXIT_DISTANCE_KM = 0.03;
const PICKUP_NOTICE_PRIORITY: Record<PickupNoticeEventType, number> = {
  driver_arrived_pickup: 1,
  parties_nearby: 2,
  passenger_ready_pickup: 3,
};
const androidNavigationMarkerImages: Record<'pickup' | 'dropoff' | 'destination', ImageRequireSource> = {
  pickup: require('@/assets/images/map-markers/trip-detail-marker-passenger.png'),
  dropoff: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
  destination: require('@/assets/images/map-markers/trip-detail-marker-arrival.png'),
};

const cleanHtmlInstructions = (html: string): string => {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const formatDistanceForSpeech = (distanceInMeters: number): string => {
  if (!Number.isFinite(distanceInMeters) || distanceInMeters <= 0) {
    return '';
  }

  if (distanceInMeters >= 1000) {
    const kilometers = distanceInMeters / 1000;
    const rounded = kilometers >= 10 ? Math.round(kilometers).toString() : kilometers.toFixed(1).replace('.', ',');
    return `${rounded} ${kilometers > 1 ? 'kilomètres' : 'kilomètre'}`;
  }

  const roundedMeters = Math.max(10, Math.round(distanceInMeters / 10) * 10);
  return `${roundedMeters} mètres`;
};

export default function NavigationScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const tripId = typeof id === 'string' ? id : '';

  const { data: trip, isLoading, isFetching: isTripFetching, refetch: refetchTrip } = useGetTripByIdQuery(tripId, { skip: !tripId });
  const isTripOngoing = trip?.status === 'ongoing';
  const { data: bookings, isLoading: bookingsLoading, refetch: refetchBookings } = useGetTripBookingsQuery(
    tripId,
    {
      skip: !tripId,
      pollingInterval: isTripOngoing ? 10000 : 0,
      skipPollingIfUnfocused: true,
    },
  );
  const [getDirections] = useGetDirectionsMutation();
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

  const mapRef = useRef<MapView>(null);
  const passengerMarkerRefs = useRef<Record<string, MapMarker | null>>({});
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [totalDistance, setTotalDistance] = useState<string>('');
  const [totalDuration, setTotalDuration] = useState<string>('');
  const [isLoadingRoute, setIsLoadingRoute] = useState(true);
  const [heading, setHeading] = useState<number>(0);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isVoiceGuidanceEnabled, setIsVoiceGuidanceEnabled] = useState(true);
  const [livePassengerLocations, setLivePassengerLocations] = useState<Record<string, LivePassengerLocation>>({});
  const [routeSectionFocus, setRouteSectionFocus] = useState<RouteSectionFocus>('next');
  
  // Modal et panneau pour les waypoints
  const [waypointModalVisible, setWaypointModalVisible] = useState(false);
  const [passengersPanelVisible, setPassengersPanelVisible] = useState(false);
  const [activeWaypoint, setActiveWaypoint] = useState<Waypoint | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [backgroundDisclosureVisible, setBackgroundDisclosureVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [pickupNotice, setPickupNotice] = useState<PickupNotice | null>(null);
  const [pickupNoticeCountdown, setPickupNoticeCountdown] = useState<number | null>(null);
  const [tripEndNotice, setTripEndNotice] = useState<TripEndNotice | null>(null);
  const pickupNoticeRef = useRef<PickupNotice | null>(null);
  const tripEndNoticeRef = useRef<TripEndNotice | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const recalcRouteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundDisclosureResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const isMountedRef = useRef(true);
  const isTripOngoingRef = useRef(false);
  const driverMarkerRef = useRef<MapMarker | null>(null);
  const [loadedPassengerMarkerKeys, setLoadedPassengerMarkerKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [destinationTracksViewChanges, setDestinationTracksViewChanges] = useState(true);
  const driverPosition = useRef(
    new AnimatedRegion({
      latitude: tripDepartureCoordinate?.latitude ?? 0,
      longitude: tripDepartureCoordinate?.longitude ?? 0,
      latitudeDelta: 0,
      longitudeDelta: 0,
    })
  ).current;

  const passengerMapLocations = useMemo<PassengerMapLocation[]>(() => {
    const locations: PassengerMapLocation[] = [];

    (bookings ?? [])
      .filter((booking) => {
        if (booking.status !== 'accepted' && booking.status !== 'completed') {
          return false;
        }

        const isPassengerDroppedOff = Boolean(
          booking.status === 'completed' || booking.droppedOff || booking.droppedOffConfirmedByPassenger,
        );
        return !(booking.pickedUp && !isPassengerDroppedOff);
      })
      .slice(0, MAX_LIVE_PASSENGER_MARKERS)
      .forEach((booking) => {
        const isPassengerDroppedOff = Boolean(
          booking.status === 'completed' || booking.droppedOff || booking.droppedOffConfirmedByPassenger,
        );
        const liveLocation = livePassengerLocations[booking.id];
        const apiLocation = normalizeTripMapCoordinate(
          booking.passengerLocationCoordinates?.latitude,
          booking.passengerLocationCoordinates?.longitude,
        );
        const pickupLocation = normalizeTripMapCoordinate(
          booking.passengerOriginCoordinates?.latitude,
          booking.passengerOriginCoordinates?.longitude,
        );
        const dropoffLocation =
          normalizeTripMapCoordinate(
            booking.passengerDestinationCoordinates?.latitude,
            booking.passengerDestinationCoordinates?.longitude,
          ) ?? tripArrivalCoordinate;
        const status: PassengerTrackingMarkerStatus =
          isPassengerDroppedOff
            ? 'arrived'
            : 'pickup';
        const coordinate =
          status === 'arrived'
            ? dropoffLocation ?? liveLocation?.coordinate ?? apiLocation ?? pickupLocation ?? tripDepartureCoordinate
            : liveLocation?.coordinate ?? apiLocation ?? pickupLocation ?? tripDepartureCoordinate;

        if (!coordinate) return;

        locations.push({
          bookingId: booking.id,
          coordinate,
          isLive: Boolean(liveLocation || apiLocation),
          passengerId: booking.passengerId,
          passengerName: booking.passengerName || 'Passager',
          status,
        });
      });

    return locations;
  }, [bookings, livePassengerLocations, tripArrivalCoordinate, tripDepartureCoordinate]);
  
  // Refs pour éviter les re-rendus excessifs
  const routeFetchedRef = useRef(false);
  const routeCoordinatesRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const lastRouteFetchTimeRef = useRef(0);
  const waypointsCountRef = useRef(0);
  const currentLocationRef = useRef<Location.LocationObject | null>(null);
  const hasEnabled3DRef = useRef(false);
  const isExitingRef = useRef(false);
  const isVoiceGuidanceEnabledRef = useRef(true);
  const lastSpeechAtRef = useRef(0);
  const spokenInstructionKeysRef = useRef<Set<string>>(new Set());
  const announcedWaypointIdsRef = useRef<Set<string>>(new Set());
  const presentedWaypointIdsRef = useRef<Set<string>>(new Set());
  const presentedPickupNoticeKeysRef = useRef<Set<string>>(new Set());
  const highestPickupNoticePriorityRef = useRef<Map<string, number>>(new Map());
  const presentedPassengerBoardedKeysRef = useRef<Set<string>>(new Set());
  const presentedPassengerDestinationKeysRef = useRef<Set<string>>(new Set());
  const presentedTripDestinationKeysRef = useRef<Set<string>>(new Set());
  const stepsRef = useRef<RouteStep[]>([]);
  const currentStepIndexRef = useRef(0);
  const waypointsRef = useRef<Waypoint[]>([]);
  const currentWaypointIndexRef = useRef(0);
  const waypointModalVisibleRef = useRef(false);

  stepsRef.current = steps;
  currentStepIndexRef.current = currentStepIndex;
  waypointsRef.current = waypoints;
  currentWaypointIndexRef.current = currentWaypointIndex;
  waypointModalVisibleRef.current = waypointModalVisible;
  routeCoordinatesRef.current = routeCoordinates;
  pickupNoticeRef.current = pickupNotice;
  tripEndNoticeRef.current = tripEndNotice;

  const cleanupNavigationUi = useCallback(() => {
    if (recalcRouteTimeoutRef.current) {
      clearTimeout(recalcRouteTimeoutRef.current);
      recalcRouteTimeoutRef.current = null;
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (backgroundDisclosureResolverRef.current) {
      backgroundDisclosureResolverRef.current(false);
      backgroundDisclosureResolverRef.current = null;
    }
    void Speech.stop();

    setBackgroundDisclosureVisible(false);
    setSecurityModalVisible(false);
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
    tripEndNoticeRef.current = null;
    setTripEndNotice(null);
    waypointModalVisibleRef.current = false;
    setWaypointModalVisible(false);
    setPassengersPanelVisible(false);
    setActiveWaypoint(null);
  }, []);

  const navigateBackSafely = useCallback(() => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    cleanupNavigationUi();
    currentLocationRef.current = null;
    mapRef.current = null;

    try {
      if (router.canGoBack()) {
        router.back();
      } else if (tripId) {
        router.replace(`/trip/${tripId}`);
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      isExitingRef.current = false;
      console.warn('[DriverNavigation] Impossible de quitter la navigation:', error);
      router.replace('/(tabs)');
    }
  }, [cleanupNavigationUi, router, tripId]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (recalcRouteTimeoutRef.current) {
        clearTimeout(recalcRouteTimeoutRef.current);
        recalcRouteTimeoutRef.current = null;
      }
      if (backgroundDisclosureResolverRef.current) {
        backgroundDisclosureResolverRef.current(false);
        backgroundDisclosureResolverRef.current = null;
      }
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    isTripOngoingRef.current = isTripOngoing;
  }, [isTripOngoing]);

  useEffect(() => {
    isVoiceGuidanceEnabledRef.current = isVoiceGuidanceEnabled;
    if (!isVoiceGuidanceEnabled) {
      void Speech.stop();
    }
  }, [isVoiceGuidanceEnabled]);

  useEffect(() => {
    spokenInstructionKeysRef.current.clear();
    announcedWaypointIdsRef.current.clear();
    presentedWaypointIdsRef.current.clear();
    lastSpeechAtRef.current = 0;
    setLoadedPassengerMarkerKeys(new Set());
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
    presentedPickupNoticeKeysRef.current.clear();
    highestPickupNoticePriorityRef.current.clear();
    presentedPassengerBoardedKeysRef.current.clear();
    presentedPassengerDestinationKeysRef.current.clear();
    void Speech.stop();
  }, [tripId]);

  useEffect(() => {
    if (isTripOngoing) {
      return;
    }
    void Speech.stop();
    waypointModalVisibleRef.current = false;
    setWaypointModalVisible(false);
    setPassengersPanelVisible(false);
    setActiveWaypoint(null);
  }, [isTripOngoing]);

  const resolveBackgroundDisclosure = (accepted: boolean) => {
    setBackgroundDisclosureVisible(false);
    if (backgroundDisclosureResolverRef.current) {
      backgroundDisclosureResolverRef.current(accepted);
      backgroundDisclosureResolverRef.current = null;
    }
  };

  const promptBackgroundDisclosure = () =>
    new Promise<boolean>((resolve) => {
      backgroundDisclosureResolverRef.current = resolve;
      setBackgroundDisclosureVisible(true);
    });

  const presentWaypointModal = useCallback((waypoint: Waypoint) => {
    if (
      !isMountedRef.current ||
      waypoint.completed ||
      waypointModalVisibleRef.current ||
      presentedWaypointIdsRef.current.has(waypoint.id)
    ) {
      return;
    }

    presentedWaypointIdsRef.current.add(waypoint.id);
    waypointModalVisibleRef.current = true;
    setActiveWaypoint(waypoint);
    setWaypointModalVisible(true);
  }, []);

  const presentPickupNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint: Waypoint) => {
      if (
        !isMountedRef.current ||
        !event.bookingId ||
        !['driver_arrived_pickup', 'parties_nearby', 'passenger_ready_pickup'].includes(event.type)
      ) {
        return;
      }

      const key = `${event.type}:${event.bookingId}`;
      if (presentedPickupNoticeKeysRef.current.has(key)) {
        return;
      }

      const nextType = event.type as PickupNoticeEventType;
      const nextPriority = PICKUP_NOTICE_PRIORITY[nextType];
      const highestPriorityForBooking =
        highestPickupNoticePriorityRef.current.get(event.bookingId) ?? -1;
      if (highestPriorityForBooking >= nextPriority) {
        return;
      }

      const currentNotice = pickupNoticeRef.current;
      if (
        currentNotice?.waypoint.booking.id === event.bookingId &&
        PICKUP_NOTICE_PRIORITY[currentNotice.type] >= nextPriority
      ) {
        return;
      }

      presentedPickupNoticeKeysRef.current.add(key);
      const nextNotice: PickupNotice = {
        type: nextType,
        waypoint,
        distanceMeters: event.distanceMeters,
        detectedAt: event.detectedAt,
        expiresAt: event.expiresAt,
        pickupWaitSeconds: event.pickupWaitSeconds,
      };
      pickupNoticeRef.current = nextNotice;
      highestPickupNoticePriorityRef.current.set(event.bookingId, nextPriority);
      setPickupNotice(nextNotice);

      const passengerName = waypoint.passenger.name || 'Le passager';
      const speech =
        event.type === 'passenger_ready_pickup'
          ? `${passengerName} s'est signalé au point de récupération.`
          : event.type === 'parties_nearby'
            ? `${passengerName} est là et prêt à être embarqué.`
            : `Vous êtes arrivé au point de récupération de ${passengerName}.`;

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(speech, { language: 'fr-FR', rate: 0.95 });
      });
    },
    [],
  );

  const getPassengerNameForBooking = useCallback(
    (bookingId: string, waypoint?: Waypoint | null) =>
      waypoint?.passenger.name ||
      bookings?.find((booking) => booking.id === bookingId)?.passengerName ||
      'Le passager',
    [bookings],
  );

  const presentPassengerBoardedNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint?: Waypoint | null) => {
      if (!isMountedRef.current || event.type !== 'pickup_confirmed' || !event.bookingId) {
        return;
      }

      const key = `pickup_confirmed:${event.bookingId}`;
      if (presentedPassengerBoardedKeysRef.current.has(key)) {
        return;
      }

      presentedPassengerBoardedKeysRef.current.add(key);
      const passengerName = getPassengerNameForBooking(event.bookingId, waypoint);
      setPickupNotice((current) =>
        current?.waypoint.booking.id === event.bookingId ? null : current,
      );
      setPickupNoticeCountdown(null);

      showDialog({
        variant: 'success',
        icon: 'checkmark-circle',
        title: 'Passager embarqu\u00e9',
        message: `${passengerName} a \u00e9t\u00e9 embarqu\u00e9. Vous pouvez continuer vers sa destination.`,
      });

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(`${passengerName} a \u00e9t\u00e9 embarqu\u00e9.`, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [getPassengerNameForBooking, showDialog],
  );

  const presentPassengerDestinationNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint?: Waypoint | null) => {
      if (!isMountedRef.current || event.type !== 'dropoff_confirmed' || !event.bookingId) {
        return;
      }

      const key = `dropoff_confirmed:${event.bookingId}`;
      if (presentedPassengerDestinationKeysRef.current.has(key)) {
        return;
      }

      presentedPassengerDestinationKeysRef.current.add(key);
      const passengerName = getPassengerNameForBooking(event.bookingId, waypoint);

      showDialog({
        variant: 'success',
        icon: 'flag',
        title: 'Destination atteinte',
        message: `Nous sommes arriv\u00e9s au point de destination de ${passengerName}.`,
      });

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(`Nous sommes arriv\u00e9s au point de destination de ${passengerName}.`, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [getPassengerNameForBooking, showDialog],
  );

  const presentTripDestinationNotice = useCallback(
    (event: BookingAutoProgressEvent) => {
      if (!isMountedRef.current || event.type !== 'driver_arrived_destination') {
        return;
      }

      const key = `driver_arrived_destination:${event.tripId}`;
      if (presentedTripDestinationKeysRef.current.has(key)) {
        return;
      }

      presentedTripDestinationKeysRef.current.add(key);
      const notice: TripEndNotice = {
        distanceMeters: event.distanceMeters,
        detectedAt: event.detectedAt,
      };
      tripEndNoticeRef.current = notice;
      setTripEndNotice(notice);

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak('Vous avez atteint la destination finale. Le trajet est termine automatiquement.', {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [],
  );

  useEffect(() => {
    if (!pickupNotice?.expiresAt) {
      setPickupNoticeCountdown(null);
      return;
    }

    const expiresAt = new Date(pickupNotice.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      setPickupNoticeCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setPickupNoticeCountdown(remainingSeconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pickupNotice?.expiresAt]);

  // Connexion WebSocket pour le tracking temps reel
  useEffect(() => {
    if (!tripId || !isTripOngoing) {
      setIsSocketConnected(false);
      return;
    }

    let isCancelled = false;
    setLivePassengerLocations({});

    // Rejoindre la room du trip pour le tracking temps reel
    trackingSocket
      .joinTrip(tripId)
      .then(() => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(true);
        void trackingSocket.requestPassengerLocations(tripId);
        console.log('[Navigation] Connecte au tracking temps reel');
      })
      .catch((error) => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(false);
        console.warn('[Navigation] Connexion tracking impossible:', error);
      });

    // Ecouter les erreurs WebSocket
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      if (!isMountedRef.current || isCancelled) return;
      console.warn('[Navigation] Erreur tracking:', message);
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (!isMountedRef.current || isCancelled || payload.tripId !== tripId) return;
      if (payload.events.length > 0) {
        const hasTripDestinationEvent = payload.events.some(
          (event) => event.type === 'driver_arrived_destination',
        );

        payload.events.forEach((event) => {
          if (event.type === 'driver_arrived_destination') {
            presentTripDestinationNotice(event);
            return;
          }

          if (!event.bookingId) {
            return;
          }

          if (
            event.type === 'driver_arrived_pickup' ||
            event.type === 'parties_nearby' ||
            event.type === 'passenger_ready_pickup'
          ) {
            const waypoint = waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'pickup',
            );
            if (waypoint) {
              presentPickupNotice(event, waypoint);
            }
            return;
          }

          if (event.type === 'pickup_confirmed') {
            const waypoint = waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'pickup',
            );
            presentPassengerBoardedNotice(event, waypoint ?? null);
            return;
          }

          if (event.type === 'dropoff_confirmed') {
            if (hasTripDestinationEvent) {
              return;
            }

            const waypoint = waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'dropoff',
            );
            presentPassengerDestinationNotice(event, waypoint ?? null);
          }
        });
        refetchBookings();
        refetchTrip();
      }
    });

    const unsubscribePassengerLocation = trackingSocket.subscribeToPassengerLocation(
      (payload: PassengerLocationPayload) => {
        if (
          !isMountedRef.current ||
          isCancelled ||
          payload.tripId !== tripId ||
          !payload.bookingId ||
          !payload.coordinates
        ) {
          return;
        }

        const coordinate = normalizeTripMapCoordinate(
          payload.coordinates[1],
          payload.coordinates[0],
        );
        if (!coordinate) return;

        setLivePassengerLocations((current) => ({
          ...current,
          [payload.bookingId]: {
            coordinate,
            updatedAt: payload.updatedAt,
          },
        }));
      },
    );

    return () => {
      isCancelled = true;
      // Quitter la room et se deconnecter proprement
      trackingSocket.leaveTrip(tripId);
      unsubscribeError();
      unsubscribeAutoProgress();
      unsubscribePassengerLocation();
      currentLocationRef.current = null;

      console.log('[Navigation] Deconnecte et memoire nettoyee');
    };
  }, [
    isTripOngoing,
    presentPassengerBoardedNotice,
    presentPassengerDestinationNotice,
    presentPickupNotice,
    presentTripDestinationNotice,
    refetchBookings,
    refetchTrip,
    tripId,
  ]);
  // Créer les waypoints à partir des bookings acceptés
  useEffect(() => {
    if (!bookings || !trip) return;

    // Vérifier que les coordonnées du trip sont valides
    const hasDeparture = Boolean(tripDepartureCoordinate);
    const hasArrival = Boolean(tripArrivalCoordinate);
    
    if (!hasDeparture || !hasArrival) {
      console.log('Coordonnées du trajet invalides');
      return;
    }

    const acceptedBookings = bookings.filter(b => b.status === 'accepted');
    const waypointsList: Waypoint[] = [];

    acceptedBookings.forEach((booking) => {
      try {
        // Utiliser le point de récupération choisi pendant la réservation.
        const passengerPickupCoordinate = normalizeTripMapCoordinate(
          booking.passengerOriginCoordinates?.latitude,
          booking.passengerOriginCoordinates?.longitude,
        );
        const pickupLocation = {
          lat: passengerPickupCoordinate?.latitude ?? tripDepartureCoordinate!.latitude,
          lng: passengerPickupCoordinate?.longitude ?? tripDepartureCoordinate!.longitude,
        };

        waypointsList.push({
          id: `pickup-${booking.id}`,
          type: 'pickup',
          location: pickupLocation,
          address: booking.passengerOrigin || trip.departure.address || '',
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: booking.pickedUp || false,
        });

        // Point d'arrivée du passager (destination personnalisée ou arrivée du trip)
        let dropoffLocation = {
          lat: tripArrivalCoordinate!.latitude,
          lng: tripArrivalCoordinate!.longitude,
        };
        
        const passengerDestinationCoordinate = normalizeTripMapCoordinate(
          booking.passengerDestinationCoordinates?.latitude,
          booking.passengerDestinationCoordinates?.longitude,
        );

        if (passengerDestinationCoordinate) {
          dropoffLocation = { 
            lat: passengerDestinationCoordinate.latitude,
            lng: passengerDestinationCoordinate.longitude,
          };
        }

        waypointsList.push({
          id: `dropoff-${booking.id}`,
          type: 'dropoff',
          location: dropoffLocation,
          address: booking.passengerDestination || trip.arrival.address || '',
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: booking.droppedOff || false,
        });
      } catch (error) {
        console.log('Erreur création waypoint pour booking:', booking.id, error);
      }
    });

    waypointsRef.current = waypointsList;
    setWaypoints(waypointsList);

    // Trouver le prochain waypoint non complété
    const nextIncompleteIndex = waypointsList.findIndex(wp => !wp.completed);
    if (nextIncompleteIndex !== -1) {
      currentWaypointIndexRef.current = nextIncompleteIndex;
      setCurrentWaypointIndex(nextIncompleteIndex);
    }
  }, [bookings, trip, tripArrivalCoordinate, tripDepartureCoordinate]);

  // Demander les permissions de localisation
  useEffect(() => {
    if (!tripId || !isTripOngoing) {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      return;
    }

    (async () => {
      try {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (!isMountedRef.current) return;
        if (foregroundStatus !== 'granted') {
          showDialog({
            title: 'Permission refusée',
            message: 'L\'accès à la localisation est nécessaire pour la navigation GPS.',
            variant: 'warning',
            icon: 'location-outline',
            actions: [
              { label: 'Retour', onPress: navigateBackSafely }
            ],
          });
          return;
        }

        // Tenter de demander la permission de localisation en arrière-plan (optionnel)
        // Cette permission n'est pas toujours disponible/configurée
        try {
          const { status: backgroundPermissionStatus } = await Location.getBackgroundPermissionsAsync();
          if (!isMountedRef.current) return;

          if (backgroundPermissionStatus !== 'granted') {
            const acceptedDisclosure = await promptBackgroundDisclosure();
            if (!isMountedRef.current) return;

            if (acceptedDisclosure) {
              const { status: requestedBackgroundStatus } = await Location.requestBackgroundPermissionsAsync();
              if (!isMountedRef.current) return;
              if (requestedBackgroundStatus !== 'granted') {
                console.log('Permission de localisation en arriere-plan non accordee - mode premier plan uniquement');
              }
            } else {
              console.log('Disclosure arriere-plan refusee par l utilisateur - mode premier plan uniquement');
            }
          }
        } catch (bgError) {
          // La permission de localisation en arriere-plan n est pas disponible/configuree
          console.log('Localisation en arriere-plan non disponible:', bgError);
        }

        const hasServicesEnabled = await Location.hasServicesEnabledAsync();
        if (!isMountedRef.current) return;
        if (!hasServicesEnabled) {
          showDialog({
            title: 'Localisation désactivée',
            message: 'Activez les services de localisation pour démarrer la navigation.',
            variant: 'warning',
            icon: 'location-outline',
            actions: [
              { label: 'Retour', onPress: navigateBackSafely }
            ],
          });
          return;
        }

        // Obtenir la position initiale (avec fallback)
        let location: Location.LocationObject | null = null;
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch (error) {
          location = await Location.getLastKnownPositionAsync({});
        }
        if (!isMountedRef.current) return;

        if (location) {
          currentLocationRef.current = location;
          setCurrentLocation(location);
          driverPosition.setValue({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
          });
        } else {
          console.warn('[Navigation] Position initiale indisponible, en attente du GPS');
        }

      // Variables pour throttling des mises à jour (optimisé pour éviter les crashs)
      let lastStateUpdateTime = 0;
      let lastBackendUpdateTime = 0;
      let lastStepCheckTime = 0;
      const STATE_UPDATE_INTERVAL = 10000; // Mise à jour du state toutes les 10 secondes
      const BACKEND_UPDATE_INTERVAL = 8000; // Mise à jour WebSocket toutes les 8 secondes
      const STEP_CHECK_INTERVAL = 5000; // Vérification étapes toutes les 5 secondes

      // S'abonner aux mises à jour de localisation (fréquence réduite pour stabilité)
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced, // Équilibre entre précision et batterie
          timeInterval: 5000, // GPS update toutes les 5 secondes
          distanceInterval: 20, // Ou tous les 20 mètres
        },
        (newLocation) => {
          if (!isMountedRef.current) return;
          const now = Date.now();

          if (
            currentLocationRef.current &&
            typeof newLocation.coords.accuracy === 'number' &&
            newLocation.coords.accuracy > 80
          ) {
            return;
          }

          currentLocationRef.current = newLocation;
          const rawCoordinate = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          };
          const routeAlignment = getRouteAlignedPosition(
            rawCoordinate,
            routeCoordinatesRef.current,
          );
          const displayedCoordinate = routeAlignment?.coordinate ?? rawCoordinate;

          driverPosition.timing({
            latitude: displayedCoordinate.latitude,
            longitude: displayedCoordinate.longitude,
            duration: 4500,
            useNativeDriver: false,
            toValue: 0,
            latitudeDelta: 0,
            longitudeDelta: 0
          }).start();

          const gpsHeading =
            newLocation.coords.heading !== null &&
            newLocation.coords.heading !== -1 &&
            (newLocation.coords.speed ?? 0) > 0.8
              ? normalizeHeading(newLocation.coords.heading)
              : null;
          const alignedHeading = routeAlignment?.heading ?? gpsHeading;

          if (alignedHeading !== null) {
            setHeading((previousHeading) => {
              const currentHeading = normalizeHeading(previousHeading);
              let delta = alignedHeading - currentHeading;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;

              if (Math.abs(delta) < 3) {
                return previousHeading;
              }

              return normalizeHeading(currentHeading + delta * 0.45);
            });
          }

          // Mettre à jour le state très rarement (pour éviter les re-rendus)
          if (now - lastStateUpdateTime > STATE_UPDATE_INTERVAL) {
            lastStateUpdateTime = now;
            setCurrentLocation(newLocation);
          }

          // Mettre à jour la position du conducteur via WebSocket (throttled)
          if (tripId && isTripOngoingRef.current && now - lastBackendUpdateTime > BACKEND_UPDATE_INTERVAL) {
            lastBackendUpdateTime = now;
            trackingSocket.updateDriverLocation(
              tripId,
              [newLocation.coords.longitude, newLocation.coords.latitude]
            ).catch(() => {}); // Ignorer les erreurs silencieusement
          }

          // NOTE: Animation de caméra désactivée pour éviter les crashs mémoire
          // L'utilisateur peut recentrer manuellement avec le bouton

          // Calculer la distance à chaque étape (throttled)
          if (now - lastStepCheckTime > STEP_CHECK_INTERVAL) {
            lastStepCheckTime = now;
            updateCurrentStep(newLocation);
          }
        }
      );
      locationSubscription.current = subscription;
      } catch (error) {
        console.error('Erreur lors de l\'initialisation de la localisation:', error);
        if (!isMountedRef.current) return;
        showDialog({
          title: 'Erreur de localisation',
          message: 'Impossible d\'activer le GPS. Vérifiez que la localisation est activée sur votre appareil.',
          variant: 'danger',
          icon: 'location-outline',
          actions: [
            { label: 'Réessayer', onPress: () => router.replace(`/trip/navigate/${tripId}`) },
            { label: 'Retour', variant: 'secondary', onPress: navigateBackSafely },
          ],
        });
      }
    })();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [tripId, isTripOngoing, navigateBackSafely]);

  // Passer la carte en 3D lorsque la course est en cours
  useEffect(() => {
    if (!isTripOngoing) {
      hasEnabled3DRef.current = false;
      return;
    }

    if (hasEnabled3DRef.current || !mapRef.current || !currentLocationRef.current) {
      return;
    }

    hasEnabled3DRef.current = true;
    mapRef.current.animateCamera(
      {
        center: {
          latitude: currentLocationRef.current.coords.latitude,
          longitude: currentLocationRef.current.coords.longitude,
        },
        pitch: 60,
        heading,
        zoom: 17,
      },
      { duration: 800 }
    );
  }, [isTripOngoing, currentLocation, heading]);

  const speakNavigationMessage = useCallback(async (message: string, options: { force?: boolean } = {}) => {
    const text = message.replace(/\s+/g, ' ').trim();
    if (!text || !isMountedRef.current || !isTripOngoingRef.current || !isVoiceGuidanceEnabledRef.current) {
      return;
    }

    const now = Date.now();
    if (!options.force && now - lastSpeechAtRef.current < SPEECH_MIN_INTERVAL_MS) {
      return;
    }
    lastSpeechAtRef.current = now;

    try {
      if (await Speech.isSpeakingAsync()) {
        await Speech.stop();
      }

      if (!isMountedRef.current || !isTripOngoingRef.current || !isVoiceGuidanceEnabledRef.current) {
        return;
      }

      Speech.speak(text, {
        language: SPEECH_LANGUAGE,
        rate: SPEECH_RATE,
        pitch: 1,
        onError: (error) => {
          console.warn('[Navigation] Guidage vocal impossible:', error);
        },
      });
    } catch (error) {
      console.warn('[Navigation] Guidage vocal indisponible:', error);
    }
  }, []);

  const buildInstructionSpeech = useCallback((step: RouteStep, intro?: string) => {
    const instruction = cleanHtmlInstructions(step.html_instructions);
    if (!instruction) return '';

    const distance = formatDistanceForSpeech(step.distance.value);
    const instructionText = distance ? `Dans ${distance}, ${instruction}.` : `${instruction}.`;
    return [intro, instructionText].filter(Boolean).join(' ');
  }, []);

  const buildWaypointSpeech = useCallback((waypoint: Waypoint) => {
    const passengerName = waypoint.passenger.name || 'le passager';
    const address = waypoint.address ? ` Adresse: ${waypoint.address}.` : '';
    if (waypoint.type === 'pickup') {
      return `Vous \u00eates arriv\u00e9 au point de r\u00e9cup\u00e9ration de ${passengerName}.${address}`;
    }

    return `Nous sommes arriv\u00e9s au point de destination de ${passengerName}. La d\u00e9pose se confirme automatiquement.${address}`;
  }, []);

  useEffect(() => {
    if (
      !waypointModalVisible ||
      !activeWaypoint ||
      announcedWaypointIdsRef.current.has(activeWaypoint.id)
    ) {
      return;
    }

    announcedWaypointIdsRef.current.add(activeWaypoint.id);
    void speakNavigationMessage(buildWaypointSpeech(activeWaypoint), { force: true });
  }, [activeWaypoint, buildWaypointSpeech, speakNavigationMessage, waypointModalVisible]);

  const announceInstruction = useCallback((step: RouteStep, index: number, intro?: string) => {
    const instruction = cleanHtmlInstructions(step.html_instructions);
    if (!instruction) return;

    const speechKey = `${index}:${instruction}`;
    if (spokenInstructionKeysRef.current.has(speechKey)) {
      return;
    }

    spokenInstructionKeysRef.current.add(speechKey);
    void speakNavigationMessage(buildInstructionSpeech(step, intro));
  }, [buildInstructionSpeech, speakNavigationMessage]);

  const toggleVoiceGuidance = useCallback(() => {
    const nextValue = !isVoiceGuidanceEnabledRef.current;
    isVoiceGuidanceEnabledRef.current = nextValue;
    setIsVoiceGuidanceEnabled(nextValue);

    if (!nextValue) {
      void Speech.stop();
      return;
    }

    const currentStep = steps[currentStepIndex];
    const message = currentStep
      ? buildInstructionSpeech(currentStep, 'Guidage vocal activé.')
      : 'Guidage vocal activé.';
    void speakNavigationMessage(message, { force: true });
  }, [buildInstructionSpeech, currentStepIndex, speakNavigationMessage, steps]);

  useEffect(() => {
    spokenInstructionKeysRef.current.clear();
  }, [steps]);

  useEffect(() => {
    if (!isTripOngoing || isLoadingRoute) {
      return;
    }

    const currentStep = steps[currentStepIndex];
    if (!currentStep) {
      return;
    }

    announceInstruction(
      currentStep,
      currentStepIndex,
      currentStepIndex === 0 ? 'Navigation démarrée.' : 'Prochaine instruction.'
    );
  }, [announceInstruction, currentStepIndex, isLoadingRoute, isTripOngoing, steps]);
  // Récupérer l'itinéraire depuis Google Directions API (une seule fois au démarrage et quand les waypoints changent)
  useEffect(() => {
    const now = Date.now();
    const waypointsChanged = waypoints.length !== waypointsCountRef.current;
    const timeSinceLastFetch = now - lastRouteFetchTimeRef.current;
    
    // Ne fetch que si:
    // 1. On a une location et un trip
    // 2. ET (le route n'a jamais été fetch OU les waypoints ont changé)
    // 3. ET au moins 30 secondes se sont écoulées depuis le dernier fetch
    if (currentLocation && trip && 
        (!routeFetchedRef.current || waypointsChanged) && 
        timeSinceLastFetch > 30000) {
      routeFetchedRef.current = true;
      waypointsCountRef.current = waypoints.length;
      lastRouteFetchTimeRef.current = now;
      fetchRoute();
    }
  }, [currentLocation, trip, waypoints.length]);

  const fetchRoute = async () => {
    if (!currentLocation || !trip || !tripArrivalCoordinate || !isMountedRef.current) return;

    setIsLoadingRoute(true);
    try {
      // Construire les waypoints non complétés pour l'API backend
      const incompletWaypoints = waypoints.filter(wp => !wp.completed);
      const waypointsForApi = incompletWaypoints.map(wp => ({
        lat: wp.location.lat,
        lng: wp.location.lng,
      }));

      // Appel à l'API backend optimisée
      const data = await getDirections({
        origin: {
          lat: currentLocation.coords.latitude,
          lng: currentLocation.coords.longitude,
        },
        destination: {
          lat: tripArrivalCoordinate.latitude,
          lng: tripArrivalCoordinate.longitude,
        },
        waypoints: waypointsForApi.length > 0 ? waypointsForApi : undefined,
        mode: TravelMode.DRIVING,
        optimizeWaypoints: true,
        language: 'fr',
      }).unwrap();
      if (!isMountedRef.current) return;

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Décoder le polyline
        const points = decodePolyline(route.overviewPolyline);
        setRouteCoordinates(points);

        // Calculer la distance et durée totales
        let totalDist = 0;
        let totalDur = 0;
        route.legs.forEach(leg => {
          totalDist += leg.distance; // déjà en mètres
          totalDur += leg.duration; // déjà en secondes
        });

        setTotalDistance(`${(totalDist / 1000).toFixed(1)} km`);
        setTotalDuration(`${Math.round(totalDur / 60)} min`);

        // Convertir et stocker les étapes du leg actuel
        if (route.legs.length > 0) {
          const currentLeg = route.legs[currentLegIndex] || route.legs[0];
          const convertedSteps: RouteStep[] = currentLeg.steps.map(step => ({
            distance: { text: `${Math.round(step.distance)} m`, value: step.distance },
            duration: { text: `${Math.round(step.duration / 60)} min`, value: step.duration },
            html_instructions: step.htmlInstructions,
            maneuver: '',
            start_location: { lat: step.startLocation.lat, lng: step.startLocation.lng },
            end_location: { lat: step.endLocation.lat, lng: step.endLocation.lng },
            polyline: { points: step.polyline },
            travel_mode: 'DRIVING',
          }));
          stepsRef.current = convertedSteps;
          currentStepIndexRef.current = 0;
          setSteps(convertedSteps);
          setCurrentStepIndex(0);
        }

        // Ajuster la vue de la carte pour afficher tout l'itinéraire
        if (mapRef.current && points.length > 0) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
            animated: true,
          });
        }
      }
    } catch (error: any) {
      if (!isMountedRef.current) return;
      // Vérifier si c'est une erreur "pas de route trouvée" (400)
      const isNoRouteError = error?.status === 400 || error?.data?.statusCode === 400;
      const isNetworkError = error?.status === 'FETCH_ERROR' || error?.error?.includes?.('Network');
      
      if (isNoRouteError) {
        // Fallback: utiliser une ligne droite entre les points
        console.warn('[Navigation] Pas de route trouvée, utilisation de ligne droite');
        
        // Créer une route simplifiée avec les waypoints
        const fallbackPoints: Array<{ latitude: number; longitude: number }> = [
          { latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude },
        ];
        
        // Ajouter les waypoints non complétés
        waypoints.filter(wp => !wp.completed).forEach(wp => {
          fallbackPoints.push({ latitude: wp.location.lat, longitude: wp.location.lng });
        });
        
        // Ajouter la destination finale
        fallbackPoints.push({
          latitude: tripArrivalCoordinate.latitude,
          longitude: tripArrivalCoordinate.longitude,
        });
        
        setRouteCoordinates(fallbackPoints);
        setTotalDistance('--');
        setTotalDuration('--');
        stepsRef.current = [];
        setSteps([]);
        void speakNavigationMessage(
          "Itinéraire détaillé indisponible. Suivez la ligne jusqu'à la destination.",
          { force: true }
        );
      } else if (isNetworkError) {
        // Erreur réseau - afficher un warning discret
        console.warn('[Navigation] Erreur réseau, nouvelle tentative plus tard');
      } else {
        // Autres erreurs - log seulement
        console.warn('[Navigation] Erreur itinéraire:', error?.data?.message || error?.message || 'Erreur inconnue');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingRoute(false);
      }
    }
  };

  // Mettre à jour l'étape actuelle en fonction de la position
  const updateCurrentStep = (location: Location.LocationObject) => {
    const latestSteps = stepsRef.current;
    const latestWaypoints = waypointsRef.current;
    const latestWaypointIndex = currentWaypointIndexRef.current;
    const latestStepIndex = currentStepIndexRef.current;

    if (!isMountedRef.current) return;

    const currentCoords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    // Vérifier si on est proche du prochain waypoint
    if (latestWaypoints.length > 0 && latestWaypointIndex < latestWaypoints.length) {
      const nextWaypoint = latestWaypoints[latestWaypointIndex];
      if (!nextWaypoint.completed) {
        const waypointCoords = {
          latitude: nextWaypoint.location.lat,
          longitude: nextWaypoint.location.lng,
        };
        const distanceToWaypoint = calculateDistance(currentCoords, waypointCoords);

        // Si on est a moins de 50 metres du waypoint, notifier le conducteur.
        if (distanceToWaypoint < DRIVER_PICKUP_ARRIVAL_DISTANCE_KM) {
          if (!announcedWaypointIdsRef.current.has(nextWaypoint.id)) {
            announcedWaypointIdsRef.current.add(nextWaypoint.id);
            void speakNavigationMessage(buildWaypointSpeech(nextWaypoint), { force: true });
          }

          if (nextWaypoint.type === 'pickup') {
            presentPickupNotice(
              {
                type: 'driver_arrived_pickup',
                bookingId: nextWaypoint.booking.id,
                tripId,
                passengerId: nextWaypoint.passenger.id,
                distanceMeters: Math.round(distanceToWaypoint * 1000),
                detectedAt: new Date().toISOString(),
              },
              nextWaypoint,
            );
          } else {
            presentWaypointModal(nextWaypoint);
          }
        }
      }
    }

    if (latestSteps.length === 0) return;

    // Trouver l'étape la plus proche
    for (let i = latestStepIndex; i < latestSteps.length; i++) {
      const stepEnd = {
        latitude: latestSteps[i].end_location.lat,
        longitude: latestSteps[i].end_location.lng,
      };

      const distance = calculateDistance(currentCoords, stepEnd);

      // Si on est à moins de 30 mètres de la fin de l'étape, passer à la suivante
      if (distance < 0.03 && i < latestSteps.length - 1) {
        currentStepIndexRef.current = i + 1;
        setCurrentStepIndex(i + 1);
        break;
      }
    }
  };

  const normalizeHeading = (value: number) => {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };

  // Calculer la distance entre deux points (en km)
  const calculateDistance = useCallback((
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((point1.latitude * Math.PI) / 180) *
        Math.cos((point2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  useEffect(() => {
    if (!isTripOngoing || !tripId) {
      return;
    }

    const latestDriverLocation = currentLocationRef.current ?? currentLocation;
    if (!latestDriverLocation) {
      return;
    }

    const driverCoordinate = {
      latitude: latestDriverLocation.coords.latitude,
      longitude: latestDriverLocation.coords.longitude,
    };
    const detectedAt = new Date().toISOString();

    waypoints.forEach((waypoint) => {
      const booking = waypoint.booking;
      const isPassengerAlreadyPickedUp =
        waypoint.completed || booking.pickedUp || booking.pickedUpConfirmedByPassenger;

      if (
        waypoint.type !== 'pickup' ||
        isPassengerAlreadyPickedUp ||
        booking.droppedOff ||
        booking.droppedOffConfirmedByPassenger
      ) {
        return;
      }

      const pickupCoordinate = {
        latitude: waypoint.location.lat,
        longitude: waypoint.location.lng,
      };
      const driverPickupDistanceKm = calculateDistance(driverCoordinate, pickupCoordinate);

      if (driverPickupDistanceKm <= DRIVER_PICKUP_ARRIVAL_DISTANCE_KM) {
        presentPickupNotice(
          {
            type: 'driver_arrived_pickup',
            bookingId: booking.id,
            tripId,
            passengerId: waypoint.passenger.id,
            distanceMeters: Math.round(driverPickupDistanceKm * 1000),
            detectedAt,
          },
          waypoint,
        );
      }

      const passengerLocation = livePassengerLocations[booking.id]?.coordinate;
      if (!passengerLocation) {
        return;
      }

      const driverPassengerDistanceKm = calculateDistance(driverCoordinate, passengerLocation);
      const passengerPickupDistanceKm = calculateDistance(passengerLocation, pickupCoordinate);

      if (
        Math.min(driverPassengerDistanceKm, passengerPickupDistanceKm) <= PASSENGER_READY_DISTANCE_KM
      ) {
        presentPickupNotice(
          {
            type: 'parties_nearby',
            bookingId: booking.id,
            tripId,
            passengerId: waypoint.passenger.id,
            distanceMeters: Math.round(
              Math.min(driverPassengerDistanceKm, passengerPickupDistanceKm) * 1000,
            ),
            detectedAt,
          },
          waypoint,
        );
      }

      if (
        driverPassengerDistanceKm <= MOVING_TOGETHER_DISTANCE_KM &&
        driverPickupDistanceKm > MOVING_TOGETHER_PICKUP_EXIT_DISTANCE_KM &&
        passengerPickupDistanceKm > MOVING_TOGETHER_PICKUP_EXIT_DISTANCE_KM
      ) {
        presentPassengerBoardedNotice(
          {
            type: 'pickup_confirmed',
            bookingId: booking.id,
            tripId,
            passengerId: waypoint.passenger.id,
            distanceMeters: Math.round(driverPassengerDistanceKm * 1000),
            detectedAt,
          },
          waypoint,
        );
      }
    });
  }, [
    calculateDistance,
    currentLocation,
    isTripOngoing,
    livePassengerLocations,
    presentPassengerBoardedNotice,
    presentPickupNotice,
    tripId,
    waypoints,
  ]);

  // Forcer le recalcul de l'itinéraire
  const forceRecalculateRoute = () => {
    lastRouteFetchTimeRef.current = 0; // Reset le timestamp
    routeFetchedRef.current = false; // Permettre un nouveau fetch
    if (currentLocation && trip) {
      fetchRoute();
    }
  };

  const fitVehicleAndPassengers = useCallback(() => {
    if (!mapRef.current) return;

    const coordinates = passengerMapLocations.map((passenger) => passenger.coordinate);
    const driverLocation = currentLocationRef.current ?? currentLocation;
    if (driverLocation) {
      coordinates.unshift({
        latitude: driverLocation.coords.latitude,
        longitude: driverLocation.coords.longitude,
      });
    }

    if (coordinates.length === 1) {
      mapRef.current.animateToRegion(
        {
          ...coordinates[0],
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        320,
      );
      return;
    }

    if (coordinates.length > 1) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 190, right: 56, bottom: 190, left: 56 },
        animated: true,
      });
    }
  }, [currentLocation, passengerMapLocations]);

  // Calculs pour les stats passagers (mémorisés)
  const passengerStats = React.useMemo(() => {
    const pickups = waypoints.filter(wp => wp.type === 'pickup');
    const dropoffs = waypoints.filter(wp => wp.type === 'dropoff');
    const pendingPickups = pickups.filter(wp => !wp.completed);
    const pendingDropoffs = dropoffs.filter(wp => !wp.completed);
    const completedPickups = pickups.filter(wp => wp.completed);
    const completedDropoffs = dropoffs.filter(wp => wp.completed);
    
    // Passagers uniques
    const uniquePassengers = new Map<string, { name: string; pickedUp: boolean; droppedOff: boolean }>();
    waypoints.forEach(wp => {
      const existing = uniquePassengers.get(wp.passenger.id);
      if (!existing) {
        uniquePassengers.set(wp.passenger.id, {
          name: wp.passenger.name,
          pickedUp: wp.type === 'pickup' ? wp.completed : false,
          droppedOff: wp.type === 'dropoff' ? wp.completed : false,
        });
      } else {
        if (wp.type === 'pickup') existing.pickedUp = wp.completed;
        if (wp.type === 'dropoff') existing.droppedOff = wp.completed;
      }
    });
    
    return {
      totalPassengers: uniquePassengers.size,
      pendingPickups: pendingPickups.length,
      pendingDropoffs: pendingDropoffs.length,
      completedPickups: completedPickups.length,
      completedDropoffs: completedDropoffs.length,
      inVehicle: completedPickups.length - completedDropoffs.length,
      passengers: Array.from(uniquePassengers.entries()).map(([id, data]) => ({ id, ...data })),
    };
  }, [waypoints]);

  // Fermer le modal de waypoint sans confirmer
  const handleDismissWaypointModal = () => {
    waypointModalVisibleRef.current = false;
    setWaypointModalVisible(false);
    setActiveWaypoint(null);
  };


  const openReportForWaypoint = (waypoint: Waypoint) => {
    if (!tripId) return;

    router.push({
      pathname: '/report',
      params: {
        tripId,
        bookingId: waypoint.booking.id,
        reportedUserId: waypoint.passenger.id,
        reportedUserName: waypoint.passenger.name || 'Passager',
      },
    });
  };

  const handleReportPassenger = () => {
    if (!activeWaypoint) return;
    openReportForWaypoint(activeWaypoint);
  };

  const dismissPickupNotice = useCallback(() => {
    pickupNoticeRef.current = null;
    setPickupNotice(null);
    setPickupNoticeCountdown(null);
  }, []);

  const dismissTripEndNotice = useCallback(() => {
    tripEndNoticeRef.current = null;
    setTripEndNotice(null);
  }, []);

  const handleRatePassengersFromTripEnd = useCallback(() => {
    if (!tripId) {
      return;
    }

    dismissTripEndNotice();
    router.replace(`/rate/${tripId}`);
  }, [dismissTripEndNotice, router, tripId]);

  const handleSkipPickupAfterWait = useCallback(() => {
    const passengerName = pickupNotice?.waypoint.passenger.name || 'le passager';
    dismissPickupNotice();
    showDialog({
      variant: 'warning',
      title: 'Vous pouvez poursuivre',
      message: `${passengerName} ne s'est pas signalé dans le délai. Vous pouvez passer au point suivant et signaler le passager si nécessaire.`,
    });
  }, [dismissPickupNotice, pickupNotice?.waypoint.passenger.name, showDialog]);

  // Quitter la navigation
  const handleExitNavigation = useCallback(() => {
    showDialog({
      title: 'Quitter la navigation',
      message: 'Voulez-vous vraiment quitter la navigation GPS ?',
      variant: 'warning',
      icon: 'exit-outline',
      actions: [
        {
          label: 'Quitter',
          variant: 'primary',
          onPress: navigateBackSafely,
        },
        { label: 'Annuler', variant: 'secondary' },
      ],
    });
  }, [navigateBackSafely, showDialog]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (securityModalVisible) {
        setSecurityModalVisible(false);
        return true;
      }
      handleExitNavigation();
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [handleExitNavigation, securityModalVisible]);

  // Décoder un polyline Google (avec simplification pour économiser la mémoire)
  const decodePolyline = (encoded: string): Array<{ latitude: number; longitude: number }> => {
    const allPoints: Array<{ latitude: number; longitude: number }> = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      allPoints.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    // Simplifier le polyline pour économiser la mémoire (max 200 points)
    const maxPoints = 200;
    if (allPoints.length <= maxPoints) {
      return allPoints;
    }
    
    const step = Math.ceil(allPoints.length / maxPoints);
    const simplified: Array<{ latitude: number; longitude: number }> = [];
    for (let i = 0; i < allPoints.length; i += step) {
      simplified.push(allPoints[i]);
    }
    // Toujours inclure le dernier point
    if (simplified[simplified.length - 1] !== allPoints[allPoints.length - 1]) {
      simplified.push(allPoints[allPoints.length - 1]);
    }
    
    return simplified;
  };

  // Obtenir l'icône de manœuvre
  const getManeuverIcon = (maneuver?: string): string => {
    if (!maneuver) return 'arrow-up';
    
    const maneuverMap: Record<string, string> = {
      'turn-left': 'arrow-back',
      'turn-right': 'arrow-forward',
      'turn-slight-left': 'arrow-back',
      'turn-slight-right': 'arrow-forward',
      'turn-sharp-left': 'arrow-back',
      'turn-sharp-right': 'arrow-forward',
      'uturn-left': 'return-up-back',
      'uturn-right': 'return-up-forward',
      'straight': 'arrow-up',
      'ramp-left': 'arrow-back',
      'ramp-right': 'arrow-forward',
      'merge': 'git-merge',
      'fork-left': 'git-branch',
      'fork-right': 'git-branch',
      'roundabout-left': 'refresh',
      'roundabout-right': 'refresh',
    };

    return maneuverMap[maneuver] || 'arrow-up';
  };

  // Vérifier que le trip est chargé et a des coordonnées valides
  const hasValidTripCoordinates = Boolean(
    tripDepartureCoordinate &&
      tripArrivalCoordinate &&
      !areTripMapCoordinatesSame(tripDepartureCoordinate, tripArrivalCoordinate),
  );

  const currentNavigationWaypoint =
    currentWaypointIndex < waypoints.length && !waypoints[currentWaypointIndex]?.completed
      ? waypoints[currentWaypointIndex]
      : null;

  const routeSectionCoordinates = useMemo(() => {
    if (routeCoordinates.length < 2 || !currentNavigationWaypoint) {
      return {
        nextCoordinates: routeCoordinates,
        remainingCoordinates: [] as Array<{ latitude: number; longitude: number }>,
      };
    }

    const waypointCoordinate = {
      latitude: currentNavigationWaypoint.location.lat,
      longitude: currentNavigationWaypoint.location.lng,
    };

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    routeCoordinates.forEach((coordinate, index) => {
      const distance = calculateDistance(coordinate, waypointCoordinate);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    const splitIndex = Math.max(1, Math.min(closestIndex, routeCoordinates.length - 1));

    return {
      nextCoordinates: routeCoordinates.slice(0, splitIndex + 1),
      remainingCoordinates: routeCoordinates.slice(splitIndex),
    };
  }, [
    currentNavigationWaypoint?.id,
    currentNavigationWaypoint?.location.lat,
    currentNavigationWaypoint?.location.lng,
    routeCoordinates,
  ]);

  const canToggleRouteSections =
    routeSectionCoordinates.nextCoordinates.length > 1 &&
    routeSectionCoordinates.remainingCoordinates.length > 1;

  useEffect(() => {
    if (!canToggleRouteSections && routeSectionFocus === 'remaining') {
      setRouteSectionFocus('next');
    }
  }, [canToggleRouteSections, routeSectionFocus]);

  if (isLoading || bookingsLoading || !trip) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement de la navigation...</Text>
      </View>
    );
  }

  if (!hasValidTripCoordinates) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={Colors.warning} />
        <Text style={styles.loadingText}>Coordonnées du trajet invalides</Text>
        <TouchableOpacity
          style={styles.backButtonAlt}
          onPress={navigateBackSafely}
        >
          <Text style={styles.backButtonAltText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStep = steps[currentStepIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Carte (ultra-optimisée pour éviter les crashs) */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsPointsOfInterest={false}
        loadingEnabled={false}
        mapType="standard"
        minZoomLevel={12}
        maxZoomLevel={18}
        pitchEnabled={isTripOngoing}
        rotateEnabled={isTripOngoing}
        scrollEnabled={isTripOngoing}
        zoomEnabled={isTripOngoing}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        initialRegion={{
          latitude: currentLocation?.coords?.latitude ?? tripDepartureCoordinate?.latitude ?? -4.4419,
          longitude: currentLocation?.coords?.longitude ?? tripDepartureCoordinate?.longitude ?? 15.2663,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {/* Itinéraire (simplifié) */}
        {routeSectionCoordinates.nextCoordinates.length > 1 && (
          <Polyline
            coordinates={routeSectionCoordinates.nextCoordinates}
            strokeWidth={routeSectionFocus === 'next' ? 6 : 3}
            strokeColor={routeSectionFocus === 'next' ? Colors.primaryDark : 'rgba(255, 107, 53, 0.26)'}
            lineCap="round"
            lineJoin="round"
            tappable
            onPress={() => setRouteSectionFocus('next')}
            zIndex={routeSectionFocus === 'next' ? 12 : 2}
          />
        )}

        {routeSectionCoordinates.remainingCoordinates.length > 1 && (
          <Polyline
            coordinates={routeSectionCoordinates.remainingCoordinates}
            strokeWidth={routeSectionFocus === 'remaining' ? 6 : 3}
            strokeColor={routeSectionFocus === 'remaining' ? Colors.infoDark : 'rgba(52, 152, 219, 0.24)'}
            lineDashPattern={routeSectionFocus === 'remaining' ? undefined : [8, 6]}
            lineCap="round"
            lineJoin="round"
            tappable
            onPress={() => setRouteSectionFocus('remaining')}
            zIndex={routeSectionFocus === 'remaining' ? 13 : 3}
          />
        )}

        {/* Position actuelle du conducteur - Marqueur voiture */}
        {currentLocation?.coords?.latitude && currentLocation?.coords?.longitude && (
          <Marker.Animated
            ref={driverMarkerRef}
            coordinate={driverPosition as unknown as { latitude: number; longitude: number }}
            anchor={VEHICLE_TRACKING_MARKER_ANCHOR}
            title="Ma position"
            image={
              USE_ANDROID_NAVIGATION_MARKER_IMAGES
                ? getVehicleTrackingMarkerImage(trip.vehicleType)
                : undefined
            }
            flat
            rotation={heading}
            tracksViewChanges={false}
          >
            {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
              <VehicleTrackingMarker vehicleType={trip.vehicleType} />
            )}
          </Marker.Animated>
        )}

        {passengerMapLocations.map((passenger) => {
          const passengerMarkerKey = `live-passenger-${passenger.bookingId}:${passenger.status}`;
          const passengerDescription =
            passenger.status === 'arrived'
              ? 'Passager arrivé'
              : passenger.status === 'pickup'
                ? 'Point de prise en charge'
                : passenger.isLive
                  ? 'Position en direct'
                  : 'Position du passager';

          return (
            <Marker
              ref={(marker) => {
                if (marker) {
                  passengerMarkerRefs.current[passenger.bookingId] = marker;
                } else {
                  delete passengerMarkerRefs.current[passenger.bookingId];
                }
              }}
              key={passengerMarkerKey}
              coordinate={passenger.coordinate}
              anchor={PASSENGER_TRACKING_MARKER_ANCHOR}
              title={passenger.passengerName}
              description={passengerDescription}
              onPress={() => router.push(`/passenger/${passenger.passengerId}`)}
              tracksViewChanges={USE_ANDROID_NAVIGATION_MARKER_IMAGES && !loadedPassengerMarkerKeys.has(passengerMarkerKey)}
              zIndex={20}
            >
              <PassengerTrackingMarker
                status={passenger.status}
                onReady={() => {
                  if (!USE_ANDROID_NAVIGATION_MARKER_IMAGES) return;

                  [80, 220].forEach((delay) => {
                    setTimeout(() => {
                      passengerMarkerRefs.current[passenger.bookingId]?.redraw();
                    }, delay);
                  });
                  setTimeout(() => {
                    if (!isMountedRef.current) return;

                    setLoadedPassengerMarkerKeys((current) => {
                      if (current.has(passengerMarkerKey)) return current;

                      const next = new Set(current);
                      next.add(passengerMarkerKey);
                      return next;
                    });
                  }, 320);
                }}
              />
            </Marker>
          );
        })}
        {/* Prochain waypoint uniquement (1 seul pour éviter les crashs) */}
        {waypoints.length > 0 && currentWaypointIndex < waypoints.length && 
         !waypoints[currentWaypointIndex].completed &&
         waypoints[currentWaypointIndex].location?.lat && 
         waypoints[currentWaypointIndex].location?.lng && (
          <Marker
            coordinate={{
              latitude: waypoints[currentWaypointIndex].location.lat,
              longitude: waypoints[currentWaypointIndex].location.lng,
            }}
            anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 0.5 }}
            pinColor={
              USE_ANDROID_NAVIGATION_MARKER_IMAGES
                ? undefined
                : waypoints[currentWaypointIndex].type === 'pickup'
                  ? Colors.secondary
                  : Colors.success
            }
            title={`${waypoints[currentWaypointIndex].type === 'pickup' ? 'Lieu de prise en charge' : 'Point d arrivee'} ${waypoints[currentWaypointIndex].passenger.name}`}
            tracksViewChanges={false}
          >
            {USE_ANDROID_NAVIGATION_MARKER_IMAGES ? (
              <Image
                source={
                  androidNavigationMarkerImages[
                    waypoints[currentWaypointIndex].type === 'pickup' ? 'pickup' : 'dropoff'
                  ]
                }
                style={styles.androidWaypointMarkerImage}
                resizeMode="contain"
              />
            ) : (
              <View
                collapsable={false}
                style={[
                  styles.waypointMarkerContainer,
                  waypoints[currentWaypointIndex].type === 'pickup'
                    ? styles.pickupMarker
                    : styles.dropoffMarker,
                ]}
              >
                <Ionicons
                  name={waypoints[currentWaypointIndex].type === 'pickup' ? 'person-add' : 'flag'}
                  size={20}
                  color={Colors.white}
                />
              </View>
            )}
          </Marker>
        )}

        {/* Destination finale - Marqueur arrivée */}
        {tripArrivalCoordinate && (
          <Marker
            coordinate={{
              latitude: tripArrivalCoordinate.latitude,
              longitude: tripArrivalCoordinate.longitude,
            }}
            anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 1 }}
            title={trip.arrival.name || 'Arrivée'}
            tracksViewChanges={!USE_ANDROID_NAVIGATION_MARKER_IMAGES && destinationTracksViewChanges}
          >
            {USE_ANDROID_NAVIGATION_MARKER_IMAGES ? (
              <Image
                source={androidNavigationMarkerImages.destination}
                style={styles.androidWaypointMarkerImage}
                resizeMode="contain"
              />
            ) : (
              <View
                collapsable={false}
                style={styles.destinationMarkerContainer}
                onLayout={() => {
                  if (isMountedRef.current && destinationTracksViewChanges) {
                    setDestinationTracksViewChanges(false);
                  }
                }}
              >
                <View style={styles.destinationMarkerBody}>
                  <Ionicons name="flag" size={22} color={Colors.white} />
                </View>
                <View style={styles.destinationMarkerTip} />
              </View>
            )}
          </Marker>
        )}
      </MapView>

      {isTripOngoing && canToggleRouteSections && (
        <View style={styles.routeSectionToggle}>
          <TouchableOpacity
            style={[
              styles.routeSectionToggleButton,
              routeSectionFocus === 'next' && styles.routeSectionToggleNextActive,
            ]}
            onPress={() => setRouteSectionFocus('next')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="navigate-outline"
              size={15}
              color={routeSectionFocus === 'next' ? Colors.white : Colors.primaryDark}
            />
            <Text
              style={[
                styles.routeSectionToggleText,
                routeSectionFocus === 'next' && styles.routeSectionToggleTextActive,
              ]}
            >
              Prochain
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.routeSectionToggleButton,
              routeSectionFocus === 'remaining' && styles.routeSectionToggleRemainingActive,
            ]}
            onPress={() => setRouteSectionFocus('remaining')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="map-outline"
              size={15}
              color={routeSectionFocus === 'remaining' ? Colors.white : Colors.infoDark}
            />
            <Text
              style={[
                styles.routeSectionToggleText,
                routeSectionFocus === 'remaining' && styles.routeSectionToggleTextActive,
              ]}
            >
              Reste
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isTripOngoing && (
        <View style={styles.preStartOverlay}>
          <View style={styles.preStartCard}>
            <View style={styles.preStartIconWrap}>
              <Ionicons
                name={trip?.status === 'completed' ? 'flag' : trip?.status === 'cancelled' ? 'close-circle' : 'time-outline'}
                size={26}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.preStartTitle}>
              {trip?.status === 'upcoming'
                ? 'Trajet pas encore demarre'
                : trip?.status === 'completed'
                  ? 'Trajet termine'
                  : trip?.status === 'cancelled'
                    ? 'Trajet annule'
                    : 'Navigation en pause'}
            </Text>
            <Text style={styles.preStartText}>
              {trip?.status === 'upcoming'
                ? 'Le trajet doit etre demarre avant d activer la navigation en direct.'
                : 'La navigation en direct est disponible uniquement pour un trajet en cours.'}
            </Text>
            <View style={styles.preStartActions}>
              <TouchableOpacity
                style={[styles.preStartButton, styles.preStartButtonPrimary]}
                onPress={() => refetchTrip()}
                disabled={isTripFetching}
              >
                {isTripFetching ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.preStartButtonPrimaryText}>Rafraichir</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.preStartButton, styles.preStartButtonSecondary]}
                onPress={handleExitNavigation}
              >
                <Text style={styles.preStartButtonSecondaryText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Header avec infos */}
      <View style={styles.header} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleExitNavigation}
          hitSlop={12}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Quitter la navigation"
        >
          <Ionicons name="close" size={28} color={Colors.white} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.etaRow}>
            <Text style={styles.etaText}>{totalDuration}</Text>
            {/* Indicateur temps réel */}
            <View style={[styles.liveIndicator, isSocketConnected && styles.liveIndicatorActive]}>
              <View style={[styles.liveDot, isSocketConnected && styles.liveDotActive]} />
              <Text style={[styles.liveText, isSocketConnected && styles.liveTextActive]}>
                {isSocketConnected ? 'LIVE' : '...'}
              </Text>
            </View>
          </View>
          <Text style={styles.distanceText}>{totalDistance}</Text>
        </View>
      </View>

      {/* Barre compacte des passagers */}
      {isTripOngoing && waypoints.length > 0 && (
        <View style={styles.passengersBar}>
          {/* Stats des passagers */}
          <TouchableOpacity 
            style={styles.passengersStatsButton}
            onPress={() => setPassengersPanelVisible(true)}
          >
            <View style={styles.passengersBadge}>
              <Ionicons name="people" size={16} color={Colors.white} />
              <Text style={styles.passengersBadgeText}>{passengerStats.totalPassengers}</Text>
            </View>
            <View style={styles.passengersStatsInfo}>
              {passengerStats.inVehicle > 0 && (
                <View style={styles.inVehicleBadge}>
                  <Ionicons name="car" size={12} color={Colors.white} />
                  <Text style={styles.inVehicleText}>{passengerStats.inVehicle} à bord</Text>
                </View>
              )}
              {passengerStats.pendingPickups > 0 && (
                <Text style={styles.pendingText}>
                  {passengerStats.pendingPickups} a prendre en charge
                </Text>
              )}
            </View>
            <Ionicons name="chevron-up" size={20} color={Colors.gray[500]} />
          </TouchableOpacity>

          {/* Prochain waypoint compact */}
          {currentWaypointIndex < waypoints.length && !waypoints[currentWaypointIndex].completed && (
            <TouchableOpacity 
              style={[
                styles.nextWaypointCompact,
                { borderLeftColor: waypoints[currentWaypointIndex].type === 'pickup' ? Colors.secondary : Colors.success }
              ]}
              activeOpacity={0.8}
              onPress={() => {
                waypointModalVisibleRef.current = true;
                setActiveWaypoint(waypoints[currentWaypointIndex]);
                setWaypointModalVisible(true);
              }}
            >
              <View style={styles.nextWaypointInfo}>
                <Text style={styles.nextWaypointType}>
                  {waypoints[currentWaypointIndex].type === 'pickup' ? 'Lieu de prise en charge' : 'Point d arrivee'}
                </Text>
                <Text style={styles.nextWaypointName} numberOfLines={1}>
                  {waypoints[currentWaypointIndex].passenger.name}
                </Text>
              </View>
              <View
                style={[
                  styles.gpsStatusPill,
                  {
                    backgroundColor:
                      waypoints[currentWaypointIndex].type === 'pickup'
                        ? Colors.secondary + '15'
                        : Colors.success + '15',
                    borderColor:
                      waypoints[currentWaypointIndex].type === 'pickup'
                        ? Colors.secondary
                        : Colors.success,
                  }
                ]}
              >
                <Ionicons
                  name="locate"
                  size={14}
                  color={
                    waypoints[currentWaypointIndex].type === 'pickup'
                      ? Colors.secondary
                      : Colors.success
                  }
                />
                <Text
                  style={[
                    styles.gpsStatusPillText,
                    {
                      color:
                        waypoints[currentWaypointIndex].type === 'pickup'
                          ? Colors.secondary
                          : Colors.success,
                    },
                  ]}
                >
                  Suivi actif
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Instructions de navigation */}
      {isTripOngoing && !isLoadingRoute && currentStep && (
        <View style={styles.instructionCard}>
          <View style={styles.instructionHeader}>
            <View style={styles.maneuverIcon}>
              <Ionicons 
                name={getManeuverIcon(currentStep.maneuver) as any} 
                size={36} 
                color={Colors.white} 
              />
            </View>
            <View style={styles.instructionInfo}>
              <Text style={styles.instructionText}>
                {cleanHtmlInstructions(currentStep.html_instructions)}
              </Text>
              <Text style={styles.instructionDistance}>{currentStep.distance.text}</Text>
            </View>
          </View>

          {/* Prochaine instruction */}
          {currentStepIndex < steps.length - 1 && (
            <View style={styles.nextInstruction}>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
              <Text style={styles.nextInstructionText}>
                Ensuite : {cleanHtmlInstructions(steps[currentStepIndex + 1].html_instructions)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Loading route indicator */}
      {isTripOngoing && isLoadingRoute && (
        <View style={styles.loadingRouteCard}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingRouteText}>Calcul de l itineraire...</Text>
        </View>
      )}

      {/* Boutons d'action flottants */}
      {isTripOngoing && (
      <View style={styles.floatingButtons}>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => setSecurityModalVisible(true)}
        >
          <Ionicons name="shield-checkmark" size={22} color={Colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.floatingButton, !isVoiceGuidanceEnabled && styles.voiceButtonMuted]}
          onPress={toggleVoiceGuidance}
          accessibilityRole="button"
          accessibilityLabel={isVoiceGuidanceEnabled ? 'Désactiver le guidage vocal' : 'Activer le guidage vocal'}
        >
          <Ionicons
            name={isVoiceGuidanceEnabled ? 'volume-high' : 'volume-mute'}
            size={22}
            color={isVoiceGuidanceEnabled ? Colors.primary : Colors.gray[500]}
          />
        </TouchableOpacity>

        {/* Bouton recalculer l'itinéraire */}
        {passengerMapLocations.length > 0 && (
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={fitVehicleAndPassengers}
            accessibilityRole="button"
            accessibilityLabel="Voir le vehicule et les passagers"
          >
            <Ionicons name="people" size={22} color={Colors.primary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.floatingButton, isLoadingRoute && styles.floatingButtonDisabled]}
          onPress={forceRecalculateRoute}
          disabled={isLoadingRoute}
        >
          <Ionicons name="refresh" size={22} color={isLoadingRoute ? Colors.gray[400] : Colors.primary} />
        </TouchableOpacity>

        {/* Bouton recentrer */}
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => {
            const loc = currentLocationRef.current || currentLocation;
            if (mapRef.current && loc) {
              mapRef.current.animateToRegion({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }, 300);
            }
          }}
        >
          <Ionicons name="locate" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      )}

      {/* Disclosure localisation arriere-plan */}
      <Modal
        visible={backgroundDisclosureVisible}
        transparent
        animationType="fade"
        onRequestClose={() => resolveBackgroundDisclosure(false)}
      >
        <View style={styles.backgroundDisclosureOverlay}>
          <View style={styles.backgroundDisclosureCard}>
            <View style={styles.backgroundDisclosureIcon}>
              <Ionicons name="location" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.backgroundDisclosureTitle}>
              Autorisation de localisation en arriere-plan
            </Text>
            <Text style={styles.backgroundDisclosureText}>
              Zwanga collecte votre position meme quand l application est en arriere-plan pendant un trajet actif.
            </Text>
            <View style={styles.backgroundDisclosureList}>
              <Text style={styles.backgroundDisclosureItem}>
                - Suivre votre trajet en continu pour la navigation GPS.
              </Text>
              <Text style={styles.backgroundDisclosureItem}>
                - Envoyer votre position au serveur et aux passagers du trajet en cours.
              </Text>
              <Text style={styles.backgroundDisclosureItem}>
                - Arreter automatiquement le suivi a la fin du trajet.
              </Text>
            </View>
            <Text style={styles.backgroundDisclosureFootnote}>
              Vous pouvez continuer sans cette autorisation. Dans ce cas, le suivi fonctionne uniquement quand l application est ouverte.
            </Text>
            <View style={styles.backgroundDisclosureActions}>
              <TouchableOpacity
                style={styles.backgroundDisclosureSecondaryButton}
                onPress={() => resolveBackgroundDisclosure(false)}
              >
                <Text style={styles.backgroundDisclosureSecondaryButtonText}>Pas maintenant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backgroundDisclosurePrimaryButton}
                onPress={() => resolveBackgroundDisclosure(true)}
              >
                <Text style={styles.backgroundDisclosurePrimaryButtonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={securityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSecurityModalVisible(false)}
      >
        <View style={styles.securityModalOverlay}>
          <TouchableOpacity
            style={styles.securityModalBackdrop}
            activeOpacity={1}
            onPress={() => setSecurityModalVisible(false)}
          />
          <View
            style={[
              styles.securityModalContent,
              { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.md },
            ]}
          >
            <View style={styles.securityModalHeader}>
              <Text style={styles.securityModalTitle}>Securite du trajet</Text>
              <TouchableOpacity
                style={styles.securityModalCloseButton}
                onPress={() => setSecurityModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>

            {trip ? (
              <ScrollView
                style={styles.securityModalBody}
                contentContainerStyle={styles.securityModalBodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <TripSecurityPanel
                  tripId={trip.id}
                  role="driver"
                  tripStatus={trip.status}
                  openSelectorByDefault={securityModalVisible}
                  compact
                />
              </ScrollView>
            ) : (
              <View style={styles.securityModalLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.securityModalLoadingText}>Chargement securite...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(tripEndNotice)}
        transparent
        animationType="slide"
        onRequestClose={dismissTripEndNotice}
      >
        <View style={styles.waypointModalOverlay}>
          <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
            <View style={styles.waypointModalHandle} />
            <View style={[styles.waypointModalIcon, { backgroundColor: Colors.success }]}>
              <Ionicons name="flag" size={32} color={Colors.white} />
            </View>
            <Text style={styles.waypointModalTitle}>Trajet termine</Text>
            <Text style={styles.waypointModalPassenger}>
              {trip?.arrival?.name ?? 'Destination finale'}
            </Text>
            <View style={styles.waypointModalAddressContainer}>
              <Ionicons name="location" size={18} color={Colors.gray[500]} />
              <Text style={styles.waypointModalAddress}>
                {trip?.arrival?.address ?? trip?.arrival?.name ?? 'Arrivee du trajet'}
              </Text>
            </View>
            <Text style={styles.waypointModalWaitingText}>
              Vous avez atteint la destination finale. Le trajet est termine automatiquement. Vous pouvez noter les passagers.
            </Text>
            <View
              style={[
                styles.waypointGpsStatus,
                {
                  backgroundColor: Colors.success + '15',
                  borderColor: Colors.success,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={[styles.waypointGpsStatusText, { color: Colors.success }]}>
                {tripEndNotice?.distanceMeters !== undefined
                  ? `Arrivee detectee a ${Math.max(1, Math.round(tripEndNotice.distanceMeters))} m`
                  : 'Arrivee detectee'}
              </Text>
            </View>
            <View style={styles.waypointModalActions}>
              <TouchableOpacity
                style={styles.waypointModalSecondaryButton}
                onPress={dismissTripEndNotice}
              >
                <Text style={styles.waypointModalSecondaryButtonText}>Plus tard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.waypointModalPrimaryButton}
                onPress={() => void handleRatePassengersFromTripEnd()}
              >
                <Ionicons name="star" size={20} color={Colors.white} />
                <Text style={styles.waypointModalPrimaryButtonText}>Noter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(pickupNotice)}
        transparent
        animationType="slide"
        onRequestClose={dismissPickupNotice}
      >
        <View style={styles.waypointModalOverlay}>
          <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
            <View style={styles.waypointModalHandle} />
            <View
              style={[
                styles.waypointModalIcon,
                {
                  backgroundColor:
                    pickupNotice?.type === 'passenger_ready_pickup'
                      ? Colors.success
                      : pickupNotice?.type === 'parties_nearby'
                        ? Colors.primary
                        : Colors.secondary,
                },
              ]}
            >
              <Ionicons
                name={
                  pickupNotice?.type === 'passenger_ready_pickup'
                    ? 'hand-left'
                    : pickupNotice?.type === 'parties_nearby'
                      ? 'people'
                      : 'time'
                }
                size={32}
                color={Colors.white}
              />
            </View>
            <Text style={styles.waypointModalTitle}>
              {pickupNotice?.type === 'passenger_ready_pickup'
                ? "Le passager s'est signalé"
                : pickupNotice?.type === 'parties_nearby'
                  ? 'Passager prêt à embarquer'
                  : 'Arrivé au point de récupération'}
            </Text>
            <Text style={styles.waypointModalPassenger}>
              {pickupNotice?.waypoint.passenger.name || 'Passager'}
            </Text>
            <View style={styles.waypointModalAddressContainer}>
              <Ionicons name="location" size={18} color={Colors.gray[500]} />
              <Text style={styles.waypointModalAddress}>
                {pickupNotice?.waypoint.address}
              </Text>
            </View>
            <Text style={styles.waypointModalWaitingText}>
              {pickupNotice?.type === 'passenger_ready_pickup'
                ? "Le passager indique qu'il est présent au point de récupération."
                : pickupNotice?.type === 'parties_nearby'
                  ? `${pickupNotice?.waypoint.passenger.name || 'Le passager'} est là et prêt à être embarqué.`
                  : `Vous êtes arrivé au point de récupération de ${pickupNotice?.waypoint.passenger.name || 'ce passager'}. Le passager est notifié.`}
            </Text>
            {pickupNotice?.type === 'driver_arrived_pickup' && pickupNoticeCountdown !== null && (
              <View style={styles.waypointGpsStatus}>
                <Ionicons name="timer" size={18} color={Colors.secondary} />
                <Text style={[styles.waypointGpsStatusText, { color: Colors.secondary }]}>
                  {pickupNoticeCountdown > 0
                    ? `Temps restant ${Math.floor(pickupNoticeCountdown / 60)
                        .toString()
                        .padStart(2, '0')}:${(pickupNoticeCountdown % 60)
                        .toString()
                        .padStart(2, '0')}`
                    : 'Les 10 minutes sont écoulées'}
                </Text>
              </View>
            )}
            <View style={styles.waypointModalActions}>
              <TouchableOpacity
                style={styles.waypointModalSecondaryButton}
                onPress={dismissPickupNotice}
              >
                <Text style={styles.waypointModalSecondaryButtonText}>Compris</Text>
              </TouchableOpacity>
              {pickupNotice?.type === 'driver_arrived_pickup' && (
                <TouchableOpacity
                  style={[
                    styles.waypointModalPrimaryButton,
                    pickupNoticeCountdown !== 0 && { opacity: 0.45 },
                  ]}
                  onPress={handleSkipPickupAfterWait}
                  disabled={pickupNoticeCountdown !== 0}
                >
                  <Ionicons name="arrow-forward-circle" size={20} color={Colors.white} />
                  <Text style={styles.waypointModalPrimaryButtonText}>Passer</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de waypoint stylise */}
      <Modal
        visible={waypointModalVisible && Boolean(activeWaypoint)}
        transparent
        animationType="slide"
        onRequestClose={handleDismissWaypointModal}
      >
        <View style={styles.waypointModalOverlay}>
          <View style={[styles.waypointModalContent, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.lg }]}>
            {/* Indicateur de slide */}
            <View style={styles.waypointModalHandle} />
            
            {/* Icône du type de waypoint */}
            <View style={[
              styles.waypointModalIcon,
              { backgroundColor: activeWaypoint?.type === 'pickup' ? Colors.secondary : Colors.info }
            ]}>
              <Ionicons 
                name={activeWaypoint?.type === 'pickup' ? 'person-add' : 'person-remove'} 
                size={32} 
                color={Colors.white} 
              />
            </View>

            {/* Titre */}
            <Text style={styles.waypointModalTitle}>
              {activeWaypoint?.type === 'pickup' ? 'Lieu de prise en charge' : "Point d'arrivée"}
            </Text>

            {/* Nom du passager */}
            <Text style={styles.waypointModalPassenger}>
              {activeWaypoint?.passenger?.name}
            </Text>

            {/* Adresse */}
            <View style={styles.waypointModalAddressContainer}>
              <Ionicons name="location" size={18} color={Colors.gray[500]} />
              <Text style={styles.waypointModalAddress}>
                {activeWaypoint?.address}
              </Text>
            </View>

            {activeWaypoint && (
              <Text style={styles.waypointModalWaitingText}>
                {activeWaypoint.type === 'pickup'
                  ? `Vous êtes arrivé au point de récupération de ${activeWaypoint.passenger.name || 'ce passager'}.`
                  : `Nous sommes arrives au point de destination de ${activeWaypoint.passenger.name || 'ce passager'}. La depose se confirme automatiquement.`}
              </Text>
            )}

            {activeWaypoint && (
              <View
                style={[
                  styles.waypointGpsStatus,
                  {
                    backgroundColor:
                      activeWaypoint.type === 'pickup'
                        ? Colors.secondary + '15'
                        : Colors.success + '15',
                    borderColor:
                      activeWaypoint.type === 'pickup'
                        ? Colors.secondary
                        : Colors.success,
                  },
                ]}
              >
                <Ionicons
                  name="locate"
                  size={18}
                  color={activeWaypoint.type === 'pickup' ? Colors.secondary : Colors.success}
                />
                <Text
                  style={[
                    styles.waypointGpsStatusText,
                    {
                      color: activeWaypoint.type === 'pickup' ? Colors.secondary : Colors.success,
                    },
                  ]}
                >
                  Confirmation automatique active
                </Text>
              </View>
            )}

            {/* Fermeture du detail */}
            <View style={styles.waypointModalActions}>
              <TouchableOpacity
                style={styles.waypointModalSecondaryButton}
                onPress={handleDismissWaypointModal}
              >
                <Text style={styles.waypointModalSecondaryButtonText}>
                  Compris
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.waypointModalReportButton}
              onPress={handleReportPassenger}
              activeOpacity={0.9}
            >
              <Ionicons name="warning-outline" size={18} color={Colors.white} />
              <Text style={styles.waypointModalReportButtonText}>Signaler ce passager</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Panneau des passagers */}
      <Modal
        visible={passengersPanelVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPassengersPanelVisible(false)}
      >
        <View style={styles.passengersPanelOverlay}>
          <TouchableOpacity 
            style={styles.passengersPanelBackdrop} 
            activeOpacity={1}
            onPress={() => setPassengersPanelVisible(false)}
          />
          <View style={[styles.passengersPanelContent, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md }]}>
            <View style={styles.passengersPanelHandle} />
            
            {/* Header */}
            <View style={styles.passengersPanelHeader}>
              <Text style={styles.passengersPanelTitle}>Passagers du trajet</Text>
              <View style={styles.passengersPanelStats}>
                <View style={styles.statBadge}>
                  <Ionicons name="person-add" size={14} color={Colors.secondary} />
                  <Text style={styles.statText}>{passengerStats.completedPickups}/{passengerStats.completedPickups + passengerStats.pendingPickups}</Text>
                </View>
                <View style={styles.statBadge}>
                  <Ionicons name="car" size={14} color={Colors.primary} />
                  <Text style={styles.statText}>{passengerStats.inVehicle}</Text>
                </View>
                <View style={styles.statBadge}>
                  <Ionicons name="flag" size={14} color={Colors.success} />
                  <Text style={styles.statText}>{passengerStats.completedDropoffs}/{passengerStats.completedDropoffs + passengerStats.pendingDropoffs}</Text>
                </View>
              </View>
            </View>

            {/* Liste des waypoints */}
            <View style={styles.waypointsList}>
              {waypoints.map((waypoint, index) => {
                const isNext = index === currentWaypointIndex && !waypoint.completed;
                return (
                  <TouchableOpacity
                    key={waypoint.id}
                    style={[
                      styles.waypointListItem,
                      waypoint.completed && styles.waypointListItemCompleted,
                      isNext && styles.waypointListItemNext,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!waypoint.completed) {
                        waypointModalVisibleRef.current = true;
                        setActiveWaypoint(waypoint);
                        setPassengersPanelVisible(false);
                        setWaypointModalVisible(true);
                      }
                    }}
                    disabled={waypoint.completed}
                  >
                    <View style={[
                      styles.waypointListIcon,
                      { backgroundColor: waypoint.type === 'pickup' ? Colors.secondary : Colors.success },
                      waypoint.completed && styles.waypointListIconCompleted,
                    ]}>
                      {waypoint.completed ? (
                        <Ionicons name="checkmark" size={14} color={Colors.white} />
                      ) : (
                        <Ionicons 
                          name={waypoint.type === 'pickup' ? 'person-add' : 'flag'} 
                          size={14} 
                          color={Colors.white} 
                        />
                      )}
                    </View>
                    
                    <View style={styles.waypointListInfo}>
                      <Text style={[
                        styles.waypointListName,
                        waypoint.completed && styles.waypointListNameCompleted,
                      ]}>
                        {waypoint.passenger.name}
                      </Text>
                      <Text style={styles.waypointListType}>
                        {waypoint.type === 'pickup' ? 'Prise en charge' : 'Arrivée'}
                      </Text>
                    </View>

                    {!waypoint.completed && (
                      <View style={styles.waypointListActions}>
                        <TouchableOpacity
                          style={[styles.waypointListAction, styles.waypointListReportAction]}
                          onPress={(event) => {
                            event.stopPropagation();
                            openReportForWaypoint(waypoint);
                          }}
                        >
                          <Ionicons name="warning-outline" size={16} color={Colors.white} />
                        </TouchableOpacity>
                        <View
                          style={[
                            styles.waypointListGpsStatus,
                            {
                              backgroundColor:
                                waypoint.type === 'pickup'
                                  ? Colors.secondary + '15'
                                  : Colors.success + '15',
                              borderColor:
                                waypoint.type === 'pickup'
                                  ? Colors.secondary
                                  : Colors.success,
                            }
                          ]}
                        >
                          <Ionicons
                            name="locate"
                            size={14}
                            color={waypoint.type === 'pickup' ? Colors.secondary : Colors.success}
                          />
                          <Text
                            style={[
                              styles.waypointListGpsStatusText,
                              { color: waypoint.type === 'pickup' ? Colors.secondary : Colors.success },
                            ]}
                          >
                            Auto
                          </Text>
                        </View>
                      </View>
                    )}

                    {isNext && (
                      <View style={styles.nextBadge}>
                        <Text style={styles.nextBadgeText}>SUIVANT</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Bouton fermer */}
            <TouchableOpacity
              style={styles.closePanelButton}
              onPress={() => setPassengersPanelVisible(false)}
            >
              <Text style={styles.closePanelButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[200],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  backButtonAlt: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  backButtonAltText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    zIndex: 40,
    elevation: 40,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 41,
    elevation: 41,
  },
  headerInfo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  etaText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  liveIndicatorActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray[400],
  },
  liveDotActive: {
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.gray[400],
  },
  liveTextActive: {
    color: '#10B981',
  },
  distanceText: {
    fontSize: FontSizes.base,
    color: Colors.gray[300],
  },
  preStartOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    zIndex: 30,
  },
  preStartCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 12,
  },
  preStartIconWrap: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  preStartTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  preStartText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    textAlign: 'center',
    lineHeight: 20,
  },
  preStartActions: {
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  preStartButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preStartButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  preStartButtonPrimaryText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  preStartButtonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  preStartButtonSecondaryText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  instructionCard: {
    position: 'absolute',
    bottom: 52,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  maneuverIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionInfo: {
    flex: 1,
  },
  instructionText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  instructionDistance: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
  },
  nextInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    gap: Spacing.xs,
  },
  nextInstructionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  loadingRouteCard: {
    position: 'absolute',
    bottom: 52,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingRouteText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
  },
  routeSectionToggle: {
    position: 'absolute',
    left: Spacing.lg,
    top: Platform.OS === 'ios' ? 114 : 84,
    zIndex: 35,
    elevation: 35,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
  },
  routeSectionToggleButton: {
    width: 92,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    opacity: 0.68,
  },
  routeSectionToggleNextActive: {
    backgroundColor: Colors.primaryDark,
    opacity: 1,
  },
  routeSectionToggleRemainingActive: {
    backgroundColor: Colors.infoDark,
    opacity: 1,
  },
  routeSectionToggleText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
  },
  routeSectionToggleTextActive: {
    color: Colors.white,
  },
  floatingButtons: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: 180,
    gap: Spacing.sm,
  },
  floatingButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingButtonDisabled: {
    opacity: 0.6,
  },
  voiceButtonMuted: {
    backgroundColor: Colors.gray[100],
  },
  securityModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  securityModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  securityModalContent: {
    backgroundColor: Colors.gray[50],
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    height: '88%',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  securityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  securityModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  securityModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityModalBody: {
    flex: 1,
  },
  securityModalBodyContent: {
    paddingBottom: Spacing.sm,
  },
  securityModalLoading: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  securityModalLoadingText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  backgroundDisclosureOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  backgroundDisclosureCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  backgroundDisclosureIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backgroundDisclosureTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  backgroundDisclosureText: {
    fontSize: FontSizes.sm,
    lineHeight: 22,
    color: Colors.gray[700],
  },
  backgroundDisclosureList: {
    gap: Spacing.xs,
  },
  backgroundDisclosureItem: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.gray[700],
  },
  backgroundDisclosureFootnote: {
    fontSize: FontSizes.xs,
    lineHeight: 18,
    color: Colors.gray[600],
  },
  backgroundDisclosureActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  backgroundDisclosureSecondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundDisclosureSecondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  backgroundDisclosurePrimaryButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundDisclosurePrimaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  driverMarkerFrame: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  driverMarker: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  driverMarkerInner: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverMarkerCar: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationMarkerContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: 'transparent',
    paddingTop: 6,
    overflow: 'visible',
  },
  destinationMarkerBody: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  destinationMarkerTip: {
    marginTop: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.success,
  },
  waypointMarkerContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    overflow: 'visible',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 4,
    elevation: 4,
  },
  androidWaypointMarkerImage: {
    width: 32,
    height: 36,
  },
  passengerLocationMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 3,
    borderColor: Colors.white,
    elevation: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  passengerProfileCallout: {
    width: 210,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  passengerProfileCalloutIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
  },
  passengerProfileCalloutText: {
    flex: 1,
    minWidth: 0,
  },
  passengerProfileCalloutName: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  passengerProfileCalloutAction: {
    marginTop: 2,
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  pickupMarker: {
    backgroundColor: Colors.secondary,
  },
  dropoffMarker: {
    backgroundColor: Colors.info,
  },
  completedMarker: {
    backgroundColor: Colors.gray[400],
  },
  // Barre compacte des passagers
  passengersBar: {
    position: 'absolute',
    top: 100,
    left: Spacing.md,
    right: Spacing.md,
    gap: Spacing.sm,
  },
  passengersStatsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: Spacing.sm,
  },
  passengersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    gap: 4,
  },
  passengersBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  passengersStatsInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  inVehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    gap: 2,
  },
  inVehicleText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.white,
  },
  pendingText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  nextWaypointCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    paddingLeft: Spacing.md,
    borderLeftWidth: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: Spacing.sm,
  },
  nextWaypointInfo: {
    flex: 1,
  },
  nextWaypointType: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  nextWaypointName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  gpsStatusPill: {
    minHeight: 34,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gpsStatusPillText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  // Panneau des passagers
  passengersPanelOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  passengersPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  passengersPanelContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  passengersPanelHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  passengersPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  passengersPanelTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  passengersPanelStats: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    gap: 4,
  },
  statText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  waypointsList: {
    gap: Spacing.xs,
  },
  waypointListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  waypointListItemCompleted: {
    backgroundColor: Colors.gray[100],
    opacity: 0.7,
  },
  waypointListItemNext: {
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  waypointListIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointListIconCompleted: {
    backgroundColor: Colors.gray[400],
  },
  waypointListInfo: {
    flex: 1,
  },
  waypointListName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  waypointListNameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.gray[500],
  },
  waypointListType: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  waypointListAction: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointListActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  waypointListReportAction: {
    backgroundColor: Colors.danger,
  },
  waypointListGpsStatus: {
    minWidth: 48,
    height: 32,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  waypointListGpsStatusText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  nextBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  closePanelButton: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  closePanelButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  // Styles du modal de waypoint
  waypointModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  waypointModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  waypointModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: Spacing.lg,
  },
  waypointModalIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  waypointModalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  waypointModalPassenger: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  waypointModalAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  waypointModalAddress: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    flex: 1,
  },
  waypointModalWaitingText: {
    alignSelf: 'stretch',
    marginTop: -Spacing.md,
    marginBottom: Spacing.lg,
    color: Colors.secondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    textAlign: 'center',
  },
  waypointGpsStatus: {
    width: '100%',
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  waypointGpsStatusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  waypointModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  waypointModalSecondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waypointModalSecondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  waypointModalPrimaryButton: {
    flex: 1,
    height: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.success,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  waypointModalPrimaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  waypointModalReportButton: {
    marginTop: Spacing.md,
    width: '100%',
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  waypointModalReportButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
});
