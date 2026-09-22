import * as Location from 'expo-location';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { subscribeRideLocation } from '@/services/rideLocationStream';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';

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
  rideLocationKey?: string | null;
};

export function useUserLocation(options: UserLocationOptions = { autoRequest: true }) {
  const dispatch = useAppDispatch();
  const permissionStatus = useAppSelector(selectPermissionStatus);
  const lastKnownLocation = useAppSelector(selectUserTrackedLocation);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const watcherGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const permissionInFlightRef = useRef<Promise<Location.LocationPermissionResponse> | null>(null);
  const automaticPermissionAttemptedRef = useRef(false);
  const isNearbyTracking = options.trackingProfile === 'nearby';
  const rideLocationKey = options.rideLocationKey;

  const stopWatching = useCallback(() => {
    watcherGenerationRef.current += 1;
    watcherRef.current?.remove();
    watcherRef.current = null;
    dispatch(setTrackingEnabled(false));
  }, [dispatch]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopWatching(); };
  }, [stopWatching]);

  const getPermission = useCallback((allowPrompt: boolean) => {
    if (permissionInFlightRef.current) return permissionInFlightRef.current;
    const generation = watcherGenerationRef.current;
    const pending = (async () => {
      let permission = await Location.getForegroundPermissionsAsync();
      if (mountedRef.current && generation === watcherGenerationRef.current
        && AppState.currentState === 'active' && allowPrompt && permission.status !== Location.PermissionStatus.GRANTED
        && permission.canAskAgain !== false) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      return permission;
    })();
    permissionInFlightRef.current = pending;
    const clear = () => { if (permissionInFlightRef.current === pending) permissionInFlightRef.current = null; };
    void pending.then(clear, clear);
    return pending;
  }, []);

  const startWatching = useCallback(async () => {
    if (!mountedRef.current || AppState.currentState !== 'active' || watcherRef.current) return;
    const generation = watcherGenerationRef.current + 1;
    watcherGenerationRef.current = generation;

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!mountedRef.current || generation !== watcherGenerationRef.current || AppState.currentState !== 'active') {
        return;
      }

      dispatch(setTrackingEnabled(enabled));
      if (!enabled) {
        return;
      }

      const watchOptions: Location.LocationOptions = {
        accuracy: isNearbyTracking ? Location.Accuracy.Balanced : Location.Accuracy.High,
        timeInterval: isNearbyTracking ? 15000 : 5000,
        // A shared ride fallback must retain stationary boarding samples.
        distanceInterval: rideLocationKey ? 0 : isNearbyTracking ? 50 : 25,
        // Passive tracking must not open an Android settings activity on every resume.
        mayShowUserSettingsDialog: false,
      };
      let lastPublishedAt = -Infinity;
      const onLocation = (location: Location.LocationObject) => {
        if (generation !== watcherGenerationRef.current || AppState.currentState !== 'active') return;
        const coordinate = normalizeTripMapCoordinate(location.coords.latitude, location.coords.longitude);
        if (!coordinate) return;
        // iOS ignores timeInterval. Limit Redux/UI updates, never the native ride progress stream.
        const now = Date.now();
        if (now - lastPublishedAt < (isNearbyTracking ? 15000 : 5000)) return;
        lastPublishedAt = now;
        dispatch(setLastKnownLocation({
          coords: coordinate,
          timestamp: location.timestamp,
          accuracy: location.coords.accuracy,
        }));
      };
      const subscription = rideLocationKey
        ? subscribeRideLocation(rideLocationKey, watchOptions, onLocation)
        : await Location.watchPositionAsync(watchOptions, onLocation);

      if (generation !== watcherGenerationRef.current) {
        subscription.remove();
        return;
      }

      watcherRef.current = subscription;
    } catch (error) {
      console.warn('Impossible de suivre la position', error);
    }
  }, [dispatch, isNearbyTracking, rideLocationKey]);

  const requestPermission = useCallback(async (allowPrompt = true) => {
    const generation = watcherGenerationRef.current;
    try {
      const { status } = await getPermission(allowPrompt);
      if (!mountedRef.current || generation !== watcherGenerationRef.current) return;
      dispatch(setLocationPermission(status));

      if (status === Location.PermissionStatus.GRANTED) {
        await startWatching();
      }
    } catch (error) {
      if (!mountedRef.current || generation !== watcherGenerationRef.current) return;
      console.warn('Permission localisation refusée', error);
      dispatch(setLocationPermission('denied'));
    }
  }, [dispatch, getPermission, startWatching]);

  const getCurrentLocation = useCallback(async () => {
    try {
      const { status } = await getPermission(true);
      if (!mountedRef.current) return null;
      dispatch(setLocationPermission(status));
      if (status !== Location.PermissionStatus.GRANTED) {
        return null;
      }

      const enabled = await Location.hasServicesEnabledAsync();
      if (!mountedRef.current) return null;
      dispatch(setTrackingEnabled(enabled));
      if (!enabled) {
        return null;
      }

      const preferredAccuracy = isNearbyTracking
        ? Location.Accuracy.Balanced
        : Location.Accuracy.High;
      let location = await Location.getLastKnownPositionAsync({
        maxAge: 2 * 60 * 1000,
        requiredAccuracy: isNearbyTracking ? 250 : 100,
      });

      if (!mountedRef.current) return null;
      if (!location) {
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: preferredAccuracy,
          });
        } catch (currentLocationError) {
          location = await Location.getLastKnownPositionAsync({
            maxAge: 15 * 60 * 1000,
            requiredAccuracy: 1000,
          });

          if (!location) {
            throw currentLocationError;
          }
        }
      }

      if (!mountedRef.current) return null;
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

      return location;
    } catch (error) {
      console.warn('Impossible de récupérer la position actuelle', error);
      return null;
    }
  }, [dispatch, getPermission, isNearbyTracking]);

  useEffect(() => {
    if (!options.autoRequest) {
      return;
    }

    let cancelled = false;
    let pendingStart: Promise<void> | null = null;
    let backgroundStopTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearBackgroundStop = () => {
      if (backgroundStopTimeout) {
        clearTimeout(backgroundStopTimeout);
        backgroundStopTimeout = null;
      }
    };

    const syncWatcherWithAppState = (state = AppState.currentState) => {
      if (cancelled) return;
      if (state === 'active') {
        clearBackgroundStop();
        if (watcherRef.current || pendingStart) {
          return;
        }

        const allowPrompt = !automaticPermissionAttemptedRef.current;
        automaticPermissionAttemptedRef.current = true;
        const started = requestPermission(allowPrompt);
        pendingStart = started;
        void started.finally(() => { if (pendingStart === started) pendingStart = null; });
        return;
      }

      clearBackgroundStop();
      backgroundStopTimeout = setTimeout(() => {
        backgroundStopTimeout = null;
        if (!cancelled && AppState.currentState !== 'active') {
          pendingStart = null;
          stopWatching();
        }
      }, 2_000);
    };

    syncWatcherWithAppState();
    const subscription = AppState.addEventListener('change', syncWatcherWithAppState);

    return () => {
      cancelled = true;
      subscription.remove();
      clearBackgroundStop();
      stopWatching();
    };
  }, [options.autoRequest, requestPermission, stopWatching]);

  return {
    permissionStatus,
    lastKnownLocation,
    requestPermission,
    getCurrentLocation,
    startWatching,
    stopWatching,
  };
}
