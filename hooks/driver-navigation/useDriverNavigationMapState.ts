import {
  RouteStep,
  Waypoint,
  RouteCoordinate,
  RouteSectionFocus,
  PickupNotice,
  PickupBypassConfirmation,
  TripEndNotice,
  LivePassengerLocation,
  USE_ANDROID_NAVIGATION_MARKER_IMAGES,
} from '../../features/driver-navigation/navigationModel';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { useNavigationMarkerRefresh } from '@/hooks/navigation/useNavigationMarkerRefresh';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import MapView, { AnimatedRegion, type MapMarker } from 'react-native-maps';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  tripId: string;
  isScreenActive: boolean;
  tripDepartureCoordinate: MapCoordinate | null;
}

export function useDriverNavigationMapState({
  tripId,
  isScreenActive,
  tripDepartureCoordinate,
}: Params) {
  const mapRef = useRef<MapView>(null);
  const {
    shouldRenderMap, isMapReady: isNativeMapReady, readyRef: isMapReadyRef,
    onMapReady: handleMapReady, onMapLayout, runMapCommand, navigateAfterRelease,
  } = useNavigationMapLifecycle({ screenKey: tripId, enabled: isScreenActive, mapRef });
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
  const [pickupBypassConfirmation, setPickupBypassConfirmation] =
    useState<PickupBypassConfirmation | null>(null);
  const [pickupBypassAction, setPickupBypassAction] = useState<'confirm' | 'cancel' | null>(null);
  const [tripEndNotice, setTripEndNotice] = useState<TripEndNotice | null>(null);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [locallyAcceptedBookingIds, setLocallyAcceptedBookingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [locallyPickedUpBookingIds, setLocallyPickedUpBookingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [locallyCancelledBookingIds, setLocallyCancelledBookingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pickupNoticeRef = useRef<PickupNotice | null>(null);
  const pickupBypassConfirmationRef = useRef<PickupBypassConfirmation | null>(null);
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
  const { onReady: refreshPassengerMarker, isLoaded: isPassengerMarkerLoaded } =
    useNavigationMarkerRefresh(USE_ANDROID_NAVIGATION_MARKER_IMAGES && shouldRenderMap, tripId);
  const [destinationTracksViewChanges, setDestinationTracksViewChanges] = useState(true);
  const [driverPosition] = useState(() =>
    new AnimatedRegion({
      latitude: tripDepartureCoordinate?.latitude ?? 0,
      longitude: tripDepartureCoordinate?.longitude ?? 0,
      latitudeDelta: 0,
      longitudeDelta: 0,
    })
  );
  const driverMarkerAnimationRef = useRef<ReturnType<AnimatedRegion['timing']> | null>(null);
  const stopDriverMarkerAnimation = useCallback(() => {
    driverMarkerAnimationRef.current?.stop();
    driverMarkerAnimationRef.current = null;
  }, []);
  useEffect(() => {
    if (!isNativeMapReady) stopDriverMarkerAnimation();
    return stopDriverMarkerAnimation;
  }, [isNativeMapReady, stopDriverMarkerAnimation]);

  return {
    runMapCommand,
    setLocallyAcceptedBookingIds,
    setLocallyPickedUpBookingIds,
    setLocallyCancelledBookingIds,
    setSkippedPickupBookingIds,
    locallyAcceptedBookingIds,
    locallyPickedUpBookingIds,
    locallyCancelledBookingIds,
    livePassengerLocations,
    processingBookingId,
    steps,
    currentStepIndex,
    waypoints,
    currentWaypointIndex,
    waypointModalVisible,
    routeCoordinates,
    pickupNoticeRef,
    pickupNotice,
    pickupBypassConfirmationRef,
    pickupBypassConfirmation,
    tripEndNoticeRef,
    tripEndNotice,
    skippedPickupBookingIds,
    setPickupBypassConfirmation,
    setPickupNotice,
    setPickupNoticeCountdown,
    stopDriverMarkerAnimation,
    recalcRouteTimeoutRef,
    locationSubscription,
    backgroundDisclosureResolverRef,
    lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef,
    lastTripCompletionCheckCoordinateRef,
    lastBackgroundCheckpointAtRef,
    isRestCompletionCheckRunningRef,
    lastRestCompletionCheckAtRef,
    completedDuringInactiveCandidateRef,
    setIsReroutingRoute,
    setRouteDistanceMeters,
    setRouteDurationSeconds,
    setBackgroundDisclosureVisible,
    setSecurityModalVisible,
    setPickupBypassAction,
    setTripEndNotice,
    setWaypointModalVisible,
    setPassengersPanelVisible,
    setActiveWaypoint,
    navigateAfterRelease,
    isMountedRef,
    isTripOngoingRef,
    isVoiceGuidanceEnabled,
    setCurrentLocation,
    appStateRef,
    setIsSocketConnected,
    setLivePassengerLocations,
    setWaypoints,
    setCurrentWaypointIndex,
    activeWaypoint,
    driverPosition,
    isMapReadyRef,
    driverMarkerAnimationRef,
    setHeading,
    isNativeMapReady,
    mapRef,
    heading,
    currentLocation,
    setIsVoiceGuidanceEnabled,
    isLoadingRoute,
    setIsLoadingRoute,
    setRouteCoordinates,
    setTotalDistance,
    setTotalDuration,
    currentLegIndex,
    setSteps,
    setCurrentStepIndex,
    setProcessingBookingId,
    pickupBypassAction,
    securityModalVisible,
    routeDistanceMeters,
    routeDurationSeconds,
    totalDistance,
    totalDuration,
    routeSectionFocus,
    setRouteSectionFocus,
    shouldRenderMap,
    handleMapReady,
    onMapLayout,
    driverMarkerRef,
    passengerMarkerRefs,
    isPassengerMarkerLoaded,
    refreshPassengerMarker,
    destinationTracksViewChanges,
    setDestinationTracksViewChanges,
    isSocketConnected,
    isReroutingRoute,
    backgroundDisclosureVisible,
    pickupNoticeCountdown,
    passengersPanelVisible,
  };
}
