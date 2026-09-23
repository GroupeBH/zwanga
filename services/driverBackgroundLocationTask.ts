import { evaluateBackgroundTripEnd } from './background/driverTripCompletion';
import { isDriverBackgroundLocationAvailable, hasStartedDriverBackgroundLocationUpdates, stopRegisteredDriverBackgroundLocationTask } from './background/driverTaskLifecycle';
import { DRIVER_BACKGROUND_LOCATION_TASK } from './background/driverTaskName';
import { getRtkErrorStatus, getRtkErrorMessage, shouldBackOffAfterBackgroundResponse, isTerminalDriverTrackingResponse } from './background/driverTrackingErrors';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { isLocationDeliveryPending, recordLocationDelivery, wasLocationDeliveredRecently } from './locationDelivery';
import { publishNativeRideLocation } from './rideLocationStream';

import { ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS, ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS } from '@/constants/rideProgress';
import { clearActiveDriverBackgroundTripId, getActiveDriverBackgroundTripSession, setActiveDriverBackgroundTripId, updateActiveDriverBackgroundTripSession, type DriverBackgroundLocationCoordinate } from '@/services/driverBackgroundLocationSession';
import { hasRecoverableSession, handle401Error } from '@/services/tokenRefresh';
import { store } from '@/store';
import { tripApi } from '@/store/api/tripApi';

import { DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS, DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS } from '@/utils/navigation/tripCompletion';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
export { DRIVER_BACKGROUND_LOCATION_TASK } from './background/driverTaskName';

const BACKGROUND_LOCATION_FETCH_TIMEOUT_MS = 18_000;
const BACKGROUND_LOCATION_FAILURE_BACKOFF_MS = 30_000;
const BACKGROUND_PERMISSION_RETRY_COOLDOWN_MS = 10 * 60_000;

let lastBackgroundLocationSentAt = 0;
let lastBackgroundPermissionDeniedAt = 0;
let driverLocationRequestInFlight = false;
let driverLocationBackoffUntil = 0;

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
    isLocationDeliveryPending(`driver:${tripId}`) ||
    wasLocationDeliveredRecently(`driver:${tripId}`, 4000, 'rest') ||
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
    if (!(await hasRecoverableSession())) {
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
    recordLocationDelivery(`driver:${tripId}`);
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

        publishNativeRideLocation(`driver:${tripId}`, latestLocation);
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
      deferredUpdatesInterval: 2000, // iOS batches background callbacks, not GPS acquisition.
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
