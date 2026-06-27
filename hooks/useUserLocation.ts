import * as Location from 'expo-location';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { selectPermissionStatus, selectUserTrackedLocation } from '@/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setLastKnownLocation,
  setLocationPermission,
  setTrackingEnabled,
} from '@/store/slices/locationSlice';

type UserLocationOptions = {
  autoRequest?: boolean;
  trackingProfile?: 'nearby' | 'navigation';
};

export function useUserLocation(options: UserLocationOptions = { autoRequest: true }) {
  const dispatch = useAppDispatch();
  const permissionStatus = useAppSelector(selectPermissionStatus);
  const lastKnownLocation = useAppSelector(selectUserTrackedLocation);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const watcherGenerationRef = useRef(0);
  const isNearbyTracking = options.trackingProfile === 'nearby';

  const stopWatching = useCallback(() => {
    watcherGenerationRef.current += 1;
    watcherRef.current?.remove();
    watcherRef.current = null;
    dispatch(setTrackingEnabled(false));
  }, [dispatch]);

  const startWatching = useCallback(async () => {
    const generation = watcherGenerationRef.current + 1;
    watcherGenerationRef.current = generation;
    watcherRef.current?.remove();
    watcherRef.current = null;

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (generation !== watcherGenerationRef.current) {
        return;
      }

      dispatch(setTrackingEnabled(enabled));
      if (!enabled) {
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: isNearbyTracking ? Location.Accuracy.Balanced : Location.Accuracy.High,
          timeInterval: isNearbyTracking ? 15000 : 5000,
          distanceInterval: isNearbyTracking ? 50 : 25,
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

      if (generation !== watcherGenerationRef.current) {
        subscription.remove();
        return;
      }

      watcherRef.current = subscription;
    } catch (error) {
      console.warn('Impossible de suivre la position', error);
    }
  }, [dispatch, isNearbyTracking]);

  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      dispatch(setLocationPermission(status as any));

      if (status === Location.PermissionStatus.GRANTED) {
        await startWatching();
      }
    } catch (error) {
      console.warn('Permission localisation refusée', error);
      dispatch(setLocationPermission('denied'));
    }
  }, [dispatch, startWatching]);

  useEffect(() => {
    if (!options.autoRequest) {
      return;
    }

    let cancelled = false;
    const syncWatcherWithAppState = (state = AppState.currentState) => {
      if (state === 'active') {
        void requestPermission().then(() => {
          if (cancelled || AppState.currentState !== 'active') {
            stopWatching();
          }
        });
      } else {
        stopWatching();
      }
    };

    syncWatcherWithAppState();
    const subscription = AppState.addEventListener('change', syncWatcherWithAppState);

    return () => {
      cancelled = true;
      subscription.remove();
      stopWatching();
    };
  }, [options.autoRequest, requestPermission, stopWatching]);

  return {
    permissionStatus,
    lastKnownLocation,
    requestPermission,
    startWatching,
    stopWatching,
  };
}
