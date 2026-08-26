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
  DRIVER_LOCATION_BACKEND_UPDATE_INTERVAL_MS,
  DRIVER_PICKUP_ARRIVAL_DISTANCE_KM,
  PASSENGER_READY_DISTANCE_KM,
} from '@/constants/rideProgress';
import {
  trackingSocket,
  type BookingAutoProgressPayload,
  type PassengerLocationPayload,
} from '@/services/trackingSocket';
import {
  startDriverBackgroundLocationTracking,
  stopDriverBackgroundLocationTracking,
  updateDriverBackgroundLocationCheckpoint,
} from '@/services/driverBackgroundLocationTask';
import {
  useAcceptBookingMutation,
  useConfirmPassengerTripInterruptionMutation,
  useGetTripBookingsQuery,
  useRejectPassengerTripInterruptionMutation,
  useRejectBookingMutation,
} from '@/store/api/bookingApi';
import { TravelMode, useGetDirectionsMutation } from '@/store/api/googleMapsApi';
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
import type {
  Booking,
  DriverTripRevenueSummary,
  Trip,
  TripInterruptionReason,
} from '@/types';
import {
  areTripMapCoordinatesSame,
  getTripLocationCoordinate,
  isCoordinateInKinshasaBounds,
  normalizeTripMapCoordinate,
} from '@/utils/tripCoordinates';
import { calculateDistance, getRouteAlignedPosition } from '@/utils/routeHelpers';
import {
  LOCATION_FRESHNESS_MS,
  MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
  MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
  ROUTE_DEVIATION_THRESHOLD_METERS,
  calculateBearingDegrees,
  calculateDistanceMeters,
  calculatePolylineDistanceMeters,
  distanceFromCoordinateToPolyline,
  getPolylineProgress,
  isFreshLocationTimestamp,
  isPlausibleLocationUpdate,
  isRouteDeviationConfirmed,
  normalizeHeadingDelta,
  resolveActiveDestination,
  trimPolylineFromCurrentPosition,
  type NavigationCoordinate,
  type NavigationStop,
} from '@/utils/navigation/routeProgress';
import {
  DRIVER_TRIP_END_APPROACH_DISTANCE_METERS,
  DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
  DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  evaluateDestinationAutoComplete,
  evaluateDestinationPassage,
} from '@/utils/navigation/tripCompletion';
import { shareTrip } from '@/utils/shareHelpers';
import {
  getTripInterruptionReasonLabel,
  isPendingTripInterruption,
} from '@/utils/tripInterruption';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AppStateStatus,
  type ImageRequireSource,
} from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE, type MapMarker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type RouteCoordinate = NavigationCoordinate;

type MapEdgePadding = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

interface PassengerMapLocation {
  bookingId: string;
  coordinate: RouteCoordinate;
  isLive: boolean;
  passengerId: string;
  passengerName: string;
  status: PassengerTrackingMarkerStatus;
}

type RouteSectionFocus = 'next' | 'remaining';

type FetchRouteOptions = {
  originOverride?: RouteCoordinate;
  announceReroute?: boolean;
  fitToRoute?: boolean;
};

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
  tripId: string;
  completedWhileAppInactive?: boolean;
  distanceMeters?: number;
  detectedAt?: string;
  revenueSummary?: DriverTripRevenueSummary;
  revenueSummaryUnavailable?: boolean;
}

type LivePassengerLocation = {
  coordinate: RouteCoordinate;
  updatedAt?: string | null;
};

const SPEECH_LANGUAGE = 'fr-FR';
const SPEECH_RATE = 0.95;
const SPEECH_MIN_INTERVAL_MS = 2500;
const MAX_LIVE_PASSENGER_MARKERS = Platform.OS === 'ios' ? 10 : 16;
const USE_ANDROID_NAVIGATION_MARKER_IMAGES = Platform.OS === 'android';
const ANDROID_PIN_MARKER_ANCHOR = { x: 0.5, y: 0.88 };
const DRIVER_DROPOFF_APPROACH_DISTANCE_KM = 0.04;
const DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS = 3000;
const FRESH_DRIVER_LOCATION_MAX_AGE_MS = LOCATION_FRESHNESS_MS;
const OFF_ROUTE_DISTANCE_KM = ROUTE_DEVIATION_THRESHOLD_METERS / 1000;
const DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS = 55;
const DRIVER_REROUTE_CONFIRMATION_COUNT = 2;
const DRIVER_REROUTE_MIN_INTERVAL_MS = 12_000;
const PICKUP_BYPASS_OBSERVED_DISTANCE_METERS = 90;
const PICKUP_BYPASS_MIN_AHEAD_METERS = 120;
const PICKUP_BYPASS_MIN_DISTANCE_METERS = 160;
const PICKUP_BYPASS_BEHIND_HEADING_DEGREES = 125;
const DIRECT_NEAR_WAYPOINT_ROUTE_DISTANCE_METERS = 120;
const DIRECT_NEAR_WAYPOINT_REACHED_DISTANCE_METERS = 30;
const DIRECT_NEAR_WAYPOINT_MAX_TURN_DEGREES = 35;
const DIRECT_NEAR_WAYPOINT_MAX_ROUTE_RATIO = 1.35;
const ROUTE_TURN_SEGMENT_MIN_METERS = 8;
const MAP_FIT_MIN_COORDINATE_DISTANCE_METERS = 2;
const MAP_POLYLINE_MIN_COORDINATE_DISTANCE_METERS = 0.5;
const DEFAULT_MAP_FOCUS_DELTA = 0.01;
const KINSHASA_FALLBACK_MAP_COORDINATE: RouteCoordinate = {
  latitude: -4.4419,
  longitude: 15.2663,
};

const isCoordinateAllowedForNavigationRoute = (
  coordinate: RouteCoordinate | null | undefined,
  restrictToKinshasa: boolean,
): coordinate is RouteCoordinate => Boolean(
  coordinate && (!restrictToKinshasa || isCoordinateInKinshasaBounds(coordinate)),
);
const OFF_ROUTE_MAX_ACCURACY_METERS = MAX_ACCEPTABLE_GPS_ACCURACY_METERS;
const OFF_ROUTE_MIN_ROUTE_POINTS = 2;

const getSafeMapCoordinate = (
  coordinate: RouteCoordinate | null | undefined,
) =>
  coordinate
    ? normalizeTripMapCoordinate(coordinate.latitude, coordinate.longitude)
    : null;

const getSafeMapCoordinateList = (
  coordinates: Array<RouteCoordinate | null | undefined>,
  minimumDistanceMeters = MAP_POLYLINE_MIN_COORDINATE_DISTANCE_METERS,
) => {
  const safeCoordinates: RouteCoordinate[] = [];

  coordinates.forEach((coordinate) => {
    const safeCoordinate = getSafeMapCoordinate(coordinate);
    if (!safeCoordinate) {
      return;
    }

    const previousCoordinate = safeCoordinates[safeCoordinates.length - 1];
    if (
      !previousCoordinate ||
      calculateDistanceMeters(previousCoordinate, safeCoordinate) >
        minimumDistanceMeters
    ) {
      safeCoordinates.push(safeCoordinate);
    }
  });

  return safeCoordinates;
};

const getSafePolylineCoordinates = (
  coordinates: Array<RouteCoordinate | null | undefined>,
) => {
  const safeCoordinates = getSafeMapCoordinateList(coordinates);
  return safeCoordinates.length > 1 ? safeCoordinates : [];
};

const fitMapToSafeCoordinates = (
  map: MapView | null,
  coordinates: Array<RouteCoordinate | null | undefined>,
  {
    animated = true,
    durationMs = 320,
    edgePadding,
    logContext = 'navigation-map',
    singleCoordinateDelta = DEFAULT_MAP_FOCUS_DELTA,
  }: {
    animated?: boolean;
    durationMs?: number;
    edgePadding: MapEdgePadding;
    logContext?: string;
    singleCoordinateDelta?: number;
  },
) => {
  if (!map) {
    return;
  }

  const safeCoordinates = getSafeMapCoordinateList(
    coordinates,
    MAP_FIT_MIN_COORDINATE_DISTANCE_METERS,
  );
  if (safeCoordinates.length === 0) {
    return;
  }

  try {
    if (safeCoordinates.length === 1) {
      map.animateToRegion(
        {
          ...safeCoordinates[0],
          latitudeDelta: singleCoordinateDelta,
          longitudeDelta: singleCoordinateDelta,
        },
        durationMs,
      );
      return;
    }

    map.fitToCoordinates(safeCoordinates, {
      edgePadding,
      animated,
    });
  } catch (error) {
    console.warn('[Navigation] Ajustement de la carte ignoré pour éviter un plantage :', {
      context: logContext,
      error,
    });
  }
};

const getMaximumRouteTurnDegrees = (coordinates: RouteCoordinate[]) => {
  let maxTurnDegrees = 0;
  let previousBearing: number | null = null;

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    if (calculateDistanceMeters(previous, current) < ROUTE_TURN_SEGMENT_MIN_METERS) {
      continue;
    }

    const bearing = calculateBearingDegrees(previous, current);
    if (previousBearing !== null) {
      maxTurnDegrees = Math.max(
        maxTurnDegrees,
        normalizeHeadingDelta(previousBearing, bearing),
      );
    }
    previousBearing = bearing;
  }

  return maxTurnDegrees;
};

const shouldUseDirectNearWaypointRoute = ({
  activeDestinationKind,
  directDistanceMeters,
  isTripOngoing,
  routeCoordinates,
}: {
  activeDestinationKind?: NavigationStop['kind'];
  directDistanceMeters: number;
  isTripOngoing: boolean;
  routeCoordinates: RouteCoordinate[];
}) => {
  if (
    !isTripOngoing ||
    activeDestinationKind === 'destination' ||
    !Number.isFinite(directDistanceMeters) ||
    directDistanceMeters > DIRECT_NEAR_WAYPOINT_ROUTE_DISTANCE_METERS
  ) {
    return false;
  }

  if (directDistanceMeters <= DIRECT_NEAR_WAYPOINT_REACHED_DISTANCE_METERS) {
    return true;
  }

  const routeDistanceMeters = calculatePolylineDistanceMeters(routeCoordinates);
  if (!Number.isFinite(routeDistanceMeters) || routeDistanceMeters <= 0) {
    return false;
  }

  const routeRatio = routeDistanceMeters / Math.max(1, directDistanceMeters);
  const maxTurnDegrees = getMaximumRouteTurnDegrees(routeCoordinates);

  if (
    maxTurnDegrees <= DIRECT_NEAR_WAYPOINT_MAX_TURN_DEGREES &&
    routeRatio <= DIRECT_NEAR_WAYPOINT_MAX_ROUTE_RATIO
  ) {
    return true;
  }

  return false;
};
const PICKUP_NOTICE_PRIORITY: Record<PickupNoticeEventType, number> = {
  driver_arrived_pickup: 1,
  parties_nearby: 2,
  passenger_ready_pickup: 3,
};
const androidNavigationMarkerImages: Record<'departure' | 'pickup' | 'dropoff' | 'destination', ImageRequireSource> = {
  departure: require('@/assets/images/map-markers/trip-detail-marker-departure.png'),
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

const formatSeatCount = (seats: number): string => {
  const safeSeats = Number.isFinite(seats) && seats > 0 ? Math.round(seats) : 1;
  return `${safeSeats} place${safeSeats > 1 ? 's' : ''}`;
};

const formatNavigationDistance = (distanceInMeters: number | null | undefined) => {
  if (typeof distanceInMeters !== 'number' || !Number.isFinite(distanceInMeters)) {
    return null;
  }

  if (distanceInMeters >= 1000) {
    return `${(distanceInMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.max(1, Math.round(distanceInMeters))} m`;
};

const formatNavigationDuration = (durationInSeconds: number | null | undefined) => {
  if (typeof durationInSeconds !== 'number' || !Number.isFinite(durationInSeconds)) {
    return null;
  }

  const minutes = Math.max(1, Math.round(durationInSeconds / 60));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  }

  return `${minutes} min`;
};

const formatNavigationEta = (durationInSeconds: number | null | undefined) => {
  if (typeof durationInSeconds !== 'number' || !Number.isFinite(durationInSeconds)) {
    return null;
  }

  return new Date(Date.now() + durationInSeconds * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTripRevenueAmount = (amount: number, currency: string) =>
  `${Number(amount || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`;

const formatPendingBookingPayment = (booking: Booking, tripPrice?: number): string => {
  if (booking.paymentMode === 'cash') {
    return 'Cash';
  }

  if (booking.paymentMode === 'points') {
    return 'Jetons';
  }

  if (booking.paymentMode === 'electronic') {
    return 'Mobile money';
  }

  if (!tripPrice || tripPrice <= 0) {
    return 'Gratuit';
  }

  return `${tripPrice * booking.numberOfSeats} FC`;
};

const getBookingActionErrorMessage = (error: any, fallback: string): string => {
  const message = error?.data?.message ?? error?.error;
  return Array.isArray(message) ? message.join('\n') : message || fallback;
};

const hasBookingPickupCompleted = (booking?: Booking | null): boolean =>
  Boolean(
    booking?.pickedUp ||
      booking?.pickedUpConfirmedByPassenger ||
      booking?.pickedUpAt ||
      booking?.pickedUpConfirmedAt,
  );

const hasBookingDropoffCompleted = (booking?: Booking | null): boolean =>
  Boolean(
    booking?.status === 'completed' ||
      booking?.droppedOff ||
      booking?.droppedOffConfirmedByPassenger ||
      booking?.droppedOffAt ||
      booking?.droppedOffConfirmedAt,
  );

const getTripLocationLabel = (
  location: Trip['departure'] | Trip['arrival'] | undefined,
  fallback: string,
) => (location?.address || location?.name || fallback).trim();

const getBookingPickupLabel = (booking: Booking | null | undefined, trip?: Trip | null) => {
  const tripLabel = getTripLocationLabel(trip?.departure, 'Point de récupération');
  const bookingLabel = (booking?.passengerOrigin || booking?.passengerOriginReference || '').trim();
  const hasPassengerCoordinate = Boolean(
    normalizeTripMapCoordinate(
      booking?.passengerOriginCoordinates?.latitude,
      booking?.passengerOriginCoordinates?.longitude,
    ),
  );

  return hasPassengerCoordinate ? bookingLabel || tripLabel : tripLabel || bookingLabel;
};

const getBookingDropoffLabel = (booking: Booking | null | undefined, trip?: Trip | null) => {
  const tripLabel = getTripLocationLabel(trip?.arrival, 'Point de destination');
  const bookingLabel = (
    booking?.passengerDestination ||
    booking?.passengerDestinationReference ||
    ''
  ).trim();
  const hasPassengerCoordinate = Boolean(
    normalizeTripMapCoordinate(
      booking?.passengerDestinationCoordinates?.latitude,
      booking?.passengerDestinationCoordinates?.longitude,
    ),
  );

  return hasPassengerCoordinate ? bookingLabel || tripLabel : tripLabel || bookingLabel;
};

const getBookingDropoffCoordinate = (
  booking: Booking,
  fallbackCoordinate: RouteCoordinate | null,
) =>
  normalizeTripMapCoordinate(
    booking.passengerDestinationCoordinates?.latitude,
    booking.passengerDestinationCoordinates?.longitude,
  ) ?? fallbackCoordinate;

const isFreshLocationObject = (
  location: Location.LocationObject | null,
  maxAgeMs = FRESH_DRIVER_LOCATION_MAX_AGE_MS,
): location is Location.LocationObject => {
  if (!location) {
    return false;
  }

  if (!normalizeTripMapCoordinate(location.coords.latitude, location.coords.longitude)) {
    return false;
  }

  const timestamp = Number(location.timestamp);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
};

const normalizeDriverLocationObject = (
  location: Location.LocationObject | null,
): Location.LocationObject | null => {
  if (!location) {
    return null;
  }

  const coordinate = normalizeTripMapCoordinate(
    location.coords.latitude,
    location.coords.longitude,
  );
  if (!coordinate) {
    return null;
  }

  return {
    ...location,
    coords: {
      ...location.coords,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    },
  };
};

const isFreshLivePassengerLocation = (
  location: LivePassengerLocation | undefined,
  maxAgeMs = FRESH_DRIVER_LOCATION_MAX_AGE_MS,
) => {
  if (!location) {
    return false;
  }

  if (!location.updatedAt) {
    return true;
  }

  const timestamp = new Date(location.updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
};

const hasFreshBookingPassengerLocation = (booking: Booking) => {
  if (!booking.passengerLocationUpdatedAt) {
    return false;
  }

  return isFreshLocationTimestamp(new Date(booking.passengerLocationUpdatedAt).getTime());
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
  const [acceptBooking, { isLoading: isAcceptingBooking }] = useAcceptBookingMutation();
  const [rejectBooking, { isLoading: isRejectingBooking }] = useRejectBookingMutation();
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
    if (!trip?.id) {
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

  const mapRef = useRef<MapView>(null);
  const isMapReadyRef = useRef(false);
  const passengerMarkerRefs = useRef<Record<string, MapMarker | null>>({});
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentLegIndex = 0;
  const [totalDistance, setTotalDistance] = useState<string>('');
  const [totalDuration, setTotalDuration] = useState<string>('');
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(true);
  const [isReroutingRoute, setIsReroutingRoute] = useState(false);
  const [heading, setHeading] = useState<number>(0);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isVoiceGuidanceEnabled, setIsVoiceGuidanceEnabled] = useState(true);
  const [livePassengerLocations, setLivePassengerLocations] = useState<Record<string, LivePassengerLocation>>({});
  const [skippedPickupBookingIds, setSkippedPickupBookingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const pickupNoticeRef = useRef<PickupNotice | null>(null);
  const tripEndNoticeRef = useRef<TripEndNotice | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const recalcRouteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundDisclosureResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const isMountedRef = useRef(true);
  const isTripOngoingRef = useRef(false);
  const driverMarkerRef = useRef<MapMarker | null>(null);
  const lastAcceptedDriverCoordinateRef = useRef<RouteCoordinate | null>(null);
  const lastAcceptedDriverTimestampRef = useRef<number | null>(null);
  const lastTripCompletionCheckCoordinateRef = useRef<RouteCoordinate | null>(null);
  const lastBackgroundCheckpointAtRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isRestCompletionCheckRunningRef = useRef(false);
  const lastRestCompletionCheckAtRef = useRef(0);
  const completedDuringInactiveCandidateRef = useRef(false);
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

  const focusMapOnCoordinates = useCallback(
    (
      coordinates: Array<RouteCoordinate | null | undefined>,
      options: Parameters<typeof fitMapToSafeCoordinates>[2],
    ) => {
      if (!isMapReadyRef.current) {
        return;
      }

      fitMapToSafeCoordinates(mapRef.current, coordinates, options);
    },
    [],
  );

  const handleMapReady = useCallback(() => {
    isMapReadyRef.current = true;
  }, []);

  const passengerMapLocations = useMemo<PassengerMapLocation[]>(() => {
    const locations: PassengerMapLocation[] = [];

    (bookings ?? [])
      .filter((booking) => {
        if (booking.status !== 'accepted' && booking.status !== 'completed') {
          return false;
        }

        const isPassengerDroppedOff = hasBookingDropoffCompleted(booking);
        return !(hasBookingPickupCompleted(booking) && !isPassengerDroppedOff);
      })
      .slice(0, MAX_LIVE_PASSENGER_MARKERS)
      .forEach((booking) => {
        const isPassengerDroppedOff = hasBookingDropoffCompleted(booking);
        const liveLocation = livePassengerLocations[booking.id];
        const liveLocationCoordinate = liveLocation?.coordinate ?? null;
        const rawApiLocationCoordinate = normalizeTripMapCoordinate(
          booking.passengerLocationCoordinates?.latitude,
          booking.passengerLocationCoordinates?.longitude,
        );
        const apiLocationCoordinate = hasFreshBookingPassengerLocation(booking)
          ? rawApiLocationCoordinate
          : null;
        const passengerPickupCoordinate = normalizeTripMapCoordinate(
          booking.passengerOriginCoordinates?.latitude,
          booking.passengerOriginCoordinates?.longitude,
        );
        const passengerDropoffCoordinate = normalizeTripMapCoordinate(
          booking.passengerDestinationCoordinates?.latitude,
          booking.passengerDestinationCoordinates?.longitude,
        );
        const liveCoordinate = isCoordinateAllowedForNavigationRoute(
          liveLocationCoordinate,
          isKinshasaNavigationTrip,
        )
          ? liveLocationCoordinate
          : null;
        const apiLocation = isCoordinateAllowedForNavigationRoute(
          apiLocationCoordinate,
          isKinshasaNavigationTrip,
        )
          ? apiLocationCoordinate
          : null;
        const pickupLocation = isCoordinateAllowedForNavigationRoute(
          passengerPickupCoordinate,
          isKinshasaNavigationTrip,
        )
          ? passengerPickupCoordinate
          : null;
        const safePassengerDropoffCoordinate = isCoordinateAllowedForNavigationRoute(
          passengerDropoffCoordinate,
          isKinshasaNavigationTrip,
        )
          ? passengerDropoffCoordinate
          : null;
        const dropoffLocation = safePassengerDropoffCoordinate ?? tripArrivalCoordinate;

        if (isKinshasaNavigationTrip && liveLocationCoordinate && !liveCoordinate) {
          console.warn('[DriverNavigation] Position live passager hors Kinshasa ignorée:', {
            bookingId: booking.id,
            coordinate: liveLocationCoordinate,
          });
        }
        if (rawApiLocationCoordinate && !apiLocationCoordinate) {
          console.warn('[DriverNavigation] Position API passager trop ancienne ignorée:', {
            bookingId: booking.id,
            updatedAt: booking.passengerLocationUpdatedAt,
          });
        }
        if (isKinshasaNavigationTrip && apiLocationCoordinate && !apiLocation) {
          console.warn('[DriverNavigation] Position API passager hors Kinshasa ignorée:', {
            bookingId: booking.id,
            coordinate: apiLocationCoordinate,
          });
        }
        if (isKinshasaNavigationTrip && passengerPickupCoordinate && !pickupLocation) {
          console.warn('[DriverNavigation] Pickup passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerPickupCoordinate,
          });
        }
        if (
          isKinshasaNavigationTrip &&
          passengerDropoffCoordinate &&
          !safePassengerDropoffCoordinate
        ) {
          console.warn('[DriverNavigation] Dropoff passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerDropoffCoordinate,
            destination: booking.passengerDestination,
          });
        }

        const status: PassengerTrackingMarkerStatus =
          isPassengerDroppedOff
            ? 'arrived'
            : 'pickup';
        const coordinate =
          status === 'arrived'
            ? dropoffLocation ?? liveCoordinate ?? apiLocation ?? pickupLocation ?? tripDepartureCoordinate
            : liveCoordinate ?? apiLocation ?? pickupLocation ?? tripDepartureCoordinate;

        if (!coordinate) return;

        locations.push({
          bookingId: booking.id,
          coordinate,
          isLive: Boolean(liveCoordinate || apiLocation),
          passengerId: booking.passengerId,
          passengerName: booking.passengerName || 'Passager',
          status,
        });
      });

    return locations;
  }, [
    bookings,
    isKinshasaNavigationTrip,
    livePassengerLocations,
    tripArrivalCoordinate,
    tripDepartureCoordinate,
  ]);
  
  // Refs pour éviter les re-rendus excessifs
  const pendingNavigationBookings = useMemo(
    () => (bookings ?? []).filter((booking) => booking.status === 'pending'),
    [bookings],
  );
  const activePendingBooking = pendingNavigationBookings[0] ?? null;
  const activePendingBookingPickupLabel = getBookingPickupLabel(activePendingBooking, trip);
  const activePendingBookingDropoffLabel = getBookingDropoffLabel(activePendingBooking, trip);
  const pendingBookingQueueCount = Math.max(0, pendingNavigationBookings.length - 1);
  const isProcessingPendingBooking = Boolean(
    activePendingBooking && processingBookingId === activePendingBooking.id,
  );
  const passengerInterruptionRequests = useMemo(
    () =>
      (bookings ?? []).filter((booking) =>
        isPendingTripInterruption(booking.interruptionRequest?.status),
      ),
    [bookings],
  );
  const activePassengerInterruptionBooking = passengerInterruptionRequests[0] ?? null;
  const pendingPassengerInterruptionQueueCount = Math.max(
    0,
    passengerInterruptionRequests.length - 1,
  );
  const activeDriverInterruptionRequest = isPendingTripInterruption(
    trip?.interruptionRequest?.status,
  )
    ? trip?.interruptionRequest ?? null
    : null;
  const activeDriverInterruptionRequiredCount =
    activeDriverInterruptionRequest?.requiredPassengerCount ??
    activeDriverInterruptionRequest?.confirmations.length ??
    0;
  const activeDriverInterruptionConfirmedCount =
    activeDriverInterruptionRequest?.confirmedPassengerCount ??
    activeDriverInterruptionRequest?.confirmations.filter(
      (confirmation) => confirmation.status === 'confirmed',
    ).length ??
    0;

  const routeFetchedRef = useRef(false);
  const routeCoordinatesRef = useRef<RouteCoordinate[]>([]);
  const lastRouteFetchTimeRef = useRef(0);
  const fetchRouteRef = useRef<((options?: FetchRouteOptions) => Promise<void>) | null>(null);
  const routeSignatureRef = useRef('');
  const hasFetchedInitialDriverRouteRef = useRef(false);
  const offRouteSampleCountRef = useRef(0);
  const lastOffRouteRerouteAtRef = useRef(0);
  const isReroutingRef = useRef(false);
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
  const skippedPickupBookingIdsRef = useRef<ReadonlySet<string>>(new Set());
  const pickupClosestDistanceMetersRef = useRef<Map<string, number>>(new Map());
  const tripDestinationNearSinceMsRef = useRef<number | null>(null);
  const evaluatePickupBypassRef = useRef<
    ((driverCoordinate: RouteCoordinate, gpsHeadingDegrees: number | null) => void) | null
  >(null);
  const autoCompletingTripRef = useRef(false);
  const presentedPassengerBoardedKeysRef = useRef<Set<string>>(new Set());
  const presentedPassengerDestinationApproachKeysRef = useRef<Set<string>>(new Set());
  const presentedPassengerDestinationKeysRef = useRef<Set<string>>(new Set());
  const presentedTripDestinationKeysRef = useRef<Set<string>>(new Set());
  const previousTripStatusRef = useRef<Trip['status'] | null>(trip?.status ?? null);
  const stepsRef = useRef<RouteStep[]>([]);
  const currentStepIndexRef = useRef(0);
  const waypointsRef = useRef<Waypoint[]>([]);
  const currentWaypointIndexRef = useRef(0);
  const waypointModalVisibleRef = useRef(false);
  const bookingsRef = useRef<Booking[] | undefined>(undefined);

  stepsRef.current = steps;
  currentStepIndexRef.current = currentStepIndex;
  waypointsRef.current = waypoints;
  currentWaypointIndexRef.current = currentWaypointIndex;
  waypointModalVisibleRef.current = waypointModalVisible;
  routeCoordinatesRef.current = routeCoordinates;
  pickupNoticeRef.current = pickupNotice;
  tripEndNoticeRef.current = tripEndNotice;
  bookingsRef.current = bookings;
  skippedPickupBookingIdsRef.current = skippedPickupBookingIds;

  const activeNavigationDestination = useMemo(() => {
    const navigationStops = waypoints.reduce<NavigationStop[]>((stops, waypoint) => {
      const isSkippedPickupBooking =
        skippedPickupBookingIds.has(waypoint.booking.id) &&
        !hasBookingPickupCompleted(waypoint.booking);
      if (isSkippedPickupBooking) {
        return stops;
      }

      const coordinate = normalizeTripMapCoordinate(
        waypoint.location.lat,
        waypoint.location.lng,
      );

      if (!isCoordinateAllowedForNavigationRoute(coordinate, isKinshasaNavigationTrip)) {
        if (isKinshasaNavigationTrip && coordinate) {
          console.warn('[DriverNavigation] Waypoint hors Kinshasa ignoré pour le tracé:', {
            waypointId: waypoint.id,
            type: waypoint.type,
            coordinate,
          });
        }

        return stops;
      }

      stops.push({
        id: waypoint.id,
        kind: waypoint.type,
        completed: waypoint.completed,
        coordinate,
      });

      return stops;
    }, []);

    return resolveActiveDestination(navigationStops, tripArrivalCoordinate);
  }, [
    isKinshasaNavigationTrip,
    skippedPickupBookingIds,
    tripArrivalCoordinate,
    waypoints,
  ]);
  const activeRouteDestination = activeNavigationDestination?.coordinate ?? null;

  evaluatePickupBypassRef.current = (
    driverCoordinate: RouteCoordinate,
    gpsHeadingDegrees: number | null,
  ) => {
    const route = routeCoordinatesRef.current;
    const driverProgress = route.length >= 2
      ? getPolylineProgress(driverCoordinate, route)
      : null;
    const activeDestinationId = activeNavigationDestination?.id ?? null;

    for (const waypoint of waypointsRef.current) {
      const booking = waypoint.booking;
      if (
        waypoint.type !== 'pickup' ||
        waypoint.id !== activeDestinationId ||
        waypoint.completed ||
        hasBookingPickupCompleted(booking) ||
        hasBookingDropoffCompleted(booking) ||
        skippedPickupBookingIdsRef.current.has(booking.id)
      ) {
        continue;
      }

      const pickupCoordinate = normalizeTripMapCoordinate(
        waypoint.location.lat,
        waypoint.location.lng,
      );
      if (!pickupCoordinate) {
        continue;
      }

      const distanceToPickupMeters = calculateDistanceMeters(
        driverCoordinate,
        pickupCoordinate,
      );
      const previousClosestDistance =
        pickupClosestDistanceMetersRef.current.get(booking.id) ??
        Number.POSITIVE_INFINITY;
      const closestDistance = Math.min(
        previousClosestDistance,
        distanceToPickupMeters,
      );
      pickupClosestDistanceMetersRef.current.set(booking.id, closestDistance);

      if (
        closestDistance > PICKUP_BYPASS_OBSERVED_DISTANCE_METERS ||
        distanceToPickupMeters < PICKUP_BYPASS_MIN_DISTANCE_METERS
      ) {
        continue;
      }

      const pickupProgress = route.length >= 2
        ? getPolylineProgress(pickupCoordinate, route)
        : null;
      const hasPassedPickupOnRoute = Boolean(
        driverProgress &&
          pickupProgress &&
          pickupProgress.closestPoint.distanceMeters <=
            ROUTE_DEVIATION_THRESHOLD_METERS * 2 &&
          driverProgress.distanceFromStartMeters -
            pickupProgress.distanceFromStartMeters >=
            PICKUP_BYPASS_MIN_AHEAD_METERS,
      );
      const pickupBearing = calculateBearingDegrees(
        driverCoordinate,
        pickupCoordinate,
      );
      const isPickupBehindDriver =
        typeof gpsHeadingDegrees === 'number' &&
        Number.isFinite(gpsHeadingDegrees) &&
        normalizeHeadingDelta(gpsHeadingDegrees, pickupBearing) >=
          PICKUP_BYPASS_BEHIND_HEADING_DEGREES;

      if (!hasPassedPickupOnRoute && !isPickupBehindDriver) {
        continue;
      }

      console.warn('[DriverNavigation] Pickup depasse sans embarquement, retrait local du trace:', {
        bookingId: booking.id,
        passengerName: waypoint.passenger.name,
        distanceToPickupMeters: Math.round(distanceToPickupMeters),
        closestDistanceMeters: Math.round(closestDistance),
        hasPassedPickupOnRoute,
        isPickupBehindDriver,
      });

      setSkippedPickupBookingIds((current) => {
        if (current.has(booking.id)) {
          return current;
        }

        const next = new Set(current);
        next.add(booking.id);
        skippedPickupBookingIdsRef.current = next;
        return next;
      });

      const currentNotice = pickupNoticeRef.current;
      if (currentNotice?.waypoint.booking.id === booking.id) {
        pickupNoticeRef.current = null;
        setPickupNotice(null);
        setPickupNoticeCountdown(null);
      }

      routeFetchedRef.current = false;
      routeSignatureRef.current = '';
      offRouteSampleCountRef.current = 0;
      lastOffRouteRerouteAtRef.current = 0;
      break;
    }
  };

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

    offRouteSampleCountRef.current = 0;
    isReroutingRef.current = false;
    hasFetchedInitialDriverRouteRef.current = false;
    autoCompletingTripRef.current = false;
    lastAcceptedDriverCoordinateRef.current = null;
    lastAcceptedDriverTimestampRef.current = null;
    lastTripCompletionCheckCoordinateRef.current = null;
    lastBackgroundCheckpointAtRef.current = 0;
    isRestCompletionCheckRunningRef.current = false;
    lastRestCompletionCheckAtRef.current = 0;
    completedDuringInactiveCandidateRef.current = false;
    previousTripStatusRef.current = null;
    skippedPickupBookingIdsRef.current = new Set();
    pickupClosestDistanceMetersRef.current.clear();
    tripDestinationNearSinceMsRef.current = null;
    setIsReroutingRoute(false);
    setRouteDistanceMeters(null);
    setRouteDurationSeconds(null);
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
    offRouteSampleCountRef.current = 0;
    lastOffRouteRerouteAtRef.current = 0;
    isReroutingRef.current = false;
    routeSignatureRef.current = '';
    hasFetchedInitialDriverRouteRef.current = false;
    autoCompletingTripRef.current = false;
    lastAcceptedDriverCoordinateRef.current = null;
    lastAcceptedDriverTimestampRef.current = null;
    lastTripCompletionCheckCoordinateRef.current = null;
    lastBackgroundCheckpointAtRef.current = 0;
    isRestCompletionCheckRunningRef.current = false;
    lastRestCompletionCheckAtRef.current = 0;
    completedDuringInactiveCandidateRef.current = false;
    skippedPickupBookingIdsRef.current = new Set();
    pickupClosestDistanceMetersRef.current.clear();
    setSkippedPickupBookingIds(new Set());
    setRouteDistanceMeters(null);
    setRouteDurationSeconds(null);
    setIsReroutingRoute(false);
    presentedPassengerBoardedKeysRef.current.clear();
    presentedPassengerDestinationApproachKeysRef.current.clear();
    presentedPassengerDestinationKeysRef.current.clear();
    presentedTripDestinationKeysRef.current.clear();
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

      if (
        waypoint.completed ||
        hasBookingPickupCompleted(waypoint.booking) ||
        hasBookingDropoffCompleted(waypoint.booking)
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

  const presentPassengerDestinationApproachNotice = useCallback(
    (event: BookingAutoProgressEvent, waypoint?: Waypoint | null) => {
      if (!isMountedRef.current || event.type !== 'passenger_near_destination' || !event.bookingId) {
        return;
      }

      const key = `passenger_near_destination:${event.bookingId}`;
      if (presentedPassengerDestinationApproachKeysRef.current.has(key)) {
        return;
      }

      presentedPassengerDestinationApproachKeysRef.current.add(key);
      const passengerName = getPassengerNameForBooking(event.bookingId, waypoint);
      const roundedDistance =
        typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
          ? Math.max(1, Math.round(event.distanceMeters))
          : null;
      const distanceText = roundedDistance ? ` Distance detectée: ${roundedDistance} m.` : '';

      showDialog({
        variant: 'info',
        icon: 'flag',
        title: 'Destination passager proche',
        message: `Le point d'arrivée de ${passengerName} va être atteint.${distanceText}`,
      });

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(`Le point d'arrivée de ${passengerName} va être atteint.`, {
          language: SPEECH_LANGUAGE,
          rate: SPEECH_RATE,
        });
      });
    },
    [getPassengerNameForBooking, showDialog],
  );

  const presentTripDestinationNotice = useCallback(
    (
      event: BookingAutoProgressEvent,
      options: { completedWhileAppInactive?: boolean } = {},
    ) => {
      if (
        !isMountedRef.current ||
        (event.type !== 'driver_near_destination' && event.type !== 'driver_arrived_destination')
      ) {
        return;
      }

      const roundedDistance =
        typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
          ? Math.max(1, Math.round(event.distanceMeters))
          : null;
      const isAutoCompleteZone =
        event.type === 'driver_near_destination' &&
        roundedDistance !== null &&
        roundedDistance <= DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS;
      const key = [
        event.type,
        event.tripId,
        event.type === 'driver_arrived_destination'
          ? 'completed'
          : isAutoCompleteZone
            ? 'auto-complete-zone'
            : 'approach',
      ].join(':');
      if (presentedTripDestinationKeysRef.current.has(key)) {
        return;
      }

      presentedTripDestinationKeysRef.current.add(key);
      if (event.type === 'driver_near_destination') {
        const distanceText = roundedDistance ? ` Distance detectée: ${roundedDistance} m.` : '';

        showDialog({
          variant: 'info',
          icon: 'flag',
          title: isAutoCompleteZone ? 'Zone de destination atteinte' : 'Destination finale proche',
          message: isAutoCompleteZone
            ? `Le véhicule est à moins de ${DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS} m du point d'arrivée. Le trajet sera terminé automatiquement après 10 minutes si le véhicule reste dans cette zone.${distanceText}`
            : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
        });

        void Speech.stop().finally(() => {
          if (!isMountedRef.current) return;
          Speech.speak(
            isAutoCompleteZone
              ? "Zone d'arrivée atteinte."
              : "Le point d'arrivée du trajet est presque atteint.",
            {
              language: SPEECH_LANGUAGE,
              rate: SPEECH_RATE,
            },
          );
        });
        return;
      }

      const notice: TripEndNotice = {
        tripId: event.tripId,
        completedWhileAppInactive: options.completedWhileAppInactive,
        distanceMeters: event.distanceMeters,
        detectedAt: event.detectedAt,
        revenueSummary: event.revenueSummary,
      };
      tripEndNoticeRef.current = notice;
      setTripEndNotice(notice);

      if (!event.revenueSummary) {
        void getDriverTripRevenueSummary(event.tripId)
          .unwrap()
          .then((revenueSummary) => {
            if (
              !isMountedRef.current ||
              tripEndNoticeRef.current?.tripId !== event.tripId
            ) {
              return;
            }
            const hydratedNotice = {
              ...tripEndNoticeRef.current,
              revenueSummary,
              revenueSummaryUnavailable: false,
            };
            tripEndNoticeRef.current = hydratedNotice;
            setTripEndNotice(hydratedNotice);
          })
          .catch((error) => {
            console.warn('[Navigation] Résumé financier du trajet indisponible:', error);
            if (
              !isMountedRef.current ||
              tripEndNoticeRef.current?.tripId !== event.tripId
            ) {
              return;
            }
            const unavailableNotice = {
              ...tripEndNoticeRef.current,
              revenueSummaryUnavailable: true,
            };
            tripEndNoticeRef.current = unavailableNotice;
            setTripEndNotice(unavailableNotice);
          });
      }

      void Speech.stop().finally(() => {
        if (!isMountedRef.current) return;
        Speech.speak(
          options.completedWhileAppInactive
            ? "Le trajet s'est terminé pendant que l'application était en veille."
            : 'Vous avez atteint la destination finale. Le trajet est terminé automatiquement.',
          {
            language: SPEECH_LANGUAGE,
            rate: SPEECH_RATE,
          },
        );
      });
    },
    [getDriverTripRevenueSummary, showDialog],
  );

  const resolveCompletedTripDistanceMeters = useCallback(
    (completedTrip?: Trip | null) => {
      if (!tripArrivalCoordinate) {
        return undefined;
      }

      const tripLocationCoordinate = normalizeTripMapCoordinate(
        completedTrip?.currentLocation?.coordinates?.[1],
        completedTrip?.currentLocation?.coordinates?.[0],
      );
      const driverLocationCoordinate = normalizeDriverLocationObject(
        currentLocationRef.current,
      );
      const driverCoordinate =
        tripLocationCoordinate ??
        (driverLocationCoordinate
          ? {
              latitude: driverLocationCoordinate.coords.latitude,
              longitude: driverLocationCoordinate.coords.longitude,
            }
          : null) ??
        lastAcceptedDriverCoordinateRef.current;

      if (!driverCoordinate) {
        return undefined;
      }

      const distanceMeters = calculateDistanceMeters(
        driverCoordinate,
        tripArrivalCoordinate,
      );
      return Number.isFinite(distanceMeters)
        ? Math.max(1, Math.round(distanceMeters))
        : undefined;
    },
    [tripArrivalCoordinate],
  );

  const presentCompletedTripFromServerSync = useCallback(
    (
      completedTrip?: Trip | null,
      options: { completedWhileAppInactive?: boolean } = {},
    ) => {
      if (!tripId || completedTrip?.status !== 'completed') {
        return false;
      }

      void stopDriverBackgroundLocationTracking(tripId);
      presentTripDestinationNotice(
        {
          type: 'driver_arrived_destination',
          tripId,
          distanceMeters: resolveCompletedTripDistanceMeters(completedTrip),
          detectedAt: completedTrip.completedAt ?? new Date().toISOString(),
        },
        {
          completedWhileAppInactive: options.completedWhileAppInactive,
        },
      );
      completedDuringInactiveCandidateRef.current = false;
      return true;
    },
    [presentTripDestinationNotice, resolveCompletedTripDistanceMeters, tripId],
  );

  const getTripDestinationReferenceRoute = useCallback((): RouteCoordinate[] => {
    if (
      activeNavigationDestination?.kind === 'destination' &&
      routeCoordinatesRef.current.length >= 2
    ) {
      return routeCoordinatesRef.current;
    }

    return [tripDepartureCoordinate, tripArrivalCoordinate].filter(
      (coordinate): coordinate is RouteCoordinate => Boolean(coordinate),
    );
  }, [activeNavigationDestination?.kind, tripArrivalCoordinate, tripDepartureCoordinate]);

  const tryCompleteTripFromNavigation = useCallback(
    (
      distanceMeters?: number,
      options: {
        completedWhileAppInactive?: boolean;
      } = {},
    ) => {
      if (!tripId || autoCompletingTripRef.current || trip?.status !== 'ongoing') {
        return;
      }

      const complete = async () => {
        await completeTrip(tripId).unwrap();
        return true;
      };

      autoCompletingTripRef.current = true;
      void complete()
        .then((didComplete) => {
          if (!didComplete) {
            return;
          }

          void stopDriverBackgroundLocationTracking(tripId);
          presentTripDestinationNotice({
            type: 'driver_arrived_destination',
            tripId,
            distanceMeters,
            detectedAt: new Date().toISOString(),
          }, {
            completedWhileAppInactive: options.completedWhileAppInactive,
          });
          completedDuringInactiveCandidateRef.current = false;
          refetchTrip();
          refetchBookings();
        })
        .catch((error) => {
          console.warn('[Navigation] Finalisation automatique du trajet non persistée:', error);
        })
        .finally(() => {
          autoCompletingTripRef.current = false;
        });
    },
    [
      completeTrip,
      presentTripDestinationNotice,
      refetchBookings,
      refetchTrip,
      trip?.status,
      tripId,
    ],
  );

  const checkTripCompletionFromRestOnForeground = useCallback(async () => {
    if (
      !tripId ||
      trip?.status !== 'ongoing' ||
      !tripArrivalCoordinate ||
      isRestCompletionCheckRunningRef.current
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastRestCompletionCheckAtRef.current < 5000) {
      return;
    }

    isRestCompletionCheckRunningRef.current = true;
    lastRestCompletionCheckAtRef.current = now;

    try {
      const [tripResult, bookingsResult] = await Promise.all([
        refetchTrip(),
        refetchBookings(),
      ]);
      const refreshedTrip = (tripResult as { data?: Trip }).data ?? trip;
      const refreshedBookings = (bookingsResult as { data?: Booking[] }).data;
      if (refreshedBookings) {
        bookingsRef.current = refreshedBookings;
      }

      if (refreshedTrip?.status === 'completed') {
        presentCompletedTripFromServerSync(refreshedTrip, {
          completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
        });
        return;
      }

      if (refreshedTrip?.status !== 'ongoing') {
        return;
      }

      const completionCandidates: Array<{
        source: 'rest' | 'device';
        coordinate: RouteCoordinate;
        timestampMs: number;
        location?: Location.LocationObject | null;
      }> = [];
      const previousAcceptedTimestamp = lastAcceptedDriverTimestampRef.current ?? 0;

      try {
        const restLocationSnapshot = await getDriverLocationSnapshot(tripId, false).unwrap();
        const restCoordinate = normalizeTripMapCoordinate(
          restLocationSnapshot.coordinates?.[1],
          restLocationSnapshot.coordinates?.[0],
        );
        const restTimestamp = restLocationSnapshot.updatedAt
          ? new Date(restLocationSnapshot.updatedAt).getTime()
          : now;

        if (
          restCoordinate &&
          Number.isFinite(restTimestamp) &&
          restTimestamp + 2000 >= previousAcceptedTimestamp
        ) {
          completionCandidates.push({
            source: 'rest',
            coordinate: restCoordinate,
            timestampMs: restTimestamp,
          });
        }
      } catch (error) {
        console.warn('[Navigation] Position REST du conducteur indisponible au retour dans l’app :', error);
      }

      let location: Location.LocationObject | null = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch {
        location = await Location.getLastKnownPositionAsync({
          maxAge: 15 * 60_000,
          requiredAccuracy: MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
        });
      }

      if (!isMountedRef.current) {
        return;
      }

      const normalizedLocation = normalizeDriverLocationObject(location);
      if (normalizedLocation) {
        const accuracy = normalizedLocation.coords.accuracy;
        if (
          typeof accuracy !== 'number' ||
          !Number.isFinite(accuracy) ||
          accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_METERS
        ) {
          const locationTimestamp = Number(normalizedLocation.timestamp);
          const safeLocationTimestamp = Number.isFinite(locationTimestamp)
            ? locationTimestamp
            : now;
          if (safeLocationTimestamp + 2000 >= previousAcceptedTimestamp) {
            completionCandidates.push({
              source: 'device',
              coordinate: {
                latitude: normalizedLocation.coords.latitude,
                longitude: normalizedLocation.coords.longitude,
              },
              timestampMs: safeLocationTimestamp,
              location: normalizedLocation,
            });
          }
        }
      }

      if (completionCandidates.length === 0) {
        return;
      }

      const orderedCandidates = completionCandidates.sort(
        (a, b) => a.timestampMs - b.timestampMs,
      );
      const firstCandidate = orderedCandidates[0];
      let previousDriverCoordinate =
        lastTripCompletionCheckCoordinateRef.current ??
        lastAcceptedDriverCoordinateRef.current;
      let nearDestinationSinceMs = tripDestinationNearSinceMsRef.current;
      let completionDistanceMeters: number | null = null;
      const destinationReferenceRoute = getTripDestinationReferenceRoute();

      for (const candidate of orderedCandidates) {
        const passage = evaluateDestinationPassage({
          destinationCoordinate: tripArrivalCoordinate,
          driverCoordinate: candidate.coordinate,
          previousDriverCoordinate,
          routeCoordinates: destinationReferenceRoute,
          directDistanceThresholdMeters: DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
          parallelDistanceThresholdMeters: DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
        });
        const dwellEvaluation = evaluateDestinationAutoComplete({
          destinationCoordinate: tripArrivalCoordinate,
          driverCoordinate: candidate.coordinate,
          nearDestinationSinceMs,
          nowMs: candidate.timestampMs,
        });

        nearDestinationSinceMs = dwellEvaluation.nearDestinationSinceMs;
        previousDriverCoordinate = candidate.coordinate;

        if (passage.shouldComplete || dwellEvaluation.shouldComplete) {
          completionDistanceMeters = Math.round(
            passage.distanceMeters ?? dwellEvaluation.distanceMeters ?? 0,
          );
          break;
        }
      }

      tripDestinationNearSinceMsRef.current = nearDestinationSinceMs;
      const latestCandidate = orderedCandidates[orderedCandidates.length - 1] ?? firstCandidate;
      lastAcceptedDriverCoordinateRef.current = latestCandidate.coordinate;
      lastAcceptedDriverTimestampRef.current = latestCandidate.timestampMs;
      lastTripCompletionCheckCoordinateRef.current = latestCandidate.coordinate;

      if (latestCandidate.location) {
        currentLocationRef.current = latestCandidate.location;
        setCurrentLocation(latestCandidate.location);
      }

      if (latestCandidate.source === 'device') {
        const location = latestCandidate.location;
        await updateDriverLocation({
          tripId,
          coordinates: [
            latestCandidate.coordinate.longitude,
            latestCandidate.coordinate.latitude,
          ],
          ...(location &&
          typeof location.coords.accuracy === 'number' &&
          location.coords.accuracy >= 0
            ? { accuracy: location.coords.accuracy }
            : {}),
          ...(location && typeof location.coords.speed === 'number' && location.coords.speed >= 0
            ? { speed: location.coords.speed }
            : {}),
          ...(location &&
          typeof location.coords.heading === 'number' &&
          location.coords.heading >= 0
            ? { heading: location.coords.heading }
            : {}),
          ...(location && Number.isFinite(location.timestamp)
            ? { recordedAt: new Date(location.timestamp).toISOString() }
            : {}),
        })
          .unwrap()
          .catch((error) => {
            console.warn('[Navigation] Position REST retour app non envoyée:', error);
          });
      }

      if (completionDistanceMeters !== null) {
        tryCompleteTripFromNavigation(completionDistanceMeters, {
          completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
        });
      }
    } catch (error) {
      console.warn('[Navigation] Vérification REST de fin de trajet impossible:', error);
    } finally {
      if (appStateRef.current === 'active') {
        completedDuringInactiveCandidateRef.current = false;
      }
      isRestCompletionCheckRunningRef.current = false;
    }
  }, [
    getDriverLocationSnapshot,
    getTripDestinationReferenceRoute,
    presentCompletedTripFromServerSync,
    refetchBookings,
    refetchTrip,
    trip,
    tripArrivalCoordinate,
    tripId,
    tryCompleteTripFromNavigation,
    updateDriverLocation,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (nextState === 'background' || nextState === 'inactive') &&
        isTripOngoingRef.current
      ) {
        completedDuringInactiveCandidateRef.current = true;
      }

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        void checkTripCompletionFromRestOnForeground();
        if (tripId) {
          void trackingSocket.resumeBoardingDetection(tripId).catch((error) => {
            console.warn('[Navigation] Reprise détection embarquement impossible:', error);
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkTripCompletionFromRestOnForeground, tripId]);

  useEffect(() => {
    if (!isTripOngoing || !tripArrivalCoordinate) {
      return;
    }

    void checkTripCompletionFromRestOnForeground();
  }, [checkTripCompletionFromRestOnForeground, isTripOngoing, tripArrivalCoordinate]);

  useEffect(() => {
    const previousStatus = previousTripStatusRef.current;
    const currentStatus = trip?.status ?? null;

    if (previousStatus === 'ongoing' && currentStatus === 'completed' && trip) {
      presentCompletedTripFromServerSync(trip, {
        completedWhileAppInactive: completedDuringInactiveCandidateRef.current,
      });
    }

    previousTripStatusRef.current = currentStatus;
  }, [presentCompletedTripFromServerSync, trip]);

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

  // Connexion WebSocket pour le tracking temps réel
  useEffect(() => {
    if (!tripId || !isTripOngoing) {
      setIsSocketConnected(false);
      return;
    }

    let isCancelled = false;
    setLivePassengerLocations({});

    // Rejoindre la room du trip pour le tracking temps réel
    trackingSocket
      .joinTrip(tripId)
      .then(() => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(true);
        void trackingSocket.requestPassengerLocations(tripId);
        console.log('[Navigation] Connecté au suivi en temps réel');
      })
      .catch((error) => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(false);
        console.warn('[Navigation] Connexion tracking impossible:', error);
      });

    // Écouter les erreurs WebSocket
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      if (!isMountedRef.current || isCancelled) return;
      setIsSocketConnected(false);
      console.warn('[Navigation] Erreur tracking:', message);
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (!isMountedRef.current || isCancelled || payload.tripId !== tripId) return;
      if (payload.events.length > 0) {
        const hasTripDestinationEvent = payload.events.some(
          (event) => event.type === 'driver_arrived_destination',
        );

        payload.events.forEach((event) => {
          if (event.type === 'driver_near_destination' || event.type === 'driver_arrived_destination') {
            presentTripDestinationNotice(event);
            return;
          }

          if (!event.bookingId) {
            return;
          }

          if (event.type === 'passenger_no_show') {
            const passengerName = getPassengerNameForBooking(event.bookingId);
            const currentNotice = pickupNoticeRef.current;
            if (currentNotice?.waypoint.booking.id === event.bookingId) {
              pickupNoticeRef.current = null;
              setPickupNotice(null);
              setPickupNoticeCountdown(null);
            }
            showDialog({
              variant: 'info',
              icon: 'person-remove',
              title: 'Passager non embarqué',
              message: `${passengerName} n'a pas été détecté à bord après le délai d'attente. La réservation est clôturée sans paiement.`,
            });
            return;
          }

          if (event.type === 'passenger_boarding_uncertain') {
            const passengerName = getPassengerNameForBooking(event.bookingId);
            const currentNotice = pickupNoticeRef.current;
            if (currentNotice?.waypoint.booking.id === event.bookingId) {
              pickupNoticeRef.current = null;
              setPickupNotice(null);
              setPickupNoticeCountdown(null);
            }
            showDialog({
              variant: 'warning',
              icon: 'help-circle',
              title: 'Embarquement non confirmé',
              message: `Le trajet est arrivé à destination sans preuve GPS suffisante de l'embarquement de ${passengerName}. La réservation est clôturée sans paiement.`,
            });
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

          if (event.type === 'passenger_near_destination') {
            const waypoint = waypointsRef.current.find(
              (item) => item.booking.id === event.bookingId && item.type === 'dropoff',
            );
            presentPassengerDestinationApproachNotice(event, waypoint ?? null);
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
        const passengerLiveLocation = {
          coordinate,
          updatedAt: payload.updatedAt,
        };

        if (!isFreshLivePassengerLocation(passengerLiveLocation)) {
          console.warn('[DriverNavigation] Position passager ignoree car trop ancienne:', {
            bookingId: payload.bookingId,
            updatedAt: payload.updatedAt,
          });
          return;
        }

        if (!isCoordinateAllowedForNavigationRoute(coordinate, isKinshasaNavigationTrip)) {
          console.warn('[DriverNavigation] Position passager live hors Kinshasa ignoree:', {
            bookingId: payload.bookingId,
            coordinate,
          });
          return;
        }

        setLivePassengerLocations((current) => ({
          ...current,
          [payload.bookingId]: passengerLiveLocation,
        }));
      },
    );

    const passengerLocationsRefreshInterval = setInterval(() => {
      void trackingSocket.requestPassengerLocations(tripId);
    }, 10000);

    return () => {
      isCancelled = true;
      // Quitter le canal et se déconnecter proprement
      trackingSocket.leaveTrip(tripId);
      unsubscribeError();
      unsubscribeAutoProgress();
      unsubscribePassengerLocation();
      clearInterval(passengerLocationsRefreshInterval);
      currentLocationRef.current = null;

      console.log('[Navigation] Déconnecté et mémoire nettoyée');
    };
  }, [
    isTripOngoing,
    isKinshasaNavigationTrip,
    getPassengerNameForBooking,
    presentPassengerBoardedNotice,
    presentPassengerDestinationApproachNotice,
    presentPassengerDestinationNotice,
    presentPickupNotice,
    presentTripDestinationNotice,
    refetchBookings,
    refetchTrip,
    showDialog,
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
        const safePassengerPickupCoordinate = isCoordinateAllowedForNavigationRoute(
          passengerPickupCoordinate,
          isKinshasaNavigationTrip,
        )
          ? passengerPickupCoordinate
          : null;
        if (isKinshasaNavigationTrip && passengerPickupCoordinate && !safePassengerPickupCoordinate) {
          console.warn('[DriverNavigation] Pickup waypoint passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerPickupCoordinate,
            origin: booking.passengerOrigin,
          });
        }
        const pickupLocation = {
          lat: safePassengerPickupCoordinate?.latitude ?? tripDepartureCoordinate!.latitude,
          lng: safePassengerPickupCoordinate?.longitude ?? tripDepartureCoordinate!.longitude,
        };
        const pickupAddress = getBookingPickupLabel(booking, trip);
        waypointsList.push({
          id: `pickup-${booking.id}`,
          type: 'pickup',
          location: pickupLocation,
          address: pickupAddress,
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: hasBookingPickupCompleted(booking),
        });

        // Point d'arrivée du passager (destination personnalisée ou arrivée du trip)
        const passengerDestinationCoordinate = getBookingDropoffCoordinate(
          booking,
          tripArrivalCoordinate,
        );
        let dropoffLocation = {
          lat: passengerDestinationCoordinate?.latitude ?? tripArrivalCoordinate!.latitude,
          lng: passengerDestinationCoordinate?.longitude ?? tripArrivalCoordinate!.longitude,
        };
        const safePassengerDestinationCoordinate = isCoordinateAllowedForNavigationRoute(
          passengerDestinationCoordinate,
          isKinshasaNavigationTrip,
        )
          ? passengerDestinationCoordinate
          : null;
        if (
          isKinshasaNavigationTrip &&
          passengerDestinationCoordinate &&
          !safePassengerDestinationCoordinate
        ) {
          console.warn('[DriverNavigation] Dropoff waypoint passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerDestinationCoordinate,
            destination: booking.passengerDestination,
          });
        }

        if (safePassengerDestinationCoordinate) {
          dropoffLocation = { 
            lat: safePassengerDestinationCoordinate.latitude,
            lng: safePassengerDestinationCoordinate.longitude,
          };
        } else {
          dropoffLocation = {
            lat: tripArrivalCoordinate!.latitude,
            lng: tripArrivalCoordinate!.longitude,
          };
        }
        const dropoffAddress = getBookingDropoffLabel(booking, trip);
        waypointsList.push({
          id: `dropoff-${booking.id}`,
          type: 'dropoff',
          location: dropoffLocation,
          address: dropoffAddress,
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: hasBookingDropoffCompleted(booking),
        });
      } catch (error) {
        console.log('Erreur création waypoint pour booking:', booking.id, error);
      }
    });

    console.log('[DriverNavigation] navigation waypoints', {
      tripId,
      isKinshasaNavigationTrip,
      count: waypointsList.length,
      waypoints: waypointsList.map((waypoint) => ({
        id: waypoint.id,
        type: waypoint.type,
        completed: waypoint.completed,
        bookingId: waypoint.booking.id,
        coordinate: waypoint.location,
      })),
    });

    waypointsRef.current = waypointsList;
    setWaypoints(waypointsList);

    // Trouver le prochain waypoint non complété
    const nextIncompleteIndex = waypointsList.findIndex((wp) => {
      const isSkippedPickupBooking =
        skippedPickupBookingIds.has(wp.booking.id) &&
        !hasBookingPickupCompleted(wp.booking);
      return !wp.completed && !isSkippedPickupBooking;
    });
    if (nextIncompleteIndex !== -1) {
      currentWaypointIndexRef.current = nextIncompleteIndex;
      setCurrentWaypointIndex(nextIncompleteIndex);
    } else {
      currentWaypointIndexRef.current = waypointsList.length;
      setCurrentWaypointIndex(waypointsList.length);
    }
  }, [
    bookings,
    isKinshasaNavigationTrip,
    skippedPickupBookingIds,
    trip,
    tripArrivalCoordinate,
    tripDepartureCoordinate,
    tripId,
  ]);

  useEffect(() => {
    if (!bookings) {
      return;
    }

    const activeSkippedIds = new Set(
      bookings
        .filter(
          (booking) =>
            booking.status === 'accepted' &&
            !hasBookingPickupCompleted(booking) &&
            !hasBookingDropoffCompleted(booking),
        )
        .map((booking) => booking.id),
    );

    setSkippedPickupBookingIds((current) => {
      const next = new Set(
        Array.from(current).filter((bookingId) =>
          activeSkippedIds.has(bookingId),
        ),
      );

      if (
        next.size === current.size &&
        Array.from(current).every((bookingId) => next.has(bookingId))
      ) {
        return current;
      }

      skippedPickupBookingIdsRef.current = next;
      return next;
    });

    const bookingIds = new Set(bookings.map((booking) => booking.id));
    Array.from(pickupClosestDistanceMetersRef.current.keys()).forEach(
      (bookingId) => {
        if (!bookingIds.has(bookingId)) {
          pickupClosestDistanceMetersRef.current.delete(bookingId);
        }
      },
    );
  }, [bookings]);

  useEffect(() => {
    const currentNotice = pickupNoticeRef.current;
    if (currentNotice) {
      const latestBooking = bookings?.find(
        (booking) => booking.id === currentNotice.waypoint.booking.id,
      );

      if (
        !latestBooking ||
        hasBookingPickupCompleted(latestBooking) ||
        hasBookingDropoffCompleted(latestBooking)
      ) {
        pickupNoticeRef.current = null;
        setPickupNotice(null);
        setPickupNoticeCountdown(null);
      }
    }

    if (activeWaypoint) {
      const latestBooking = bookings?.find(
        (booking) => booking.id === activeWaypoint.booking.id,
      );
      const isCompleted =
        activeWaypoint.type === 'pickup'
          ? hasBookingPickupCompleted(latestBooking)
          : hasBookingDropoffCompleted(latestBooking);

      if (!latestBooking || isCompleted) {
        waypointModalVisibleRef.current = false;
        setWaypointModalVisible(false);
        setActiveWaypoint(null);
      }
    }
  }, [activeWaypoint, bookings]);

  const sendDriverLocationToTracking = useCallback(
    (location: Location.LocationObject) => {
      if (!tripId || (!isTripOngoing && !isTripOngoingRef.current)) {
        return;
      }

      const coordinate = normalizeTripMapCoordinate(
        location.coords.latitude,
        location.coords.longitude,
      );
      if (!coordinate) {
        console.warn('[Navigation] Position conducteur non envoyée car invalide:', {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        return;
      }

      const coordinates: [number, number] = [
        coordinate.longitude,
        coordinate.latitude,
      ];
      const metadata = {
        ...(typeof location.coords.accuracy === 'number' && location.coords.accuracy >= 0
          ? { accuracy: location.coords.accuracy }
          : {}),
        ...(typeof location.coords.speed === 'number' && location.coords.speed >= 0
          ? { speed: location.coords.speed }
          : {}),
        ...(typeof location.coords.heading === 'number' && location.coords.heading >= 0
          ? { heading: location.coords.heading }
          : {}),
        ...(Number.isFinite(location.timestamp)
          ? { recordedAt: new Date(location.timestamp).toISOString() }
          : {}),
      };

      if (!isFreshLocationObject(location)) {
        return;
      }

      const now = Date.now();
      if (now - lastBackgroundCheckpointAtRef.current > 10_000) {
        lastBackgroundCheckpointAtRef.current = now;
        void updateDriverBackgroundLocationCheckpoint(tripId, coordinate);
      }

      void trackingSocket
        .updateDriverLocation(tripId, coordinates, metadata)
        .catch((error) => {
          console.warn('[Navigation] Position conducteur socket non envoyée:', error);
          void updateDriverLocation({ tripId, coordinates, ...metadata })
            .unwrap()
            .catch((fallbackError) => {
              console.warn(
                '[Navigation] Position conducteur REST non envoyée:',
                fallbackError,
              );
            });
        });
    },
    [isTripOngoing, tripId, updateDriverLocation],
  );

  // Demander les permissions de localisation
  useEffect(() => {
    if (!tripId || !isTripOngoing) {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      tripDestinationNearSinceMsRef.current = null;
      if (tripId) {
        void stopDriverBackgroundLocationTracking(tripId);
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
                console.log('Permission de localisation en arrière-plan non accordee - mode premier plan uniquement');
              }
            } else {
              console.log('Autorisation d’arrière-plan refusée par l’utilisateur : mode premier plan uniquement');
            }
          }
        } catch (bgError) {
          // La permission de localisation en arrière-plan n'est pas disponible/configuree
          console.log('Localisation en arrière-plan non disponible:', bgError);
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

        void startDriverBackgroundLocationTracking(tripId, {
          arrivalCoordinate: tripArrivalCoordinate,
          autoCompleteDistanceMeters: DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
          autoCompleteDwellMs: DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
          requestMissingPermissions: false,
        });

        // Obtenir la position initiale (avec fallback)
        let location: Location.LocationObject | null = null;
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch {
          location = await Location.getLastKnownPositionAsync({
            maxAge: FRESH_DRIVER_LOCATION_MAX_AGE_MS,
            requiredAccuracy: 100,
          });
        }
        if (!isMountedRef.current) return;

        const normalizedInitialLocation = normalizeDriverLocationObject(location);
        if (isFreshLocationObject(normalizedInitialLocation)) {
          const initialCoordinate = {
            latitude: normalizedInitialLocation.coords.latitude,
            longitude: normalizedInitialLocation.coords.longitude,
          };
          const initialTimestamp = Number(normalizedInitialLocation.timestamp);
          lastAcceptedDriverCoordinateRef.current = initialCoordinate;
          lastAcceptedDriverTimestampRef.current = Number.isFinite(initialTimestamp)
            ? initialTimestamp
            : Date.now();
          currentLocationRef.current = normalizedInitialLocation;
          setCurrentLocation(normalizedInitialLocation);
          driverPosition.setValue({
            latitude: initialCoordinate.latitude,
            longitude: initialCoordinate.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
          });
          sendDriverLocationToTracking(normalizedInitialLocation);
          if (!hasFetchedInitialDriverRouteRef.current) {
            hasFetchedInitialDriverRouteRef.current = true;
            void fetchRouteRef.current?.({
              originOverride: initialCoordinate,
              fitToRoute: true,
            });
          }
        } else {
          console.warn('[Navigation] Position initiale indisponible, en attente du GPS');
        }

      // Variables pour throttling des mises à jour (optimisé pour éviter les crashs)
      let lastStateUpdateTime = 0;
      let lastBackendUpdateTime = 0;
      let lastStepCheckTime = 0;
      const STATE_UPDATE_INTERVAL = DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS; // Mise à jour du state toutes les 3 secondes
      const BACKEND_UPDATE_INTERVAL = DRIVER_LOCATION_BACKEND_UPDATE_INTERVAL_MS; // Mise à jour WebSocket toutes les 3 secondes
      const STEP_CHECK_INTERVAL = 5000; // Vérification étapes toutes les 5 secondes

      // S'abonner aux mises à jour de localisation (fréquence réduite pour stabilité)
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High, // Équilibre entre précision et batterie
          timeInterval: DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS, // GPS update toutes les 3 secondes
          distanceInterval: 5, // Ou tous les 5 mètres
        },
        (newLocation) => {
          if (!isMountedRef.current) return;
          const now = Date.now();
          const normalizedLocation = normalizeDriverLocationObject(newLocation);
          if (!normalizedLocation) {
            console.warn('[Navigation] Position du conducteur ignorée car invalide :', {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
            });
            return;
          }

          if (
            currentLocationRef.current &&
            typeof normalizedLocation.coords.accuracy === 'number' &&
            normalizedLocation.coords.accuracy > 80
          ) {
            return;
          }

          currentLocationRef.current = normalizedLocation;
          const rawCoordinate = {
            latitude: normalizedLocation.coords.latitude,
            longitude: normalizedLocation.coords.longitude,
          };
          if (!isFreshLocationObject(normalizedLocation)) {
            return;
          }

          const locationTimestamp = Number(normalizedLocation.timestamp);
          const acceptedTimestamp = Number.isFinite(locationTimestamp)
            ? locationTimestamp
            : now;
          if (
            !isPlausibleLocationUpdate({
              previous: lastAcceptedDriverCoordinateRef.current,
              current: rawCoordinate,
              previousTimestamp: lastAcceptedDriverTimestampRef.current,
              currentTimestamp: acceptedTimestamp,
              maxJumpMeters: MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
            })
          ) {
            console.warn('[Navigation] Position du conducteur ignorée : saut GPS incohérent');
            return;
          }

          lastAcceptedDriverCoordinateRef.current = rawCoordinate;
          lastAcceptedDriverTimestampRef.current = acceptedTimestamp;

          if (!hasFetchedInitialDriverRouteRef.current) {
            hasFetchedInitialDriverRouteRef.current = true;
            void fetchRouteRef.current?.({
              originOverride: rawCoordinate,
              fitToRoute: !routeFetchedRef.current,
            });
          }
          const routeAlignment = getRouteAlignedPosition(
            rawCoordinate,
            routeCoordinatesRef.current,
            OFF_ROUTE_DISTANCE_KM,
          );
          const distanceFromRouteMeters = distanceFromCoordinateToPolyline(
            rawCoordinate,
            routeCoordinatesRef.current,
          );
          const gpsAccuracy =
            typeof normalizedLocation.coords.accuracy === 'number'
              ? normalizedLocation.coords.accuracy
              : null;
          const hasReliableOffRouteSignal =
            gpsAccuracy === null || gpsAccuracy <= OFF_ROUTE_MAX_ACCURACY_METERS;
          const hasRouteForReroute =
            isTripOngoingRef.current &&
            routeFetchedRef.current &&
            routeCoordinatesRef.current.length >= OFF_ROUTE_MIN_ROUTE_POINTS;
          const isOffRoute =
            hasRouteForReroute &&
            hasReliableOffRouteSignal &&
            typeof distanceFromRouteMeters === 'number' &&
            distanceFromRouteMeters > DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS;

          offRouteSampleCountRef.current = isOffRoute
            ? offRouteSampleCountRef.current + 1
            : 0;

          if (
            isRouteDeviationConfirmed({
              distanceFromRouteMeters,
              gpsAccuracyMeters: gpsAccuracy,
              consecutiveOffRouteCount: offRouteSampleCountRef.current,
              nowMs: now,
              lastRecalculationAtMs: lastOffRouteRerouteAtRef.current,
              routeDeviationThresholdMeters:
                DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS,
              confirmationCount: DRIVER_REROUTE_CONFIRMATION_COUNT,
              minRecalculationIntervalMs: DRIVER_REROUTE_MIN_INTERVAL_MS,
            }) &&
            !isReroutingRef.current
          ) {
            const routeFetcher = fetchRouteRef.current;
            if (routeFetcher) {
              lastOffRouteRerouteAtRef.current = now;
              offRouteSampleCountRef.current = 0;
              isReroutingRef.current = true;
              void routeFetcher({
                originOverride: rawCoordinate,
                announceReroute: true,
                fitToRoute: false,
              }).finally(() => {
                isReroutingRef.current = false;
              });
            }
          }

          const displayedCoordinate = rawCoordinate;

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
            normalizedLocation.coords.heading !== null &&
            normalizedLocation.coords.heading !== -1 &&
            (normalizedLocation.coords.speed ?? 0) > 0.8
              ? normalizeHeading(normalizedLocation.coords.heading)
              : null;
          const alignedHeading = routeAlignment?.heading ?? gpsHeading;
          evaluatePickupBypassRef.current?.(rawCoordinate, gpsHeading);

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
            setCurrentLocation(normalizedLocation);
          }

          // Mettre à jour la position du conducteur via WebSocket (throttled)
          if (tripId && isTripOngoingRef.current && now - lastBackendUpdateTime > BACKEND_UPDATE_INTERVAL) {
            lastBackendUpdateTime = now;
            sendDriverLocationToTracking(normalizedLocation);
          }

          // NOTE: Animation de caméra désactivée pour éviter les crashs mémoire
          // L'utilisateur peut recentrer manuellement avec le bouton

          // Calculer la distance à chaque étape (throttled)
          if (now - lastStepCheckTime > STEP_CHECK_INTERVAL) {
            lastStepCheckTime = now;
            updateCurrentStep(normalizedLocation);
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
  }, [
    tripId,
    isTripOngoing,
    navigateBackSafely,
    sendDriverLocationToTracking,
    tripArrivalCoordinate,
  ]);

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
  const getFreshDriverCoordinate = useCallback((): RouteCoordinate | null => {
    const location = currentLocationRef.current;
    if (!isFreshLocationObject(location)) {
      return null;
    }

    return normalizeTripMapCoordinate(
      location.coords.latitude,
      location.coords.longitude,
    );
  }, []);

  const routeSignature = useMemo(() => {
    if (!trip || !tripDepartureCoordinate || !activeRouteDestination) {
      return '';
    }

    const waypointSignature = waypoints
      .map((waypoint) =>
        [
          waypoint.id,
          waypoint.completed ? '1' : '0',
          waypoint.location.lat.toFixed(6),
          waypoint.location.lng.toFixed(6),
        ].join(':'),
      )
      .join('|');

    return [
      trip.id,
      trip.status,
      tripDepartureCoordinate.latitude.toFixed(6),
      tripDepartureCoordinate.longitude.toFixed(6),
      activeNavigationDestination?.id ?? 'trip-destination',
      activeRouteDestination.latitude.toFixed(6),
      activeRouteDestination.longitude.toFixed(6),
      waypointSignature,
    ].join('|');
  }, [
    activeNavigationDestination?.id,
    activeRouteDestination,
    trip,
    tripDepartureCoordinate,
    waypoints,
  ]);

  useEffect(() => {
    if (!trip || !tripDepartureCoordinate || !activeRouteDestination || !routeSignature) {
      return;
    }

    const signatureChanged = routeSignatureRef.current !== routeSignature;
    
    // Ne fetch que si:
    // 1. On a un trip avec départ/arrivée publies
    // 2. ET (le route n'a jamais été fetch OU les waypoints ont changé)
    // 3. ET au moins 30 secondes se sont écoulées depuis le dernier fetch
    if (!signatureChanged && routeFetchedRef.current) {
      return;
    }

    routeSignatureRef.current = routeSignature;
    const originOverride = isTripOngoing ? getFreshDriverCoordinate() ?? undefined : undefined;
    void fetchRouteRef.current?.({ originOverride });
  }, [
    getFreshDriverCoordinate,
    isTripOngoing,
    routeSignature,
    trip,
    activeRouteDestination,
    tripDepartureCoordinate,
  ]);

  const fetchRoute = async (options: FetchRouteOptions = {}) => {
    if (!trip || !tripDepartureCoordinate || !activeRouteDestination || !isMountedRef.current) return;

    let routeOrigin = options.originOverride ?? tripDepartureCoordinate;
    let routeDestination = activeRouteDestination;
    if (isKinshasaNavigationTrip && !isCoordinateInKinshasaBounds(routeOrigin)) {
      console.warn('[DriverNavigation] Origine Directions hors Kinshasa ignoree:', {
        tripId,
        origin: routeOrigin,
        fallback: tripDepartureCoordinate,
      });
      routeOrigin = tripDepartureCoordinate;
    }
    if (
      isKinshasaNavigationTrip &&
      tripArrivalCoordinate &&
      !isCoordinateInKinshasaBounds(routeDestination)
    ) {
      console.warn('[DriverNavigation] Destination Directions hors Kinshasa ignoree:', {
        tripId,
        activeDestination: activeNavigationDestination,
        destination: routeDestination,
        fallback: tripArrivalCoordinate,
      });
      routeDestination = tripArrivalCoordinate;
    }

    const safeRouteOrigin = getSafeMapCoordinate(routeOrigin);
    const safeRouteDestination = getSafeMapCoordinate(routeDestination);
    if (!safeRouteOrigin || !safeRouteDestination) {
      console.warn('[DriverNavigation] Directions ignorees: coordonnées invalides', {
        tripId,
        origin: routeOrigin,
        destination: routeDestination,
      });
      return;
    }
    routeOrigin = safeRouteOrigin;
    routeDestination = safeRouteDestination;

    const shouldFitToRoute = options.fitToRoute ?? true;
    const directDistanceKm = calculateDistance(routeOrigin, routeDestination);
    const directDistanceMeters = directDistanceKm * 1000;

    console.log('[DriverNavigation] Directions request coordinates', {
      tripId,
      isKinshasaNavigationTrip,
      activeDestination: activeNavigationDestination,
      origin: routeOrigin,
      destination: routeDestination,
      directDistanceKm: Number(directDistanceKm.toFixed(2)),
    });

    const buildFallbackRoute = () => {
      return getSafeMapCoordinateList([routeOrigin, routeDestination]);
    };

    routeFetchedRef.current = true;
    lastRouteFetchTimeRef.current = Date.now();
    setIsLoadingRoute(true);
    setIsReroutingRoute(Boolean(options.announceReroute));

    try {
      // Construire les waypoints non complétés pour l'API backend
      // Appel à l'API backend optimisée
      const data = await getDirections({
        origin: {
          lat: routeOrigin.latitude,
          lng: routeOrigin.longitude,
        },
        destination: {
          lat: routeDestination.latitude,
          lng: routeDestination.longitude,
        },
        mode: TravelMode.DRIVING,
        optimizeWaypoints: false,
        language: 'fr',
      }).unwrap();
      if (!isMountedRef.current) return;

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Décoder le polyline
        const decodedPoints = route.overviewPolyline
          ? decodePolyline(route.overviewPolyline)
          : [];
        const safeDecodedPoints = getSafePolylineCoordinates(decodedPoints);
        const routeCheck =
          safeDecodedPoints.length > 1
            ? trimPolylineFromCurrentPosition(routeOrigin, safeDecodedPoints, routeDestination)
            : null;
        const detailedRoutePoints =
          routeCheck?.isRouteUsable && safeDecodedPoints.length > 1
            ? safeDecodedPoints
            : buildFallbackRoute();
        const shouldSimplifyNearWaypointRoute = shouldUseDirectNearWaypointRoute({
          activeDestinationKind: activeNavigationDestination?.kind,
          directDistanceMeters,
          isTripOngoing,
          routeCoordinates: detailedRoutePoints,
        });
        const points = shouldSimplifyNearWaypointRoute
          ? buildFallbackRoute()
          : detailedRoutePoints;
        setRouteCoordinates(points);

        // Calculer la distance et durée totales
        let totalDist = 0;
        let totalDur = 0;
        if (!shouldSimplifyNearWaypointRoute) {
          route.legs.forEach(leg => {
            totalDist += leg.distance;
            totalDur += leg.duration;
          });
        }

        const fallbackDistanceMeters = calculatePolylineDistanceMeters(points);
        if (shouldSimplifyNearWaypointRoute || !totalDist || !routeCheck?.isRouteUsable) {
          totalDist = fallbackDistanceMeters;
          totalDur = 0;
        }

        setRouteDistanceMeters(totalDist || fallbackDistanceMeters);
        setRouteDurationSeconds(totalDur || null);
        setTotalDistance(`${(totalDist / 1000).toFixed(1)} km`);
        setTotalDuration(totalDur > 0 ? `${Math.round(totalDur / 60)} min` : '--');

        // Convertir et stocker les étapes du leg actuel
        if (!shouldSimplifyNearWaypointRoute && route.legs.length > 0) {
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

          if (options.announceReroute) {
            const nextStep = convertedSteps[0];
            void speakNavigationMessage(
              nextStep
                ? buildInstructionSpeech(nextStep, 'Nouvel itinéraire calculé.')
                : 'Nouvel itinéraire calculé.',
              { force: true },
            );
          }
        } else {
          stepsRef.current = [];
          currentStepIndexRef.current = 0;
          setSteps([]);
          setCurrentStepIndex(0);
          if (shouldSimplifyNearWaypointRoute && options.announceReroute) {
            void speakNavigationMessage(
              "Point proche. Suivez la ligne jusqu'au point indiqué.",
              { force: true },
            );
          }
        }

        // Ajuster la vue de la carte pour afficher tout l'itinéraire
        if (shouldFitToRoute && points.length > 0) {
          focusMapOnCoordinates(
            [
            ...points,
            routeOrigin,
            routeDestination,
            ],
            {
              edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
              logContext: 'route-fetch',
            },
          );
        }
      } else {
        const fallbackPoints = buildFallbackRoute();
        setRouteCoordinates(fallbackPoints);
        setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
        setRouteDurationSeconds(null);
        setTotalDistance('--');
        setTotalDuration('--');
        stepsRef.current = [];
        setSteps([]);
        if (options.announceReroute) {
          void speakNavigationMessage(
            "Nouvel itinéraire simplifié. Suivez la ligne jusqu'à la destination.",
            { force: true },
          );
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
        const fallbackPoints = buildFallbackRoute();
        
        setRouteCoordinates(fallbackPoints);
        setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
        setRouteDurationSeconds(null);
        setTotalDistance('--');
        setTotalDuration('--');
        stepsRef.current = [];
        setSteps([]);
        if (shouldFitToRoute) {
          focusMapOnCoordinates(
            [
            ...fallbackPoints,
            routeOrigin,
            ],
            {
              edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
              logContext: 'route-fallback',
            },
          );
        }
        void speakNavigationMessage(
          "Itinéraire détaillé indisponible. Suivez la ligne jusqu'à la destination.",
          { force: true }
        );
      } else if (isNetworkError) {
        // Erreur réseau - afficher un warning discret
        console.warn('[Navigation] Erreur réseau, nouvelle tentative plus tard');
        if (routeCoordinatesRef.current.length < 2) {
          const fallbackPoints = buildFallbackRoute();
          setRouteCoordinates(fallbackPoints);
          setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
          setRouteDurationSeconds(null);
        }
      } else {
        // Autres erreurs - log seulement
        console.warn('[Navigation] Erreur itinéraire:', error?.data?.message || error?.message || 'Erreur inconnue');
        if (routeCoordinatesRef.current.length < 2) {
          const fallbackPoints = buildFallbackRoute();
          setRouteCoordinates(fallbackPoints);
          setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
          setRouteDurationSeconds(null);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingRoute(false);
        if (options.announceReroute) {
          setIsReroutingRoute(false);
        }
      }
    }
  };

  // Mettre à jour l'étape actuelle en fonction de la position
  fetchRouteRef.current = fetchRoute;

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

        // Si on est à moins de 50 mètres du point de passage, notifier le conducteur.
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
    const previousDriverCoordinate = lastTripCompletionCheckCoordinateRef.current;
    const detectedAt = new Date().toISOString();

    waypoints.forEach((waypoint) => {
      const booking = waypoint.booking;

      if (waypoint.type === 'dropoff') {
        if (!hasBookingPickupCompleted(booking) || hasBookingDropoffCompleted(booking)) {
          return;
        }

        const dropoffCoordinate = {
          latitude: waypoint.location.lat,
          longitude: waypoint.location.lng,
        };
        const driverDropoffDistanceKm = calculateDistance(driverCoordinate, dropoffCoordinate);
        const dropoffPassage = evaluateDestinationPassage({
          destinationCoordinate: dropoffCoordinate,
          driverCoordinate,
          previousDriverCoordinate,
          routeCoordinates:
            activeNavigationDestination?.id === waypoint.id
              ? routeCoordinatesRef.current
              : [tripDepartureCoordinate, dropoffCoordinate].filter(
                  (coordinate): coordinate is RouteCoordinate => Boolean(coordinate),
                ),
          directDistanceThresholdMeters:
            DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
          parallelDistanceThresholdMeters:
            DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
        });

        if (driverDropoffDistanceKm <= DRIVER_DROPOFF_APPROACH_DISTANCE_KM) {
          presentPassengerDestinationApproachNotice(
            {
              type: 'passenger_near_destination',
              bookingId: booking.id,
              tripId,
              passengerId: waypoint.passenger.id,
              distanceMeters: Math.round(driverDropoffDistanceKm * 1000),
              detectedAt,
            },
            waypoint,
          );
        }

        if (dropoffPassage.shouldComplete) {
          presentPassengerDestinationNotice(
            {
              type: 'dropoff_confirmed',
              bookingId: booking.id,
              tripId,
              passengerId: waypoint.passenger.id,
              distanceMeters: Math.round(dropoffPassage.distanceMeters ?? 0),
              detectedAt,
            },
            waypoint,
          );
        }

        return;
      }

      const isPassengerAlreadyPickedUp =
        waypoint.completed || hasBookingPickupCompleted(booking);

      if (
        waypoint.type !== 'pickup' ||
        isPassengerAlreadyPickedUp ||
        hasBookingDropoffCompleted(booking)
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

      const passengerLiveLocation = livePassengerLocations[booking.id];
      if (!isFreshLivePassengerLocation(passengerLiveLocation)) {
        return;
      }
      const passengerLocation = passengerLiveLocation.coordinate;

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

      // La confirmation pickup est decidee par le backend a partir de l'historique Redis.
    });

    if (tripArrivalCoordinate) {
      const driverTripEndDistanceMeters = calculateDistanceMeters(
        driverCoordinate,
        tripArrivalCoordinate,
      );
      const roundedTripEndDistanceMeters = Math.round(driverTripEndDistanceMeters);

      if (driverTripEndDistanceMeters <= DRIVER_TRIP_END_APPROACH_DISTANCE_METERS) {
        presentTripDestinationNotice({
          type: 'driver_near_destination',
          tripId,
          distanceMeters: roundedTripEndDistanceMeters,
          detectedAt,
        });
      }

      const destinationAutoComplete = evaluateDestinationAutoComplete({
        destinationCoordinate: tripArrivalCoordinate,
        driverCoordinate,
        nearDestinationSinceMs: tripDestinationNearSinceMsRef.current,
      });
      const destinationPassage = evaluateDestinationPassage({
        destinationCoordinate: tripArrivalCoordinate,
        driverCoordinate,
        previousDriverCoordinate,
        routeCoordinates: getTripDestinationReferenceRoute(),
        directDistanceThresholdMeters: DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
        parallelDistanceThresholdMeters: DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
      });
      tripDestinationNearSinceMsRef.current =
        destinationAutoComplete.nearDestinationSinceMs;

      if (
        driverTripEndDistanceMeters <= DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS ||
        destinationAutoComplete.shouldComplete ||
        destinationPassage.shouldComplete
      ) {
        tryCompleteTripFromNavigation(roundedTripEndDistanceMeters);
      }
    }

    lastTripCompletionCheckCoordinateRef.current = driverCoordinate;
  }, [
    activeNavigationDestination?.id,
    currentLocation,
    getTripDestinationReferenceRoute,
    isTripOngoing,
    livePassengerLocations,
    presentPassengerDestinationApproachNotice,
    presentPassengerDestinationNotice,
    presentPickupNotice,
    presentTripDestinationNotice,
    tripDepartureCoordinate,
    tripId,
    tripArrivalCoordinate,
    tryCompleteTripFromNavigation,
    waypoints,
  ]);

  // Forcer le recalcul de l'itinéraire
  const forceRecalculateRoute = () => {
    lastRouteFetchTimeRef.current = 0; // Reset le timestamp
    routeFetchedRef.current = false; // Permettre un nouveau fetch
    routeSignatureRef.current = '';
    if (trip && tripDepartureCoordinate && activeRouteDestination) {
      const originOverride = isTripOngoing ? getFreshDriverCoordinate() ?? undefined : undefined;
      fetchRoute({ originOverride });
    }
  };

  const handleAcceptPendingBooking = useCallback(
    async (booking: Booking) => {
      setProcessingBookingId(booking.id);
      try {
        await acceptBooking(booking.id).unwrap();
        lastRouteFetchTimeRef.current = 0;
        routeFetchedRef.current = false;
        await Promise.all([refetchBookings(), refetchTrip()]);
        void speakNavigationMessage(
          `${booking.passengerName || 'Passager'} accepte. Recalcul de l'itinéraire.`,
          { force: true },
        );
      } catch (error: any) {
        showDialog({
          variant: 'danger',
          title: 'Réservation impossible',
          message: getBookingActionErrorMessage(
            error,
            "Impossible d'accepter cette réservation pour le moment.",
          ),
        });
      } finally {
        setProcessingBookingId(null);
      }
    },
    [acceptBooking, refetchBookings, refetchTrip, showDialog, speakNavigationMessage],
  );

  const handleRejectPendingBooking = useCallback(
    async (booking: Booking) => {
      setProcessingBookingId(booking.id);
      try {
        await rejectBooking({
          id: booking.id,
          reason: 'Refus depuis la navigation conducteur',
        }).unwrap();
        await Promise.all([refetchBookings(), refetchTrip()]);
        void speakNavigationMessage(
          `${booking.passengerName || 'Passager'} refuse.`,
          { force: true },
        );
      } catch (error: any) {
        showDialog({
          variant: 'danger',
          title: 'Refus impossible',
          message: getBookingActionErrorMessage(
            error,
            'Impossible de refuser cette réservation pour le moment.',
          ),
        });
      } finally {
        setProcessingBookingId(null);
      }
    },
    [refetchBookings, refetchTrip, rejectBooking, showDialog, speakNavigationMessage],
  );

  const handleConfirmPassengerInterruption = useCallback(
    (booking: Booking) => {
      if (!booking.id || isConfirmingPassengerInterruption) return;

      showDialog({
        variant: 'warning',
        icon: 'walk-outline',
        title: "Confirmer l'arrivée à destination",
        message: `${booking.passengerName || 'Ce passager'} demande à descendre avant sa destination. Confirmer l'interruption de sa participation ?`,
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Confirmer',
            variant: 'primary',
            onPress: async () => {
              setProcessingBookingId(booking.id);
              try {
                await confirmPassengerTripInterruption(booking.id).unwrap();
                routeFetchedRef.current = false;
                routeSignatureRef.current = '';
                await Promise.all([refetchBookings(), refetchTrip()]);
                showDialog({
                  variant: 'success',
                  icon: 'checkmark-circle',
                  title: 'Descente confirmée',
                  message: 'La participation du passager est interrompue.',
                });
              } catch (error: any) {
                const message =
                  error?.data?.message ??
                  error?.error ??
                  "Impossible de confirmer l'interruption.";
                showDialog({
                  variant: 'danger',
                  icon: 'alert-circle',
                  title: 'Confirmation impossible',
                  message: Array.isArray(message) ? message.join('\n') : message,
                });
              } finally {
                setProcessingBookingId(null);
              }
            },
          },
        ],
      });
    },
    [
      confirmPassengerTripInterruption,
      isConfirmingPassengerInterruption,
      refetchBookings,
      refetchTrip,
      showDialog,
    ],
  );

  const handleRejectPassengerInterruption = useCallback(
    (booking: Booking) => {
      if (!booking.id || isRejectingPassengerInterruption) return;

      showDialog({
        variant: 'warning',
        icon: 'close-circle-outline',
        title: 'Refuser la descente',
        message: `Refuser la demande de ${booking.passengerName || 'ce passager'} ?`,
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Refuser',
            variant: 'danger',
            onPress: async () => {
              setProcessingBookingId(booking.id);
              try {
                await rejectPassengerTripInterruption({
                  bookingId: booking.id,
                  reason: 'Refus depuis la navigation conducteur',
                }).unwrap();
                await Promise.all([refetchBookings(), refetchTrip()]);
                showDialog({
                  variant: 'info',
                  icon: 'information-circle',
                  title: 'Demande refusée',
                  message: 'Le passager sera informé du refus.',
                });
              } catch (error: any) {
                const message =
                  error?.data?.message ??
                  error?.error ??
                  "Impossible de refuser l'interruption.";
                showDialog({
                  variant: 'danger',
                  icon: 'alert-circle',
                  title: 'Refus impossible',
                  message: Array.isArray(message) ? message.join('\n') : message,
                });
              } finally {
                setProcessingBookingId(null);
              }
            },
          },
        ],
      });
    },
    [
      isRejectingPassengerInterruption,
      refetchBookings,
      refetchTrip,
      rejectPassengerTripInterruption,
      showDialog,
    ],
  );

  const fitVehicleAndPassengers = useCallback(() => {
    const coordinates = passengerMapLocations.map((passenger) => passenger.coordinate);
    const driverLocation = currentLocationRef.current ?? currentLocation;
    const driverCoordinate = normalizeDriverLocationObject(driverLocation);
    if (driverCoordinate) {
      coordinates.unshift({
        latitude: driverCoordinate.coords.latitude,
        longitude: driverCoordinate.coords.longitude,
      });
    }

    focusMapOnCoordinates(coordinates, {
        edgePadding: { top: 190, right: 56, bottom: 190, left: 56 },
      logContext: 'vehicle-passengers',
    });
  }, [currentLocation, focusMapOnCoordinates, passengerMapLocations]);

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

  const handleRestartTripFromNavigation = useCallback(async () => {
    if (!tripId || isRestartingTrip || isTripFetching) {
      return;
    }

    try {
      await startTrip(tripId).unwrap();
      lastRouteFetchTimeRef.current = 0;
      routeFetchedRef.current = false;
      routeSignatureRef.current = '';
      hasFetchedInitialDriverRouteRef.current = false;
      offRouteSampleCountRef.current = 0;
      lastOffRouteRerouteAtRef.current = 0;
      setRouteCoordinates([]);
      setRouteDistanceMeters(null);
      setRouteDurationSeconds(null);
      setSteps([]);
      setCurrentStepIndex(0);
      await Promise.all([refetchTrip(), refetchBookings()]);
      showDialog({
        variant: 'success',
        icon: 'play-circle',
        title: 'Trajet redémarré',
        message: 'La navigation va reprendre depuis votre position actuelle.',
      });
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible de redémarrer ce trajet.';
      showDialog({
        variant: 'danger',
        icon: 'alert-circle',
        title: 'Redemarrage impossible',
        message,
      });
    }
  }, [
    isRestartingTrip,
    isTripFetching,
    refetchBookings,
    refetchTrip,
    showDialog,
    startTrip,
    tripId,
  ]);

  const pauseTripWithoutPassengerConfirmation = useCallback(async () => {
    if (!tripId) return;

    try {
      await pauseTrip(tripId).unwrap();
      void stopDriverBackgroundLocationTracking(tripId);
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      currentLocationRef.current = null;
      setIsSocketConnected(false);
      setLivePassengerLocations({});
      cleanupNavigationUi();
      refetchTrip();
      refetchBookings();
      showDialog({
        variant: 'success',
        icon: 'checkmark-circle',
        title: 'Trajet interrompu',
        message: 'Le trajet a été interrompu avec succès.',
      });
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? "Impossible d'interrompre ce trajet.";
      showDialog({
        variant: 'danger',
        icon: 'alert-circle',
        title: 'Interruption impossible',
        message,
      });
    }
  }, [
    cleanupNavigationUi,
    pauseTrip,
    refetchBookings,
    refetchTrip,
    showDialog,
    tripId,
  ]);

  const sendDriverInterruptionRequest = useCallback(
    async (reason: TripInterruptionReason) => {
      if (!tripId) return;

      const currentCoordinate = currentLocationRef.current
        ? normalizeTripMapCoordinate(
            currentLocationRef.current.coords.latitude,
            currentLocationRef.current.coords.longitude,
          )
        : null;

      try {
        await requestDriverTripInterruption({
          tripId,
          reason,
          note:
            reason === 'emergency'
              ? 'Le conducteur demande une interruption urgente du trajet.'
              : 'Le conducteur demande une interruption du trajet.',
          coordinates: currentCoordinate,
        }).unwrap();
        await Promise.all([refetchTrip(), refetchBookings()]);
        showDialog({
          variant: 'success',
          icon: 'send',
          title: 'Demande envoyée',
          message: 'Tous les passagers à bord doivent confirmer avant interruption du trajet.',
        });
      } catch (error: any) {
        const message =
          error?.data?.message ??
          error?.error ??
          "Impossible d'envoyer la demande d'interruption.";
        showDialog({
          variant: 'danger',
          icon: 'alert-circle',
          title: 'Demande impossible',
          message: Array.isArray(message) ? message.join('\n') : message,
        });
      }
    },
    [
      refetchBookings,
      refetchTrip,
      requestDriverTripInterruption,
      showDialog,
      tripId,
    ],
  );

  const handlePauseTripFromNavigation = useCallback(() => {
    if (
      !tripId ||
      isPausingTrip ||
      isRequestingDriverInterruption ||
      isCancellingDriverInterruption
    ) {
      return;
    }

    if (activeDriverInterruptionRequest) {
      showDialog({
        title: 'Interruption en attente',
        message: `${activeDriverInterruptionConfirmedCount}/${activeDriverInterruptionRequiredCount} passager(s) ont confirmé.`,
        variant: 'info',
        icon: 'hourglass-outline',
        actions: [
          { label: 'Fermer', variant: 'ghost' },
          {
            label: 'Annuler la demande',
            variant: 'danger',
            onPress: async () => {
              await cancelDriverTripInterruption(tripId).unwrap();
              await Promise.all([refetchTrip(), refetchBookings()]);
            },
          },
        ],
      });
      return;
    }

    const passengersOnBoard = (bookingsRef.current ?? []).filter(
      (booking) =>
        booking.status === 'accepted' &&
        hasBookingPickupCompleted(booking) &&
        !hasBookingDropoffCompleted(booking),
    );

    if (passengersOnBoard.length === 0) {
      showDialog({
        title: 'Interrompre le trajet',
        message: "Aucun passager n'est à bord. Vous pouvez interrompre ce trajet directement.",
        variant: 'warning',
        icon: 'pause-circle-outline',
        actions: [
          { label: 'Annuler', variant: 'ghost' },
          {
            label: 'Interrompre',
            variant: 'secondary',
            onPress: pauseTripWithoutPassengerConfirmation,
          },
        ],
      });
      return;
    }

    showDialog({
      title: 'Demander une interruption',
      message:
        'Cette interruption devra être confirmée par tous les passagers à bord avant de prendre effet.',
      variant: 'warning',
      icon: 'stop-circle-outline',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Urgence',
          variant: 'danger',
          onPress: () => sendDriverInterruptionRequest('emergency'),
        },
        {
          label: 'Autre raison',
          variant: 'secondary',
          onPress: () => sendDriverInterruptionRequest('other'),
        },
      ],
    });
  }, [
    activeDriverInterruptionConfirmedCount,
    activeDriverInterruptionRequest,
    activeDriverInterruptionRequiredCount,
    cancelDriverTripInterruption,
    isCancellingDriverInterruption,
    isPausingTrip,
    isRequestingDriverInterruption,
    pauseTripWithoutPassengerConfirmation,
    refetchBookings,
    refetchTrip,
    sendDriverInterruptionRequest,
    showDialog,
    tripId,
  ]);

  const handleShareTrip = useCallback(async () => {
    if (!tripId) return;

    try {
      const response = await createTripShareLink({
        tripId,
        message: 'Voici le lien pour suivre mon trajet Zwanga en temps réel.',
      }).unwrap();
      await shareTrip(
        response.publicUrl,
        trip?.departure?.name ?? trip?.departure?.address,
        trip?.arrival?.name ?? trip?.arrival?.address,
      );
    } catch (error: any) {
      const backendMessage = error?.data?.message;
      const message = Array.isArray(backendMessage)
        ? backendMessage.join('\n')
        : backendMessage || error?.message || 'Impossible de créer le lien web de suivi.';
      showDialog({
        variant: 'danger',
        title: 'Partage impossible',
        message,
      });
    }
  }, [
    createTripShareLink,
    showDialog,
    trip?.arrival?.address,
    trip?.arrival?.name,
    trip?.departure?.address,
    trip?.departure?.name,
    tripId,
  ]);

  const handleEditTripFromNavigation = useCallback(() => {
    if (!tripId) {
      return;
    }

    cleanupNavigationUi();
    currentLocationRef.current = null;
    mapRef.current = null;
    router.replace(`/trip/${tripId}?openEdit=1`);
  }, [cleanupNavigationUi, router, tripId]);

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
  const decodePolyline = (encoded: string): RouteCoordinate[] => {
    const allPoints: RouteCoordinate[] = [];
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

      const coordinate = normalizeTripMapCoordinate(lat / 1e5, lng / 1e5);
      if (!coordinate) {
        return [];
      }

      allPoints.push(coordinate);
    }

    // Simplifier le polyline pour économiser la mémoire (max 200 points)
    const maxPoints = 200;
    if (allPoints.length <= maxPoints) {
      return allPoints;
    }
    
    const step = Math.ceil(allPoints.length / maxPoints);
    const simplified: RouteCoordinate[] = [];
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

  const canRestartTripFromOverlay = Boolean(
    tripId && trip?.status !== 'completed' && trip?.status !== 'cancelled',
  );
  const isRestartOverlayActionLoading = isRestartingTrip || isTripFetching;
  const tripDepartureLabel = (trip?.departure?.address || trip?.departure?.name || 'Départ du trajet').trim();
  const tripArrivalLabel = (trip?.arrival?.address || trip?.arrival?.name || 'Arrivée du trajet').trim();
  const currentNavigationWaypoint =
    waypoints.length > 0 && currentWaypointIndex < waypoints.length
      ? waypoints[currentWaypointIndex]
      : null;
  const currentNavigationWaypointCoordinate = currentNavigationWaypoint
    ? normalizeTripMapCoordinate(
        currentNavigationWaypoint.location?.lat,
        currentNavigationWaypoint.location?.lng,
      )
    : null;
  const isCurrentWaypointAtTripArrival = Boolean(
    currentNavigationWaypointCoordinate &&
      tripArrivalCoordinate &&
      calculateDistanceMeters(
        currentNavigationWaypointCoordinate,
        tripArrivalCoordinate,
      ) <= DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  );
  const shouldShowTripArrivalMarker = Boolean(
    tripArrivalCoordinate &&
      activeNavigationDestination?.kind !== 'dropoff' &&
      !isCurrentWaypointAtTripArrival,
  );

  const currentDriverCoordinate = useMemo(
    () =>
      normalizeTripMapCoordinate(
        currentLocation?.coords?.latitude,
        currentLocation?.coords?.longitude,
      ),
    [currentLocation?.coords?.latitude, currentLocation?.coords?.longitude],
  );
  const remainingRoute = useMemo(
    () => {
      const routeOrigin = isTripOngoing
        ? currentDriverCoordinate
        : routeCoordinates[0] ?? tripDepartureCoordinate;
      const safeRouteCoordinates = getSafePolylineCoordinates(routeCoordinates);
      const distanceToActiveDestinationMeters =
        routeOrigin && activeRouteDestination
          ? calculateDistanceMeters(routeOrigin, activeRouteDestination)
          : null;
      const directRouteCoordinates = getSafeMapCoordinateList([
        routeOrigin,
        activeRouteDestination,
      ]);
      const routeForNearWaypointDecision =
        safeRouteCoordinates.length >= 2
          ? safeRouteCoordinates
          : directRouteCoordinates;
      const shouldUseDirectNearWaypointRouteForDisplay =
        typeof distanceToActiveDestinationMeters === 'number' &&
        shouldUseDirectNearWaypointRoute({
          activeDestinationKind: activeNavigationDestination?.kind,
          directDistanceMeters: distanceToActiveDestinationMeters,
          isTripOngoing,
          routeCoordinates: routeForNearWaypointDecision,
        });

      return trimPolylineFromCurrentPosition(
        routeOrigin,
        shouldUseDirectNearWaypointRouteForDisplay
          ? directRouteCoordinates
          : safeRouteCoordinates,
        activeRouteDestination,
      );
    },
    [
      activeNavigationDestination?.kind,
      activeRouteDestination,
      currentDriverCoordinate,
      isTripOngoing,
      routeCoordinates,
      tripDepartureCoordinate,
    ],
  );
  const displayedRemainingDistanceMeters =
    remainingRoute.remainingCoordinates.length > 1
      ? remainingRoute.distanceMeters
      : routeDistanceMeters;
  const displayedRemainingDurationSeconds =
    typeof displayedRemainingDistanceMeters === 'number' &&
    typeof routeDistanceMeters === 'number' &&
    routeDistanceMeters > 0 &&
    typeof routeDurationSeconds === 'number'
      ? routeDurationSeconds * Math.min(1, displayedRemainingDistanceMeters / routeDistanceMeters)
      : routeDurationSeconds;
  const displayedDistanceText =
    formatNavigationDistance(displayedRemainingDistanceMeters) ?? totalDistance;
  const displayedDurationText =
    formatNavigationDuration(displayedRemainingDurationSeconds) ?? totalDuration;
  const displayedEtaText = formatNavigationEta(displayedRemainingDurationSeconds);

  const routeSectionCoordinates = useMemo(() => {
    return {
      nextCoordinates: getSafePolylineCoordinates(remainingRoute.remainingCoordinates),
      remainingCoordinates: [] as RouteCoordinate[],
    };
  }, [remainingRoute.remainingCoordinates]);

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
  const initialMapCoordinate =
    currentDriverCoordinate ??
    tripDepartureCoordinate ??
    KINSHASA_FALLBACK_MAP_COORDINATE;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Carte (ultra-optimisée pour éviter les crashs) */}
      <MapView
        ref={mapRef}
        onMapReady={handleMapReady}
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
          latitude: initialMapCoordinate.latitude,
          longitude: initialMapCoordinate.longitude,
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
        {currentDriverCoordinate && (
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
        {/* Départ publié du trajet */}
        {tripDepartureCoordinate && (
          <Marker
            coordinate={tripDepartureCoordinate}
            anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 0.5 }}
            image={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? androidNavigationMarkerImages.departure : undefined}
            pinColor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? undefined : Colors.primary}
            title="Départ"
            description={tripDepartureLabel}
            tracksViewChanges={false}
            zIndex={8}
          >
            {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
              <View
                collapsable={false}
                style={[styles.waypointMarkerContainer, styles.departureMarker]}
              >
                <Ionicons name="location" size={20} color={Colors.white} />
              </View>
            )}
          </Marker>
        )}

        {/* Prochain waypoint uniquement (1 seul pour éviter les crashs) */}
        {currentNavigationWaypoint &&
         currentNavigationWaypointCoordinate &&
         !currentNavigationWaypoint.completed && (
          <Marker
            coordinate={currentNavigationWaypointCoordinate}
            anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 0.5 }}
            image={
              USE_ANDROID_NAVIGATION_MARKER_IMAGES
                ? androidNavigationMarkerImages[
                    currentNavigationWaypoint.type === 'pickup' ? 'pickup' : 'dropoff'
                  ]
                : undefined
            }
            pinColor={
              USE_ANDROID_NAVIGATION_MARKER_IMAGES
                ? undefined
                : currentNavigationWaypoint.type === 'pickup'
                  ? Colors.secondary
                  : Colors.success
            }
            title={`${currentNavigationWaypoint.type === 'pickup' ? 'Lieu de prise en charge' : "Point d'arrivée"} ${currentNavigationWaypoint.passenger.name}`}
            description={currentNavigationWaypoint.address}
            tracksViewChanges={false}
            zIndex={26}
          >
            {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
              <View
                collapsable={false}
                style={[
                  styles.waypointMarkerContainer,
                  currentNavigationWaypoint.type === 'pickup'
                    ? styles.pickupMarker
                    : styles.dropoffMarker,
                ]}
              >
                <Ionicons
                  name={currentNavigationWaypoint.type === 'pickup' ? 'person-add' : 'flag'}
                  size={20}
                  color={Colors.white}
                />
              </View>
            )}
          </Marker>
        )}

        {/* Destination finale - Marqueur arrivée */}
        {shouldShowTripArrivalMarker && tripArrivalCoordinate && (
          <Marker
            coordinate={{
              latitude: tripArrivalCoordinate.latitude,
              longitude: tripArrivalCoordinate.longitude,
            }}
            anchor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? ANDROID_PIN_MARKER_ANCHOR : { x: 0.5, y: 1 }}
            image={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? androidNavigationMarkerImages.destination : undefined}
            pinColor={USE_ANDROID_NAVIGATION_MARKER_IMAGES ? undefined : Colors.success}
            title="Arrivée"
            description={tripArrivalLabel}
            tracksViewChanges={!USE_ANDROID_NAVIGATION_MARKER_IMAGES && destinationTracksViewChanges}
            zIndex={18}
          >
            {!USE_ANDROID_NAVIGATION_MARKER_IMAGES && (
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
                ? 'Trajet pas encore démarré'
                : trip?.status === 'completed'
                  ? 'Trajet terminé'
                  : trip?.status === 'cancelled'
                    ? 'Trajet annulé'
                    : 'Navigation en pause'}
            </Text>
            <Text style={styles.preStartText}>
              {trip?.status === 'upcoming'
                ? 'Le trajet doit être demarré avant d\'activer la navigation en direct.'
                : 'La navigation en direct est disponible uniquement pour un trajet en cours.'}
            </Text>
            <View style={styles.preStartActions}>
              <TouchableOpacity
                style={[styles.preStartButton, styles.preStartButtonPrimary]}
                onPress={
                  canRestartTripFromOverlay
                    ? () => void handleRestartTripFromNavigation()
                    : () => refetchTrip()
                }
                disabled={isRestartOverlayActionLoading}
              >
                {isRestartOverlayActionLoading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.preStartButtonPrimaryText}>
                    {canRestartTripFromOverlay ? 'Redemarrer' : 'Actualiser'}
                  </Text>
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
            <Text style={styles.etaText}>{displayedDurationText}</Text>
            {/* Indicateur temps réel */}
            <View style={[styles.liveIndicator, isSocketConnected && styles.liveIndicatorActive]}>
              <View style={[styles.liveDot, isSocketConnected && styles.liveDotActive]} />
              <Text style={[styles.liveText, isSocketConnected && styles.liveTextActive]}>
                {isSocketConnected ? 'LIVE' : '...'}
              </Text>
            </View>
          </View>
          <View style={styles.distanceRow}>
            <Text style={styles.distanceText}>{displayedDistanceText}</Text>
            {displayedEtaText && (
              <Text style={styles.arrivalTimeText}>ETA {displayedEtaText}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Barre compacte des passagers */}
      {isTripOngoing && (waypoints.length > 0 || activePendingBooking) && (
        <View style={styles.passengersBar}>
          {/* Stats des passagers */}
          {waypoints.length > 0 && (
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
                  {passengerStats.pendingPickups} à prendre en charge
                </Text>
              )}
            </View>
            <Ionicons name="chevron-up" size={20} color={Colors.gray[500]} />
            </TouchableOpacity>
          )}

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
                  {waypoints[currentWaypointIndex].type === 'pickup' ? 'Lieu de prise en charge' : "Point d'arrivée"}
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

          {activePendingBooking && (
            <View style={styles.pendingBookingPrompt}>
              <View style={styles.pendingBookingHeader}>
                <View style={styles.pendingBookingIcon}>
                  <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.pendingBookingTitleWrap}>
                  <Text style={styles.pendingBookingEyebrow}>
                    Nouvelle réservation
                    {pendingBookingQueueCount > 0 ? ` +${pendingBookingQueueCount}` : ''}
                  </Text>
                  <Text style={styles.pendingBookingTitle} numberOfLines={1}>
                    {activePendingBooking.passengerName || 'Passager'}
                  </Text>
                </View>
                <View style={styles.pendingBookingSeatPill}>
                  <Ionicons name="people-outline" size={14} color={Colors.primaryDark} />
                  <Text style={styles.pendingBookingSeatText}>
                    {formatSeatCount(activePendingBooking.numberOfSeats)}
                  </Text>
                </View>
              </View>

              <View style={styles.pendingBookingRoute}>
                <View style={styles.pendingBookingRouteRow}>
                  <View style={[styles.pendingBookingRouteDot, styles.pendingBookingPickupDot]} />
                  <Text style={styles.pendingBookingRouteLabel} numberOfLines={1}>
                    {activePendingBookingPickupLabel}
                  </Text>
                </View>
                <View style={styles.pendingBookingRouteRow}>
                  <View style={[styles.pendingBookingRouteDot, styles.pendingBookingDropoffDot]} />
                  <Text style={styles.pendingBookingRouteLabel} numberOfLines={1}>
                    {activePendingBookingDropoffLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.pendingBookingFooter}>
                <Text style={styles.pendingBookingPaymentText} numberOfLines={1}>
                  {formatPendingBookingPayment(activePendingBooking, trip?.price)}
                </Text>
                <View style={styles.pendingBookingActions}>
                  <TouchableOpacity
                    style={[
                      styles.pendingBookingActionButton,
                      styles.pendingBookingRejectButton,
                      isProcessingPendingBooking && styles.pendingBookingActionDisabled,
                    ]}
                    onPress={() => void handleRejectPendingBooking(activePendingBooking)}
                    disabled={isAcceptingBooking || isRejectingBooking || isProcessingPendingBooking}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Refuser la réservation"
                  >
                    {isProcessingPendingBooking && isRejectingBooking ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <>
                        <Ionicons name="close" size={18} color={Colors.danger} />
                        <Text style={styles.pendingBookingRejectText}>Refuser</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pendingBookingActionButton,
                      styles.pendingBookingAcceptButton,
                      isProcessingPendingBooking && styles.pendingBookingActionDisabled,
                    ]}
                    onPress={() => void handleAcceptPendingBooking(activePendingBooking)}
                    disabled={isAcceptingBooking || isRejectingBooking || isProcessingPendingBooking}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Accepter la réservation"
                  >
                    {isProcessingPendingBooking && isAcceptingBooking ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color={Colors.white} />
                        <Text style={styles.pendingBookingAcceptText}>Accepter</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {activePassengerInterruptionBooking && (
            <View style={styles.interruptionPrompt}>
              <View style={styles.interruptionPromptHeader}>
                <View style={styles.interruptionPromptIcon}>
                  <Ionicons name="walk-outline" size={18} color={Colors.danger} />
                </View>
                <View style={styles.interruptionPromptTitleWrap}>
                  <Text style={styles.interruptionPromptEyebrow}>
                    Demande de descente
                    {pendingPassengerInterruptionQueueCount > 0
                      ? ` +${pendingPassengerInterruptionQueueCount}`
                      : ''}
                  </Text>
                  <Text style={styles.interruptionPromptTitle} numberOfLines={1}>
                    {activePassengerInterruptionBooking.passengerName || 'Passager'}
                  </Text>
                </View>
              </View>

              <Text style={styles.interruptionPromptText}>
                Motif: {getTripInterruptionReasonLabel(activePassengerInterruptionBooking.interruptionRequest?.reason)}.
                Le passager demande à descendre avant sa destination.
              </Text>

              <View style={styles.interruptionPromptActions}>
                <TouchableOpacity
                  style={[
                    styles.interruptionPromptButton,
                    styles.interruptionPromptRejectButton,
                    (processingBookingId === activePassengerInterruptionBooking.id ||
                      isConfirmingPassengerInterruption ||
                      isRejectingPassengerInterruption) &&
                      styles.pendingBookingActionDisabled,
                  ]}
                  onPress={() => handleRejectPassengerInterruption(activePassengerInterruptionBooking)}
                  disabled={
                    processingBookingId === activePassengerInterruptionBooking.id ||
                    isConfirmingPassengerInterruption ||
                    isRejectingPassengerInterruption
                  }
                  activeOpacity={0.85}
                >
                  {processingBookingId === activePassengerInterruptionBooking.id &&
                  isRejectingPassengerInterruption ? (
                    <ActivityIndicator size="small" color={Colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="close" size={18} color={Colors.danger} />
                      <Text style={styles.interruptionPromptRejectText}>Refuser</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.interruptionPromptButton,
                    styles.interruptionPromptConfirmButton,
                    (processingBookingId === activePassengerInterruptionBooking.id ||
                      isConfirmingPassengerInterruption ||
                      isRejectingPassengerInterruption) &&
                      styles.pendingBookingActionDisabled,
                  ]}
                  onPress={() => handleConfirmPassengerInterruption(activePassengerInterruptionBooking)}
                  disabled={
                    processingBookingId === activePassengerInterruptionBooking.id ||
                    isConfirmingPassengerInterruption ||
                    isRejectingPassengerInterruption
                  }
                  activeOpacity={0.85}
                >
                  {processingBookingId === activePassengerInterruptionBooking.id &&
                  isConfirmingPassengerInterruption ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color={Colors.white} />
                      <Text style={styles.interruptionPromptConfirmText}>Confirmer</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeDriverInterruptionRequest && (
            <View style={styles.driverInterruptionStatusCard}>
              <Ionicons name="hourglass-outline" size={19} color={Colors.warning} />
              <View style={styles.driverInterruptionStatusCopy}>
                <Text style={styles.driverInterruptionStatusTitle}>
                  Interruption demandee
                </Text>
                <Text style={styles.driverInterruptionStatusText}>
                  {activeDriverInterruptionConfirmedCount}/{activeDriverInterruptionRequiredCount} passager(s) ont confirmé.
                </Text>
              </View>
            </View>
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
          <Text style={styles.loadingRouteText}>
            {isReroutingRoute ? "Recalcul de l'itinéraire..." : "Calcul de l'itinéraire..."}
          </Text>
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
          style={styles.floatingButton}
          onPress={handleEditTripFromNavigation}
          accessibilityRole="button"
          accessibilityLabel="Modifier le trajet"
        >
          <Ionicons name="create-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.floatingButton,
            styles.interruptTripButton,
            (isPausingTrip ||
              isRequestingDriverInterruption ||
              isCancellingDriverInterruption) &&
              styles.floatingButtonDisabled,
          ]}
          onPress={handlePauseTripFromNavigation}
          disabled={isPausingTrip || isRequestingDriverInterruption || isCancellingDriverInterruption}
          accessibilityRole="button"
          accessibilityLabel={
            activeDriverInterruptionRequest
              ? "Voir la demande d'interruption"
              : 'Demander une interruption du trajet'
          }
        >
          {isPausingTrip || isRequestingDriverInterruption || isCancellingDriverInterruption ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons
              name={activeDriverInterruptionRequest ? 'hourglass' : 'stop-circle'}
              size={24}
              color={Colors.white}
            />
          )}
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

        <TouchableOpacity
          style={[
            styles.floatingButton,
            isCreatingTripShareLink && styles.floatingButtonDisabled,
          ]}
          onPress={() => void handleShareTrip()}
          disabled={isCreatingTripShareLink}
          accessibilityRole="button"
          accessibilityLabel="Partager le trajet"
        >
          {isCreatingTripShareLink ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="share-social-outline" size={22} color={Colors.primary} />
          )}
        </TouchableOpacity>

        {/* Bouton recalculer l'itinéraire */}
        {passengerMapLocations.length > 0 && (
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={fitVehicleAndPassengers}
            accessibilityRole="button"
            accessibilityLabel="Voir le véhicule et les passagers"
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
            const normalizedLocation = normalizeDriverLocationObject(loc);
            if (normalizedLocation) {
              focusMapOnCoordinates(
                [
                  {
                    latitude: normalizedLocation.coords.latitude,
                    longitude: normalizedLocation.coords.longitude,
                  },
                ],
                {
                  durationMs: 300,
                  edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
                  logContext: 'recenter-driver',
                  singleCoordinateDelta: 0.005,
                },
              );
            }
          }}
        >
          <Ionicons name="locate" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      )}

      {/* Disclosure localisation arrière-plan */}
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
              Autorisation de localisation en arrière-plan
            </Text>
            <Text style={styles.backgroundDisclosureText}>
              {"Zwanga collecte votre position même quand l'application est en arrière-plan pendant un trajet actif."}
            </Text>
            <View style={styles.backgroundDisclosureList}>
              <Text style={styles.backgroundDisclosureItem}>
                - Suivre votre trajet en continu pour la navigation GPS.
              </Text>
              <Text style={styles.backgroundDisclosureItem}>
                - Envoyer votre position au serveur et aux passagers du trajet en cours.
              </Text>
              <Text style={styles.backgroundDisclosureItem}>
                - Arreter automatiquement le suivi à la fin du trajet.
              </Text>
            </View>
            <Text style={styles.backgroundDisclosureFootnote}>
              {"Vous pouvez continuer sans cette autorisation. Dans ce cas, le suivi fonctionne uniquement quand l'application est ouverte."}
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
        visible={securityModalVisible && !backgroundDisclosureVisible}
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
              <Text style={styles.securityModalTitle}>Securité du trajet</Text>
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
                <Text style={styles.securityModalLoadingText}>Chargement securité...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={
          Boolean(tripEndNotice) &&
          !backgroundDisclosureVisible &&
          !securityModalVisible
        }
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
            <Text style={styles.waypointModalTitle}>Trajet terminé</Text>
            <Text style={styles.waypointModalPassenger}>
              {trip?.arrival?.name ?? 'Destination finale'}
            </Text>
            <View style={styles.waypointModalAddressContainer}>
              <Ionicons name="location" size={18} color={Colors.gray[500]} />
              <Text style={styles.waypointModalAddress}>
                {trip?.arrival?.address ?? trip?.arrival?.name ?? 'Arrivée du trajet'}
              </Text>
            </View>
            <Text style={styles.waypointModalWaitingText}>
              {tripEndNotice?.completedWhileAppInactive
                ? "Le trajet s'est terminé pendant que le téléphone était en veille ou hors de l'application. Il est maintenant clôturé. Vous pouvez noter les passagers."
                : 'Vous avez atteint la destination finale. Le trajet est terminé automatiquement. Vous pouvez noter les passagers.'}
            </Text>
            {tripEndNotice?.revenueSummary ? (
              <View style={styles.tripRevenueSummary}>
                {tripEndNotice.revenueSummary.confirmedAmount > 0 ? (
                  <View style={styles.tripRevenueRow}>
                    <View style={[styles.tripRevenueIcon, { backgroundColor: Colors.success + '18' }]}>
                      <Ionicons name="wallet-outline" size={20} color={Colors.successDark} />
                    </View>
                    <View style={styles.tripRevenueCopy}>
                      <Text style={styles.tripRevenueLabel}>Gain ajouté</Text>
                      <Text style={styles.tripRevenueHint}>Disponible dans vos gains conducteur</Text>
                    </View>
                    <Text style={[styles.tripRevenueAmount, { color: Colors.successDark }]}>
                      {formatTripRevenueAmount(
                        tripEndNotice.revenueSummary.confirmedAmount,
                        tripEndNotice.revenueSummary.currency,
                      )}
                    </Text>
                  </View>
                ) : null}
                {tripEndNotice.revenueSummary.cashToCollectAmount > 0 ? (
                  <View style={styles.tripRevenueRow}>
                    <View style={[styles.tripRevenueIcon, { backgroundColor: Colors.warning + '18' }]}>
                      <Ionicons name="cash-outline" size={20} color={Colors.warningDark} />
                    </View>
                    <View style={styles.tripRevenueCopy}>
                      <Text style={styles.tripRevenueLabel}>À encaisser en liquide</Text>
                      <Text style={styles.tripRevenueHint}>À recevoir directement du passager</Text>
                    </View>
                    <Text style={[styles.tripRevenueAmount, { color: Colors.warningDark }]}>
                      {formatTripRevenueAmount(
                        tripEndNotice.revenueSummary.cashToCollectAmount,
                        tripEndNotice.revenueSummary.currency,
                      )}
                    </Text>
                  </View>
                ) : null}
                {tripEndNotice.revenueSummary.electronicPendingAmount > 0 ? (
                  <View style={styles.tripRevenueRow}>
                    <View style={[styles.tripRevenueIcon, { backgroundColor: Colors.info + '18' }]}>
                      <Ionicons name="time-outline" size={20} color={Colors.infoDark} />
                    </View>
                    <View style={styles.tripRevenueCopy}>
                      <Text style={styles.tripRevenueLabel}>Paiement électronique attendu</Text>
                      <Text style={styles.tripRevenueHint}>Ajouté après confirmation FlexPay</Text>
                    </View>
                    <Text style={[styles.tripRevenueAmount, { color: Colors.infoDark }]}>
                      {formatTripRevenueAmount(
                        tripEndNotice.revenueSummary.electronicPendingAmount,
                        tripEndNotice.revenueSummary.currency,
                      )}
                    </Text>
                  </View>
                ) : null}
                {tripEndNotice.revenueSummary.totalExpectedAmount <= 0 ? (
                  <View style={styles.tripRevenueEmpty}>
                    <Ionicons name="checkmark-circle-outline" size={20} color={Colors.gray[500]} />
                    <Text style={styles.tripRevenueHint}>Aucun montant à encaisser pour ce trajet.</Text>
                  </View>
                ) : null}
              </View>
            ) : tripEndNotice?.revenueSummaryUnavailable ? (
              <View style={styles.tripRevenueLoading}>
                <Ionicons name="cloud-offline-outline" size={18} color={Colors.gray[500]} />
                <Text style={styles.tripRevenueHint}>
                  Le détail du gain reste disponible dans l&apos;espace conducteur.
                </Text>
              </View>
            ) : (
              <View style={styles.tripRevenueLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.tripRevenueHint}>Calcul du montant du trajet…</Text>
              </View>
            )}
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
                  ? `Arrivée détectée a ${Math.max(1, Math.round(tripEndNotice.distanceMeters))} m`
                  : 'Arrivée détectée'}
              </Text>
            </View>
            <Text style={styles.waypointModalWaitingText}>
              L&apos;embarquement est validé automatiquement lorsque les deux téléphones se déplacent ensemble.
            </Text>
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
        visible={
          Boolean(pickupNotice) &&
          !backgroundDisclosureVisible &&
          !securityModalVisible &&
          !tripEndNotice
        }
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
                <Text style={styles.waypointModalSecondaryButtonText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de waypoint stylise */}
      <Modal
        visible={
          waypointModalVisible &&
          Boolean(activeWaypoint) &&
          !backgroundDisclosureVisible &&
          !securityModalVisible &&
          !tripEndNotice &&
          !pickupNotice
        }
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
                  : `Nous sommes arrivés au point de destination de ${activeWaypoint.passenger.name || 'ce passager'}. La dépose se confirme automatiquement.`}
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
                  Confirmation automatique activée
                </Text>
              </View>
            )}

            {/* Fermeture du détail */}
            <View style={styles.waypointModalActions}>
              <TouchableOpacity
                style={styles.waypointModalSecondaryButton}
                onPress={handleDismissWaypointModal}
              >
                <Text style={styles.waypointModalSecondaryButtonText}>
                  Fermer
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
        visible={
          passengersPanelVisible &&
          !backgroundDisclosureVisible &&
          !securityModalVisible &&
          !tripEndNotice &&
          !pickupNotice &&
          !waypointModalVisible
        }
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
  distanceRow: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
  },
  arrivalTimeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
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
  interruptTripButton: {
    backgroundColor: Colors.danger,
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: Colors.danger,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
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
  departureMarker: {
    backgroundColor: Colors.primary,
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
  pendingBookingPrompt: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 5,
  },
  pendingBookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pendingBookingIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBookingTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  pendingBookingEyebrow: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
    textTransform: 'uppercase',
  },
  pendingBookingTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  pendingBookingSeatPill: {
    minHeight: 30,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '12',
  },
  pendingBookingSeatText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
  },
  pendingBookingRoute: {
    gap: 6,
  },
  pendingBookingRouteRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pendingBookingRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pendingBookingPickupDot: {
    backgroundColor: Colors.secondary,
  },
  pendingBookingDropoffDot: {
    backgroundColor: Colors.success,
  },
  pendingBookingRouteLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  pendingBookingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pendingBookingPaymentText: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  pendingBookingActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pendingBookingActionButton: {
    minWidth: 92,
    height: 42,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pendingBookingRejectButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.danger + '55',
  },
  pendingBookingAcceptButton: {
    backgroundColor: Colors.primary,
  },
  pendingBookingActionDisabled: {
    opacity: 0.62,
  },
  pendingBookingRejectText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.danger,
  },
  pendingBookingAcceptText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  interruptionPrompt: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 5,
  },
  interruptionPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  interruptionPromptIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.danger + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  interruptionPromptTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  interruptionPromptEyebrow: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.danger,
    textTransform: 'uppercase',
  },
  interruptionPromptTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  interruptionPromptText: {
    fontSize: FontSizes.sm,
    lineHeight: 19,
    color: Colors.gray[700],
  },
  interruptionPromptActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  interruptionPromptButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  interruptionPromptRejectButton: {
    borderWidth: 1,
    borderColor: Colors.danger + '55',
    backgroundColor: Colors.white,
  },
  interruptionPromptConfirmButton: {
    backgroundColor: Colors.danger,
  },
  interruptionPromptRejectText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.danger,
  },
  interruptionPromptConfirmText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  driverInterruptionStatusCard: {
    minHeight: 50,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    backgroundColor: Colors.warning + '12',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverInterruptionStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  driverInterruptionStatusTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  driverInterruptionStatusText: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[700],
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
  tripRevenueSummary: {
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gray[200],
    marginBottom: Spacing.lg,
  },
  tripRevenueRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  tripRevenueIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripRevenueCopy: {
    flex: 1,
  },
  tripRevenueLabel: {
    color: Colors.gray[900],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  tripRevenueHint: {
    color: Colors.gray[600],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  tripRevenueAmount: {
    maxWidth: '34%',
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    textAlign: 'right',
  },
  tripRevenueEmpty: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  tripRevenueLoading: {
    alignSelf: 'stretch',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gray[200],
    marginBottom: Spacing.lg,
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
