import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { useDriverNavigationData } from './useDriverNavigationData';
import {
  getSafeMapCoordinate,
  getSafeMapCoordinateList,
  getSafePolylineCoordinates,
  fitMapToSafeCoordinates,
  shouldUseDirectNearWaypointRoute,
} from '../../features/driver-navigation/navigationMap';
import { RouteStep, RouteCoordinate, FetchRouteOptions } from '../../features/driver-navigation/navigationModel';
import { TravelMode } from '@/store/api/googleMapsApi';
import type { Trip } from '@/types';
import { isCoordinateInKinshasaBounds } from '@/utils/tripCoordinates';
import { calculateDistance } from '@/utils/routeHelpers';
import { calculatePolylineDistanceMeters, trimPolylineFromCurrentPosition } from '@/utils/navigation/routeProgress';
import React from 'react';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  trip: Trip | undefined;
  tripDepartureCoordinate: MapCoordinate | null;
  activeRouteDestination: NavigationCoordinate | null;
  isMountedRef: React.RefObject<boolean>;
  isKinshasaNavigationTrip: boolean;
  tripId: string;
  tripArrivalCoordinate: MapCoordinate | null;
  activeNavigationDestination: { id: string; kind: "pickup" | "dropoff" | "destination"; coordinate: NavigationCoordinate; } | null;
  beginRouteRequest: (key: string) => { attach: (request: { abort: () => void; }) => void; isCurrent: () => boolean; finish: () => void; } | null;
  routeSignature: string;
  routeFetchedRef: React.RefObject<boolean>;
  lastRouteFetchTimeRef: React.RefObject<number>;
  setIsLoadingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  setIsReroutingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  getDirections: ReturnType<typeof useDriverNavigationData>['getDirections'];
  decodePolyline: (encoded: string) => RouteCoordinate[];
  isTripOngoing: boolean;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<NavigationCoordinate[]>>;
  setRouteDistanceMeters: React.Dispatch<React.SetStateAction<number | null>>;
  setRouteDurationSeconds: React.Dispatch<React.SetStateAction<number | null>>;
  setTotalDistance: React.Dispatch<React.SetStateAction<string>>;
  setTotalDuration: React.Dispatch<React.SetStateAction<string>>;
  currentLegIndex: number;
  stepsRef: React.RefObject<RouteStep[]>;
  currentStepIndexRef: React.RefObject<number>;
  setSteps: React.Dispatch<React.SetStateAction<RouteStep[]>>;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  speakNavigationMessage: (message: string, options?: { force?: boolean; }) => Promise<void>;
  buildInstructionSpeech: (step: RouteStep, intro?: string) => string;
  focusMapOnCoordinates: (coordinates: (RouteCoordinate | null | undefined)[], options: Parameters<typeof fitMapToSafeCoordinates>[2]) => void;
  routeCoordinatesRef: React.RefObject<NavigationCoordinate[]>;
}

export function useDriverNavigationRoute({
  trip,
  tripDepartureCoordinate,
  activeRouteDestination,
  isMountedRef,
  isKinshasaNavigationTrip,
  tripId,
  tripArrivalCoordinate,
  activeNavigationDestination,
  beginRouteRequest,
  routeSignature,
  routeFetchedRef,
  lastRouteFetchTimeRef,
  setIsLoadingRoute,
  setIsReroutingRoute,
  getDirections,
  decodePolyline,
  isTripOngoing,
  setRouteCoordinates,
  setRouteDistanceMeters,
  setRouteDurationSeconds,
  setTotalDistance,
  setTotalDuration,
  currentLegIndex,
  stepsRef,
  currentStepIndexRef,
  setSteps,
  setCurrentStepIndex,
  speakNavigationMessage,
  buildInstructionSpeech,
  focusMapOnCoordinates,
  routeCoordinatesRef,
}: Params) {
  const fetchRoute = async (options: FetchRouteOptions = {}) => {
    if (!trip || !tripDepartureCoordinate || !activeRouteDestination || !isMountedRef.current) return;

    let routeOrigin = options.originOverride ?? tripDepartureCoordinate;
    let routeDestination = activeRouteDestination;
    if (isKinshasaNavigationTrip && !isCoordinateInKinshasaBounds(routeOrigin)) {
      console.warn('[DriverNavigation] Origine Directions hors Kinshasa ignoree:', {
        tripId,
        origin: routeOrigin,
        fallback: tripDepartureCoordinate,
      });
      routeOrigin = tripDepartureCoordinate;
    }
    if (
      isKinshasaNavigationTrip &&
      tripArrivalCoordinate &&
      !isCoordinateInKinshasaBounds(routeDestination)
    ) {
      console.warn('[DriverNavigation] Destination Directions hors Kinshasa ignoree:', {
        tripId,
        activeDestination: activeNavigationDestination,
        destination: routeDestination,
        fallback: tripArrivalCoordinate,
      });
      routeDestination = tripArrivalCoordinate;
    }

    const safeRouteOrigin = getSafeMapCoordinate(routeOrigin);
    const safeRouteDestination = getSafeMapCoordinate(routeDestination);
    if (!safeRouteOrigin || !safeRouteDestination) {
      console.warn('[DriverNavigation] Directions ignorees: coordonnées invalides', {
        tripId,
        origin: routeOrigin,
        destination: routeDestination,
      });
      return;
    }
    routeOrigin = safeRouteOrigin;
    routeDestination = safeRouteDestination;

    const shouldFitToRoute = options.fitToRoute ?? true;
    const directDistanceKm = calculateDistance(routeOrigin, routeDestination);
    const directDistanceMeters = directDistanceKm * 1000;

    if (__DEV__) {
      console.log('[DriverNavigation] Directions request coordinates', {
        tripId,
        isKinshasaNavigationTrip,
        activeDestination: activeNavigationDestination,
        origin: routeOrigin,
        destination: routeDestination,
        directDistanceKm: Number(directDistanceKm.toFixed(2)),
      });
    }

    const buildFallbackRoute = () => {
      return getSafeMapCoordinateList([routeOrigin, routeDestination]);
    };

    const requestGuard = beginRouteRequest(routeSignature);
    if (!requestGuard) return;
    routeFetchedRef.current = true;
    lastRouteFetchTimeRef.current = Date.now();
    setIsLoadingRoute(true);
    setIsReroutingRoute(Boolean(options.announceReroute));

    try {
      // Construire les waypoints non complétés pour l'API backend
      // Appel à l'API backend optimisée
      const request = getDirections({
        origin: {
          lat: routeOrigin.latitude,
          lng: routeOrigin.longitude,
        },
        destination: {
          lat: routeDestination.latitude,
          lng: routeDestination.longitude,
        },
        mode: TravelMode.DRIVING,
        optimizeWaypoints: false,
        language: 'fr',
      });
      requestGuard.attach(request);
      const data = await request.unwrap();
      if (!isMountedRef.current || !requestGuard.isCurrent()) return;

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Décoder le polyline
        const decodedPoints = route.overviewPolyline
          ? decodePolyline(route.overviewPolyline)
          : [];
        const safeDecodedPoints = getSafePolylineCoordinates(decodedPoints);
        const routeCheck =
          safeDecodedPoints.length > 1
            ? trimPolylineFromCurrentPosition(routeOrigin, safeDecodedPoints, routeDestination)
            : null;
        const detailedRoutePoints =
          routeCheck?.isRouteUsable && safeDecodedPoints.length > 1
            ? safeDecodedPoints
            : buildFallbackRoute();
        const shouldSimplifyNearWaypointRoute = shouldUseDirectNearWaypointRoute({
          activeDestinationKind: activeNavigationDestination?.kind,
          directDistanceMeters,
          isTripOngoing,
          routeCoordinates: detailedRoutePoints,
        });
        const points = shouldSimplifyNearWaypointRoute
          ? buildFallbackRoute()
          : detailedRoutePoints;
        setRouteCoordinates(points);

        // Calculer la distance et durée totales
        let totalDist = 0;
        let totalDur = 0;
        if (!shouldSimplifyNearWaypointRoute) {
          route.legs.forEach(leg => {
            totalDist += leg.distance;
            totalDur += leg.duration;
          });
        }

        const fallbackDistanceMeters = calculatePolylineDistanceMeters(points);
        if (shouldSimplifyNearWaypointRoute || !totalDist || !routeCheck?.isRouteUsable) {
          totalDist = fallbackDistanceMeters;
          totalDur = 0;
        }

        setRouteDistanceMeters(totalDist || fallbackDistanceMeters);
        setRouteDurationSeconds(totalDur || null);
        setTotalDistance(`${(totalDist / 1000).toFixed(1)} km`);
        setTotalDuration(totalDur > 0 ? `${Math.round(totalDur / 60)} min` : '--');

        // Convertir et stocker les étapes du leg actuel
        if (!shouldSimplifyNearWaypointRoute && route.legs.length > 0) {
          const currentLeg = route.legs[currentLegIndex] || route.legs[0];
          const convertedSteps: RouteStep[] = currentLeg.steps.map(step => ({
            distance: { text: `${Math.round(step.distance)} m`, value: step.distance },
            duration: { text: `${Math.round(step.duration / 60)} min`, value: step.duration },
            html_instructions: step.htmlInstructions,
            maneuver: '',
            start_location: { lat: step.startLocation.lat, lng: step.startLocation.lng },
            end_location: { lat: step.endLocation.lat, lng: step.endLocation.lng },
            polyline: { points: step.polyline },
            travel_mode: 'DRIVING',
          }));
          stepsRef.current = convertedSteps;
          currentStepIndexRef.current = 0;
          setSteps(convertedSteps);
          setCurrentStepIndex(0);

          if (options.announceReroute) {
            const nextStep = convertedSteps[0];
            void speakNavigationMessage(
              nextStep
                ? buildInstructionSpeech(nextStep, 'Nouvel itinéraire calculé.')
                : 'Nouvel itinéraire calculé.',
              { force: true },
            );
          }
        } else {
          stepsRef.current = [];
          currentStepIndexRef.current = 0;
          setSteps([]);
          setCurrentStepIndex(0);
          if (shouldSimplifyNearWaypointRoute && options.announceReroute) {
            void speakNavigationMessage(
              "Point proche. Suivez la ligne jusqu'au point indiqué.",
              { force: true },
            );
          }
        }

        // Ajuster la vue de la carte pour afficher tout l'itinéraire
        if (shouldFitToRoute && points.length > 0) {
          focusMapOnCoordinates(
            [
            ...points,
            routeOrigin,
            routeDestination,
            ],
            {
              edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
              logContext: 'route-fetch',
            },
          );
        }
      } else {
        const fallbackPoints = buildFallbackRoute();
        setRouteCoordinates(fallbackPoints);
        setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
        setRouteDurationSeconds(null);
        setTotalDistance('--');
        setTotalDuration('--');
        stepsRef.current = [];
        setSteps([]);
        if (options.announceReroute) {
          void speakNavigationMessage(
            "Nouvel itinéraire simplifié. Suivez la ligne jusqu'à la destination.",
            { force: true },
          );
        }
      }
    } catch (error: any) {
      if (!isMountedRef.current || !requestGuard.isCurrent()) return;
      // Vérifier si c'est une erreur "pas de route trouvée" (400)
      const isNoRouteError = error?.status === 400 || error?.data?.statusCode === 400;
      const isNetworkError = error?.status === 'FETCH_ERROR' || error?.error?.includes?.('Network');
      
      if (isNoRouteError) {
        // Fallback: utiliser une ligne droite entre les points
        console.warn('[Navigation] Pas de route trouvée, utilisation de ligne droite');
        
        // Créer une route simplifiée avec les waypoints
        const fallbackPoints = buildFallbackRoute();
        
        setRouteCoordinates(fallbackPoints);
        setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
        setRouteDurationSeconds(null);
        setTotalDistance('--');
        setTotalDuration('--');
        stepsRef.current = [];
        setSteps([]);
        if (shouldFitToRoute) {
          focusMapOnCoordinates(
            [
            ...fallbackPoints,
            routeOrigin,
            ],
            {
              edgePadding: { top: 150, right: 50, bottom: 300, left: 50 },
              logContext: 'route-fallback',
            },
          );
        }
        void speakNavigationMessage(
          "Itinéraire détaillé indisponible. Suivez la ligne jusqu'à la destination.",
          { force: true }
        );
      } else if (isNetworkError) {
        // Erreur réseau - afficher un warning discret
        console.warn('[Navigation] Erreur réseau, nouvelle tentative plus tard');
        if (routeCoordinatesRef.current.length < 2) {
          const fallbackPoints = buildFallbackRoute();
          setRouteCoordinates(fallbackPoints);
          setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
          setRouteDurationSeconds(null);
        }
      } else {
        // Autres erreurs - log seulement
        console.warn('[Navigation] Erreur itinéraire:', error?.data?.message || error?.message || 'Erreur inconnue');
        if (routeCoordinatesRef.current.length < 2) {
          const fallbackPoints = buildFallbackRoute();
          setRouteCoordinates(fallbackPoints);
          setRouteDistanceMeters(calculatePolylineDistanceMeters(fallbackPoints));
          setRouteDurationSeconds(null);
        }
      }
    } finally {
      if (isMountedRef.current && requestGuard.isCurrent()) {
        setIsLoadingRoute(false);
        if (options.announceReroute) {
          setIsReroutingRoute(false);
        }
      }
      requestGuard.finish();
    }
  };

  return {
    fetchRoute,
  };
}
