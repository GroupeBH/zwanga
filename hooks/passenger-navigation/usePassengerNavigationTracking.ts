import { usePassengerNavigationData } from './usePassengerNavigationData';
import { BookingAutoProgressEvent } from '../../features/passenger-navigation/navigationModel';
import { trackingSocket, type DriverLocationPayload } from '@/services/trackingSocket';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import {
  MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
  isPlausibleLocationUpdate,
  type NavigationCoordinate,
} from '@/utils/navigation/routeProgress';
import React, { useEffect } from 'react';
import type { Trip } from '@/types';

interface Params {
  isScreenActive: boolean;
  routeFetchedRef: React.RefObject<boolean>;
  setIsLoadingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  routeSignatureRef: React.RefObject<string>;
  passengerRouteSignature: string;
  lastRouteFetchRef: React.RefObject<number>;
  trip: Trip | undefined;
  fetchRoute: () => Promise<void>;
  tripId: string;
  isTripOngoing: boolean;
  setIsSocketConnected: React.Dispatch<React.SetStateAction<boolean>>;
  isMountedRef: React.RefObject<boolean>;
  lastAcceptedDriverCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedDriverTimestampRef: React.RefObject<number | null>;
  setDriverLocation: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; } | null>>;
  setLastUpdate: React.Dispatch<React.SetStateAction<Date | null>>;
  bookingId: string;
  presentPickupNotice: (event: BookingAutoProgressEvent) => void;
  presentBoardedNotice: () => void;
  presentNoShowNotice: () => void;
  presentBoardingUncertainNotice: () => void;
  presentDestinationApproachNotice: (event: BookingAutoProgressEvent) => void;
  presentArrivalModal: () => void;
  presentTripDestinationNotice: (event: BookingAutoProgressEvent) => void;
  refetchBooking: ReturnType<typeof usePassengerNavigationData>['refetchBooking'];
  refetchTrip: ReturnType<typeof usePassengerNavigationData>['refetchTrip'];
}

export function usePassengerNavigationTracking({
  isScreenActive,
  routeFetchedRef,
  setIsLoadingRoute,
  routeSignatureRef,
  passengerRouteSignature,
  lastRouteFetchRef,
  trip,
  fetchRoute,
  tripId,
  isTripOngoing,
  setIsSocketConnected,
  isMountedRef,
  lastAcceptedDriverCoordinateRef,
  lastAcceptedDriverTimestampRef,
  setDriverLocation,
  setLastUpdate,
  bookingId,
  presentPickupNotice,
  presentBoardedNotice,
  presentNoShowNotice,
  presentBoardingUncertainNotice,
  presentDestinationApproachNotice,
  presentArrivalModal,
  presentTripDestinationNotice,
  refetchBooking,
  refetchTrip,
}: Params) {
  useEffect(() => {
    if (!isScreenActive) {
      routeFetchedRef.current = false;
      setIsLoadingRoute(false);
      return;
    }
    if (routeSignatureRef.current !== passengerRouteSignature) {
      routeSignatureRef.current = passengerRouteSignature;
      routeFetchedRef.current = false;
      lastRouteFetchRef.current = 0;
    }

    if (trip && !routeFetchedRef.current) {
      fetchRoute();
    }
  }, [fetchRoute, isScreenActive, passengerRouteSignature, trip]);

  // Connexion WebSocket pour recevoir la position du conducteur
  useEffect(() => {
    if (!isScreenActive || !tripId || !isTripOngoing) {
      setIsSocketConnected(false);
      return;
    }

    let isCancelled = false;
    setIsSocketConnected(false);
    const unsubscribeConnection = trackingSocket.subscribeToConnectionState((connected) => {
      if (!isCancelled && isMountedRef.current) setIsSocketConnected(connected);
    });

    // Rejoindre la room du trip pour recevoir les updates
    trackingSocket
      .joinTrip(tripId)
      .then(() => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(true);
        // Demander la position actuelle du conducteur
        void trackingSocket.requestDriverLocation(tripId).catch(() => undefined);
      })
      .catch((error) => {
        if (!isMountedRef.current || isCancelled) return;
        setIsSocketConnected(false);
        console.warn('[PassengerNavigation] Connexion tracking impossible:', error);
      });

    // Écouter les mises à jour de position du conducteur
    const unsubscribeLocation = trackingSocket.subscribeToDriverLocation((payload: DriverLocationPayload) => {
      if (!isMountedRef.current || isCancelled) return;
      if (payload.tripId === tripId && payload.coordinates) {
        const coordinate = normalizeTripMapCoordinate(
          payload.coordinates[1],
          payload.coordinates[0],
        );
        if (!coordinate) return;
        const updatedAtMs = payload.updatedAt
          ? new Date(payload.updatedAt).getTime()
          : Date.now();
        const safeUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now();
        if (
          !isPlausibleLocationUpdate({
            previous: lastAcceptedDriverCoordinateRef.current,
            current: coordinate,
            previousTimestamp: lastAcceptedDriverTimestampRef.current,
            currentTimestamp: safeUpdatedAtMs,
            maxJumpMeters: MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
          })
        ) {
          console.warn('[PassengerNavigation] Position du conducteur ignorée : saut GPS incohérent');
          return;
        }

        lastAcceptedDriverCoordinateRef.current = coordinate;
        lastAcceptedDriverTimestampRef.current = safeUpdatedAtMs;
        setDriverLocation(coordinate);
        setLastUpdate(new Date(safeUpdatedAtMs));
      }
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (!isMountedRef.current || payload.tripId !== tripId) return;
      const bookingEvents = payload.events.filter((event) => event.bookingId === bookingId);
      const tripDestinationEvents = payload.events.filter(
        (event) =>
          event.type === 'driver_near_destination' ||
          event.type === 'driver_arrived_destination',
      );
      bookingEvents.forEach((event) => {
        if (
          event.type === 'driver_near_pickup' ||
          event.type === 'driver_arrived_pickup' ||
          event.type === 'parties_nearby'
        ) {
          presentPickupNotice(event);
        }
        if (event.type === 'pickup_confirmed') {
          presentBoardedNotice();
        }
        if (event.type === 'passenger_no_show') {
          presentNoShowNotice();
        }
        if (event.type === 'passenger_boarding_uncertain') {
          presentBoardingUncertainNotice();
        }
        if (event.type === 'passenger_near_destination') {
          presentDestinationApproachNotice(event);
        }
      });
      if (bookingEvents.some((event) => event.type === 'dropoff_confirmed')) {
        presentArrivalModal();
      }
      tripDestinationEvents.forEach(presentTripDestinationNotice);
      if (bookingEvents.length > 0 || tripDestinationEvents.length > 0) {
        refetchBooking();
        refetchTrip();
      }
    });

    // Écouter les erreurs
    const unsubscribeError = trackingSocket.subscribeToErrors((message) => {
      if (!isMountedRef.current || isCancelled) return;
      console.warn('[PassengerNavigation] Erreur tracking:', message);
    });

    // Live pushes supply positions; useDriverLocationFallback handles silent connections.

    return () => {
      isCancelled = true;
      trackingSocket.leaveTrip(tripId);
      unsubscribeConnection();
      unsubscribeLocation();
      unsubscribeAutoProgress();
      unsubscribeError();
    };
  }, [
    bookingId,
    isScreenActive,
    isTripOngoing,
    presentDestinationApproachNotice,
    presentArrivalModal,
    presentBoardedNotice,
    presentBoardingUncertainNotice,
    presentPickupNotice,
    presentNoShowNotice,
    presentTripDestinationNotice,
    refetchBooking,
    refetchTrip,
    tripId,
  ]);

  return {

  };
}
