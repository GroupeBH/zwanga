import { createDriverLocationListener } from '../../features/driver-navigation/driverLocationListener';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import {
  isFreshLocationObject,
  normalizeDriverLocationObject,
} from '../../features/driver-navigation/navigationBooking';
import {
  DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS,
  FRESH_DRIVER_LOCATION_MAX_AGE_MS,
} from '../../features/driver-navigation/navigationModel';
import {
  startDriverBackgroundLocationTracking,
  stopDriverBackgroundLocationTracking,
} from '@/services/driverBackgroundLocationTask';
import {
  DRIVER_TRIP_END_AUTO_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_AUTO_COMPLETE_DWELL_MS,
} from '@/utils/navigation/tripCompletion';
import * as Location from 'expo-location';
import { useEffect } from 'react';

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

    let locationEffectCancelled = false;
    (async () => {
      try {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;
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
          if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;

          if (backgroundPermissionStatus !== 'granted') {
            const acceptedDisclosure = await promptBackgroundDisclosure();
            if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;

            if (acceptedDisclosure) {
              const { status: requestedBackgroundStatus } = await Location.requestBackgroundPermissionsAsync();
              if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;
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
        if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;
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

        // Obtenir la position initiale (avec fallback)
        let location: Location.LocationObject | null = null;
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch {
          location = await Location.getLastKnownPositionAsync({
            maxAge: FRESH_DRIVER_LOCATION_MAX_AGE_MS,
            requiredAccuracy: 100,
          });
        }
        if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) return;

        const normalizedInitialLocation = normalizeDriverLocationObject(location);
        if (isFreshLocationObject(normalizedInitialLocation)) {
          const initialCoordinate = {
            latitude: normalizedInitialLocation.coords.latitude,
            longitude: normalizedInitialLocation.coords.longitude,
          };
          const initialTimestamp = Number(normalizedInitialLocation.timestamp);
          mapState.lastAcceptedDriverCoordinateRef.current = initialCoordinate;
          mapState.lastAcceptedDriverTimestampRef.current = Number.isFinite(initialTimestamp)
            ? initialTimestamp
            : Date.now();
          refs.currentLocationRef.current = normalizedInitialLocation;
          mapState.setCurrentLocation(normalizedInitialLocation);
          mapState.driverPosition.setValue({
            latitude: initialCoordinate.latitude,
            longitude: initialCoordinate.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
          });
          sendDriverLocationToTracking(normalizedInitialLocation);
          if (!refs.hasFetchedInitialDriverRouteRef.current) {
            refs.hasFetchedInitialDriverRouteRef.current = true;
            void refs.fetchRouteRef.current?.({
              originOverride: initialCoordinate,
              fitToRoute: true,
            });
          }
        } else {
          console.warn('[Navigation] Position initiale indisponible, en attente du GPS');
        }

      // Variables pour throttling des mises à jour (optimisé pour éviter les crashs)
       // Vérification étapes toutes les 5 secondes

      // S'abonner aux mises à jour de localisation (fréquence réduite pour stabilité)
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High, // Équilibre entre précision et batterie
          timeInterval: DRIVER_LOCATION_STATE_UPDATE_INTERVAL_MS, // GPS update toutes les 5 secondes
          distanceInterval: 5, // Ou tous les 5 mètres
        },
        createDriverLocationListener({ data, mapState, refs, sendDriverLocationToTracking, isCancelled: () => locationEffectCancelled })
      );
      if (locationEffectCancelled || !mapState.isMountedRef.current || refs.isExitingRef.current) {
        subscription.remove();
        return;
      }
      mapState.locationSubscription.current?.remove();
      mapState.locationSubscription.current = subscription;
      } catch (error) {
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
