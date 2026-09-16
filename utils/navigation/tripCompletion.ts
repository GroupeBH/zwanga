import {
  calculateDistanceMeters,
  normalizeCoordinateList,
  normalizeCoordinateObject,
  type NavigationCoordinate,
} from '@/utils/navigation/routeProgress';

export const DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS = 30;
export const DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS = 25;
export const DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS = 10 * 60_000;
export const DRIVER_TRIP_END_APPROACH_DISTANCE_METERS = 40;
export const DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS = 100;

const MIN_REFERENCE_SEGMENT_METERS = 5;

type DestinationAutoCompleteInput = {
  destinationCoordinate: NavigationCoordinate | null | undefined;
  driverCoordinate: NavigationCoordinate | null | undefined;
  nearDestinationSinceMs?: number | null;
  nowMs?: number;
  distanceThresholdMeters?: number;
  dwellMs?: number;
};

export type DestinationAutoCompleteEvaluation = {
  distanceMeters: number | null;
  isInsideDestinationZone: boolean;
  nearDestinationSinceMs: number | null;
  shouldComplete: boolean;
};

type DestinationPassageInput = {
  destinationCoordinate: NavigationCoordinate | null | undefined;
  driverCoordinate: NavigationCoordinate | null | undefined;
  previousDriverCoordinate?: NavigationCoordinate | null;
  routeCoordinates?: NavigationCoordinate[];
  directDistanceThresholdMeters?: number;
  parallelDistanceThresholdMeters?: number;
};

export type DestinationPassageEvaluation = {
  distanceMeters: number | null;
  isInsideDirectCompleteZone: boolean;
  hasCrossedDestinationParallel: boolean;
  hasPassedDestinationOnRoute: boolean;
  movementClosestDistanceMeters: number | null;
  routeParallelDistanceMeters: number | null;
  routeAheadDistanceMeters: number | null;
  shouldComplete: boolean;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
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

function evaluateMovementCrossing(
  destinationCoordinate: NavigationCoordinate,
  previousDriverCoordinate: NavigationCoordinate | null,
  driverCoordinate: NavigationCoordinate,
  parallelDistanceThresholdMeters: number,
) {
  if (!previousDriverCoordinate) {
    return {
      hasCrossedDestinationParallel: false,
      movementClosestDistanceMeters: null,
    };
  }

  const start = projectToLocalMeters(destinationCoordinate, previousDriverCoordinate);
  const end = projectToLocalMeters(destinationCoordinate, driverCoordinate);
  const movement = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const lengthSquared = movement.x * movement.x + movement.y * movement.y;
  if (lengthSquared < 1) {
    return {
      hasCrossedDestinationParallel: false,
      movementClosestDistanceMeters: Math.hypot(end.x, end.y),
    };
  }

  const projectionRatio =
    (-(start.x * movement.x + start.y * movement.y)) / lengthSquared;
  const clampedRatio = Math.max(0, Math.min(1, projectionRatio));
  const closestPoint = {
    x: start.x + movement.x * clampedRatio,
    y: start.y + movement.y * clampedRatio,
  };
  const movementClosestDistanceMeters = Math.hypot(
    closestPoint.x,
    closestPoint.y,
  );

  return {
    hasCrossedDestinationParallel:
      projectionRatio >= 0 &&
      projectionRatio <= 1 &&
      movementClosestDistanceMeters <= parallelDistanceThresholdMeters,
    movementClosestDistanceMeters,
  };
}

function getRouteDestinationSegment(
  destinationCoordinate: NavigationCoordinate,
  routeCoordinates: NavigationCoordinate[] | undefined,
) {
  const route = normalizeCoordinateList(routeCoordinates ?? []);
  if (route.length === 0) {
    return null;
  }

  const routeWithDestination = [...route];
  const lastCoordinate = routeWithDestination[routeWithDestination.length - 1];
  if (calculateDistanceMeters(lastCoordinate, destinationCoordinate) > 1) {
    routeWithDestination.push(destinationCoordinate);
  }

  for (let index = routeWithDestination.length - 2; index >= 0; index -= 1) {
    const candidate = routeWithDestination[index];
    if (
      calculateDistanceMeters(candidate, destinationCoordinate) >=
      MIN_REFERENCE_SEGMENT_METERS
    ) {
      return {
        start: candidate,
        end: destinationCoordinate,
      };
    }
  }

  return null;
}

function evaluateRoutePassage(
  destinationCoordinate: NavigationCoordinate,
  driverCoordinate: NavigationCoordinate,
  routeCoordinates: NavigationCoordinate[] | undefined,
  parallelDistanceThresholdMeters: number,
) {
  const segment = getRouteDestinationSegment(destinationCoordinate, routeCoordinates);
  if (!segment) {
    return {
      hasPassedDestinationOnRoute: false,
      routeParallelDistanceMeters: null,
      routeAheadDistanceMeters: null,
    };
  }

  const start = projectToLocalMeters(destinationCoordinate, segment.start);
  const driver = projectToLocalMeters(destinationCoordinate, driverCoordinate);
  const direction = {
    x: -start.x,
    y: -start.y,
  };
  const length = Math.hypot(direction.x, direction.y);
  if (length < MIN_REFERENCE_SEGMENT_METERS) {
    return {
      hasPassedDestinationOnRoute: false,
      routeParallelDistanceMeters: null,
      routeAheadDistanceMeters: null,
    };
  }

  const unit = {
    x: direction.x / length,
    y: direction.y / length,
  };
  const routeAheadDistanceMeters = driver.x * unit.x + driver.y * unit.y;
  const routeParallelDistanceMeters = Math.abs(
    driver.x * unit.y - driver.y * unit.x,
  );

  return {
    hasPassedDestinationOnRoute:
      routeAheadDistanceMeters >= 0 &&
      routeParallelDistanceMeters <= parallelDistanceThresholdMeters,
    routeParallelDistanceMeters,
    routeAheadDistanceMeters,
  };
}

export function evaluateDestinationAutoComplete({
  destinationCoordinate,
  driverCoordinate,
  nearDestinationSinceMs,
  nowMs = Date.now(),
  distanceThresholdMeters = DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
  dwellMs = DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
}: DestinationAutoCompleteInput): DestinationAutoCompleteEvaluation {
  if (!destinationCoordinate || !driverCoordinate) {
    return {
      distanceMeters: null,
      isInsideDestinationZone: false,
      nearDestinationSinceMs: null,
      shouldComplete: false,
    };
  }

  const distanceMeters = calculateDistanceMeters(driverCoordinate, destinationCoordinate);
  const isInsideDestinationZone =
    Number.isFinite(distanceMeters) && distanceMeters <= distanceThresholdMeters;

  if (!isInsideDestinationZone) {
    return {
      distanceMeters,
      isInsideDestinationZone: false,
      nearDestinationSinceMs: null,
      shouldComplete: false,
    };
  }

  const startedAt =
    typeof nearDestinationSinceMs === 'number' && Number.isFinite(nearDestinationSinceMs)
      ? nearDestinationSinceMs
      : nowMs;

  return {
    distanceMeters,
    isInsideDestinationZone: true,
    nearDestinationSinceMs: startedAt,
    shouldComplete: nowMs - startedAt >= dwellMs,
  };
}

export function evaluateDestinationPassage({
  destinationCoordinate,
  driverCoordinate,
  previousDriverCoordinate,
  routeCoordinates,
  directDistanceThresholdMeters = DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
  parallelDistanceThresholdMeters = DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
}: DestinationPassageInput): DestinationPassageEvaluation {
  const safeDestination = normalizeCoordinateObject(destinationCoordinate);
  const safeDriverCoordinate = normalizeCoordinateObject(driverCoordinate);
  const safePreviousDriverCoordinate = normalizeCoordinateObject(
    previousDriverCoordinate,
  );

  if (!safeDestination || !safeDriverCoordinate) {
    return {
      distanceMeters: null,
      isInsideDirectCompleteZone: false,
      hasCrossedDestinationParallel: false,
      hasPassedDestinationOnRoute: false,
      movementClosestDistanceMeters: null,
      routeParallelDistanceMeters: null,
      routeAheadDistanceMeters: null,
      shouldComplete: false,
    };
  }

  const distanceMeters = calculateDistanceMeters(
    safeDriverCoordinate,
    safeDestination,
  );
  const movementPassage = evaluateMovementCrossing(
    safeDestination,
    safePreviousDriverCoordinate,
    safeDriverCoordinate,
    parallelDistanceThresholdMeters,
  );
  const routePassage = evaluateRoutePassage(
    safeDestination,
    safeDriverCoordinate,
    routeCoordinates,
    parallelDistanceThresholdMeters,
  );
  const isInsideDirectCompleteZone =
    Number.isFinite(distanceMeters) && distanceMeters <= directDistanceThresholdMeters;

  return {
    distanceMeters,
    isInsideDirectCompleteZone,
    hasCrossedDestinationParallel:
      movementPassage.hasCrossedDestinationParallel,
    hasPassedDestinationOnRoute: routePassage.hasPassedDestinationOnRoute,
    movementClosestDistanceMeters:
      movementPassage.movementClosestDistanceMeters,
    routeParallelDistanceMeters: routePassage.routeParallelDistanceMeters,
    routeAheadDistanceMeters: routePassage.routeAheadDistanceMeters,
    shouldComplete:
      isInsideDirectCompleteZone ||
      movementPassage.hasCrossedDestinationParallel ||
      routePassage.hasPassedDestinationOnRoute,
  };
}
