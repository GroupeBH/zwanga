import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setLastKnownLocation,
  setLocationPermission,
  setTrackingEnabled,
} from '@/store/slices/locationSlice';
import { selectPermissionStatus, selectUserTrackedLocation } from '@/store/selectors';

export function useUserLocation(options: { autoRequest?: boolean } = { autoRequest: true }) {
  const dispatch = useAppDispatch();
  const permissionStatus = useAppSelector(selectPermissionStatus);
  const lastKnownLocation = useAppSelector(selectUserTrackedLocation);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!options.autoRequest) {
      return;
    }

    requestPermission();
    return () => {
      watcherRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      dispatch(setLocationPermission(status as any));

      if (status === Location.PermissionStatus.GRANTED) {
        startWatching();
      }
    } catch (error) {
      console.warn('Permission localisation refusée', error);
      dispatch(setLocationPermission('denied'));
    }
  };

  const startWatching = async () => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      dispatch(setTrackingEnabled(enabled));

      if (!enabled) {
        return;
      }

      watcherRef.current?.remove();
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 25,
        },
        (location) => {
          dispatch(
            setLastKnownLocation({
              coords: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              },
              timestamp: location.timestamp,
              accuracy: location.coords.accuracy,
            }),
          );
        },
      );
    } catch (error) {
      console.warn('Impossible de suivre la position', error);
    }
  };

  const stopWatching = () => {
    watcherRef.current?.remove();
    watcherRef.current = null;
    dispatch(setTrackingEnabled(false));
  };

  return {
    permissionStatus,
    lastKnownLocation,
    requestPermission,
    startWatching,
    stopWatching,
  };
}

