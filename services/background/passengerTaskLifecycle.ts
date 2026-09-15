import { PassengerTrackingSession } from './passengerTrackingTypes';
import { PASSENGER_BACKGROUND_LOCATION_TASK, ACTIVE_BOOKING_KEY } from './passengerTaskName';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const getActiveTrackingSession = async (): Promise<PassengerTrackingSession | null> => {
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

export const saveTrackingSession = async (session: PassengerTrackingSession) => {
  await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, JSON.stringify(session));
};

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
