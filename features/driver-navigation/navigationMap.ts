import {
  RouteCoordinate,
  MapEdgePadding,
  DIRECT_NEAR_WAYPOINT_ROUTE_DISTANCE_METERS,
  DIRECT_NEAR_WAYPOINT_REACHED_DISTANCE_METERS,
  DIRECT_NEAR_WAYPOINT_MAX_TURN_DEGREES,
  DIRECT_NEAR_WAYPOINT_MAX_ROUTE_RATIO,
  ROUTE_TURN_SEGMENT_MIN_METERS,
  MAP_FIT_MIN_COORDINATE_DISTANCE_METERS,
  MAP_POLYLINE_MIN_COORDINATE_DISTANCE_METERS,
  DEFAULT_MAP_FOCUS_DELTA,
} from './navigationModel';
import { isCoordinateInKinshasaBounds, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import {
  MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
  calculateBearingDegrees,
  calculateDistanceMeters,
  calculatePolylineDistanceMeters,
  normalizeHeadingDelta,
  type NavigationStop,
} from '@/utils/navigation/routeProgress';
import type MapView from 'react-native-maps';
import { fitNavigationCamera, type MapLayout } from '@/utils/navigation/mapCamera';

export const isCoordinateAllowedForNavigationRoute = (
  coordinate: RouteCoordinate | null | undefined,
  restrictToKinshasa: boolean,
): coordinate is RouteCoordinate => Boolean(
  coordinate && (!restrictToKinshasa || isCoordinateInKinshasaBounds(coordinate)),
);
export const OFF_ROUTE_MAX_ACCURACY_METERS = MAX_ACCEPTABLE_GPS_ACCURACY_METERS;
export const OFF_ROUTE_MIN_ROUTE_POINTS = 2;

export const getSafeMapCoordinate = (
  coordinate: RouteCoordinate | null | undefined,
) =>
  coordinate
    ? normalizeTripMapCoordinate(coordinate.latitude, coordinate.longitude)
    : null;

export const getSafeMapCoordinateList = (
  coordinates: (RouteCoordinate | null | undefined)[],
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

export const getSafePolylineCoordinates = (
  coordinates: (RouteCoordinate | null | undefined)[],
) => {
  const safeCoordinates = getSafeMapCoordinateList(coordinates);
  return safeCoordinates.length > 1 ? safeCoordinates : [];
};

export const fitMapToSafeCoordinates = (
  map: MapView | null,
  coordinates: (RouteCoordinate | null | undefined)[],
  {
    animated = true,
    durationMs = 320,
    edgePadding,
    logContext = 'navigation-map',
    singleCoordinateDelta = DEFAULT_MAP_FOCUS_DELTA,
    layout = null,
  }: {
    animated?: boolean;
    durationMs?: number;
    edgePadding: MapEdgePadding;
    logContext?: string;
    singleCoordinateDelta?: number;
    layout?: MapLayout | null;
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
    return fitNavigationCamera(map, safeCoordinates, layout, {
      edgePadding, animated, durationMs, singleCoordinateDelta,
    });
  } catch (error) {
    console.warn('[Navigation] Ajustement de la carte ignoré pour éviter un plantage :', {
      context: logContext,
      error,
    });
  }
};

export const getMaximumRouteTurnDegrees = (coordinates: RouteCoordinate[]) => {
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

export const shouldUseDirectNearWaypointRoute = ({
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
