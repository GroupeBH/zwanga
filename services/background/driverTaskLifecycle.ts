import { DRIVER_BACKGROUND_LOCATION_TASK } from './driverTaskName';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const isDriverBackgroundLocationAvailable = async () => {
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

export const isDriverBackgroundLocationTaskRegistered = async () => {
  try {
    if (!(await isDriverBackgroundLocationAvailable())) {
      return false;
    }

    return await TaskManager.isTaskRegisteredAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Vérification task impossible:', error);
    return false;
  }
};

export const hasStartedDriverBackgroundLocationUpdates = async () => {
  try {
    if (!(await isDriverBackgroundLocationAvailable())) {
      return false;
    }

    return await Location.hasStartedLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  } catch (error) {
    console.warn('[DriverBackgroundLocation] État task localisation inconnu:', error);
    return isDriverBackgroundLocationTaskRegistered();
  }
};

export const stopRegisteredDriverBackgroundLocationTask = async () => {
  try {
    if (await hasStartedDriverBackgroundLocationUpdates()) {
      await Location.stopLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
    }
  } catch (error) {
    console.warn('[DriverBackgroundLocation] Arret task impossible:', error);
  }
};
