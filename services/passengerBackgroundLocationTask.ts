import { getBookingSnapshot, getTripSnapshot } from './background/passengerTrackingReads';
import { FETCH_TIMEOUT_MS, LOCATION_FAILURE_BACKOFF_MS, BACKGROUND_PERMISSION_RETRY_COOLDOWN_MS } from './background/passengerTrackingPolicy';
import { getActiveTrackingSession, saveTrackingSession, hasStartedUpdates, stopRegisteredTask } from './background/passengerTaskLifecycle';
import { PassengerTrackingSession, PassengerTrackingReadiness } from './background/passengerTrackingTypes';
import { PASSENGER_BACKGROUND_LOCATION_TASK, ACTIVE_BOOKING_KEY } from './background/passengerTaskName';
export { PASSENGER_BACKGROUND_LOCATION_TASK } from './background/passengerTaskName';
import { getRtkErrorStatus, getRtkErrorMessage, shouldBackOffAfterBackgroundResponse, isInactiveTripResponse, isTerminalPassengerTrackingResponse } from './background/passengerTrackingErrors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { recordLocationDelivery, wasLocationDeliveredRecently } from './locationDelivery';

import { ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS, ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS, PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS } from '@/constants/rideProgress';
import { getValidAccessToken, handle401Error } from '@/services/tokenRefresh';
import { store } from '@/store';
import { bookingApi } from '@/store/api/bookingApi';

import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
let lastSentAt = 0;
let lastBackgroundPermissionDeniedAt = 0;
let lastTripStatusCheckAt = 0;
let passengerLocationRequestInFlight = false;
let passengerLocationBackoffUntil = 0;

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

type StartOptions = {
  requestMissingPermissions?: boolean;
  tripId?: string | null;
  waitForActiveTrip?: boolean;
};

const stopTrackingSession = async () => {
  await AsyncStorage.removeItem(ACTIVE_BOOKING_KEY);
  await stopRegisteredTask();
};

const getPassengerTrackingReadiness = async (
  session: PassengerTrackingSession,
): Promise<PassengerTrackingReadiness> => {
  if (!session.waitForActiveTrip) return 'active';

  const now = Date.now();
  if (now - lastTripStatusCheckAt < PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS) {
    return 'waiting';
  }
  lastTripStatusCheckAt = now;

  try {
    if (!(await getValidAccessToken())) return 'terminal';

    const bookingResult = await getBookingSnapshot(session.bookingId);
    const bookingErrorStatus = getRtkErrorStatus(bookingResult.error);
    if (
      bookingErrorStatus === 401 ||
      bookingErrorStatus === 403 ||
      bookingErrorStatus === 404
    ) {
      return 'terminal';
    }
    if (bookingResult.error || !bookingResult.data) return 'waiting';

    const booking = bookingResult.data;
    const bookingStatus = booking.status?.toLowerCase();
    if (['rejected', 'cancelled', 'completed', 'expired'].includes(bookingStatus ?? '')) {
      return 'terminal';
    }

    const resolvedTripId = session.tripId || booking.tripId || booking.trip?.id || null;
    let tripStatus = booking.trip?.status?.toLowerCase() ?? null;

    if (!tripStatus && resolvedTripId) {
      const tripResult = await getTripSnapshot(resolvedTripId);
      const tripErrorStatus = getRtkErrorStatus(tripResult.error);
      if (tripErrorStatus === 401 || tripErrorStatus === 403 || tripErrorStatus === 404) {
        return 'terminal';
      }
      if (tripResult.error || !tripResult.data) return 'waiting';

      tripStatus = tripResult.data.status?.toLowerCase() ?? null;
    }

    if (tripStatus === 'cancelled' || tripStatus === 'completed') {
      return 'terminal';
    }
    if (tripStatus !== 'ongoing' || !['accepted', 'no_show'].includes(bookingStatus ?? '')) {
      return 'waiting';
    }

    await saveTrackingSession({
      bookingId: session.bookingId,
      tripId: resolvedTripId,
      waitForActiveTrip: false,
    });
    lastSentAt = 0;
    return 'active';
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Verification trajet impossible:', error);
    return 'waiting';
  }
};

async function putPassengerLocation(
  bookingId: string,
  location: Location.LocationObject,
) {
  const coordinate = normalizeTripMapCoordinate(
    location.coords.latitude,
    location.coords.longitude,
  );
  const now = Date.now();
  if (
    !coordinate ||
    wasLocationDeliveredRecently(`passenger:${bookingId}`, 6000, 'rest') ||
    now - lastSentAt < ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS
  ) {
    return false;
  }

  if (passengerLocationRequestInFlight || now < passengerLocationBackoffUntil) {
    return false;
  }

  passengerLocationRequestInFlight = true;

  try {
    if (!(await getValidAccessToken())) {
      await stopTrackingSession();
      return false;
    }

    const payload = {
      bookingId,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
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
      recordedAt: new Date(location.timestamp || now).toISOString(),
    };

    const send = async () => {
      const request = store.dispatch(
        bookingApi.endpoints.updatePassengerLocation.initiate(payload),
      );
      const timeout = setTimeout(() => request.abort(), FETCH_TIMEOUT_MS);

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
      lastSentAt = now;
      const responseStatus = getRtkErrorStatus(result.error);
      const responseMessage = getRtkErrorMessage(result.error);
      if (isInactiveTripResponse(responseStatus, responseMessage)) {
        const session = await getActiveTrackingSession();
        if (session?.bookingId === bookingId) {
          await saveTrackingSession({ ...session, waitForActiveTrip: true });
          lastTripStatusCheckAt = 0;
        }
      } else if (isTerminalPassengerTrackingResponse(responseStatus, responseMessage)) {
        await stopTrackingSession();
      } else if (shouldBackOffAfterBackgroundResponse(responseStatus)) {
        passengerLocationBackoffUntil = Date.now() + LOCATION_FAILURE_BACKOFF_MS;
      }
      console.warn('[PassengerBackgroundLocation] Position non envoyée :', {
        bookingId,
        status: responseStatus,
      });
      return false;
    }

    lastSentAt = now;
    recordLocationDelivery(`passenger:${bookingId}`);
    return true;
  } catch (error) {
    lastSentAt = now;
    passengerLocationBackoffUntil = Date.now() + LOCATION_FAILURE_BACKOFF_MS;
    console.warn('[PassengerBackgroundLocation] Envoi impossible:', error);
    return false;
  } finally {
    passengerLocationRequestInFlight = false;
  }
}

export async function sendPassengerLocationSample(
  bookingId: string,
  location: Location.LocationObject,
) {
  if (!bookingId || Platform.OS === 'web') return false;
  return putPassengerLocation(bookingId, location);
}

const definePassengerBackgroundLocationTask = () => {
  try {
    if (
      Platform.OS === 'web' ||
      TaskManager.isTaskDefined(PASSENGER_BACKGROUND_LOCATION_TASK)
    ) {
      return;
    }

    TaskManager.defineTask<BackgroundLocationTaskData>(
      PASSENGER_BACKGROUND_LOCATION_TASK,
      async ({ data, error }) => {
        if (error) {
          console.warn('[PassengerBackgroundLocation] Task error:', error);
          return;
        }

        const session = await getActiveTrackingSession();
        if (!session) {
          await stopRegisteredTask();
          return;
        }

        const readiness = await getPassengerTrackingReadiness(session);
        if (readiness === 'terminal') {
          await stopTrackingSession();
          return;
        }
        if (readiness !== 'active') return;

        const latestLocation = (data?.locations ?? [])
          .filter((location) => typeof location?.timestamp === 'number')
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        if (latestLocation) {
          await putPassengerLocation(session.bookingId, latestLocation);
        }
      },
    );
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Definition task impossible:', error);
  }
};

definePassengerBackgroundLocationTask();

export async function startPassengerBackgroundLocationTracking(
  bookingId: string,
  options: StartOptions = {},
) {
  if (!bookingId || Platform.OS === 'web') return false;

  try {
    if (!(await TaskManager.isAvailableAsync())) return false;

    const foregroundPermission = await Location.getForegroundPermissionsAsync();
    let foregroundStatus = foregroundPermission.status;
    if (
      foregroundStatus !== Location.PermissionStatus.GRANTED &&
      options.requestMissingPermissions
    ) {
      foregroundStatus = (await Location.requestForegroundPermissionsAsync()).status;
    }
    if (foregroundStatus !== Location.PermissionStatus.GRANTED) return false;

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
      backgroundStatus = (await Location.requestBackgroundPermissionsAsync()).status;
    }
    if (backgroundStatus !== Location.PermissionStatus.GRANTED) {
      lastBackgroundPermissionDeniedAt = Date.now();
      console.warn('[PassengerBackgroundLocation] Permission d’arrière-plan refusée');
      return false;
    }

    if (!(await Location.hasServicesEnabledAsync())) {
      console.warn('[PassengerBackgroundLocation] Services de localisation desactives');
      return false;
    }

    const previousSession = await getActiveTrackingSession();
    const nextSession: PassengerTrackingSession = {
      bookingId,
      tripId: options.tripId?.trim() || null,
      waitForActiveTrip: options.waitForActiveTrip === true,
    };
    await saveTrackingSession(nextSession);
    if (previousSession?.bookingId !== bookingId) {
      lastSentAt = 0;
      lastTripStatusCheckAt = 0;
    } else if (previousSession.waitForActiveTrip && !nextSession.waitForActiveTrip) {
      lastTripStatusCheckAt = 0;
    }
    if (await hasStartedUpdates()) return true;

    await Location.startLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
      distanceInterval: ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService:
        Platform.OS === 'android'
          ? {
              notificationTitle: 'Course Zwanga en cours',
              notificationBody:
                'Votre position est partagée pour détecter la prise en charge et l’arrivée.',
              notificationColor: '#FF6B35',
              killServiceOnDestroy: false,
            }
          : undefined,
    });
    return true;
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Demarrage impossible:', error);
    return false;
  }
}

export async function stopPassengerBackgroundLocationTracking(
  bookingId?: string | null,
) {
  try {
    const activeSession = await getActiveTrackingSession();
    if (bookingId && activeSession?.bookingId && bookingId !== activeSession.bookingId) return;

    await stopTrackingSession();
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Nettoyage impossible:', error);
  }
}
