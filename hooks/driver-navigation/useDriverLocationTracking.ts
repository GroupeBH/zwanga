import { createDriverLocationListener } from '../../features/driver-navigation/driverLocationListener';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import {
  DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS,
  FRESH_DRIVER_LOCATION_MAX_AGE_MS,
} from '../../features/driver-navigation/navigationModel';
import {
  startDriverBackgroundLocationTracking,
  stopDriverBackgroundLocationTracking,
} from '@/services/driverBackgroundLocationTask';
import {
  ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
} from '@/constants/rideProgress';
import {
  DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
} from '@/utils/navigation/tripCompletion';
import * as Location from 'expo-location';
import { subscribeBootstrappedRideLocation } from '@/services/rideLocationBootstrap';
import { useEffect } from 'react';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { isAppActive } from '@/services/appActivity';
import { requestLocationPermission } from '@/services/locationPermissionWait';

interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
  exitActions: { navigateBackSafely: () => void; cleanupNavigationUi: () => void; };
  promptBackgroundDisclosure: () => Promise<boolean>;
  sendDriverLocationToTracking: (location: Location.LocationObject) => void;
}

export function useDriverLocationTracking({
  data,
  mapState,
  refs,
  exitActions,
  promptBackgroundDisclosure,
  sendDriverLocationToTracking,
}: Params) {
  const active = useAppIsActive();
  useEffect(() => {
    if (!data.isFocused || !data.tripId || !data.isTripOngoing) {
      if (mapState.locationSubscription.current) {
        mapState.locationSubscription.current.remove();
        mapState.locationSubscription.current = null;
      }
      refs.tripDestinationNearSinceMsRef.current = null;
      if (data.tripId && !data.isTripOngoing) {
        void stopDriverBackgroundLocationTracking(data.tripId);
      }
      return;
    }
    if (!active) return;

    let locationEffectCancelled = false;
    const current = () => !locationEffectCancelled && mapState.isMountedRef.current && !refs.isExitingRef.current && isAppActive();
    (async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!current()) return;
        if (permission.status !== 'granted') permission = await requestLocationPermission(() => Location.requestForegroundPermissionsAsync(), current, true);
        const { status: foregroundStatus } = permission;
        if (!current()) return;
        if (foregroundStatus !== 'granted') {
          data.showDialog({
            title: 'Permission refusée',
            message: 'L\'accès à la localisation est nécessaire pour la navigation GPS.',
            variant: 'warning',
            icon: 'location-outline',
            actions: [
              { label: 'Retour', onPress: exitActions.navigateBackSafely }
            ],
          });
          return;
        }

        // Tenter de demander la permission de localisation en arrière-plan (optionnel)
        // Cette permission n'est pas toujours disponible/configurée
        try {
          const { status: backgroundPermissionStatus } = await Location.getBackgroundPermissionsAsync();
          if (!current()) return;

          if (backgroundPermissionStatus !== 'granted') {
            const acceptedDisclosure = await promptBackgroundDisclosure();
            if (!current()) return;

            if (acceptedDisclosure) {
              const { status: requestedBackgroundStatus } = await requestLocationPermission(() => Location.requestBackgroundPermissionsAsync(), current, true);
              if (!current()) return;
              if (requestedBackgroundStatus !== 'granted') {
                if (__DEV__) {
                  console.log('Permission de localisation en arrière-plan non accordee - mode premier plan uniquement');
                }
              }
            } else {
              if (__DEV__) {
                console.log('Autorisation d’arrière-plan refusée par l’utilisateur : mode premier plan uniquement');
              }
            }
          }
        } catch (bgError) {
          // La permission de localisation en arrière-plan n'est pas disponible/configuree
          if (__DEV__) {
            console.log('Localisation en arrière-plan non disponible:', bgError);
          }
        }

        const hasServicesEnabled = await Location.hasServicesEnabledAsync();
        if (!current()) return;
        if (!hasServicesEnabled) {
          data.showDialog({
            title: 'Localisation désactivée',
            message: 'Activez les services de localisation pour démarrer la navigation.',
            variant: 'warning',
            icon: 'location-outline',
            actions: [
              { label: 'Retour', onPress: exitActions.navigateBackSafely }
            ],
          });
          return;
        }

        void startDriverBackgroundLocationTracking(data.tripId, {
          arrivalCoordinate: data.tripArrivalCoordinate,
          autoCompleteDistanceMeters: DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
          autoCompleteDwellMs: DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
          requestMissingPermissions: false,
        });

      // Reuse native samples; a shared foreground watcher takes over if they stop.
      const subscription = subscribeBootstrappedRideLocation(
        `driver:${data.tripId}`,
        {
          accuracy: Location.Accuracy.High, // Équilibre entre précision et batterie
          timeInterval: DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS, // Android only; UI throttles also cover iOS.
          distanceInterval: ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS,
        },
        createDriverLocationListener({ data, mapState, refs, sendDriverLocationToTracking, isCancelled: () => locationEffectCancelled }),
        FRESH_DRIVER_LOCATION_MAX_AGE_MS,
      );
      if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) {
        subscription.remove();
        return;
      }
      mapState.locationSubscription.current?.remove();
      mapState.locationSubscription.current = subscription;
      } catch (error) {
        if (!current()) return;
        console.error('Erreur lors de l\'initialisation de la localisation:', error);
        if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;
        data.showDialog({
          title: 'Erreur de localisation',
          message: 'Impossible d\'activer le GPS. Vérifiez que la localisation est activée sur votre appareil.',
          variant: 'danger',
          icon: 'location-outline',
          actions: [
            { label: 'Réessayer', onPress: () => data.router.replace(`/trip/navigate/${data.tripId}`) },
            { label: 'Retour', variant: 'secondary', onPress: exitActions.navigateBackSafely },
          ],
        });
      }
    })();

    return () => {
      locationEffectCancelled = true;
      if (mapState.locationSubscription.current) {
        mapState.locationSubscription.current.remove();
        mapState.locationSubscription.current = null;
      }
    };
  }, [
    active,
    data.tripId,
    data.isFocused,
    data.isTripOngoing,
    mapState.driverPosition,
    mapState.isMapReadyRef,
    mapState.stopDriverMarkerAnimation,
    exitActions.navigateBackSafely,
    data.router,
    sendDriverLocationToTracking,
    data.showDialog,
    data.tripArrivalCoordinate,
  ]);

  return {

  };
}
