import { useDriverNavigationBookings } from './useDriverNavigationBookings';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { normalizeDriverLocationObject } from '../../features/driver-navigation/navigationBooking';
import { fitMapToSafeCoordinates } from '../../features/driver-navigation/navigationMap';
import { RouteCoordinate } from '../../features/driver-navigation/navigationModel';
import React, { useCallback, useMemo } from 'react';

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
  }, [mapState.currentLocation, focusMapOnCoordinates, passengers.passengerMapLocations]);

  // Calculs pour les stats passagers (mémorisés)
  const passengerStats = React.useMemo(() => {
    const pickups = mapState.waypoints.filter(wp => wp.type === 'pickup');
    const dropoffs = mapState.waypoints.filter(wp => wp.type === 'dropoff');
    const pendingPickups = pickups.filter(wp => !wp.completed);
    const pendingDropoffs = dropoffs.filter(wp => !wp.completed);
    const completedPickups = pickups.filter(wp => wp.completed);
    const completedDropoffs = dropoffs.filter(wp => wp.completed);
    
    // Passagers uniques
    const uniquePassengers = new Map<string, { name: string; pickedUp: boolean; droppedOff: boolean }>();
    mapState.waypoints.forEach(wp => {
      const existing = uniquePassengers.get(wp.passenger.id);
      if (!existing) {
        uniquePassengers.set(wp.passenger.id, {
          name: wp.passenger.name,
          pickedUp: wp.type === 'pickup' ? wp.completed : false,
          droppedOff: wp.type === 'dropoff' ? wp.completed : false,
        });
      } else {
        if (wp.type === 'pickup') existing.pickedUp = wp.completed;
        if (wp.type === 'dropoff') existing.droppedOff = wp.completed;
      }
    });
    
    return {
      totalPassengers: uniquePassengers.size,
      pendingPickups: pendingPickups.length,
      pendingDropoffs: pendingDropoffs.length,
      completedPickups: completedPickups.length,
      completedDropoffs: completedDropoffs.length,
      inVehicle: completedPickups.length - completedDropoffs.length,
      passengers: Array.from(uniquePassengers.entries()).map(([id, data]) => ({ id, ...data })),
    };
  }, [mapState.waypoints]);

  return {
    passengerStats,
    fitVehicleAndPassengers,
  };
}
