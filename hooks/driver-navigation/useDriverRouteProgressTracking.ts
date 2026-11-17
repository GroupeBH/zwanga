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
import { DRIVER_NEAR_PICKUP_DISTANCE_KM, DRIVER_PICKUP_ARRIVAL_DISTANCE_KM, PASSENGER_READY_DISTANCE_KM } from '@/constants/rideProgress';
import { calculateDistance } from '@/utils/routeHelpers';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import {
  DRIVER_TRIP_END_APPROACH_DISTANCE_METERS,
  DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
  DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
  evaluateDestinationAutoComplete,
  evaluateDestinationPassage,
} from '@/utils/navigation/tripCompletion';
import { useEffect, useRef } from 'react';
import { isTripCompletionLocation, isTripCompletionTimestamp } from '@/utils/navigation/tripCompletionObservation';

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
  const previousFix = useRef<{ tripId: string; timestamp: number } | null>(null);
  const { getTripDestinationReferenceRoute, presentTripDestinationNotice, tryCompleteTripFromNavigation } = completion;
  const { presentPassengerDestinationApproachNotice, presentPassengerDestinationNotice, presentPickupNotice } = notices;
  const { currentLocationRef, routeCoordinatesRef, tripDestinationNearSinceMsRef } = refs;
  const { lastTripCompletionCheckCoordinateRef } = mapState;
  useEffect(() => {
    if (!data.isTripOngoing || !data.tripId) {
      return;
    }

    const latestDriverLocation = currentLocationRef.current ?? mapState.currentLocation;
    if (!latestDriverLocation) {
      return;
    }

    const driverCoordinate = {
      latitude: latestDriverLocation.coords.latitude,
      longitude: latestDriverLocation.coords.longitude,
    };
    const canDetectArrival = isTripCompletionLocation(latestDriverLocation, data.trip?.startedAt);
    const previousDriverCoordinate = canDetectArrival && previousFix.current?.tripId === data.tripId &&
      isTripCompletionTimestamp(previousFix.current.timestamp, data.trip?.startedAt) &&
      previousFix.current.timestamp < latestDriverLocation.timestamp
      ? lastTripCompletionCheckCoordinateRef.current : null;
    const detectedAt = new Date().toISOString();

    mapState.waypoints.forEach((waypoint) => {
      const booking = waypoint.booking;

      if (waypoint.type === 'dropoff') {
        if (!canDetectArrival || !hasBookingPickupCompleted(booking) || hasBookingDropoffCompleted(booking)) {
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
              ? routeCoordinatesRef.current
              : [data.tripDepartureCoordinate, dropoffCoordinate].filter(
                  (coordinate): coordinate is RouteCoordinate => Boolean(coordinate),
                ),
          directDistanceThresholdMeters:
            DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
          parallelDistanceThresholdMeters:
            DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
        });

        if (driverDropoffDistanceKm <= DRIVER_DROPOFF_APPROACH_DISTANCE_KM) {
          presentPassengerDestinationApproachNotice(
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
          presentPassengerDestinationNotice(
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

      if (driverPickupDistanceKm <= DRIVER_NEAR_PICKUP_DISTANCE_KM) {
        presentPickupNotice(
          {
            type: driverPickupDistanceKm <= DRIVER_PICKUP_ARRIVAL_DISTANCE_KM
              ? 'driver_arrived_pickup' : 'driver_near_pickup',
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
        presentPickupNotice(
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

    if (data.tripArrivalCoordinate && canDetectArrival) {
      const driverTripEndDistanceMeters = calculateDistanceMeters(
        driverCoordinate,
        data.tripArrivalCoordinate,
      );
      const roundedTripEndDistanceMeters = Math.round(driverTripEndDistanceMeters);

      if (driverTripEndDistanceMeters <= DRIVER_TRIP_END_APPROACH_DISTANCE_METERS) {
        presentTripDestinationNotice({
          type: 'driver_near_destination',
          tripId: data.tripId,
          distanceMeters: roundedTripEndDistanceMeters,
          detectedAt,
        });
      }

      const destinationAutoComplete = evaluateDestinationAutoComplete({
        destinationCoordinate: data.tripArrivalCoordinate,
        driverCoordinate,
        nearDestinationSinceMs: tripDestinationNearSinceMsRef.current,
      });
      const destinationPassage = evaluateDestinationPassage({
        destinationCoordinate: data.tripArrivalCoordinate,
        driverCoordinate,
        previousDriverCoordinate,
        routeCoordinates: getTripDestinationReferenceRoute(),
        directDistanceThresholdMeters: DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS,
        parallelDistanceThresholdMeters: DRIVER_TRIP_END_PARALLEL_COMPLETE_DISTANCE_METERS,
      });
      tripDestinationNearSinceMsRef.current =
        destinationAutoComplete.nearDestinationSinceMs;

      if (
        driverTripEndDistanceMeters <= DRIVER_TRIP_END_DIRECT_COMPLETE_DISTANCE_METERS ||
        destinationAutoComplete.shouldComplete ||
        destinationPassage.shouldComplete
      ) {
        tryCompleteTripFromNavigation(roundedTripEndDistanceMeters);
      }
    }

    if (canDetectArrival) {
      lastTripCompletionCheckCoordinateRef.current = driverCoordinate;
      previousFix.current = { tripId: data.tripId, timestamp: latestDriverLocation.timestamp };
    } else {
      previousFix.current = null;
      tripDestinationNearSinceMsRef.current = null;
    }
  }, [
    activeNavigationDestination?.id,
    mapState.currentLocation,
    getTripDestinationReferenceRoute,
    data.isTripOngoing,
    mapState.livePassengerLocations,
    presentPassengerDestinationApproachNotice,
    presentPassengerDestinationNotice,
    presentPickupNotice,
    presentTripDestinationNotice,
    data.tripDepartureCoordinate,
    data.tripId,
    data.trip?.startedAt,
    data.tripArrivalCoordinate,
    tryCompleteTripFromNavigation,
    mapState.waypoints,
    currentLocationRef,
    routeCoordinatesRef,
    tripDestinationNearSinceMsRef,
    lastTripCompletionCheckCoordinateRef,
  ]);

  return {

  };
}
