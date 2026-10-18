import { stopDriverGpsProfile } from './driverGpsProfile';
import { getRtkErrorStatus, shouldBackOffAfterBackgroundResponse } from './driverTrackingErrors';
import * as Location from 'expo-location';
import { getActiveDriverBackgroundTripSession, updateActiveDriverBackgroundTripSession } from '@/services/driverBackgroundLocationSession';
import { hasRecoverableSession, handle401Error } from '@/services/tokenRefresh';
import { store } from '@/store';
import { tripApi } from '@/store/api/tripApi';
import { MAX_ACCEPTABLE_GPS_ACCURACY_METERS } from '@/utils/navigation/routeProgress';
import { DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS, DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS, DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS, DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS, evaluateDestinationAutoComplete, evaluateDestinationPassage } from '@/utils/navigation/tripCompletion';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

const BACKGROUND_LOCATION_FETCH_TIMEOUT_MS = 18_000;
const BACKGROUND_COMPLETE_FAILURE_BACKOFF_MS = 45_000;
let completeTripRequestInFlight = false;
let completeTripBackoffUntil = 0;

export async function completeTripFromBackground(tripId: string) {
  if (completeTripRequestInFlight || Date.now() < completeTripBackoffUntil) {
    return false;
  }

  completeTripRequestInFlight = true;

  try {
    if (!(await hasRecoverableSession())) {
      return false;
    }

    const send = async () => {
      const request = store.dispatch(tripApi.endpoints.completeTrip.initiate(tripId));
      const timeout = setTimeout(
        () => request.abort(),
        BACKGROUND_LOCATION_FETCH_TIMEOUT_MS,
      );

      try {
        return await request;
      } finally {
        clearTimeout(timeout);
        request.reset();
      }
    };

    let result = await send();
    if (getRtkErrorStatus(result.error) === 401 && (await handle401Error())) {
      result = await send();
    }

    if (result.error || !result.data) {
      const responseStatus = getRtkErrorStatus(result.error);
      if (shouldBackOffAfterBackgroundResponse(responseStatus)) {
        completeTripBackoffUntil = Date.now() + BACKGROUND_COMPLETE_FAILURE_BACKOFF_MS;
      }
      console.warn('[DriverBackgroundLocation] Trajet non finalise en arrière-plan:', {
        status: responseStatus,
        tripId,
      });
      return false;
    }

    return true;
  } catch (error) {
    completeTripBackoffUntil = Date.now() + BACKGROUND_COMPLETE_FAILURE_BACKOFF_MS;
    console.warn('[DriverBackgroundLocation] Finalisation impossible:', error);
    return false;
  } finally {
    completeTripRequestInFlight = false;
  }
}

export const isLocationAccurateEnoughForTripEnd = (location: Location.LocationObject) => {
  const accuracy = location.coords.accuracy;
  return (
    typeof accuracy !== 'number' ||
    !Number.isFinite(accuracy) ||
    accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_METERS
  );
};

export const getLocationEventTimeMs = (location: Location.LocationObject) => {
  const timestamp = Number(location.timestamp);
  const now = Date.now();
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now ? timestamp : now;
};

export async function evaluateBackgroundTripEnd(
  tripId: string,
  locations: Location.LocationObject[],
) {
  const session = await getActiveDriverBackgroundTripSession();
  if (!session || session.tripId !== tripId || !session.arrivalCoordinate) {
    return false;
  }

  let nearDestinationSinceMs = session.nearDestinationSinceMs ?? null;
  let previousDriverCoordinate = session.lastDriverCoordinate ?? null;
  let lastDistanceMeters: number | null = null;
  const sortedLocations = locations
    .filter((location) => typeof location?.timestamp === 'number')
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const location of sortedLocations) {
    if (!isLocationAccurateEnoughForTripEnd(location)) {
      continue;
    }

    const driverCoordinate = normalizeTripMapCoordinate(
      location.coords.latitude,
      location.coords.longitude,
    );
    if (!driverCoordinate) {
      continue;
    }

    const évaluation = evaluateDestinationAutoComplete({
      destinationCoordinate: session.arrivalCoordinate,
      driverCoordinate,
      nearDestinationSinceMs,
      nowMs: getLocationEventTimeMs(location),
      distanceThresholdMeters:
        session.autoCompleteDistanceMeters ?? DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
      dwellMs: session.autoCompleteDwellMs ?? DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
    });
    const passage = evaluateDestinationPassage({
      destinationCoordinate: session.arrivalCoordinate,
      driverCoordinate,
      previousDriverCoordinate,
      directDistanceThresholdMeters: DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
      parallelDistanceThresholdMeters: DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
    });

    nearDestinationSinceMs = évaluation.nearDestinationSinceMs;
    lastDistanceMeters = passage.distanceMeters ?? évaluation.distanceMeters;
    previousDriverCoordinate = driverCoordinate;

    if (!évaluation.shouldComplete && !passage.shouldComplete) {
      continue;
    }

    const completed = await completeTripFromBackground(tripId);
    if (completed) {
      console.log('[DriverBackgroundLocation] Trajet finalise en arrière-plan:', {
        tripId,
        distanceMeters: lastDistanceMeters,
      });
      await stopDriverGpsProfile(tripId);
      return true;
    }
  }

  await updateActiveDriverBackgroundTripSession((currentSession) => {
    if (currentSession.tripId !== tripId) {
      return currentSession;
    }

    return {
      ...currentSession,
      lastDriverCoordinate: previousDriverCoordinate,
      nearDestinationSinceMs,
    };
  });

  return false;
}
