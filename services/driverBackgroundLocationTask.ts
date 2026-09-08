import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
  ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
} from '@/constants/rideProgress';
import {
  clearActiveDriverBackgroundTripId,
  getActiveDriverBackgroundTripSession,
  setActiveDriverBackgroundTripId,
  updateActiveDriverBackgroundTripSession,
  type DriverBackgroundLocationCoordinate,
} from '@/services/driverBackgroundLocationSession';
import { getValidAccessToken, handle401Error } from '@/services/tokenRefresh';
import { store } from '@/store';
import { tripApi } from '@/store/api/tripApi';
import { MAX_ACCEPTABLE_GPS_ACCURACY_METERS } from '@/utils/navigation/routeProgress';
import {
  DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
  DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  evaluateDestinationAutoComplete,
  evaluateDestinationPassage,
} from '@/utils/navigation/tripCompletion';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export const DRIVER_BACKGROUND_LOCATION_TASK = 'zwanga-driver-background-location';

const BACKGROUND_LOCATION_FETCH_TIMEOUT_MS = 18_000;
const BACKGROUND_LOCATION_FAILURE_BACKOFF_MS = 30_000;
const BACKGROUND_COMPLETE_FAILURE_BACKOFF_MS = 45_000;
const BACKGROUND_PERMISSION_RETRY_COOLDOWN_MS = 10 * 60_000;

let lastBackgroundLocationSentAt = 0;
let lastBackgroundPermissionDeniedAt = 0;
let driverLocationRequestInFlight = false;
let driverLocationBackoffUntil = 0;
let completeTripRequestInFlight = false;
let completeTripBackoffUntil = 0;

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

type StartDriverBackgroundLocationTrackingOptions = {
  arrivalCoordinate?: DriverBackgroundLocationCoordinate | null;
  lastDriverCoordinate?: DriverBackgroundLocationCoordinate | null;
  autoCompleteDistanceMeters?: number;
  autoCompleteDwellMs?: number;
  requestMissingPermissions?: boolean;
};

const isDriverBackgroundLocationAvailable = async () => {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    return await TaskManager.isAvailableAsync();
  } catch (error) {
    console.warn('[DriverBackgroundLocation] TaskManager indisponible:', error);
    return false;
  }
};

const isDriverBackgroundLocationTaskRegistered = async () => {
  try {
    if (!(await isDriverBackgroundLocationAvailable())) {
      return false;
    }

    return await TaskManager.isTaskRegisteredAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Vérification task impossible:', error);
    return false;
  }
};

const hasStartedDriverBackgroundLocationUpdates = async () => {
  try {
    if (!(await isDriverBackgroundLocationAvailable())) {
      return false;
    }

    return await Location.hasStartedLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  } catch (error) {
    console.warn('[DriverBackgroundLocation] État task localisation inconnu:', error);
    return isDriverBackgroundLocationTaskRegistered();
  }
};

const stopRegisteredDriverBackgroundLocationTask = async () => {
  try {
    if (await hasStartedDriverBackgroundLocationUpdates()) {
      await Location.stopLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
    }
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Arret task impossible:', error);
  }
};

const normalizeErrorMessage = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getRtkErrorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined;
  }

  return (error as { status?: number | string }).status;
};

const getRtkErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const { data, error: errorMessage } = error as {
    data?: unknown;
    error?: unknown;
  };

  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown; error?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join(' ');
    }
    if (typeof message === 'string') {
      return message;
    }

    const dataError = (data as { error?: unknown }).error;
    if (typeof dataError === 'string') {
      return dataError;
    }
  }

  return typeof errorMessage === 'string' ? errorMessage : '';
};

const shouldBackOffAfterBackgroundResponse = (status: number | string | undefined) =>
  status === 'FETCH_ERROR' ||
  status === 'TIMEOUT_ERROR' ||
  status === 408 ||
  status === 425 ||
  status === 429 ||
  (typeof status === 'number' && status >= 500);

const isTerminalDriverTrackingResponse = (
  status: number | string | undefined,
  message: string,
) => {
  if (status === 401 || status === 403 || status === 404) return true;
  if (status !== 400) return false;

  const normalizedMessage = normalizeErrorMessage(message);
  return (
    normalizedMessage.includes('plus en cours') ||
    normalizedMessage.includes('suivi en temps reel est arrete')
  );
};

async function putDriverLocation(tripId: string, location: Location.LocationObject) {
  const coordinate = normalizeTripMapCoordinate(
    location.coords.latitude,
    location.coords.longitude,
  );

  if (!coordinate) {
    return false;
  }

  const now = Date.now();
  if (
    now - lastBackgroundLocationSentAt <
    ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS
  ) {
    return false;
  }

  if (driverLocationRequestInFlight || now < driverLocationBackoffUntil) {
    return false;
  }

  driverLocationRequestInFlight = true;

  try {
    if (!(await getValidAccessToken())) {
      await clearActiveDriverBackgroundTripId(tripId);
      await stopRegisteredDriverBackgroundLocationTask();
      return false;
    }

    const payload = {
      tripId,
      coordinates: [coordinate.longitude, coordinate.latitude] as [number, number],
      ...(typeof location.coords.accuracy === 'number' &&
      Number.isFinite(location.coords.accuracy) &&
      location.coords.accuracy >= 0
        ? { accuracy: location.coords.accuracy }
        : {}),
      ...(typeof location.coords.speed === 'number' &&
      Number.isFinite(location.coords.speed) &&
      location.coords.speed >= 0
        ? { speed: location.coords.speed }
        : {}),
      ...(typeof location.coords.heading === 'number' &&
      Number.isFinite(location.coords.heading) &&
      location.coords.heading >= 0
        ? { heading: location.coords.heading }
        : {}),
      ...(Number.isFinite(location.timestamp)
        ? { recordedAt: new Date(location.timestamp).toISOString() }
        : {}),
    };

    const send = async () => {
      const request = store.dispatch(
        tripApi.endpoints.updateDriverLocation.initiate(payload),
      );
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
      lastBackgroundLocationSentAt = now;
      const responseStatus = getRtkErrorStatus(result.error);
      const responseMessage = getRtkErrorMessage(result.error);
      if (isTerminalDriverTrackingResponse(responseStatus, responseMessage)) {
        await clearActiveDriverBackgroundTripId(tripId);
        await stopRegisteredDriverBackgroundLocationTask();
      } else if (shouldBackOffAfterBackgroundResponse(responseStatus)) {
        driverLocationBackoffUntil = Date.now() + BACKGROUND_LOCATION_FAILURE_BACKOFF_MS;
      }
      console.warn('[DriverBackgroundLocation] Position non envoyée:', {
        status: responseStatus,
        tripId,
      });
      return false;
    }

    lastBackgroundLocationSentAt = now;
    return true;
  } catch (error) {
    lastBackgroundLocationSentAt = now;
    driverLocationBackoffUntil = Date.now() + BACKGROUND_LOCATION_FAILURE_BACKOFF_MS;
    console.warn('[DriverBackgroundLocation] Envoi impossible:', error);
    return false;
  } finally {
    driverLocationRequestInFlight = false;
  }
}

async function completeTripFromBackground(tripId: string) {
  if (completeTripRequestInFlight || Date.now() < completeTripBackoffUntil) {
    return false;
  }

  completeTripRequestInFlight = true;

  try {
    if (!(await getValidAccessToken())) {
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

const isLocationAccurateEnoughForTripEnd = (location: Location.LocationObject) => {
  const accuracy = location.coords.accuracy;
  return (
    typeof accuracy !== 'number' ||
    !Number.isFinite(accuracy) ||
    accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_METERS
  );
};

const getLocationEventTimeMs = (location: Location.LocationObject) => {
  const timestamp = Number(location.timestamp);
  const now = Date.now();
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now ? timestamp : now;
};

async function evaluateBackgroundTripEnd(
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
      await clearActiveDriverBackgroundTripId(tripId);
      await stopRegisteredDriverBackgroundLocationTask();
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

const defineDriverBackgroundLocationTask = () => {
  try {
    if (Platform.OS === 'web') {
      return;
    }

    if (TaskManager.isTaskDefined(DRIVER_BACKGROUND_LOCATION_TASK)) {
      return;
    }

    TaskManager.defineTask<BackgroundLocationTaskData>(DRIVER_BACKGROUND_LOCATION_TASK, async ({
      data,
      error,
    }) => {
      if (error) {
        console.warn('[DriverBackgroundLocation] Task error:', error);
        return;
      }

      try {
        const session = await getActiveDriverBackgroundTripSession();
        const tripId = session?.tripId ?? null;
        if (!tripId) {
          await stopRegisteredDriverBackgroundLocationTask();
          return;
        }

        const locations = data?.locations ?? [];
        const latestLocation = locations
          .filter((location) => typeof location?.timestamp === 'number')
          .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (!latestLocation) {
          return;
        }

        await putDriverLocation(tripId, latestLocation);
        await evaluateBackgroundTripEnd(tripId, locations);
      } catch (taskError) {
        console.warn('[DriverBackgroundLocation] Tâche ignorée après une erreur :', taskError);
      }
    });
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Definition task impossible:', error);
  }
};

defineDriverBackgroundLocationTask();

export async function startDriverBackgroundLocationTracking(
  tripId: string,
  options: StartDriverBackgroundLocationTrackingOptions = {},
) {
  if (!tripId) {
    return false;
  }

  try {
    if (!(await isDriverBackgroundLocationAvailable())) {
      return false;
    }

    const foregroundPermission = await Location.getForegroundPermissionsAsync();
    let foregroundStatus = foregroundPermission.status;
    if (
      foregroundStatus !== Location.PermissionStatus.GRANTED &&
      options.requestMissingPermissions
    ) {
      const requestedForeground = await Location.requestForegroundPermissionsAsync();
      foregroundStatus = requestedForeground.status;
    }

    if (foregroundStatus !== Location.PermissionStatus.GRANTED) {
      console.warn('[DriverBackgroundLocation] Permission de premier plan refusée');
      return false;
    }

    const backgroundPermission = await Location.getBackgroundPermissionsAsync();
    let backgroundStatus = backgroundPermission.status;
    if (
      backgroundStatus !== Location.PermissionStatus.GRANTED &&
      options.requestMissingPermissions
    ) {
      const now = Date.now();
      if (
        lastBackgroundPermissionDeniedAt > 0 &&
        now - lastBackgroundPermissionDeniedAt < BACKGROUND_PERMISSION_RETRY_COOLDOWN_MS
      ) {
        return false;
      }

      const requestedBackground = await Location.requestBackgroundPermissionsAsync();
      backgroundStatus = requestedBackground.status;
    }

    if (backgroundStatus !== Location.PermissionStatus.GRANTED) {
      lastBackgroundPermissionDeniedAt = Date.now();
      console.warn('[DriverBackgroundLocation] Permission d’arrière-plan refusée');
      return false;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      console.warn('[DriverBackgroundLocation] Services de localisation desactives');
      return false;
    }

    const existingSession = await getActiveDriverBackgroundTripSession();
    const sessionStored = await setActiveDriverBackgroundTripId(tripId, {
      arrivalCoordinate: options.arrivalCoordinate ?? existingSession?.arrivalCoordinate ?? null,
      lastDriverCoordinate:
        options.lastDriverCoordinate ??
        existingSession?.lastDriverCoordinate ??
        null,
      autoCompleteDistanceMeters:
        options.autoCompleteDistanceMeters ??
        existingSession?.autoCompleteDistanceMeters ??
        DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
      autoCompleteDwellMs:
        options.autoCompleteDwellMs ??
        existingSession?.autoCompleteDwellMs ??
        DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
      nearDestinationSinceMs:
        existingSession?.tripId === tripId ? existingSession.nearDestinationSinceMs ?? null : null,
    });
    if (!sessionStored) {
      return false;
    }

    if (await hasStartedDriverBackgroundLocationUpdates()) {
      return true;
    }

    await Location.startLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
      distanceInterval: ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: Platform.OS === 'android'
        ? {
            notificationTitle: 'Trajet Zwanga en cours',
            notificationBody: 'Votre position est partagée pendant le trajet.',
            notificationColor: '#FF6B35',
            killServiceOnDestroy: false,
          }
        : undefined,
    });

    return true;
  } catch (error) {
    await clearActiveDriverBackgroundTripId(tripId).catch(() => undefined);
    console.warn('[DriverBackgroundLocation] Demarrage ignore après erreur:', error);
    return false;
  }
}

export async function updateDriverBackgroundLocationCheckpoint(
  tripId: string,
  coordinate: DriverBackgroundLocationCoordinate,
) {
  if (!tripId) {
    return;
  }

  await updateActiveDriverBackgroundTripSession((session) => {
    if (session.tripId !== tripId) {
      return session;
    }

    return {
      ...session,
      lastDriverCoordinate: coordinate,
    };
  });
}

export async function stopDriverBackgroundLocationTracking(tripId?: string | null) {
  try {
    const didClearActiveTrip = await clearActiveDriverBackgroundTripId(tripId);
    if (!didClearActiveTrip) {
      return;
    }

    await stopRegisteredDriverBackgroundLocationTask();
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Stop ignore après erreur:', error);
  }
}
