import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS, ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
  PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS } from '@/constants/rideProgress';
import { getActiveTrackingSession, saveTrackingSession, hasStartedUpdates, stopRegisteredTask } from './passengerTaskLifecycle';
import { ACTIVE_BOOKING_KEY, PASSENGER_BACKGROUND_LOCATION_TASK } from './passengerTaskName';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PassengerTrackingSession } from './passengerTrackingTypes';

let work: Promise<unknown> = Promise.resolve();
let appliedProfile: string | null = null;
let startRevision = 0;
let requestedBooking: string | null = null;

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = work.then(operation);
  work = result.catch(() => undefined);
  return result;
}

/** Reserve before permission dialogs: a late start must not undo a newer start/stop. */
export function reservePassengerGpsStart(bookingId: string) {
  requestedBooking = bookingId;
  return ++startRevision;
}

async function applyCurrentProfile(current: PassengerTrackingSession) {
  const key = `${current.bookingId}:${current.waitForActiveTrip}`;
  if (await hasStartedUpdates() && appliedProfile === key) return true;
  await Location.startLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK,
    passengerGpsOptions(current.waitForActiveTrip));
  appliedProfile = key;
  return true;
}

export function startPassengerGpsProfile(session: PassengerTrackingSession, revision: number) {
  return serialize(async () => {
    if (revision !== startRevision || requestedBooking !== session.bookingId) return false;
    await saveTrackingSession(session);
    return applyCurrentProfile(session);
  });
}

/** A background response may update only the session which is still current. */
export function updatePassengerGpsProfile(session: PassengerTrackingSession) {
  return serialize(async () => {
    const current = await getActiveTrackingSession();
    if (current?.bookingId !== session.bookingId) return false;
    await saveTrackingSession(session);
    return applyCurrentProfile(session);
  });
}

export function passengerGpsOptions(waiting: boolean): Location.LocationTaskOptions {
  return {
    accuracy: waiting ? Location.Accuracy.Balanced : Location.Accuracy.High,
    timeInterval: waiting ? PASSENGER_TRIP_STATUS_CHECK_INTERVAL_MS : ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
    deferredUpdatesInterval: waiting ? 10_000 : 2000,
    // Keep callbacks while stationary: a sleeping passenger must still learn that the trip started.
    distanceInterval: ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: waiting ? Location.ActivityType.Other : Location.ActivityType.AutomotiveNavigation,
    foregroundService: Platform.OS === 'android' ? {
      notificationTitle: waiting ? 'Trajet Zwanga à venir' : 'Course Zwanga en cours',
      notificationBody: waiting ? 'Le suivi précis commencera au démarrage du trajet.' :
        'Votre position est partagée pour détecter la prise en charge et l’arrivée.',
      notificationColor: '#FF6B35', killServiceOnDestroy: false,
    } : undefined,
  };
}

/** Update the existing native task, without stopping/restarting its location manager. */
export function applyPassengerGpsProfile(session: PassengerTrackingSession) {
  return serialize(async () => {
    const current = await getActiveTrackingSession();
    if (current?.bookingId !== session.bookingId) return false;
    return applyCurrentProfile(current);
  });
}

export function stopPassengerGpsProfile(bookingId?: string | null) {
  if (!bookingId || requestedBooking === bookingId) {
    startRevision++;
    requestedBooking = null;
  }
  return serialize(async () => {
    const current = await getActiveTrackingSession();
    if (bookingId && current?.bookingId && current.bookingId !== bookingId) return;
    await AsyncStorage.removeItem(ACTIVE_BOOKING_KEY);
    await stopRegisteredTask();
    appliedProfile = null;
  });
}

/** A callback captured before a new session was saved must not stop that new session. */
export function stopPassengerGpsIfIdle() {
  return serialize(async () => {
    if (await getActiveTrackingSession()) return;
    await stopRegisteredTask();
    appliedProfile = null;
  });
}
