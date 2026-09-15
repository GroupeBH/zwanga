import type { NavigationCoordinate } from '@/utils/navigation/routeProgress';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import { useDriverNavigationNotices } from './useDriverNavigationNotices';
import { useDriverCompletionActions } from './useDriverCompletionActions';
import {
  hasBookingPickupCompleted,
  hasBookingDropoffCompleted,
  isFreshLivePassengerLocation,
} from '../../features/driver-navigation/navigationBooking';
import { RouteCoordinate, DRIVER_DROPOFF_APPROACH_DISTANCE_KM } from '../../features/driver-navigation/navigationModel';
import { DRIVER_PICKUP_ARRIVAL_DISTANCE_KM, PASSENGER_READY_DISTANCE_KM } from '@/constants/rideProgress';
import { calculateDistance } from '@/utils/routeHelpers';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import {
  DRIVER_TRIP_END_APPROACH_DISTANCE_METERS,
  DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  evaluateDestinationAutoComplete,
  evaluateDestinationPassage,
} from '@/utils/navigation/tripCompletion';
import { useEffect } from 'react';

interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  activeNavigationDestination: { id: string; kind: "pickup" | "dropoff" | "destination"; coordinate: NavigationCoordinate; } | null;
  notices: ReturnType<typeof useDriverNavigationNotices>;
  completion: ReturnType<typeof useDriverCompletionActions>;
}

export function useDriverRouteProgressTracking({
  data,
  refs,
  mapState,
  activeNavigationDestination,
  notices,
  completion,
}: Params) {
  useEffect(() => {
    if (!data.isTripOngoing || !data.tripId) {
      return;
    }

    const latestDriverLocation = refs.currentLocationRef.current ?? mapState.currentLocation;
    if (!latestDriverLocation) {
      return;
    }

    const driverCoordinate = {
      latitude: latestDriverLocation.coords.latitude,
      longitude: latestDriverLocation.coords.longitude,
    };
    const previousDriverCoordinate = mapState.lastTripCompletionCheckCoordinateRef.current;
    const detectedAt = new Date().toISOString();

    mapState.waypoints.forEach((waypoint) => {
      const booking = waypoint.booking;

      if (waypoint.type === 'dropoff') {
        if (!hasBookingPickupCompleted(booking) || hasBookingDropoffCompleted(booking)) {
          return;
        }

        const dropoffCoordinate = {
          latitude: waypoint.location.lat,
          longitude: waypoint.location.lng,
        };
        const driverDropoffDistanceKm = calculateDistance(driverCoordinate, dropoffCoordinate);
        const dropoffPassage = evaluateDestinationPassage({
          destinationCoordinate: dropoffCoordinate,
          driverCoordinate,
          previousDriverCoordinate,
          routeCoordinates:
            activeNavigationDestination?.id === waypoint.id
              ? refs.routeCoordinatesRef.current
              : [data.tripDepartureCoordinate, dropoffCoordinate].filter(
                  (coordinate): coordinate is RouteCoordinate => Boolean(coordinate),
                ),
          directDistanceThresholdMeters:
            DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
          parallelDistanceThresholdMeters:
            DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
        });

        if (driverDropoffDistanceKm <= DRIVER_DROPOFF_APPROACH_DISTANCE_KM) {
          notices.presentPassengerDestinationApproachNotice(
            {
              type: 'passenger_near_destination',
              bookingId: booking.id,
              tripId: data.tripId,
              passengerId: waypoint.passenger.id,
              distanceMeters: Math.round(driverDropoffDistanceKm * 1000),
              detectedAt,
            },
            waypoint,
          );
        }

        if (dropoffPassage.shouldComplete) {
          notices.presentPassengerDestinationNotice(
            {
              type: 'dropoff_confirmed',
              bookingId: booking.id,
              tripId: data.tripId,
              passengerId: waypoint.passenger.id,
              distanceMeters: Math.round(dropoffPassage.distanceMeters ?? 0),
              detectedAt,
            },
            waypoint,
          );
        }

        return;
      }

      const isPassengerAlreadyPickedUp =
        waypoint.completed || hasBookingPickupCompleted(booking);

      if (
        waypoint.type !== 'pickup' ||
        isPassengerAlreadyPickedUp ||
        hasBookingDropoffCompleted(booking)
      ) {
        return;
      }

      const pickupCoordinate = {
        latitude: waypoint.location.lat,
        longitude: waypoint.location.lng,
      };
      const driverPickupDistanceKm = calculateDistance(driverCoordinate, pickupCoordinate);

      if (driverPickupDistanceKm <= DRIVER_PICKUP_ARRIVAL_DISTANCE_KM) {
        notices.presentPickupNotice(
          {
            type: 'driver_arrived_pickup',
            bookingId: booking.id,
            tripId: data.tripId,
            passengerId: waypoint.passenger.id,
            distanceMeters: Math.round(driverPickupDistanceKm * 1000),
            detectedAt,
          },
          waypoint,
        );
      }

      const passengerLiveLocation = mapState.livePassengerLocations[booking.id];
      if (!isFreshLivePassengerLocation(passengerLiveLocation)) {
        return;
      }
      const passengerLocation = passengerLiveLocation.coordinate;

      const driverPassengerDistanceKm = calculateDistance(driverCoordinate, passengerLocation);
      const passengerPickupDistanceKm = calculateDistance(passengerLocation, pickupCoordinate);

      if (
        Math.min(driverPassengerDistanceKm, passengerPickupDistanceKm) <= PASSENGER_READY_DISTANCE_KM
      ) {
        notices.presentPickupNotice(
          {
            type: 'parties_nearby',
            bookingId: booking.id,
            tripId: data.tripId,
            passengerId: waypoint.passenger.id,
            distanceMeters: Math.round(
              Math.min(driverPassengerDistanceKm, passengerPickupDistanceKm) * 1000,
            ),
            detectedAt,
          },
          waypoint,
        );
      }

      // La confirmation pickup est decidee par le backend a partir de l'historique Redis.
    });

    if (data.tripArrivalCoordinate) {
      const driverTripEndDistanceMeters = calculateDistanceMeters(
        driverCoordinate,
        data.tripArrivalCoordinate,
      );
      const roundedTripEndDistanceMeters = Math.round(driverTripEndDistanceMeters);

      if (driverTripEndDistanceMeters <= DRIVER_TRIP_END_APPROACH_DISTANCE_METERS) {
        completion.presentTripDestinationNotice({
          type: 'driver_near_destination',
          tripId: data.tripId,
          distanceMeters: roundedTripEndDistanceMeters,
          detectedAt,
        });
      }

      const destinationAutoComplete = evaluateDestinationAutoComplete({
        destinationCoordinate: data.tripArrivalCoordinate,
        driverCoordinate,
        nearDestinationSinceMs: refs.tripDestinationNearSinceMsRef.current,
      });
      const destinationPassage = evaluateDestinationPassage({
        destinationCoordinate: data.tripArrivalCoordinate,
        driverCoordinate,
        previousDriverCoordinate,
        routeCoordinates: completion.getTripDestinationReferenceRoute(),
        directDistanceThresholdMeters: DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
        parallelDistanceThresholdMeters: DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
      });
      refs.tripDestinationNearSinceMsRef.current =
        destinationAutoComplete.nearDestinationSinceMs;

      if (
        driverTripEndDistanceMeters <= DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS ||
        destinationAutoComplete.shouldComplete ||
        destinationPassage.shouldComplete
      ) {
        completion.tryCompleteTripFromNavigation(roundedTripEndDistanceMeters);
      }
    }

    mapState.lastTripCompletionCheckCoordinateRef.current = driverCoordinate;
  }, [
    activeNavigationDestination?.id,
    mapState.currentLocation,
    completion.getTripDestinationReferenceRoute,
    data.isTripOngoing,
    mapState.livePassengerLocations,
    notices.presentPassengerDestinationApproachNotice,
    notices.presentPassengerDestinationNotice,
    notices.presentPickupNotice,
    completion.presentTripDestinationNotice,
    data.tripDepartureCoordinate,
    data.tripId,
    data.tripArrivalCoordinate,
    completion.tryCompleteTripFromNavigation,
    mapState.waypoints,
  ]);

  return {

  };
}
