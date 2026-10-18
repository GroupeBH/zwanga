import { useDriverNavigationBookings } from './useDriverNavigationBookings';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { normalizeDriverLocationObject } from '../../features/driver-navigation/navigationBooking';
import { fitMapToSafeCoordinates } from '../../features/driver-navigation/navigationMap';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import { useCallback, useMemo } from 'react';
import { getNavigationPassengerStats } from '@/features/driver-navigation/passengerStats';

interface Params {
  passengers: ReturnType<typeof useDriverNavigationBookings>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  focusMapOnCoordinates: (coordinates: (RouteCoordinate | null | undefined)[], options: Parameters<typeof fitMapToSafeCoordinates>[2]) => void;
}

export function useDriverPassengerPresentation({
  passengers,
  refs,
  mapState,
  focusMapOnCoordinates,
}: Params) {
  const fitVehicleAndPassengers = useCallback(() => {
    const coordinates = passengers.passengerMapLocations.map((passenger) => passenger.coordinate);
    const driverLocation = refs.currentLocationRef.current ?? mapState.currentLocation;
    const driverCoordinate = normalizeDriverLocationObject(driverLocation);
    if (driverCoordinate) {
      coordinates.unshift({
        latitude: driverCoordinate.coords.latitude,
        longitude: driverCoordinate.coords.longitude,
      });
    }

    focusMapOnCoordinates(coordinates, {
        edgePadding: { top: 190, right: 56, bottom: 190, left: 56 },
      logContext: 'vehicle-passengers',
    });
  }, [mapState.currentLocation, refs.currentLocationRef, focusMapOnCoordinates, passengers.passengerMapLocations]);

  // Calculs pour les stats passagers (mémorisés)
  const passengerStats = useMemo(() => getNavigationPassengerStats(mapState.waypoints), [mapState.waypoints]);

  return {
    passengerStats,
    fitVehicleAndPassengers,
  };
}
