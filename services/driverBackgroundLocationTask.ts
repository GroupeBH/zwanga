import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { API_BASE_URL } from '@/config/env';
import {
  clearActiveDriverBackgroundTripId,
  getActiveDriverBackgroundTripSession,
  setActiveDriverBackgroundTripId,
  updateActiveDriverBackgroundTripSession,
  type DriverBackgroundLocationCoordinate,
} from '@/services/driverBackgroundLocationSession';
import { getValidAccessToken, handle401Error } from '@/services/tokenRefresh';
import { MAX_ACCEPTABLE_GPS_ACCURACY_METERS } from '@/utils/navigation/routeProgress';
import {
  DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
  evaluateDestinationAutoComplete,
} from '@/utils/navigation/tripCompletion';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export const DRIVER_BACKGROUND_LOCATION_TASK = 'zwanga-driver-background-location';

const BACKGROUND_LOCATION_MIN_SEND_INTERVAL_MS = 4_000;
const BACKGROUND_LOCATION_FETCH_TIMEOUT_MS = 18_000;
const BACKGROUND_PERMISSION_RETRY_COOLDOWN_MS = 10 * 60_000;

let lastBackgroundLocationSentAt = 0;
let lastBackgroundPermissionDeniedAt = 0;

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

type StartDriverBackgroundLocationTrackingOptions = {
  arrivalCoordinate?: DriverBackgroundLocationCoordinate | null;
  autoCompleteDistanceMeters?: number;
  autoCompleteDwellMs?: number;
  requestMissingPermissions?: boolean;
};

type BackgroundTripBooking = {
  status?: string | null;
  droppedOff?: boolean | null;
  droppedOffAt?: string | null;
  droppedOffConfirmedByPassenger?: boolean | null;
  droppedOffConfirmedAt?: string | null;
};

const normalizeApiBaseUrl = () =>
  API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

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
    console.warn('[DriverBackgroundLocation] Verification task impossible:', error);
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
    console.warn('[DriverBackgroundLocation] Etat task localisation inconnu:', error);
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

async function putDriverLocation(tripId: string, location: Location.LocationObject) {
  const coordinate = normalizeTripMapCoordinate(
    location.coords.latitude,
    location.coords.longitude,
  );

  if (!coordinate) {
    return false;
  }

  const now = Date.now();
  if (now - lastBackgroundLocationSentAt < BACKGROUND_LOCATION_MIN_SEND_INTERVAL_MS) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKGROUND_LOCATION_FETCH_TIMEOUT_MS);

  const send = async (accessToken: string | null) =>
    fetch(`${normalizeApiBaseUrl()}/trips/${tripId}/driver-location`, {
      method: 'PUT',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        coordinates: [coordinate.longitude, coordinate.latitude],
      }),
    });

  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return false;
    }

    let response = await send(accessToken);
    if (response.status === 401) {
      const refreshed = await handle401Error();
      if (refreshed) {
        accessToken = await getValidAccessToken();
        response = await send(accessToken);
      }
    }

    if (!response.ok) {
      console.warn('[DriverBackgroundLocation] Position non envoyee:', {
        status: response.status,
        tripId,
      });
      return false;
    }

    lastBackgroundLocationSentAt = now;
    return true;
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Envoi impossible:', error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function completeTripFromBackground(tripId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKGROUND_LOCATION_FETCH_TIMEOUT_MS);

  const send = async (accessToken: string | null) =>
    fetch(`${normalizeApiBaseUrl()}/trips/${tripId}/complete`, {
      method: 'PUT',
      signal: controller.signal,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return false;
    }

    let response = await send(accessToken);
    if (response.status === 401) {
      const refreshed = await handle401Error();
      if (refreshed) {
        accessToken = await getValidAccessToken();
        response = await send(accessToken);
      }
    }

    if (!response.ok) {
      console.warn('[DriverBackgroundLocation] Trajet non finalise en arriere-plan:', {
        status: response.status,
        tripId,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Finalisation impossible:', error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTripBookingsFromBackground(tripId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKGROUND_LOCATION_FETCH_TIMEOUT_MS);

  const send = async (accessToken: string | null) =>
    fetch(`${normalizeApiBaseUrl()}/bookings/trip/${tripId}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return null;
    }

    let response = await send(accessToken);
    if (response.status === 401) {
      const refreshed = await handle401Error();
      if (refreshed) {
        accessToken = await getValidAccessToken();
        response = await send(accessToken);
      }
    }

    if (!response.ok) {
      console.warn('[DriverBackgroundLocation] Reservations non verifiees:', {
        status: response.status,
        tripId,
      });
      return null;
    }

    const payload = await response.json();
    return Array.isArray(payload) ? (payload as BackgroundTripBooking[]) : null;
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Verification reservations impossible:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const hasBookingDropoffCompleted = (booking: BackgroundTripBooking) =>
  Boolean(
    booking.status === 'completed' ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      booking.droppedOffAt ||
      booking.droppedOffConfirmedAt,
  );

async function hasUnfinishedAcceptedBookingFromBackground(tripId: string) {
  const bookings = await getTripBookingsFromBackground(tripId);
  if (!bookings) {
    return true;
  }

  return bookings.some(
    (booking) => booking.status === 'accepted' && !hasBookingDropoffCompleted(booking),
  );
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

    const evaluation = evaluateDestinationAutoComplete({
      destinationCoordinate: session.arrivalCoordinate,
      driverCoordinate,
      nearDestinationSinceMs,
      nowMs: getLocationEventTimeMs(location),
      distanceThresholdMeters:
        session.autoCompleteDistanceMeters ?? DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
      dwellMs: session.autoCompleteDwellMs ?? DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
    });

    nearDestinationSinceMs = evaluation.nearDestinationSinceMs;
    lastDistanceMeters = evaluation.distanceMeters;

    if (!evaluation.shouldComplete) {
      continue;
    }

    if (await hasUnfinishedAcceptedBookingFromBackground(tripId)) {
      console.log('[DriverBackgroundLocation] Finalisation differee: depose passager inachevee', {
        tripId,
      });
      continue;
    }

    const completed = await completeTripFromBackground(tripId);
    if (completed) {
      console.log('[DriverBackgroundLocation] Trajet finalise en arriere-plan:', {
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
        console.warn('[DriverBackgroundLocation] Task ignoree apres erreur:', taskError);
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
      console.warn('[DriverBackgroundLocation] Permission premier plan refusee');
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
      console.warn('[DriverBackgroundLocation] Permission arriere-plan refusee');
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
      timeInterval: 5_000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: Platform.OS === 'android'
        ? {
            notificationTitle: 'Trajet Zwanga en cours',
            notificationBody: 'Votre position est partagee pendant le trajet.',
            notificationColor: '#FF6B35',
          }
        : undefined,
    });

    return true;
  } catch (error) {
    await clearActiveDriverBackgroundTripId(tripId).catch(() => undefined);
    console.warn('[DriverBackgroundLocation] Demarrage ignore apres erreur:', error);
    return false;
  }
}

export async function stopDriverBackgroundLocationTracking(tripId?: string | null) {
  try {
    const didClearActiveTrip = await clearActiveDriverBackgroundTripId(tripId);
    if (!didClearActiveTrip) {
      return;
    }

    await stopRegisteredDriverBackgroundLocationTask();
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Stop ignore apres erreur:', error);
  }
}
