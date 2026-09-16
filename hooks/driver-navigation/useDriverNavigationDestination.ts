import { useDriverNavigationBookings } from './useDriverNavigationBookings';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import {
  hasBookingPickupCompleted,
  hasBookingDropoffCompleted,
} from '../../features/driver-navigation/navigationBooking';
import { isCoordinateAllowedForNavigationRoute } from '../../features/driver-navigation/navigationMap';
import {
  RouteCoordinate,
  PickupBypassConfirmation,
  PICKUP_BYPASS_OBSERVED_DISTANCE_METERS,
  PICKUP_BYPASS_MIN_AHEAD_METERS,
  PICKUP_BYPASS_MIN_DISTANCE_METERS,
  PICKUP_BYPASS_BEHIND_HEADING_DEGREES,
} from '../../features/driver-navigation/navigationModel';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import {
  ROUTE_DEVIATION_THRESHOLD_METERS,
  calculateBearingDegrees,
  calculateDistanceMeters,
  getPolylineProgress,
  normalizeHeadingDelta,
  resolveActiveDestination,
  type NavigationStop,
} from '@/utils/navigation/routeProgress';
import { useMemo } from 'react';

interface Params {
  refs: ReturnType<typeof useDriverNavigationRefs>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  passengers: ReturnType<typeof useDriverNavigationBookings>;
  data: ReturnType<typeof useDriverNavigationData>;
}

export function useDriverNavigationDestination({
  refs,
  mapState,
  passengers,
  data,
}: Params) {
  refs.stepsRef.current = mapState.steps;
  refs.currentStepIndexRef.current = mapState.currentStepIndex;
  refs.waypointsRef.current = mapState.waypoints;
  refs.currentWaypointIndexRef.current = mapState.currentWaypointIndex;
  refs.waypointModalVisibleRef.current = mapState.waypointModalVisible;
  refs.routeCoordinatesRef.current = mapState.routeCoordinates;
  mapState.pickupNoticeRef.current = mapState.pickupNotice;
  mapState.pickupBypassConfirmationRef.current = mapState.pickupBypassConfirmation;
  mapState.tripEndNoticeRef.current = mapState.tripEndNotice;
  refs.bookingsRef.current = passengers.visibleBookings;
  refs.skippedPickupBookingIdsRef.current = mapState.skippedPickupBookingIds;

  const activeNavigationDestination = useMemo(() => {
    const navigationStops = mapState.waypoints.reduce<NavigationStop[]>((stops, waypoint) => {
      const isSkippedPickupBooking =
        mapState.skippedPickupBookingIds.has(waypoint.booking.id) &&
        !hasBookingPickupCompleted(waypoint.booking);
      if (isSkippedPickupBooking) {
        return stops;
      }

      const coordinate = normalizeTripMapCoordinate(
        waypoint.location.lat,
        waypoint.location.lng,
      );

      if (!isCoordinateAllowedForNavigationRoute(coordinate, data.isKinshasaNavigationTrip)) {
        if (data.isKinshasaNavigationTrip && coordinate) {
          console.warn('[DriverNavigation] Waypoint hors Kinshasa ignoré pour le tracé:', {
            waypointId: waypoint.id,
            type: waypoint.type,
            coordinate,
          });
        }

        return stops;
      }

      stops.push({
        id: waypoint.id,
        kind: waypoint.type,
        completed: waypoint.completed,
        coordinate,
      });

      return stops;
    }, []);

    return resolveActiveDestination(navigationStops, data.tripArrivalCoordinate);
  }, [
    data.isKinshasaNavigationTrip,
    mapState.skippedPickupBookingIds,
    data.tripArrivalCoordinate,
    mapState.waypoints,
  ]);
  const activeRouteDestination = activeNavigationDestination?.coordinate ?? null;

  refs.evaluatePickupBypassRef.current = (
    driverCoordinate: RouteCoordinate,
    gpsHeadingDegrees: number | null,
  ) => {
    if (mapState.pickupBypassConfirmationRef.current) {
      return;
    }

    const route = refs.routeCoordinatesRef.current;
    const driverProgress = route.length >= 2
      ? getPolylineProgress(driverCoordinate, route)
      : null;
    const activeDestinationId = activeNavigationDestination?.id ?? null;

    for (const waypoint of refs.waypointsRef.current) {
      const booking = waypoint.booking;
      if (
        waypoint.type !== 'pickup' ||
        waypoint.id !== activeDestinationId ||
        waypoint.completed ||
        hasBookingPickupCompleted(booking) ||
        hasBookingDropoffCompleted(booking) ||
        refs.skippedPickupBookingIdsRef.current.has(booking.id) ||
        refs.presentedPickupBypassBookingIdsRef.current.has(booking.id)
      ) {
        continue;
      }

      const pickupCoordinate = normalizeTripMapCoordinate(
        waypoint.location.lat,
        waypoint.location.lng,
      );
      if (!pickupCoordinate) {
        continue;
      }

      const distanceToPickupMeters = calculateDistanceMeters(
        driverCoordinate,
        pickupCoordinate,
      );
      const previousClosestDistance =
        refs.pickupClosestDistanceMetersRef.current.get(booking.id) ??
        Number.POSITIVE_INFINITY;
      const closestDistance = Math.min(
        previousClosestDistance,
        distanceToPickupMeters,
      );
      refs.pickupClosestDistanceMetersRef.current.set(booking.id, closestDistance);

      if (
        closestDistance > PICKUP_BYPASS_OBSERVED_DISTANCE_METERS ||
        distanceToPickupMeters < PICKUP_BYPASS_MIN_DISTANCE_METERS
      ) {
        continue;
      }

      const pickupProgress = route.length >= 2
        ? getPolylineProgress(pickupCoordinate, route)
        : null;
      const hasPassedPickupOnRoute = Boolean(
        driverProgress &&
          pickupProgress &&
          pickupProgress.closestPoint.distanceMeters <=
            ROUTE_DEVIATION_THRESHOLD_METERS * 2 &&
          driverProgress.distanceFromStartMeters -
            pickupProgress.distanceFromStartMeters >=
            PICKUP_BYPASS_MIN_AHEAD_METERS,
      );
      const pickupBearing = calculateBearingDegrees(
        driverCoordinate,
        pickupCoordinate,
      );
      const isPickupBehindDriver =
        typeof gpsHeadingDegrees === 'number' &&
        Number.isFinite(gpsHeadingDegrees) &&
        normalizeHeadingDelta(gpsHeadingDegrees, pickupBearing) >=
          PICKUP_BYPASS_BEHIND_HEADING_DEGREES;

      if (!hasPassedPickupOnRoute && !isPickupBehindDriver) {
        continue;
      }

      const nextConfirmation: PickupBypassConfirmation = {
        waypoint,
        distanceMeters: Math.round(distanceToPickupMeters),
        closestDistanceMeters: Math.round(closestDistance),
        hasPassedPickupOnRoute,
        isPickupBehindDriver,
        detectedAt: new Date().toISOString(),
      };

      refs.presentedPickupBypassBookingIdsRef.current.add(booking.id);
      mapState.pickupBypassConfirmationRef.current = nextConfirmation;
      mapState.setPickupBypassConfirmation(nextConfirmation);

      console.warn('[DriverNavigation] Pickup depasse sans embarquement, arbitrage conducteur requis:', {
        bookingId: booking.id,
        passengerName: waypoint.passenger.name,
        distanceToPickupMeters: nextConfirmation.distanceMeters,
        closestDistanceMeters: nextConfirmation.closestDistanceMeters,
        hasPassedPickupOnRoute,
        isPickupBehindDriver,
      });

      passengers.setPickupSkipped(booking.id, true);

      const currentNotice = mapState.pickupNoticeRef.current;
      if (currentNotice?.waypoint.booking.id === booking.id) {
        mapState.pickupNoticeRef.current = null;
        mapState.setPickupNotice(null);
        mapState.setPickupNoticeCountdown(null);
      }

      refs.routeFetchedRef.current = false;
      refs.routeSignatureRef.current = '';
      refs.offRouteSampleCountRef.current = 0;
      refs.lastOffRouteRerouteAtRef.current = 0;
      break;
    }
  };

  return {
    activeNavigationDestination,
    activeRouteDestination,
  };
}
