import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { API_BASE_URL } from '@/config/env';
import {
  ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
  ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
  PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS,
} from '@/constants/rideProgress';
import { getValidAccessToken, handle401Error } from '@/services/tokenRefresh';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

export const PASSENGER_BACKGROUND_LOCATION_TASK =
  'zwanga-passenger-background-location';

const ACTIVE_BOOKING_KEY = 'zwanga.activePassengerBackgroundBookingId';
const FETCH_TIMEOUT_MS = 18_000;
const BACKGROUND_PERMISSION_RETRY_COOLDOWN_MS = 10 * 60_000;
let lastSentAt = 0;
let lastBackgroundPermissionDeniedAt = 0;
let lastTripStatusCheckAt = 0;

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

type StartOptions = {
  requestMissingPermissions?: boolean;
  tripId?: string | null;
  waitForActiveTrip?: boolean;
};

type PassengerTrackingSession = {
  bookingId: string;
  tripId?: string | null;
  waitForActiveTrip: boolean;
};

type PassengerTrackingReadiness = 'active' | 'waiting' | 'terminal';

const normalizeApiBaseUrl = () =>
  API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

const getActiveTrackingSession = async (): Promise<PassengerTrackingSession | null> => {
  try {
    const storedValue = (await AsyncStorage.getItem(ACTIVE_BOOKING_KEY))?.trim();
    if (!storedValue) return null;

    // Keep compatibility with sessions created before the tracking state became structured.
    if (!storedValue.startsWith('{')) {
      return {
        bookingId: storedValue,
        waitForActiveTrip: false,
      };
    }

    const parsed = JSON.parse(storedValue) as Partial<PassengerTrackingSession>;
    const bookingId = parsed.bookingId?.trim();
    if (!bookingId) return null;

    return {
      bookingId,
      tripId: parsed.tripId?.trim() || null,
      waitForActiveTrip: parsed.waitForActiveTrip === true,
    };
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Lecture session impossible:', error);
    return null;
  }
};

const saveTrackingSession = async (session: PassengerTrackingSession) => {
  await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, JSON.stringify(session));
};

const hasStartedUpdates = async () => {
  if (Platform.OS === 'web' || !(await TaskManager.isAvailableAsync())) {
    return false;
  }
  return Location.hasStartedLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK);
};

const stopRegisteredTask = async () => {
  try {
    if (await hasStartedUpdates()) {
      await Location.stopLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK);
    }
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Arret task impossible:', error);
  }
};

const normalizeErrorMessage = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const readResponseMessage = async (response: Response) => {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    return Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : payload?.message ?? '';
  } catch {
    return '';
  }
};

const isInactiveTripResponse = (status: number, message: string) =>
  status === 400 &&
  normalizeErrorMessage(message).includes('trajet doit etre actif');

const isTerminalPassengerTrackingResponse = (status: number, message: string) => {
  if (status === 401 || status === 403 || status === 404) return true;
  if (status !== 400) return false;

  const normalizedMessage = normalizeErrorMessage(message);
  return (
    normalizedMessage.includes('reservations acceptees') ||
    normalizedMessage.includes('reservation acceptee')
  );
};

const stopTrackingSession = async () => {
  await AsyncStorage.removeItem(ACTIVE_BOOKING_KEY);
  await stopRegisteredTask();
};

const fetchWithAccessToken = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const send = (accessToken: string | null) =>
    fetch(url, {
      signal: controller.signal,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) return null;

    let response = await send(accessToken);
    if (response.status === 401 && (await handle401Error())) {
      accessToken = await getValidAccessToken();
      response = await send(accessToken);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
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
    const bookingResponse = await fetchWithAccessToken(
      `${normalizeApiBaseUrl()}/bookings/${session.bookingId}`,
    );
    if (!bookingResponse) return 'terminal';
    if (bookingResponse.status === 401 || bookingResponse.status === 403 || bookingResponse.status === 404) {
      return 'terminal';
    }
    if (!bookingResponse.ok) return 'waiting';

    const booking = (await bookingResponse.json()) as {
      status?: string | null;
      tripId?: string | null;
      trip?: { id?: string | null; status?: string | null } | null;
    };
    const bookingStatus = booking.status?.toLowerCase();
    if (['rejected', 'cancelled', 'completed', 'expired'].includes(bookingStatus ?? '')) {
      return 'terminal';
    }

    const resolvedTripId = session.tripId || booking.tripId || booking.trip?.id || null;
    let tripStatus = booking.trip?.status?.toLowerCase() ?? null;

    if (!tripStatus && resolvedTripId) {
      const tripResponse = await fetchWithAccessToken(
        `${normalizeApiBaseUrl()}/trips/${resolvedTripId}`,
      );
      if (!tripResponse) return 'terminal';
      if (tripResponse.status === 401 || tripResponse.status === 403 || tripResponse.status === 404) {
        return 'terminal';
      }
      if (!tripResponse.ok) return 'waiting';

      const trip = (await tripResponse.json()) as { status?: string | null };
      tripStatus = trip.status?.toLowerCase() ?? null;
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
    now - lastSentAt < ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS
  ) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const send = (accessToken: string | null) =>
    fetch(`${normalizeApiBaseUrl()}/bookings/${bookingId}/passenger-location`, {
      method: 'PUT',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
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
      }),
    });

  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      await stopTrackingSession();
      return false;
    }

    let response = await send(accessToken);
    if (response.status === 401 && (await handle401Error())) {
      accessToken = await getValidAccessToken();
      response = await send(accessToken);
    }

    if (!response.ok) {
      const responseMessage = await readResponseMessage(response);
      if (isInactiveTripResponse(response.status, responseMessage)) {
        const session = await getActiveTrackingSession();
        if (session?.bookingId === bookingId) {
          await saveTrackingSession({ ...session, waitForActiveTrip: true });
          lastTripStatusCheckAt = 0;
        }
      } else if (isTerminalPassengerTrackingResponse(response.status, responseMessage)) {
        await stopTrackingSession();
      }
      console.warn('[PassengerBackgroundLocation] Position non envoyée :', {
        bookingId,
        status: response.status,
      });
      return false;
    }

    lastSentAt = now;
    return true;
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Envoi impossible:', error);
    return false;
  } finally {
    clearTimeout(timeout);
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
