import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { isFreshLocationObject } from '../../features/driver-navigation/navigationBooking';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useCallback, useEffect, useMemo } from 'react';

interface Params {
  refs: ReturnType<typeof useDriverNavigationRefs>;
  data: ReturnType<typeof useDriverNavigationData>;
  activeRouteDestination: NavigationCoordinate | null;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  activeNavigationDestination: { id: string; kind: "pickup" | "dropoff" | "destination"; coordinate: NavigationCoordinate; } | null;
}

export function useDriverRouteContext({
  refs,
  data,
  activeRouteDestination,
  mapState,
  activeNavigationDestination,
}: Params) {
  const getFreshDriverCoordinate = useCallback((): RouteCoordinate | null => {
    const location = refs.currentLocationRef.current;
    if (!isFreshLocationObject(location)) {
      return null;
    }

    return normalizeTripMapCoordinate(
      location.coords.latitude,
      location.coords.longitude,
    );
  }, []);

  const routeSignature = useMemo(() => {
    if (!data.trip || !data.tripDepartureCoordinate || !activeRouteDestination) {
      return '';
    }

    const waypointSignature = mapState.waypoints
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
      data.trip.id,
      data.trip.status,
      data.tripDepartureCoordinate.latitude.toFixed(6),
      data.tripDepartureCoordinate.longitude.toFixed(6),
      activeNavigationDestination?.id ?? 'trip-destination',
      activeRouteDestination.latitude.toFixed(6),
      activeRouteDestination.longitude.toFixed(6),
      waypointSignature,
    ].join('|');
  }, [
    activeNavigationDestination?.id,
    activeRouteDestination,
    data.trip,
    data.tripDepartureCoordinate,
    mapState.waypoints,
  ]);

  useEffect(() => {
    if (!data.isScreenActive) {
      refs.routeFetchedRef.current = false;
      mapState.setIsLoadingRoute(false);
      mapState.setIsReroutingRoute(false);
      return;
    }
    if (!data.trip || !data.tripDepartureCoordinate || !activeRouteDestination || !routeSignature) {
      return;
    }

    const signatureChanged = refs.routeSignatureRef.current !== routeSignature;
    
    // Ne fetch que si:
    // 1. On a un trip avec départ/arrivée publies
    // 2. ET (le route n'a jamais été fetch OU les waypoints ont changé)
    // 3. ET au moins 30 secondes se sont écoulées depuis le dernier fetch
    if (!signatureChanged && refs.routeFetchedRef.current) {
      return;
    }

    refs.routeSignatureRef.current = routeSignature;
    const originOverride = data.isTripOngoing ? getFreshDriverCoordinate() ?? undefined : undefined;
    void refs.fetchRouteRef.current?.({ originOverride });
  }, [
    getFreshDriverCoordinate,
    data.isScreenActive,
    data.isTripOngoing,
    routeSignature,
    data.trip,
    activeRouteDestination,
    data.tripDepartureCoordinate,
  ]);

  return {
    routeSignature,
    getFreshDriverCoordinate,
  };
}
