import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS, ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS } from '@/constants/rideProgress';
import { clearActiveDriverBackgroundTripId, getActiveDriverBackgroundTripSession,
  setActiveDriverBackgroundTripId, type ActiveDriverBackgroundTripSession } from '../driverBackgroundLocationSession';
import { hasStartedDriverBackgroundLocationUpdates, stopRegisteredDriverBackgroundLocationTask } from './driverTaskLifecycle';
import { DRIVER_BACKGROUND_LOCATION_TASK } from './driverTaskName';
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
    const existing = await getActiveDriverBackgroundTripSession();
    if (!isCurrent()) return false;
    // Never inherit another trip's destination or completion checkpoint.
    const previous = existing?.tripId === tripId ? existing : null;
    try {
      const stored = await setActiveDriverBackgroundTripId(tripId, {
        arrivalCoordinate: options.arrivalCoordinate ?? previous?.arrivalCoordinate ?? null,
        lastDriverCoordinate: options.lastDriverCoordinate ?? previous?.lastDriverCoordinate ?? null,
        autoCompleteDistanceMeters: options.autoCompleteDistanceMeters ?? previous?.autoCompleteDistanceMeters ?? DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
        autoCompleteDwellMs: options.autoCompleteDwellMs ?? previous?.autoCompleteDwellMs ?? DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
        nearDestinationSinceMs: previous?.nearDestinationSinceMs ?? null,
      });
      if (!stored || !isCurrent()) return false;
      const running = await hasStartedDriverBackgroundLocationUpdates();
      if (!isCurrent()) return false;
      if (!running) await Location.startLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK, {
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
      });
      return isCurrent();
    } catch (error) {
      await clearActiveDriverBackgroundTripId(tripId);
      await stopRegisteredDriverBackgroundLocationTask();
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
    if (!(await clearActiveDriverBackgroundTripId(tripId))) return;
    await stopRegisteredDriverBackgroundLocationTask();
  });
}

export function stopDriverGpsIfIdle() {
  return serialize(async () => {
    if (await getActiveDriverBackgroundTripSession()) return;
    await stopRegisteredDriverBackgroundLocationTask();
  });
}
