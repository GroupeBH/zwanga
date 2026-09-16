import React, { useCallback, useEffect, useMemo } from 'react';
import MapView from 'react-native-maps';
import type { Booking } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  passengerLocation: { latitude: number; longitude: number; } | null;
  displayedDriverLocation: { latitude: number; longitude: number; } | null;
  pickupCoordinate: MapCoordinate | null;
  dropoffCoordinate: MapCoordinate | null;
  runMapCommand: (command: (map: MapView) => void) => boolean;
  mapRef: React.RefObject<MapView | null>;
  booking: Booking | undefined;
  routeCoordinates: { latitude: number; longitude: number; }[];
  mapTopOffset: number;
  isMapExpanded: boolean;
  isNativeMapReady: boolean;
  hasFitInitialMapRef: React.RefObject<boolean>;
}

export function usePassengerNavigationCamera({
  passengerLocation,
  displayedDriverLocation,
  pickupCoordinate,
  dropoffCoordinate,
  runMapCommand,
  mapRef,
  booking,
  routeCoordinates,
  mapTopOffset,
  isMapExpanded,
  isNativeMapReady,
  hasFitInitialMapRef,
}: Params) {
  const mapRegion = useMemo(() => {
    const points: { latitude: number; longitude: number }[] = [];
    
    if (passengerLocation) points.push(passengerLocation);
    if (displayedDriverLocation) points.push(displayedDriverLocation);
    if (pickupCoordinate) points.push(pickupCoordinate);
    if (dropoffCoordinate) points.push(dropoffCoordinate);

    if (points.length === 0) {
      return {
        latitude: -4.441931,
        longitude: 15.266293,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }

    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.01);
    const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.01);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [displayedDriverLocation, passengerLocation, pickupCoordinate, dropoffCoordinate]);

  // Centrer sur le conducteur
  const centerOnDriver = () => {
    if (displayedDriverLocation) {
      runMapCommand((map) => map.animateToRegion({
        ...displayedDriverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500));
    }
  };

  // Centrer sur le passager
  const centerOnPassenger = () => {
    if (passengerLocation) {
      runMapCommand((map) => map.animateToRegion({
        ...passengerLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500));
    }
  };

  // Centrer sur toute la route
  const fitToRoute = useCallback(() => {
    if (!mapRef.current) return;
    
    const coordinates: { latitude: number; longitude: number }[] = [];
    
    if (passengerLocation) coordinates.push(passengerLocation);
    if (displayedDriverLocation) coordinates.push(displayedDriverLocation);
    if (pickupCoordinate && !booking?.pickedUp) coordinates.push(pickupCoordinate);
    if (dropoffCoordinate) coordinates.push(dropoffCoordinate);
    if (routeCoordinates.length > 0) {
      coordinates.push(routeCoordinates[0]);
      coordinates.push(routeCoordinates[routeCoordinates.length - 1]);
    }
    
    if (coordinates.length >= 2) {
      runMapCommand((map) => map.fitToCoordinates(coordinates, {
        edgePadding: {
          top: mapTopOffset + 24,
          right: 50,
          bottom: isMapExpanded ? 120 : 300,
          left: 50,
        },
        animated: true,
      }));
    }
  }, [
    displayedDriverLocation,
    passengerLocation,
    pickupCoordinate,
    dropoffCoordinate,
    routeCoordinates,
    booking?.pickedUp,
    mapTopOffset,
    isMapExpanded,
    runMapCommand,
  ]);

  useEffect(() => {
    if (!isNativeMapReady) {
      hasFitInitialMapRef.current = false;
      return;
    }
    if (hasFitInitialMapRef.current) return;
    hasFitInitialMapRef.current = true;
    fitToRoute();
  }, [fitToRoute, isNativeMapReady]);

  return {
    mapRegion,
    fitToRoute,
    centerOnPassenger,
    centerOnDriver,
  };
}
