import { PassengerTrackingSession } from './passengerTrackingTypes';
import { PASSENGER_BACKGROUND_LOCATION_TASK, ACTIVE_BOOKING_KEY } from './passengerTaskName';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

const SESSION_CACHE_MS = 30_000;
let cachedSession: PassengerTrackingSession | null = null;
let validUntil = -Infinity;
let work: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = work.then(operation);
  work = result.catch(() => undefined);
  return result;
}

// All reads/writes share this queue so a late disk read cannot restore an old booking.
export const getActiveTrackingSession = (forceRead = false): Promise<PassengerTrackingSession | null> => serial(async () => {
  if (!forceRead && Date.now() < validUntil) return cachedSession;
  let storedValue: string | undefined;
  try {
    storedValue = (await AsyncStorage.getItem(ACTIVE_BOOKING_KEY))?.trim();
  } catch (error) {
    validUntil = -Infinity;
    console.warn('[PassengerBackgroundLocation] Lecture session impossible:', error);
    // Unavailable storage does not prove the booking ended: let the caller retry.
    throw error;
  }
  // A readable but corrupt record, unlike an I/O failure, is not an active session.
  cachedSession = null;
  try {
    const parsed: Partial<PassengerTrackingSession> = !storedValue ? {} : storedValue.startsWith('{')
      ? JSON.parse(storedValue) : { bookingId: storedValue, waitForActiveTrip: false };
    const bookingId = typeof parsed?.bookingId === 'string' ? parsed.bookingId.trim() : '';
    if (bookingId) cachedSession = {
      bookingId,
      tripId: typeof parsed.tripId === 'string' ? parsed.tripId.trim() || null : null,
      waitForActiveTrip: parsed.waitForActiveTrip === true,
    };
  } catch {
    console.warn('[PassengerBackgroundLocation] Session enregistrée invalide');
  }
  validUntil = Date.now() + SESSION_CACHE_MS;
  return cachedSession;
});

export const saveTrackingSession = (session: PassengerTrackingSession) => serial(async () => {
  await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, JSON.stringify(session));
  cachedSession = { ...session };
  validUntil = Date.now() + SESSION_CACHE_MS;
});

export const clearTrackingSession = () => serial(async () => {
  await AsyncStorage.removeItem(ACTIVE_BOOKING_KEY);
  cachedSession = null;
  validUntil = Date.now() + SESSION_CACHE_MS;
});

export const hasStartedUpdates = async () => {
  if (Platform.OS === 'web' || !(await TaskManager.isAvailableAsync())) {
    return false;
  }
  return Location.hasStartedLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK);
};

export const stopRegisteredTask = async () => {
  try {
    if (await hasStartedUpdates()) {
      await Location.stopLocationUpdatesAsync(PASSENGER_BACKGROUND_LOCATION_TASK);
    }
  } catch (error) {
    console.warn('[PassengerBackgroundLocation] Arret task impossible:', error);
  }
};
