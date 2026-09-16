import {
  PassengerRouteInfo,
  decodePolyline,
  formatDistanceMeters,
  formatDurationSeconds,
} from '../../features/passenger-navigation/navigationModel';
import { TravelMode, useGetDirectionsMutation } from '@/store/api/googleMapsApi';
import { calculatePolylineDistanceMeters, trimPolylineFromCurrentPosition } from '@/utils/navigation/routeProgress';
import React, { useCallback } from 'react';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  routeOriginCoordinate: { latitude: number; longitude: number; } | null;
  activePassengerDestination: MapCoordinate | null;
  isMountedRef: React.RefObject<boolean>;
  isTripOngoing: boolean;
  driverLocation: { latitude: number; longitude: number; } | null;
  hasPassengerPickedUp: boolean;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; }[]>>;
  setRouteInfo: React.Dispatch<React.SetStateAction<PassengerRouteInfo | null>>;
  routeFetchedRef: React.RefObject<boolean>;
  lastRouteFetchRef: React.RefObject<number>;
  beginRouteRequest: (key: string) => { attach: (request: { abort: () => void; }) => void; isCurrent: () => boolean; finish: () => void; } | null;
  passengerRouteSignature: string;
  setIsLoadingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  getDirections: ReturnType<typeof useGetDirectionsMutation>[0];
  routeCoordinates: { latitude: number; longitude: number; }[];
}

export function usePassengerNavigationRoute({
  routeOriginCoordinate,
  activePassengerDestination,
  isMountedRef,
  isTripOngoing,
  driverLocation,
  hasPassengerPickedUp,
  setRouteCoordinates,
  setRouteInfo,
  routeFetchedRef,
  lastRouteFetchRef,
  beginRouteRequest,
  passengerRouteSignature,
  setIsLoadingRoute,
  getDirections,
  routeCoordinates,
}: Params) {
  const fetchRoute = useCallback(async () => {
    if (!routeOriginCoordinate || !activePassengerDestination || !isMountedRef.current) return;
    if (isTripOngoing && !driverLocation && !hasPassengerPickedUp) return;

    const applyFallbackRoute = () => {
      const fallbackRoute = [routeOriginCoordinate, activePassengerDestination];
      const fallbackDistanceMeters = calculatePolylineDistanceMeters(fallbackRoute);
      setRouteCoordinates(fallbackRoute);
      setRouteInfo({
        distance: formatDistanceMeters(fallbackDistanceMeters) ?? '-',
        distanceMeters: fallbackDistanceMeters,
        duration: '-',
        durationSeconds: 0,
      });
      routeFetchedRef.current = true;
    };
    
    // Éviter les appels trop fréquents (minimum 30 s entre les appels)
    const now = Date.now();
    if (now - lastRouteFetchRef.current < 30000 && routeFetchedRef.current) return;
    const requestGuard = beginRouteRequest(passengerRouteSignature);
    if (!requestGuard) return;
    lastRouteFetchRef.current = now;
    
    setIsLoadingRoute(true);
    
    try {
      const origin = { lat: routeOriginCoordinate.latitude, lng: routeOriginCoordinate.longitude };
      const destination = {
        lat: activePassengerDestination.latitude,
        lng: activePassengerDestination.longitude,
      };
      
      const request = getDirections({
        origin,
        destination,
        mode: TravelMode.DRIVING,
      });
      requestGuard.attach(request);
      const response = await request.unwrap();
      if (!isMountedRef.current || !requestGuard.isCurrent()) return;
      
      if (response.routes && response.routes.length > 0) {
        const route = response.routes[0];
        
        // Decoder la polyline
        if (route.overviewPolyline) {
          const decoded = decodePolyline(route.overviewPolyline);
          const routeCheck =
            decoded.length > 1
              ? trimPolylineFromCurrentPosition(
                  routeOriginCoordinate,
                  decoded,
                  activePassengerDestination,
                )
              : null;
          if (routeCheck?.isRouteUsable && decoded.length > 1) {
            setRouteCoordinates(decoded);
          } else {
            applyFallbackRoute();
            return;
          }
        } else {
          applyFallbackRoute();
          return;
        }
        
        // Calculer les infos de route
        if (route.legs && route.legs.length > 0) {
          const totalDistance = route.legs.reduce((acc, leg) => acc + leg.distance, 0);
          const totalDuration = route.legs.reduce((acc, leg) => acc + leg.duration, 0);
          
          setRouteInfo({
            distance: formatDistanceMeters(totalDistance) ?? '-',
            distanceMeters: totalDistance,
            duration: formatDurationSeconds(totalDuration),
            durationSeconds: totalDuration,
          });
        }
        
        routeFetchedRef.current = true;
      } else {
        applyFallbackRoute();
      }
    } catch (error: any) {
      if (!isMountedRef.current || !requestGuard.isCurrent()) return;
      console.warn(
        '[PassengerNavigation] Route detaillee indisponible, utilisation du trace direct:',
        error?.data?.message || error?.message || 'Erreur inconnue',
      );
      if (routeCoordinates.length < 2) {
        applyFallbackRoute();
      }
    } finally {
      if (isMountedRef.current && requestGuard.isCurrent()) {
        setIsLoadingRoute(false);
      }
      requestGuard.finish();
    }
  }, [
    activePassengerDestination,
    beginRouteRequest,
    driverLocation,
    getDirections,
    hasPassengerPickedUp,
    isTripOngoing,
    passengerRouteSignature,
    routeCoordinates.length,
    routeOriginCoordinate,
  ]);

  return {
    fetchRoute,
  };
}
