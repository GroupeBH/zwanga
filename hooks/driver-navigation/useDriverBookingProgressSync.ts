import { useDriverNavigationBookings } from './useDriverNavigationBookings';
import { useDriverNavigationRefs } from './useDriverNavigationRefs';
import { useDriverNavigationData } from './useDriverNavigationData';
import { useDriverNavigationMapState } from './useDriverNavigationMapState';
import {
  hasBookingPickupCompleted,
  hasBookingDropoffCompleted,
  getBookingPickupLabel,
  getBookingDropoffLabel,
  getBookingDropoffCoordinate,
} from '../../features/driver-navigation/navigationBooking';
import { isCoordinateAllowedForNavigationRoute } from '../../features/driver-navigation/navigationMap';
import { Waypoint } from '../../features/driver-navigation/navigationModel';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useEffect } from 'react';

interface Params {
  passengers: ReturnType<typeof useDriverNavigationBookings>;
  data: ReturnType<typeof useDriverNavigationData>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
}

export function useDriverBookingProgressSync({
  passengers,
  data,
  refs,
  mapState,
}: Params) {
  const activeWaypoint = mapState.activeWaypoint;
  useEffect(() => {
    if (!passengers.visibleBookings || !data.trip) return;

    // Vérifier que les coordonnées du trip sont valides
    const hasDeparture = Boolean(data.tripDepartureCoordinate);
    const hasArrival = Boolean(data.tripArrivalCoordinate);
    
    if (!hasDeparture || !hasArrival) {
      if (__DEV__) {
        console.log('Coordonnées du trajet invalides');
      }
      return;
    }

    const acceptedBookings = passengers.visibleBookings.filter(b => b.status === 'accepted');
    const waypointsList: Waypoint[] = [];

    acceptedBookings.forEach((booking) => {
      try {
        // Utiliser le point de récupération choisi pendant la réservation.
        const passengerPickupCoordinate = normalizeTripMapCoordinate(
          booking.passengerOriginCoordinates?.latitude,
          booking.passengerOriginCoordinates?.longitude,
        );
        const safePassengerPickupCoordinate = isCoordinateAllowedForNavigationRoute(
          passengerPickupCoordinate,
          data.isKinshasaNavigationTrip,
        )
          ? passengerPickupCoordinate
          : null;
        if (data.isKinshasaNavigationTrip && passengerPickupCoordinate && !safePassengerPickupCoordinate) {
          console.warn('[DriverNavigation] Pickup waypoint passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerPickupCoordinate,
            origin: booking.passengerOrigin,
          });
        }
        const pickupLocation = {
          lat: safePassengerPickupCoordinate?.latitude ?? data.tripDepartureCoordinate!.latitude,
          lng: safePassengerPickupCoordinate?.longitude ?? data.tripDepartureCoordinate!.longitude,
        };
        const pickupAddress = getBookingPickupLabel(booking, data.trip);
        waypointsList.push({
          id: `pickup-${booking.id}`,
          type: 'pickup',
          location: pickupLocation,
          address: pickupAddress,
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: hasBookingPickupCompleted(booking),
        });

        // Point d'arrivée du passager (destination personnalisée ou arrivée du trip)
        const passengerDestinationCoordinate = getBookingDropoffCoordinate(
          booking,
          data.tripArrivalCoordinate,
        );
        let dropoffLocation = {
          lat: passengerDestinationCoordinate?.latitude ?? data.tripArrivalCoordinate!.latitude,
          lng: passengerDestinationCoordinate?.longitude ?? data.tripArrivalCoordinate!.longitude,
        };
        const safePassengerDestinationCoordinate = isCoordinateAllowedForNavigationRoute(
          passengerDestinationCoordinate,
          data.isKinshasaNavigationTrip,
        )
          ? passengerDestinationCoordinate
          : null;
        if (
          data.isKinshasaNavigationTrip &&
          passengerDestinationCoordinate &&
          !safePassengerDestinationCoordinate
        ) {
          console.warn('[DriverNavigation] Dropoff waypoint passager hors Kinshasa ignore:', {
            bookingId: booking.id,
            coordinate: passengerDestinationCoordinate,
            destination: booking.passengerDestination,
          });
        }

        if (safePassengerDestinationCoordinate) {
          dropoffLocation = { 
            lat: safePassengerDestinationCoordinate.latitude,
            lng: safePassengerDestinationCoordinate.longitude,
          };
        } else {
          dropoffLocation = {
            lat: data.tripArrivalCoordinate!.latitude,
            lng: data.tripArrivalCoordinate!.longitude,
          };
        }
        const dropoffAddress = getBookingDropoffLabel(booking, data.trip);
        waypointsList.push({
          id: `dropoff-${booking.id}`,
          type: 'dropoff',
          location: dropoffLocation,
          address: dropoffAddress,
          passenger: {
            id: booking.passengerId,
            name: booking.passengerName || 'Passager',
            phone: booking.passengerPhone,
          },
          booking,
          completed: hasBookingDropoffCompleted(booking),
        });
      } catch (error) {
        if (__DEV__) {
          console.log('Erreur création waypoint pour booking:', booking.id, error);
        }
      }
    });

    if (__DEV__) {
      console.log('[DriverNavigation] navigation waypoints', {
        tripId: data.tripId,
        isKinshasaNavigationTrip: data.isKinshasaNavigationTrip,
        count: waypointsList.length,
        waypoints: waypointsList.map((waypoint) => ({
          id: waypoint.id,
          type: waypoint.type,
          completed: waypoint.completed,
          bookingId: waypoint.booking.id,
          coordinate: waypoint.location,
        })),
      });
    }

    refs.waypointsRef.current = waypointsList;
    mapState.setWaypoints(waypointsList);

    // Trouver le prochain waypoint non complété
    const nextIncompleteIndex = waypointsList.findIndex((wp) => {
      const isSkippedPickupBooking =
        mapState.skippedPickupBookingIds.has(wp.booking.id) &&
        !hasBookingPickupCompleted(wp.booking);
      return !wp.completed && !isSkippedPickupBooking;
    });
    if (nextIncompleteIndex !== -1) {
      refs.currentWaypointIndexRef.current = nextIncompleteIndex;
      mapState.setCurrentWaypointIndex(nextIncompleteIndex);
    } else {
      refs.currentWaypointIndexRef.current = waypointsList.length;
      mapState.setCurrentWaypointIndex(waypointsList.length);
    }
  }, [
    data.isKinshasaNavigationTrip,
    mapState.skippedPickupBookingIds,
    data.trip,
    data.tripArrivalCoordinate,
    data.tripDepartureCoordinate,
    data.tripId,
    passengers.visibleBookings,
  ]);

  useEffect(() => {
    if (!passengers.visibleBookings) {
      return;
    }

    const activeSkippedIds = new Set(
      passengers.visibleBookings
        .filter(
          (booking) =>
            booking.status === 'accepted' &&
            !hasBookingPickupCompleted(booking) &&
            !hasBookingDropoffCompleted(booking),
        )
        .map((booking) => booking.id),
    );

    mapState.setSkippedPickupBookingIds((current) => {
      const next = new Set(
        Array.from(current).filter((bookingId) =>
          activeSkippedIds.has(bookingId),
        ),
      );

      if (
        next.size === current.size &&
        Array.from(current).every((bookingId) => next.has(bookingId))
      ) {
        return current;
      }

      refs.skippedPickupBookingIdsRef.current = next;
      return next;
    });

    const bookingIds = new Set(passengers.visibleBookings.map((booking) => booking.id));
    Array.from(refs.pickupClosestDistanceMetersRef.current.keys()).forEach(
      (bookingId) => {
        if (!bookingIds.has(bookingId)) {
          refs.pickupClosestDistanceMetersRef.current.delete(bookingId);
        }
      },
    );
    Array.from(refs.presentedPickupBypassBookingIdsRef.current).forEach((bookingId) => {
      if (!bookingIds.has(bookingId)) {
        refs.presentedPickupBypassBookingIdsRef.current.delete(bookingId);
      }
    });
  }, [passengers.visibleBookings]);

  useEffect(() => {
    const currentNotice = mapState.pickupNoticeRef.current;
    if (currentNotice) {
      const latestBooking = passengers.visibleBookings?.find(
        (booking) => booking.id === currentNotice.waypoint.booking.id,
      );

      if (
        !latestBooking ||
        hasBookingPickupCompleted(latestBooking) ||
        hasBookingDropoffCompleted(latestBooking)
      ) {
        mapState.pickupNoticeRef.current = null;
        mapState.setPickupNotice(null);
        mapState.setPickupNoticeCountdown(null);
      }
    }

    const currentBypassConfirmation = mapState.pickupBypassConfirmationRef.current;
    if (currentBypassConfirmation) {
      const latestBooking = passengers.visibleBookings?.find(
        (booking) => booking.id === currentBypassConfirmation.waypoint.booking.id,
      );

      if (
        !latestBooking ||
        latestBooking.status !== 'accepted' ||
        hasBookingPickupCompleted(latestBooking) ||
        hasBookingDropoffCompleted(latestBooking)
      ) {
        mapState.pickupBypassConfirmationRef.current = null;
        mapState.setPickupBypassConfirmation(null);
        mapState.setPickupBypassAction(null);
      }
    }

    if (activeWaypoint) {
      const latestBooking = passengers.visibleBookings?.find(
        (booking) => booking.id === activeWaypoint.booking.id,
      );
      const isCompleted =
        activeWaypoint.type === 'pickup'
          ? hasBookingPickupCompleted(latestBooking)
          : hasBookingDropoffCompleted(latestBooking);

      if (!latestBooking || isCompleted) {
        refs.waypointModalVisibleRef.current = false;
        mapState.setWaypointModalVisible(false);
        mapState.setActiveWaypoint(null);
      }
    }
  }, [activeWaypoint, passengers.visibleBookings]);

  return {

  };
}
