import { NavigationCoordinate, NavigationStop, ClosestPolylinePoint, RemainingRoute, PolylineProgress, LocationJumpInput, RouteDeviationInput, ROUTE_DEVIATION_THRESHOLD_METERS, DEVIATION_CONFIRMATION_COUNT, MIN_ROUTE_RECALC_INTERVAL_MS, MAX_ACCEPTABLE_GPS_ACCURACY_METERS, MAX_PLAUSIBLE_LOCATION_JUMP_METERS, MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND, ROUTE_JOIN_VISUAL_THRESHOLD_METERS, MAX_ROUTE_DESTINATION_GAP_METERS, toRadians, normalizeHeading, isValidCoordinate, normalizeCoordinateObject, normalizeCoordinateList } from './coordinateModel';
export type { NavigationCoordinate } from './coordinateModel';
export type { NavigationStop } from './coordinateModel';
export type { ClosestPolylinePoint } from './coordinateModel';
export type { RemainingRoute } from './coordinateModel';
export type { PolylineProgress } from './coordinateModel';
export type { LocationJumpInput } from './coordinateModel';
export type { RouteDeviationInput } from './coordinateModel';
export { ROUTE_DEVIATION_THRESHOLD_METERS } from './coordinateModel';
export { DEVIATION_CONFIRMATION_COUNT } from './coordinateModel';
export { MIN_ROUTE_RECALC_INTERVAL_MS } from './coordinateModel';
export { MAX_ACCEPTABLE_GPS_ACCURACY_METERS } from './coordinateModel';
export { MAX_PLAUSIBLE_LOCATION_JUMP_METERS } from './coordinateModel';
export { MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND } from './coordinateModel';
export { LOCATION_FRESHNESS_MS } from './coordinateModel';
export { ROUTE_JOIN_VISUAL_THRESHOLD_METERS } from './coordinateModel';
export { MAX_ROUTE_DESTINATION_GAP_METERS } from './coordinateModel';
export { normalizeCoordinate } from './coordinateModel';
export { isValidCoordinate } from './coordinateModel';
export { normalizeCoordinateObject } from './coordinateModel';
export { normalizeCoordinateList } from './coordinateModel';
export { isFreshLocationTimestamp } from './coordinateModel';


export function calculateDistanceMeters(
  first: NavigationCoordinate,
  second: NavigationCoordinate,
) {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = toRadians(second.latitude - first.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function calculateBearingDegrees(
  from: NavigationCoordinate,
  to: NavigationCoordinate,
) {
  const startLatitude = toRadians(from.latitude);
  const endLatitude = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);

  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

export function calculatePolylineDistanceMeters(
  coordinates: NavigationCoordinate[],
) {
  let distanceMeters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distanceMeters += calculateDistanceMeters(
      coordinates[index - 1],
      coordinates[index],
    );
  }
  return distanceMeters;
}

function projectToLocalMeters(
  origin: NavigationCoordinate,
  coordinate: NavigationCoordinate,
) {
  const latitudeScale = 111_320;
  const longitudeScale = 111_320 * Math.cos(toRadians(origin.latitude));
  return {
    x: (coordinate.longitude - origin.longitude) * longitudeScale,
    y: (coordinate.latitude - origin.latitude) * latitudeScale,
  };
}

function unprojectFromLocalMeters(
  origin: NavigationCoordinate,
  point: { x: number; y: number },
): NavigationCoordinate {
  const latitudeScale = 111_320;
  const longitudeScale = 111_320 * Math.cos(toRadians(origin.latitude));
  return {
    latitude: origin.latitude + point.y / latitudeScale,
    longitude: origin.longitude + point.x / longitudeScale,
  };
}

function projectPointToSegment(
  point: NavigationCoordinate,
  segmentStart: NavigationCoordinate,
  segmentEnd: NavigationCoordinate,
) {
  const p = projectToLocalMeters(point, point);
  const a = projectToLocalMeters(point, segmentStart);
  const b = projectToLocalMeters(point, segmentEnd);
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const segmentLengthSquared = ab.x * ab.x + ab.y * ab.y;
  const ratio =
    segmentLengthSquared > 0
      ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / segmentLengthSquared))
      : 0;
  const projectedPoint = {
    x: a.x + ab.x * ratio,
    y: a.y + ab.y * ratio,
  };
  const coordinate = unprojectFromLocalMeters(point, projectedPoint);

  return {
    coordinate,
    distanceMeters: calculateDistanceMeters(point, coordinate),
  };
}

export function findClosestPointOnPolyline(
  point: NavigationCoordinate,
  polyline: NavigationCoordinate[],
): ClosestPolylinePoint | null {
  const current = normalizeCoordinateObject(point);
  const route = normalizeCoordinateList(polyline);
  if (!current || route.length < 2) {
    return null;
  }

  let closest: ClosestPolylinePoint | null = null;
  for (let index = 0; index < route.length - 1; index += 1) {
    const candidate = projectPointToSegment(current, route[index], route[index + 1]);
    if (!closest || candidate.distanceMeters < closest.distanceMeters) {
      closest = {
        ...candidate,
        segmentIndex: index,
      };
    }
  }

  return closest;
}

function pushCoordinateIfDifferent(
  coordinates: NavigationCoordinate[],
  coordinate: NavigationCoordinate,
  toleranceMeters = 2,
) {
  const previous = coordinates[coordinates.length - 1];
  if (!previous || calculateDistanceMeters(previous, coordinate) > toleranceMeters) {
    coordinates.push(coordinate);
  }
}

export function trimPolylineFromCurrentPosition(
  currentPosition: NavigationCoordinate | null | undefined,
  routeCoordinates: NavigationCoordinate[],
  destination: NavigationCoordinate | null | undefined,
  options: {
    maxDistanceToRouteMeters?: number;
    maxDestinationGapMeters?: number;
  } = {},
): RemainingRoute {
  const current = normalizeCoordinateObject(currentPosition);
  const destinationCoordinate = normalizeCoordinateObject(destination);
  const route = normalizeCoordinateList(routeCoordinates);
  const maxDistanceToRouteMeters =
    options.maxDistanceToRouteMeters ?? ROUTE_DEVIATION_THRESHOLD_METERS * 2;
  const maxDestinationGapMeters =
    options.maxDestinationGapMeters ?? MAX_ROUTE_DESTINATION_GAP_METERS;

  if (!current || !destinationCoordinate || route.length < 2) {
    const fallback = [current, destinationCoordinate].filter(
      (coordinate): coordinate is NavigationCoordinate => Boolean(coordinate),
    );
    return {
      remainingCoordinates: fallback,
      traveledCoordinates: [],
      distanceMeters: calculatePolylineDistanceMeters(fallback),
      closestPoint: null,
      isRouteUsable: false,
    };
  }

  const closestToDestination = findClosestPointOnPolyline(
    destinationCoordinate,
    route,
  );
  if (
    !closestToDestination ||
    closestToDestination.distanceMeters > maxDestinationGapMeters
  ) {
    const fallback = [current, destinationCoordinate];
    return {
      remainingCoordinates: fallback,
      traveledCoordinates: [],
      distanceMeters: calculatePolylineDistanceMeters(fallback),
      closestPoint: null,
      isRouteUsable: false,
    };
  }

  const closest = findClosestPointOnPolyline(current, route);
  if (!closest || closest.distanceMeters > maxDistanceToRouteMeters) {
    const fallback = [current, destinationCoordinate];
    return {
      remainingCoordinates: fallback,
      traveledCoordinates: [],
      distanceMeters: calculatePolylineDistanceMeters(fallback),
      closestPoint: closest,
      isRouteUsable: false,
    };
  }

  const traveledCoordinates = route.slice(0, closest.segmentIndex + 1);
  pushCoordinateIfDifferent(traveledCoordinates, closest.coordinate);

  const remainingCoordinates: NavigationCoordinate[] = [];
  pushCoordinateIfDifferent(remainingCoordinates, current, ROUTE_JOIN_VISUAL_THRESHOLD_METERS);
  if (
    calculateDistanceMeters(current, closest.coordinate) >
    ROUTE_JOIN_VISUAL_THRESHOLD_METERS
  ) {
    pushCoordinateIfDifferent(remainingCoordinates, closest.coordinate);
  }
  route.slice(closest.segmentIndex + 1).forEach((coordinate) => {
    pushCoordinateIfDifferent(remainingCoordinates, coordinate);
  });
  pushCoordinateIfDifferent(remainingCoordinates, destinationCoordinate);

  return {
    remainingCoordinates,
    traveledCoordinates,
    distanceMeters: calculatePolylineDistanceMeters(remainingCoordinates),
    closestPoint: closest,
    isRouteUsable: true,
  };
}

export function distanceFromCoordinateToPolyline(
  coordinate: NavigationCoordinate,
  polyline: NavigationCoordinate[],
) {
  return findClosestPointOnPolyline(coordinate, polyline)?.distanceMeters ?? null;
}

export function getPolylineProgress(
  coordinate: NavigationCoordinate,
  polyline: NavigationCoordinate[],
): PolylineProgress | null {
  const route = normalizeCoordinateList(polyline);
  const closestPoint = findClosestPointOnPolyline(coordinate, route);
  if (!closestPoint) {
    return null;
  }

  const traveledCoordinates = route.slice(0, closestPoint.segmentIndex + 1);
  pushCoordinateIfDifferent(traveledCoordinates, closestPoint.coordinate);
  const routeDistanceMeters = calculatePolylineDistanceMeters(route);
  const distanceFromStartMeters =
    calculatePolylineDistanceMeters(traveledCoordinates);

  return {
    closestPoint,
    distanceFromStartMeters,
    distanceToEndMeters: Math.max(
      0,
      routeDistanceMeters - distanceFromStartMeters,
    ),
    routeDistanceMeters,
  };
}

export function isPlausibleLocationUpdate({
  previous,
  current,
  previousTimestamp,
  currentTimestamp,
  maxJumpMeters = MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
  maxSpeedMetersPerSecond = MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND,
}: LocationJumpInput) {
  const previousCoordinate = normalizeCoordinateObject(previous);
  const currentCoordinate = normalizeCoordinateObject(current);
  if (!currentCoordinate) {
    return false;
  }

  if (!previousCoordinate) {
    return true;
  }

  if (
    typeof previousTimestamp === 'number' &&
    typeof currentTimestamp === 'number' &&
    Number.isFinite(previousTimestamp) &&
    Number.isFinite(currentTimestamp)
  ) {
    if (currentTimestamp < previousTimestamp) {
      return false;
    }

    const elapsedSeconds = Math.max(1, (currentTimestamp - previousTimestamp) / 1000);
    const allowedDistance = Math.max(
      maxJumpMeters,
      elapsedSeconds * maxSpeedMetersPerSecond,
    );
    return calculateDistanceMeters(previousCoordinate, currentCoordinate) <= allowedDistance;
  }

  return calculateDistanceMeters(previousCoordinate, currentCoordinate) <= maxJumpMeters;
}

export function normalizeHeadingDelta(left: number, right: number) {
  return Math.abs(((normalizeHeading(left) - normalizeHeading(right) + 540) % 360) - 180);
}

export function isRouteDeviationConfirmed({
  distanceFromRouteMeters,
  gpsAccuracyMeters,
  consecutiveOffRouteCount,
  nowMs,
  lastRecalculationAtMs,
  headingDeltaDegrees,
  routeDeviationThresholdMeters = ROUTE_DEVIATION_THRESHOLD_METERS,
  confirmationCount = DEVIATION_CONFIRMATION_COUNT,
  minRecalculationIntervalMs = MIN_ROUTE_RECALC_INTERVAL_MS,
}: RouteDeviationInput) {
  if (
    typeof distanceFromRouteMeters !== 'number' ||
    !Number.isFinite(distanceFromRouteMeters) ||
    distanceFromRouteMeters <= routeDeviationThresholdMeters
  ) {
    return false;
  }

  if (
    typeof gpsAccuracyMeters === 'number' &&
    Number.isFinite(gpsAccuracyMeters) &&
    gpsAccuracyMeters > MAX_ACCEPTABLE_GPS_ACCURACY_METERS
  ) {
    return false;
  }

  if (consecutiveOffRouteCount < confirmationCount) {
    return false;
  }

  if (nowMs - lastRecalculationAtMs < minRecalculationIntervalMs) {
    return false;
  }

  return !(
    typeof headingDeltaDegrees === 'number' &&
    Number.isFinite(headingDeltaDegrees) &&
    headingDeltaDegrees > 135
  );
}

export function resolveActiveDestination(
  stops: NavigationStop[],
  finalDestination: NavigationCoordinate | null | undefined,
) {
  const activeStop = stops.find(
    (stop) => !stop.completed && isValidCoordinate(stop.coordinate),
  );

  if (activeStop) {
    return {
      id: activeStop.id,
      kind: activeStop.kind ?? 'destination',
      coordinate: normalizeCoordinateObject(activeStop.coordinate)!,
    };
  }

  const normalizedFinalDestination = normalizeCoordinateObject(finalDestination);
  return normalizedFinalDestination
    ? {
        id: 'trip-destination',
        kind: 'destination' as const,
        coordinate: normalizedFinalDestination,
      }
    : null;
}
