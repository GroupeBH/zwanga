import { useCallback, useEffect, useMemo, type RefObject } from 'react';
import type MapView from 'react-native-maps';
import type { Booking } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';
import { fitNavigationCamera, getNavigationCameraRegion, type MapLayout } from '@/utils/navigation/mapCamera';

interface Params {
  passengerLocation: MapCoordinate | null;
  displayedDriverLocation: MapCoordinate | null;
  pickupCoordinate: MapCoordinate | null;
  dropoffCoordinate: MapCoordinate | null;
  runMapCommand: (command: (map: MapView) => void) => boolean;
  mapLayoutRef: RefObject<MapLayout | null>;
  booking: Booking | undefined;
  routeCoordinates: MapCoordinate[];
  isMapExpanded: boolean;
  isNativeMapReady: boolean;
  hasFitInitialMapRef: RefObject<boolean>;
}

export function usePassengerNavigationCamera({
  passengerLocation, displayedDriverLocation, pickupCoordinate, dropoffCoordinate,
  runMapCommand, mapLayoutRef, booking, routeCoordinates, isMapExpanded,
  isNativeMapReady, hasFitInitialMapRef,
}: Params) {
  const mapRegion = useMemo(() => getNavigationCameraRegion([
    passengerLocation, displayedDriverLocation, pickupCoordinate, dropoffCoordinate,
  ]), [passengerLocation, displayedDriverLocation, pickupCoordinate, dropoffCoordinate]);

  const focusCoordinates = useCallback((points: (MapCoordinate | null | undefined)[], animated = true) => {
    let fitted = false;
    const accepted = runMapCommand(map => {
      fitted = fitNavigationCamera(map, points, mapLayoutRef.current, {
        // The map is already laid out below the header: do NOT add its height again.
        edgePadding: { top: 24, right: 40, bottom: isMapExpanded ? 120 : 300, left: 40 },
        animated,
      });
    });
    return accepted && fitted;
  }, [runMapCommand, mapLayoutRef, isMapExpanded]);

  const centerOnDriver = useCallback(() => focusCoordinates([displayedDriverLocation]),
    [focusCoordinates, displayedDriverLocation]);
  const centerOnPassenger = useCallback(() => focusCoordinates([passengerLocation]),
    [focusCoordinates, passengerLocation]);

  const fitToRoute = useCallback((animated = true) => focusCoordinates([
    passengerLocation, displayedDriverLocation,
    !booking?.pickedUp ? pickupCoordinate : null, dropoffCoordinate,
    routeCoordinates[0], routeCoordinates[routeCoordinates.length - 1],
  ], animated), [focusCoordinates, passengerLocation, displayedDriverLocation,
    booking?.pickedUp, pickupCoordinate, dropoffCoordinate, routeCoordinates]);

  useEffect(() => {
    if (!isNativeMapReady) {
      hasFitInitialMapRef.current = false;
      return;
    }
    if (!hasFitInitialMapRef.current) {
      // Missing data/zero layout/denied command must allow a later attempt, without a timer.
      hasFitInitialMapRef.current = fitToRoute(false);
    }
  }, [fitToRoute, isNativeMapReady, hasFitInitialMapRef]);

  // Keep the public handler argument-free: Pressable passes an event, not an animation flag.
  const fitRouteOnPress = useCallback(() => fitToRoute(), [fitToRoute]);
  return { mapRegion, fitToRoute: fitRouteOnPress, centerOnPassenger, centerOnDriver };
}
