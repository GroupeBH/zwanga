

export type NavigationCoordinate = {
  latitude: number;
  longitude: number;
};

export type NavigationStop = {
  id: string;
  completed: boolean;
  coordinate: NavigationCoordinate;
  kind?: 'pickup' | 'dropoff' | 'destination';
};

export type ClosestPolylinePoint = {
  coordinate: NavigationCoordinate;
  distanceMeters: number;
  segmentIndex: number;
};

export type RemainingRoute = {
  remainingCoordinates: NavigationCoordinate[];
  traveledCoordinates: NavigationCoordinate[];
  distanceMeters: number;
  closestPoint: ClosestPolylinePoint | null;
  isRouteUsable: boolean;
};

export type PolylineProgress = {
  closestPoint: ClosestPolylinePoint;
  distanceFromStartMeters: number;
  distanceToEndMeters: number;
  routeDistanceMeters: number;
};

export type LocationJumpInput = {
  previous: NavigationCoordinate | null | undefined;
  current: NavigationCoordinate | null | undefined;
  previousTimestamp?: number | null;
  currentTimestamp?: number | null;
  maxJumpMeters?: number;
  maxSpeedMetersPerSecond?: number;
};

export type RouteDeviationInput = {
  distanceFromRouteMeters: number | null | undefined;
  gpsAccuracyMeters: number | null | undefined;
  consecutiveOffRouteCount: number;
  nowMs: number;
  lastRecalculationAtMs: number;
  headingDeltaDegrees?: number | null;
  routeDeviationThresholdMeters?: number;
  confirmationCount?: number;
  minRecalculationIntervalMs?: number;
};

// Kinshasa urban defaults: tolerate small GPS drift and short network lag,
// but reject jumps that would imply highway-scale teleporting in city traffic.
export const ROUTE_DEVIATION_THRESHOLD_METERS = 80;
export const DEVIATION_CONFIRMATION_COUNT = 3;
export const MIN_ROUTE_RECALC_INTERVAL_MS = 30_000;
export const MAX_ACCEPTABLE_GPS_ACCURACY_METERS = 80;
export const MAX_PLAUSIBLE_LOCATION_JUMP_METERS = 250;
export const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 70;
export const LOCATION_FRESHNESS_MS = 30_000;
export const ROUTE_JOIN_VISUAL_THRESHOLD_METERS = 12;
export const MAX_ROUTE_DESTINATION_GAP_METERS = 1500;

export const RDC_BOUNDS = {
  minLatitude: -13.5,
  maxLatitude: 5.5,
  minLongitude: 12,
  maxLongitude: 31.5,
};

export function isInRdcBounds(latitude: number, longitude: number) {
  return (
    latitude >= RDC_BOUNDS.minLatitude &&
    latitude <= RDC_BOUNDS.maxLatitude &&
    longitude >= RDC_BOUNDS.minLongitude &&
    longitude <= RDC_BOUNDS.maxLongitude
  );
}

export function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function normalizeHeading(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function normalizeCoordinate(
  latitudeValue: unknown,
  longitudeValue: unknown,
): NavigationCoordinate | null {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001)
  ) {
    return null;
  }

  if (isInRdcBounds(latitude, longitude)) {
    return { latitude, longitude };
  }

  if (isInRdcBounds(longitude, latitude)) {
    return { latitude: longitude, longitude: latitude };
  }

  return null;
}

export function isValidCoordinate(
  coordinate: NavigationCoordinate | null | undefined,
) {
  return Boolean(
    coordinate && normalizeCoordinate(coordinate.latitude, coordinate.longitude),
  );
}

export function normalizeCoordinateObject(
  coordinate: NavigationCoordinate | null | undefined,
) {
  return coordinate
    ? normalizeCoordinate(coordinate.latitude, coordinate.longitude)
    : null;
}

export function normalizeCoordinateList(
  coordinates: NavigationCoordinate[],
): NavigationCoordinate[] {
  const normalized: NavigationCoordinate[] = [];
  for (const coordinate of coordinates) {
    const safeCoordinate = normalizeCoordinateObject(coordinate);
    if (!safeCoordinate) {
      return [];
    }
    normalized.push(safeCoordinate);
  }
  return normalized;
}

export function isFreshLocationTimestamp(
  timestamp: number | null | undefined,
  nowMs = Date.now(),
  maxAgeMs = LOCATION_FRESHNESS_MS,
) {
  return (
    typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    timestamp <= nowMs &&
    nowMs - timestamp <= maxAgeMs
  );
}
