import { useDriverNavigationRefs } from '../../hooks/driver-navigation/useDriverNavigationRefs';
import { useDriverNavigationData } from '../../hooks/driver-navigation/useDriverNavigationData';
import { useDriverNavigationMapState } from '../../hooks/driver-navigation/useDriverNavigationMapState';
import { isFreshLocationObject, normalizeDriverLocationObject } from './navigationBooking';
import { OFF_ROUTE_MAX_ACCURACY_METERS, OFF_ROUTE_MIN_ROUTE_POINTS } from './navigationMap';
import {
  DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS,
  OFF_ROUTE_DISTANCE_KM,
  DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS,
  DRIVER_REROUTE_CONFIRMATION_COUNT,
  DRIVER_REROUTE_MIN_INTERVAL_MS,
} from './navigationModel';
import { DRIVER_LOCATION_BACKEND_UPDATE_INTERVAL_MS } from '@/constants/rideProgress';
import { getRouteAlignedPosition } from '@/utils/routeHelpers';
import {
  MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
  calculateDistanceMeters,
  distanceFromCoordinateToPolyline,
  isPlausibleLocationUpdate,
  isRouteDeviationConfirmed,
} from '@/utils/navigation/routeProgress';
import * as Location from 'expo-location';

interface Params {
    data: ReturnType<typeof useDriverNavigationData>;
    mapState: ReturnType<typeof useDriverNavigationMapState>;
    refs: ReturnType<typeof useDriverNavigationRefs>;
    sendDriverLocationToTracking: (location: Location.LocationObject) => void;
    isCancelled: () => boolean;
}
export const normalizeHeading = (value: number) => {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
};
export function createDriverLocationListener({ data, mapState, refs, sendDriverLocationToTracking, isCancelled }: Params) {
    let lastStateUpdateTime = 0;
    let lastBackendUpdateTime = 0;
    let lastStepCheckTime = 0;
    let lastMapUpdateTime = -Infinity;
    let lastDisplayedCoordinate: { latitude: number; longitude: number } | null = null;
    const STATE_UPDATE_INTERVAL = DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS; // Mise à jour du state toutes les 5 secondes
    const BACKEND_UPDATE_INTERVAL = DRIVER_LOCATION_BACKEND_UPDATE_INTERVAL_MS; // Mise à jour WebSocket toutes les 5 secondes
    const STEP_CHECK_INTERVAL = 5000;
    return (newLocation: Location.LocationObject) => {
        if (isCancelled() || !mapState.isMountedRef.current || refs.isExitingRef.current)
            return;
        const now = Date.now();
        const normalizedLocation = normalizeDriverLocationObject(newLocation);
        if (!normalizedLocation) {
            console.warn('[Navigation] Position du conducteur ignorée car invalide :', {
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
            });
            return;
        }
        if (refs.currentLocationRef.current &&
            typeof normalizedLocation.coords.accuracy === 'number' &&
            normalizedLocation.coords.accuracy > 80) {
            return;
        }
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
        if (!isPlausibleLocationUpdate({
            previous: mapState.lastAcceptedDriverCoordinateRef.current,
            current: rawCoordinate,
            previousTimestamp: mapState.lastAcceptedDriverTimestampRef.current,
            currentTimestamp: acceptedTimestamp,
            maxJumpMeters: MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
        })) {
            console.warn('[Navigation] Position du conducteur ignorée : saut GPS incohérent');
            return;
        }
        mapState.lastAcceptedDriverCoordinateRef.current = rawCoordinate;
        mapState.lastAcceptedDriverTimestampRef.current = acceptedTimestamp;
        refs.currentLocationRef.current = normalizedLocation;
        const gpsHeading = normalizedLocation.coords.heading !== null &&
            normalizedLocation.coords.heading !== -1 &&
            (normalizedLocation.coords.speed ?? 0) > 0.8
            ? normalizeHeading(normalizedLocation.coords.heading)
            : null;
        // Safety/delivery consume validated fixes independently of map rendering.
        refs.evaluatePickupBypassRef.current?.(rawCoordinate, gpsHeading);
        if (now - lastStateUpdateTime > STATE_UPDATE_INTERVAL) {
            lastStateUpdateTime = now;
            mapState.setCurrentLocation(normalizedLocation);
        }
        if (data.tripId && mapState.isTripOngoingRef.current && now - lastBackendUpdateTime > BACKEND_UPDATE_INTERVAL) {
            lastBackendUpdateTime = now;
            sendDriverLocationToTracking(normalizedLocation);
        }
        if (now - lastStepCheckTime > STEP_CHECK_INTERVAL) {
            lastStepCheckTime = now;
            refs.updateCurrentStepRef.current?.(normalizedLocation);
        }
        if (mapState.appStateRef.current !== 'active') {
            mapState.stopDriverMarkerAnimation();
            lastDisplayedCoordinate = null;
            return;
        }
        // iOS ignores Expo's timeInterval: gate BEFORE traversing polylines/animating.
        if (now - lastMapUpdateTime > 10_000) lastDisplayedCoordinate = null;
        if (now - lastMapUpdateTime < 2000) return;
        lastMapUpdateTime = now;
        if (!refs.hasFetchedInitialDriverRouteRef.current) {
            refs.hasFetchedInitialDriverRouteRef.current = true;
            void refs.fetchRouteRef.current?.({
                originOverride: rawCoordinate,
                fitToRoute: !refs.routeFetchedRef.current,
            });
        }
        const routeAlignment = getRouteAlignedPosition(rawCoordinate, refs.routeCoordinatesRef.current, OFF_ROUTE_DISTANCE_KM);
        const distanceFromRouteMeters = distanceFromCoordinateToPolyline(rawCoordinate, refs.routeCoordinatesRef.current);
        const gpsAccuracy = typeof normalizedLocation.coords.accuracy === 'number'
            ? normalizedLocation.coords.accuracy
            : null;
        const hasReliableOffRouteSignal = gpsAccuracy === null || gpsAccuracy <= OFF_ROUTE_MAX_ACCURACY_METERS;
        const hasRouteForReroute = mapState.isTripOngoingRef.current &&
            refs.routeFetchedRef.current &&
            refs.routeCoordinatesRef.current.length >= OFF_ROUTE_MIN_ROUTE_POINTS;
        const isOffRoute = hasRouteForReroute &&
            hasReliableOffRouteSignal &&
            typeof distanceFromRouteMeters === 'number' &&
            distanceFromRouteMeters > DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS;
        refs.offRouteSampleCountRef.current = isOffRoute
            ? refs.offRouteSampleCountRef.current + 1
            : 0;
        if (isRouteDeviationConfirmed({
            distanceFromRouteMeters,
            gpsAccuracyMeters: gpsAccuracy,
            consecutiveOffRouteCount: refs.offRouteSampleCountRef.current,
            nowMs: now,
            lastRecalculationAtMs: refs.lastOffRouteRerouteAtRef.current,
            routeDeviationThresholdMeters: DRIVER_REROUTE_DEVIATION_THRESHOLD_METERS,
            confirmationCount: DRIVER_REROUTE_CONFIRMATION_COUNT,
            minRecalculationIntervalMs: DRIVER_REROUTE_MIN_INTERVAL_MS,
        }) &&
            !refs.isReroutingRef.current) {
            const routeFetcher = refs.fetchRouteRef.current;
            if (routeFetcher) {
                refs.lastOffRouteRerouteAtRef.current = now;
                refs.offRouteSampleCountRef.current = 0;
                refs.isReroutingRef.current = true;
                void routeFetcher({
                    originOverride: rawCoordinate,
                    announceReroute: true,
                    fitToRoute: false,
                }).finally(() => {
                    refs.isReroutingRef.current = false;
                });
            }
        }
        const displayedCoordinate = rawCoordinate;
        const markerMoved = !lastDisplayedCoordinate || calculateDistanceMeters(lastDisplayedCoordinate, displayedCoordinate) >= 2;
        if (markerMoved) mapState.stopDriverMarkerAnimation();
        if (markerMoved && mapState.isMapReadyRef.current) {
            const animation = mapState.driverPosition.timing({
                latitude: displayedCoordinate.latitude,
                longitude: displayedCoordinate.longitude,
                duration: 750,
                useNativeDriver: false,
                toValue: 0,
                latitudeDelta: 0,
                longitudeDelta: 0,
            });
            mapState.driverMarkerAnimationRef.current = animation;
            animation.start();
        }
        else if (markerMoved) {
            mapState.driverPosition.setValue({ ...displayedCoordinate, latitudeDelta: 0, longitudeDelta: 0 });
        }
        if (markerMoved) lastDisplayedCoordinate = displayedCoordinate;
        const alignedHeading = routeAlignment?.heading ?? gpsHeading;
        if (alignedHeading !== null) {
            mapState.setHeading((previousHeading) => {
                const currentHeading = normalizeHeading(previousHeading);
                let delta = alignedHeading - currentHeading;
                if (delta > 180)
                    delta -= 360;
                if (delta < -180)
                    delta += 360;
                if (Math.abs(delta) < 3) {
                    return previousHeading;
                }
                return normalizeHeading(currentHeading + delta * 0.45);
            });
        }
        // NOTE: Animation de caméra désactivée pour éviter les crashs mémoire
        // L'utilisateur peut recentrer manuellement avec le bouton
    };
}
