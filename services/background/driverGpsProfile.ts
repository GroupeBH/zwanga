import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS, ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS } from '@/constants/rideProgress';
import { clearActiveDriverBackgroundTripId, getActiveDriverBackgroundTripSession,
  setActiveDriverBackgroundTripId, type ActiveDriverBackgroundTripSession } from '../driverBackgroundLocationSession';
import { hasStartedDriverBackgroundLocationUpdates, stopRegisteredDriverBackgroundLocationTask } from './driverTaskLifecycle';
import { DRIVER_BACKGROUND_LOCATION_TASK } from './driverTaskName';
import { pauseNearbyDriverLocation } from '../nearbyDriverLocation';
import { readLocationNative, mutateLocationNative } from '../locationNativeDeadline';
import { DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS, DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS } from '@/utils/navigation/tripCompletion';

let work: Promise<unknown> = Promise.resolve();
let revision = 0;
let requestedTrip: string | null = null;
const serialize = <T>(operation: () => Promise<T>) => {
  const result = work.then(operation);
  work = result.catch(() => undefined);
  return result;
};

/** Reserve before permissions: a delayed start cannot undo a logout or newer trip. */
export function reserveDriverGpsStart(tripId: string) {
  requestedTrip = tripId;
  return ++revision;
}

export function startDriverGpsProfile(tripId: string, generation: number,
  options: Omit<ActiveDriverBackgroundTripSession, 'tripId'> = {}) {
  return serialize(async () => {
    const isCurrent = () => generation === revision && requestedTrip === tripId;
    if (!isCurrent()) return false;
    const existing = await readLocationNative(getActiveDriverBackgroundTripSession());
    if (!isCurrent()) return false;
    // Never inherit another trip's destination or completion checkpoint.
    const previous = existing?.tripId === tripId ? existing : null;
    try {
      const stored = await mutateLocationNative('driver-session', () => setActiveDriverBackgroundTripId(tripId, {
        arrivalCoordinate: options.arrivalCoordinate ?? previous?.arrivalCoordinate ?? null,
        lastDriverCoordinate: options.lastDriverCoordinate ?? previous?.lastDriverCoordinate ?? null,
        autoCompleteDistanceMeters: options.autoCompleteDistanceMeters ?? previous?.autoCompleteDistanceMeters ?? DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
        autoCompleteDwellMs: options.autoCompleteDwellMs ?? previous?.autoCompleteDwellMs ?? DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
        nearDestinationSinceMs: previous?.nearDestinationSinceMs ?? null,
      }), () => clearActiveDriverBackgroundTripId(tripId));
      if (!stored || !isCurrent()) return false;
      await pauseNearbyDriverLocation();
      if (!isCurrent()) return false;
      const running = await readLocationNative(hasStartedDriverBackgroundLocationUpdates());
      if (!isCurrent()) return false;
      if (!running) await mutateLocationNative(DRIVER_BACKGROUND_LOCATION_TASK, () => Location.startLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
        deferredUpdatesInterval: 2000,
        distanceInterval: ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: 'Trajet Zwanga en cours',
          notificationBody: 'Votre position est partagée pendant le trajet.',
          notificationColor: '#FF6B35', killServiceOnDestroy: false,
        } : undefined,
      }), stopRegisteredDriverBackgroundLocationTask);
      return isCurrent();
    } catch (error) {
      try { await mutateLocationNative('driver-session', () => clearActiveDriverBackgroundTripId(tripId)); }
      finally { await mutateLocationNative(DRIVER_BACKGROUND_LOCATION_TASK, stopRegisteredDriverBackgroundLocationTask); }
      throw error;
    }
  });
}

/** Serialize the native stop with session changes, including terminal HTTP responses. */
export function stopDriverGpsProfile(tripId?: string | null) {
  if (!tripId || requestedTrip === tripId) {
    revision++;
    requestedTrip = null;
  }
  return serialize(async () => {
    // A global stop (logout) is unconditional. A scoped stop must first prove
    // ownership, including after a cold start: never stop another trip's GPS.
    let shouldStop = !tripId;
    try {
      const cleared = await mutateLocationNative('driver-session', () =>
        clearActiveDriverBackgroundTripId(tripId, () => { shouldStop = true; }));
      shouldStop ||= cleared;
    } finally {
      // Disk removal may fail or time out AFTER scope validation. Native stop
      // must still run; the disk mutation retains its lock for any late result.
      if (shouldStop) await mutateLocationNative(DRIVER_BACKGROUND_LOCATION_TASK, stopRegisteredDriverBackgroundLocationTask);
    }
  });
}

export function stopDriverGpsIfIdle() {
  return serialize(async () => {
    if (await readLocationNative(getActiveDriverBackgroundTripSession())) return;
    await mutateLocationNative(DRIVER_BACKGROUND_LOCATION_TASK, stopRegisteredDriverBackgroundLocationTask);
  });
}
