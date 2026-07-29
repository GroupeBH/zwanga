import {
  calculateDistanceMeters,
  type NavigationCoordinate,
} from '@/utils/navigation/routeProgress';

export const DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS = 20;
export const DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS = 25;
export const DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS = 10 * 60_000;
export const DRIVER_TRIP_END_APPROACH_DISTANCE_METERS = 40;

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
