import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS, ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS } from '@/constants/rideProgress';
import { getActiveTrackingSession, saveTrackingSession, clearTrackingSession, hasStartedUpdates, stopRegisteredTask } from './passengerTaskLifecycle';
import { PASSENGER_BACKGROUND_LOCATION_TASK } from './passengerTaskName';
import type { PassengerTrackingSession } from './passengerTrackingTypes';
import { pauseNearbyDriverLocation } from '../nearbyDriverLocation';
import { passengerWaitingInterval } from './passengerWaitingPolicy';
import { readLocationNative, mutateLocationNative } from '../locationNativeDeadline';

let work: Promise<unknown> = Promise.resolve();
let appliedProfile: string | null = null;
let nativeCheckedAt = -Infinity;
const NATIVE_CHECK_INTERVAL_MS = 30_000;
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

async function applyCurrentProfile(current: PassengerTrackingSession, forceCheck = false) {
  const interval = current.waitForActiveTrip ? passengerWaitingInterval(current.departureTimeMs) : ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS;
  const key = `${current.bookingId}:${current.waitForActiveTrip}:${interval}`;
  const now = Date.now();
  if (!forceCheck && appliedProfile === key && now >= nativeCheckedAt
    && now - nativeCheckedAt < NATIVE_CHECK_INTERVAL_MS) return true;
  if (await readLocationNative(hasStartedUpdates()) && appliedProfile === key) {
    nativeCheckedAt = now;
    return true;
  }
  await mutateLocationNative(PASSENGER_BACKGROUND_LOCATION_TASK, () => Location.startLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK,
    passengerGpsOptions(current.waitForActiveTrip, current.departureTimeMs)), stopRegisteredTask);
  appliedProfile = key;
  nativeCheckedAt = now;
  return true;
}

export function startPassengerGpsProfile(session: PassengerTrackingSession, revision: number) {
  return serialize(async () => {
    if (revision !== startRevision || requestedBooking !== session.bookingId) return false;
    await mutateLocationNative('passenger-session', () => saveTrackingSession(session), clearTrackingSession);
    try {
      await pauseNearbyDriverLocation();
      if (revision !== startRevision || requestedBooking !== session.bookingId) return false;
      return await applyCurrentProfile(session, true);
    } catch (error) {
      // This queue owns session changes: a failed native start must not leave a
      // phantom ride blocking discovery. A later queued start remains intact.
      appliedProfile = null;
      nativeCheckedAt = -Infinity;
      try { await mutateLocationNative(PASSENGER_BACKGROUND_LOCATION_TASK, stopRegisteredTask); }
      finally { await mutateLocationNative('passenger-session', clearTrackingSession); }
      throw error;
    }
  });
}

/** A background response may update only the session which is still current. */
export function updatePassengerGpsProfile(session: PassengerTrackingSession) {
  return serialize(async () => {
    const current = await readLocationNative(getActiveTrackingSession());
    if (current?.bookingId !== session.bookingId) return false;
    await mutateLocationNative('passenger-session', () => saveTrackingSession(session), () => saveTrackingSession(current));
    try {
      return await applyCurrentProfile(session, true);
    } catch (error) {
      // Keep the previous waiting state if promotion failed. Do not publish
      // coarse waiting fixes as precise in-ride samples on the next callback.
      appliedProfile = null;
      nativeCheckedAt = -Infinity;
      await mutateLocationNative('passenger-session', () => saveTrackingSession(current));
      throw error;
    }
  });
}

export function passengerGpsOptions(waiting: boolean, departureTimeMs?: number | null): Location.LocationTaskOptions {
  const waitingInterval = passengerWaitingInterval(departureTimeMs);
  return {
    accuracy: waiting ? Location.Accuracy.Balanced : Location.Accuracy.High,
    timeInterval: waiting ? waitingInterval : ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
    deferredUpdatesInterval: waiting ? waitingInterval : 2000,
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
    const current = await readLocationNative(getActiveTrackingSession());
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
    const current = await readLocationNative(getActiveTrackingSession(true));
    if (bookingId && current?.bookingId && current.bookingId !== bookingId) return;
    await mutateLocationNative('passenger-session', clearTrackingSession);
    await mutateLocationNative(PASSENGER_BACKGROUND_LOCATION_TASK, stopRegisteredTask);
    appliedProfile = null;
    nativeCheckedAt = -Infinity;
  });
}

/** A callback captured before a new session was saved must not stop that new session. */
export function stopPassengerGpsIfIdle() {
  return serialize(async () => {
    if (await readLocationNative(getActiveTrackingSession(true))) return;
    await mutateLocationNative(PASSENGER_BACKGROUND_LOCATION_TASK, stopRegisteredTask);
    appliedProfile = null;
    nativeCheckedAt = -Infinity;
  });
}
