import { RouteStep, Waypoint, BookingAutoProgressEvent } from '../../features/driver-navigation/navigationModel';
import { DRIVER_PICKUP_ARRIVAL_DISTANCE_KM } from '@/constants/rideProgress';
import { calculateDistance } from '@/utils/routeHelpers';
import * as Location from 'expo-location';
import React from 'react';

interface Params {
  stepsRef: React.RefObject<RouteStep[]>;
  waypointsRef: React.RefObject<Waypoint[]>;
  currentWaypointIndexRef: React.RefObject<number>;
  currentStepIndexRef: React.RefObject<number>;
  isMountedRef: React.RefObject<boolean>;
  announcedWaypointIdsRef: React.RefObject<Set<string>>;
  speakNavigationMessage: (message: string, options?: { force?: boolean; }) => Promise<void>;
  buildWaypointSpeech: (waypoint: Waypoint) => string;
  presentPickupNotice: (event: BookingAutoProgressEvent, waypoint: Waypoint) => void;
  tripId: string;
  presentWaypointModal: (waypoint: Waypoint) => void;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useDriverNavigationStepProgress({
  stepsRef,
  waypointsRef,
  currentWaypointIndexRef,
  currentStepIndexRef,
  isMountedRef,
  announcedWaypointIdsRef,
  speakNavigationMessage,
  buildWaypointSpeech,
  presentPickupNotice,
  tripId,
  presentWaypointModal,
  setCurrentStepIndex,
}: Params) {
  const updateCurrentStep = (location: Location.LocationObject) => {
    const latestSteps = stepsRef.current;
    const latestWaypoints = waypointsRef.current;
    const latestWaypointIndex = currentWaypointIndexRef.current;
    const latestStepIndex = currentStepIndexRef.current;

    if (!isMountedRef.current) return;

    const currentCoords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    // Vérifier si on est proche du prochain waypoint
    if (latestWaypoints.length > 0 && latestWaypointIndex < latestWaypoints.length) {
      const nextWaypoint = latestWaypoints[latestWaypointIndex];
      if (!nextWaypoint.completed) {
        const waypointCoords = {
          latitude: nextWaypoint.location.lat,
          longitude: nextWaypoint.location.lng,
        };
        const distanceToWaypoint = calculateDistance(currentCoords, waypointCoords);

        // Si on est à moins de 50 mètres du point de passage, notifier le conducteur.
        if (distanceToWaypoint < DRIVER_PICKUP_ARRIVAL_DISTANCE_KM) {
          if (!announcedWaypointIdsRef.current.has(nextWaypoint.id)) {
            announcedWaypointIdsRef.current.add(nextWaypoint.id);
            void speakNavigationMessage(buildWaypointSpeech(nextWaypoint), { force: true });
          }

          if (nextWaypoint.type === 'pickup') {
            presentPickupNotice(
              {
                type: 'driver_arrived_pickup',
                bookingId: nextWaypoint.booking.id,
                tripId,
                passengerId: nextWaypoint.passenger.id,
                distanceMeters: Math.round(distanceToWaypoint * 1000),
                detectedAt: new Date().toISOString(),
              },
              nextWaypoint,
            );
          } else {
            presentWaypointModal(nextWaypoint);
          }
        }
      }
    }

    if (latestSteps.length === 0) return;

    // Trouver l'étape la plus proche
    for (let i = latestStepIndex; i < latestSteps.length; i++) {
      const stepEnd = {
        latitude: latestSteps[i].end_location.lat,
        longitude: latestSteps[i].end_location.lng,
      };

      const distance = calculateDistance(currentCoords, stepEnd);

      // Si on est à moins de 30 mètres de la fin de l'étape, passer à la suivante
      if (distance < 0.03 && i < latestSteps.length - 1) {
        currentStepIndexRef.current = i + 1;
        setCurrentStepIndex(i + 1);
        break;
      }
    }
  };

  return {
    updateCurrentStep,
  };
}
