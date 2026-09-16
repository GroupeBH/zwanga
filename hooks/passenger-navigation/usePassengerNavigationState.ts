import {
  IS_ANDROID,
  RouteSegmentFocus,
  PassengerRouteInfo,
  PassengerPickupNotice,
} from '../../features/passenger-navigation/navigationModel';
import { type RecoveryFix } from '@/features/ride-recovery/RideRecoveryControl';
import { useNavigationMapLifecycle } from '@/hooks/navigation/useNavigationMapLifecycle';
import { useNavigationRequestGuard } from '@/hooks/navigation/useNavigationRequestGuard';
import { useNavigationMarkerRefresh } from '@/hooks/navigation/useNavigationMarkerRefresh';
import { useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { type NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, type LayoutChangeEvent } from 'react-native';
import MapView from 'react-native-maps';
import type { MapMarker } from 'react-native-maps';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Router } from 'expo-router';

interface Params {
  bookingId: string;
  isScreenActive: boolean;
  isTripOngoing: boolean;
  insets: EdgeInsets;
  router: Router;
  isFocused: boolean;
}

export function usePassengerNavigationState({
  bookingId,
  isScreenActive,
  isTripOngoing,
  insets,
  router,
  isFocused,
}: Params) {
  const mapRef = useRef<MapView>(null);
  const {
    shouldRenderMap: isNavigationMapReady, isMapReady: isNativeMapReady,
    onMapReady: handleMapReady, onMapLayout, runMapCommand, navigateAfterRelease,
  } = useNavigationMapLifecycle({ screenKey: bookingId, enabled: isScreenActive, mapRef });
  const driverMarkerRef = useRef<MapMarker | null>(null);
  const passengerMarkerRef = useRef<MapMarker | null>(null);
  const pickupMarkerRef = useRef<MapMarker | null>(null);
  const dropoffMarkerRef = useRef<MapMarker | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [passengerLocation, setPassengerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [recoveryFix, setRecoveryFix] = useState<RecoveryFix | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { onReady: refreshTrackingMarker, isLoaded: isTrackingMarkerLoaded } =
    useNavigationMarkerRefresh(IS_ANDROID && isNavigationMapReady, bookingId);

  // Route et directions
  const [getDirections] = useGetDirectionsMutation();
  const { begin: beginRouteRequest, cancel: cancelRouteRequest } = useNavigationRequestGuard(isScreenActive, bookingId);
  const { begin: beginLocationRequest, cancel: cancelLocationRequest } =
    useNavigationRequestGuard(isScreenActive && isTripOngoing, bookingId);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeInfo, setRouteInfo] = useState<PassengerRouteInfo | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [activeRouteSegment, setActiveRouteSegment] = useState<RouteSegmentFocus>('route');
  const [pickupNotice, setPickupNotice] = useState<PassengerPickupNotice | null>(null);
  const [pickupNoticeCountdown, setPickupNoticeCountdown] = useState<number | null>(null);
  const routeFetchedRef = useRef(false);
  const lastRouteFetchRef = useRef<number>(0);
  const hasFitInitialMapRef = useRef(false);
  const hasPresentedArrivalModalRef = useRef(false);
  const presentedPickupNoticeKeysRef = useRef<Set<string>>(new Set());
  const highestPickupNoticePriorityRef = useRef<Map<string, number>>(new Map());
  const hasDisplayedDriverNearNotificationRef = useRef(false);
  const hasPresentedBoardedNoticeRef = useRef(false);
  const hasPresentedDestinationApproachNoticeRef = useRef(false);
  const hasPresentedTripDestinationApproachNoticeRef = useRef(false);
  const hasPresentedTripCompletedNoticeRef = useRef(false);
  const hasPresentedNoShowNoticeRef = useRef(false);
  const hasPresentedBoardingUncertainNoticeRef = useRef(false);
  const hasObservedPickupStateRef = useRef(false);
  const previousPickupStateRef = useRef(false);
  const passengerLocationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastAcceptedDriverCoordinateRef = useRef<NavigationCoordinate | null>(null);
  const lastAcceptedDriverTimestampRef = useRef<number | null>(null);
  const lastAcceptedPassengerCoordinateRef = useRef<NavigationCoordinate | null>(null);
  const lastAcceptedPassengerTimestampRef = useRef<number | null>(null);
  const routeSignatureRef = useRef('');
  const isMountedRef = useRef(true);
  const isExitingRef = useRef(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (Number.isFinite(height) && height > 0) setHeaderHeight(previous => previous === height ? previous : height);
  }, []);
  const mapTopOffset = headerHeight || insets.top + 140;

  const navigateBackSafely = useCallback(() => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    cancelRouteRequest();
    cancelLocationRequest();
    try {
      setIsSocketConnected(false);
      setIsLoadingRoute(false);
      routeFetchedRef.current = false;
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;

    } catch (error) {
      console.warn('[PassengerNavigation] cleanup before back failed:', error);
    }

    const scheduled = navigateAfterRelease(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/bookings');
    }, () => { isExitingRef.current = false; });
    if (!scheduled) isExitingRef.current = false;
  }, [cancelLocationRequest, cancelRouteRequest, navigateAfterRelease, router]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigateBackSafely();
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [isFocused, navigateBackSafely]);

  return {
    driverLocation,
    passengerLocation,
    isMountedRef,
    hasPresentedArrivalModalRef,
    hasPresentedNoShowNoticeRef,
    setPickupNotice,
    setPickupNoticeCountdown,
    hasPresentedBoardingUncertainNoticeRef,
    passengerLocationSubscriptionRef,
    navigateBackSafely,
    presentedPickupNoticeKeysRef,
    highestPickupNoticePriorityRef,
    hasDisplayedDriverNearNotificationRef,
    hasPresentedBoardedNoticeRef,
    hasPresentedDestinationApproachNoticeRef,
    hasPresentedTripCompletedNoticeRef,
    hasPresentedTripDestinationApproachNoticeRef,
    pickupNotice,
    hasObservedPickupStateRef,
    previousPickupStateRef,
    lastAcceptedDriverCoordinateRef,
    lastAcceptedDriverTimestampRef,
    lastAcceptedPassengerCoordinateRef,
    lastAcceptedPassengerTimestampRef,
    routeSignatureRef,
    routeFetchedRef,
    lastRouteFetchRef,
    refreshTrackingMarker,
    lastUpdate,
    setDriverLocation,
    setLastUpdate,
    setRouteCoordinates,
    setRouteInfo,
    beginRouteRequest,
    setIsLoadingRoute,
    getDirections,
    routeCoordinates,
    setIsSocketConnected,
    isExitingRef,
    setPassengerLocation,
    setRecoveryFix,
    beginLocationRequest,
    runMapCommand,
    mapRef,
    mapTopOffset,
    onHeaderLayout,
    isMapExpanded,
    isNativeMapReady,
    hasFitInitialMapRef,
    routeInfo,
    activeRouteSegment,
    setActiveRouteSegment,
    isNavigationMapReady,
    handleMapReady,
    onMapLayout,
    passengerMarkerRef,
    isTrackingMarkerLoaded,
    driverMarkerRef,
    pickupMarkerRef,
    dropoffMarkerRef,
    setIsMapExpanded,
    isLoadingRoute,
    isSocketConnected,
    recoveryFix,
    pickupNoticeCountdown,
  };
}
