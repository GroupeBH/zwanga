import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import {
  formatNavigationDistance,
  formatNavigationDuration,
  formatNavigationEta,
} from '../../features/driver-navigation/navigationPresentation';
import {
  getSafeMapCoordinateList,
  getSafePolylineCoordinates,
  shouldUseDirectNearWaypointRoute,
} from '../../features/driver-navigation/navigationMap';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { areTripMapCoordinatesSame, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { calculateDistanceMeters, trimPolylineFromCurrentPosition } from '@/utils/navigation/routeProgress';
import { DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS } from '@/utils/navigation/tripCompletion';
import { useEffect, useMemo } from 'react';

interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  activeNavigationDestination: { id: string; kind: "pickup" | "dropoff" | "destination"; coordinate: NavigationCoordinate; } | null;
  activeRouteDestination: NavigationCoordinate | null;
}

export function useDriverNavigationPresentation({
  data,
  mapState,
  activeNavigationDestination,
  activeRouteDestination,
}: Params) {
  const hasValidTripCoordinates = Boolean(
    data.tripDepartureCoordinate &&
      data.tripArrivalCoordinate &&
      !areTripMapCoordinatesSame(data.tripDepartureCoordinate, data.tripArrivalCoordinate),
  );

  const canRestartTripFromOverlay = Boolean(
    data.tripId && data.trip?.status !== 'completed' && data.trip?.status !== 'cancelled',
  );
  const isRestartOverlayActionLoading = data.isRestartingTrip || data.isTripFetching;
  const tripDepartureLabel = (data.trip?.departure?.address || data.trip?.departure?.name || 'Départ du trajet').trim();
  const tripArrivalLabel = (data.trip?.arrival?.address || data.trip?.arrival?.name || 'Arrivée du trajet').trim();
  const currentNavigationWaypoint =
    mapState.waypoints.length > 0 && mapState.currentWaypointIndex < mapState.waypoints.length
      ? mapState.waypoints[mapState.currentWaypointIndex]
      : null;
  const currentNavigationWaypointCoordinate = currentNavigationWaypoint
    ? normalizeTripMapCoordinate(
        currentNavigationWaypoint.location?.lat,
        currentNavigationWaypoint.location?.lng,
      )
    : null;
  const isCurrentWaypointAtTripArrival = Boolean(
    currentNavigationWaypointCoordinate &&
      data.tripArrivalCoordinate &&
      calculateDistanceMeters(
        currentNavigationWaypointCoordinate,
        data.tripArrivalCoordinate,
      ) <= DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  );
  const shouldShowTripArrivalMarker = Boolean(
    data.tripArrivalCoordinate &&
      activeNavigationDestination?.kind !== 'dropoff' &&
      !isCurrentWaypointAtTripArrival,
  );

  const currentDriverCoordinate = useMemo(
    () =>
      normalizeTripMapCoordinate(
        mapState.currentLocation?.coords?.latitude,
        mapState.currentLocation?.coords?.longitude,
      ),
    [mapState.currentLocation?.coords?.latitude, mapState.currentLocation?.coords?.longitude],
  );
  const remainingRoute = useMemo(
    () => {
      const routeOrigin = data.isTripOngoing
        ? currentDriverCoordinate
        : mapState.routeCoordinates[0] ?? data.tripDepartureCoordinate;
      const safeRouteCoordinates = getSafePolylineCoordinates(mapState.routeCoordinates);
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
          isTripOngoing: data.isTripOngoing,
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
      data.isTripOngoing,
      mapState.routeCoordinates,
      data.tripDepartureCoordinate,
    ],
  );
  const displayedRemainingDistanceMeters =
    remainingRoute.remainingCoordinates.length > 1
      ? remainingRoute.distanceMeters
      : mapState.routeDistanceMeters;
  const displayedRemainingDurationSeconds =
    typeof displayedRemainingDistanceMeters === 'number' &&
    typeof mapState.routeDistanceMeters === 'number' &&
    mapState.routeDistanceMeters > 0 &&
    typeof mapState.routeDurationSeconds === 'number'
      ? mapState.routeDurationSeconds * Math.min(1, displayedRemainingDistanceMeters / mapState.routeDistanceMeters)
      : mapState.routeDurationSeconds;
  const displayedDistanceText =
    formatNavigationDistance(displayedRemainingDistanceMeters) ?? mapState.totalDistance;
  const displayedDurationText =
    formatNavigationDuration(displayedRemainingDurationSeconds) ?? mapState.totalDuration;
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
    if (!canToggleRouteSections && mapState.routeSectionFocus === 'remaining') {
      mapState.setRouteSectionFocus('next');
    }
  }, [canToggleRouteSections, mapState.routeSectionFocus]);

  return {
    hasValidTripCoordinates,
    currentDriverCoordinate,
    routeSectionCoordinates,
    tripDepartureLabel,
    currentNavigationWaypoint,
    currentNavigationWaypointCoordinate,
    shouldShowTripArrivalMarker,
    tripArrivalLabel,
    canToggleRouteSections,
    canRestartTripFromOverlay,
    isRestartOverlayActionLoading,
    displayedDurationText,
    displayedDistanceText,
    displayedEtaText,
  };
}
