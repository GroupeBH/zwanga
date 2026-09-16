import { usePassengerNavigationData } from './usePassengerNavigationData';
import { BookingAutoProgressEvent } from '../../features/passenger-navigation/navigationModel';
import { type RecoveryFix } from '@/features/ride-recovery/RideRecoveryControl';
import { warnThrottled } from '@/utils/throttledWarning';
import {
  BOARDING_LOCATION_MAX_AGE_MS,
  BOARDING_MAX_ACCEPTED_GPS_ACCURACY_METERS,
  PASSENGER_LOCATION_DISTANCE_INTERVAL_METERS,
  PASSENGER_LOCATION_SEND_INTERVAL_MS,
} from '@/constants/rideProgress';
import { trackingSocket } from '@/services/trackingSocket';
import { recordLocationDelivery } from '@/services/locationDelivery';
import { subscribeRideLocation } from '@/services/rideLocationStream';
import {
  startPassengerBackgroundLocationTracking,
  stopPassengerBackgroundLocationTracking,
} from '@/services/passengerBackgroundLocationTask';
import { isCoordinateInKinshasaBounds, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import {
  MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
  isPlausibleLocationUpdate,
  type NavigationCoordinate,
} from '@/utils/navigation/routeProgress';
import * as Location from 'expo-location';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import type { Booking } from '@/types';

interface Params {
  booking: Booking | undefined;
  isTripOngoing: boolean;
  passengerLocationSubscriptionRef: React.RefObject<Location.LocationSubscription | null>;
  isFocused: boolean;
  isMountedRef: React.RefObject<boolean>;
  isExitingRef: React.RefObject<boolean>;
  isKinshasaTrip: boolean;
  tripId: string;
  lastAcceptedPassengerCoordinateRef: React.RefObject<NavigationCoordinate | null>;
  lastAcceptedPassengerTimestampRef: React.RefObject<number | null>;
  setPassengerLocation: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; } | null>>;
  setRecoveryFix: React.Dispatch<React.SetStateAction<RecoveryFix | null>>;
  beginLocationRequest: (key: string) => { attach: (request: { abort: () => void; }) => void; isCurrent: () => boolean; finish: () => void; } | null;
  updatePassengerLocation: ReturnType<typeof usePassengerNavigationData>['updatePassengerLocation'];
  presentPickupNotice: (event: BookingAutoProgressEvent) => void;
  presentBoardedNotice: () => void;
  presentNoShowNotice: () => void;
  presentBoardingUncertainNotice: () => void;
  presentDestinationApproachNotice: (event: BookingAutoProgressEvent) => void;
  presentArrivalModal: () => void;
  presentTripDestinationNotice: (event: BookingAutoProgressEvent) => void;
  refetchBooking: ReturnType<typeof usePassengerNavigationData>['refetchBooking'];
  refetchTrip: ReturnType<typeof usePassengerNavigationData>['refetchTrip'];
  showDialog: ReturnType<typeof usePassengerNavigationData>['showDialog'];
}

export function usePassengerLocationSharing({
  booking,
  isTripOngoing,
  passengerLocationSubscriptionRef,
  isFocused,
  isMountedRef,
  isExitingRef,
  isKinshasaTrip,
  tripId,
  lastAcceptedPassengerCoordinateRef,
  lastAcceptedPassengerTimestampRef,
  setPassengerLocation,
  setRecoveryFix,
  beginLocationRequest,
  updatePassengerLocation,
  presentPickupNotice,
  presentBoardedNotice,
  presentNoShowNotice,
  presentBoardingUncertainNotice,
  presentDestinationApproachNotice,
  presentArrivalModal,
  presentTripDestinationNotice,
  refetchBooking,
  refetchTrip,
  showDialog,
}: Params) {
  useEffect(() => {
    const canShareLocation =
      booking?.status === 'accepted' || booking?.status === 'no_show';
    if (!booking?.id || !canShareLocation || !isTripOngoing || booking.droppedOff) {
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
      if (booking?.id) {
        void stopPassengerBackgroundLocationTracking(booking.id);
      }
      return;
    }

    if (!isFocused) return;
    let isCancelled = false;
    let lastSentAt = 0;
    let lastUiUpdateAt = -Infinity;
    const sendLocation = async (location: Location.LocationObject) => {
      if (isCancelled || !isMountedRef.current || isExitingRef.current) return;
      const coordinate = normalizeTripMapCoordinate(
        location.coords.latitude,
        location.coords.longitude,
      );
      if (!coordinate) {
        console.warn('[PassengerNavigation] Position passager ignoree car invalide:', {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        return;
      }
      if (isKinshasaTrip && !isCoordinateInKinshasaBounds(coordinate)) {
        console.warn('[PassengerNavigation] Position passager hors Kinshasa non envoyée:', {
          bookingId: booking.id,
          tripId,
          coordinate,
        });
        return;
      }

      const locationTimestamp = Number(location.timestamp);
      const acceptedTimestamp = Number.isFinite(locationTimestamp)
        ? locationTimestamp
        : Date.now();
      if (Date.now() - acceptedTimestamp > BOARDING_LOCATION_MAX_AGE_MS) {
        return;
      }

      if (
        lastAcceptedPassengerCoordinateRef.current &&
        typeof location.coords.accuracy === 'number' &&
        location.coords.accuracy > BOARDING_MAX_ACCEPTED_GPS_ACCURACY_METERS
      ) {
        return;
      }

      if (
        !isPlausibleLocationUpdate({
          previous: lastAcceptedPassengerCoordinateRef.current,
          current: coordinate,
          previousTimestamp: lastAcceptedPassengerTimestampRef.current,
          currentTimestamp: acceptedTimestamp,
          maxJumpMeters: MAX_PLAUSIBLE_LOCATION_JUMP_METERS,
        })
      ) {
        console.warn('[PassengerNavigation] Position passager ignoree: saut GPS incoherent');
        return;
      }

      lastAcceptedPassengerCoordinateRef.current = coordinate;
      lastAcceptedPassengerTimestampRef.current = acceptedTimestamp;
      const now = Date.now();
      if (now - lastUiUpdateAt >= 2000) {
        lastUiUpdateAt = now;
        setPassengerLocation(coordinate);
        setRecoveryFix({ ...coordinate, recordedAt: acceptedTimestamp, accuracy: location.coords.accuracy ?? undefined });
      }
      if (now - lastSentAt < PASSENGER_LOCATION_SEND_INTERVAL_MS) return;
      const requestGuard = beginLocationRequest(booking.id);
      if (!requestGuard) return;
      lastSentAt = now;
      const metadata = {
        ...(typeof location.coords.accuracy === 'number' &&
        Number.isFinite(location.coords.accuracy) &&
        location.coords.accuracy >= 0
          ? { accuracy: location.coords.accuracy }
          : {}),
        ...(typeof location.coords.speed === 'number' &&
        Number.isFinite(location.coords.speed) &&
        location.coords.speed >= 0
          ? { speed: location.coords.speed }
          : {}),
        ...(typeof location.coords.heading === 'number' &&
        Number.isFinite(location.coords.heading) &&
        location.coords.heading >= 0
          ? { heading: location.coords.heading }
          : {}),
        recordedAt: new Date(acceptedTimestamp).toISOString(),
      };

      try {
        try {
          await trackingSocket.updatePassengerLocation(tripId, booking.id, [
            coordinate.longitude,
            coordinate.latitude,
          ], metadata);
          return;
        } catch (socketError) {
          if (!requestGuard.isCurrent() || isCancelled || isExitingRef.current) return;
          warnThrottled('[PassengerNavigation] Envoi temps réel indisponible, fallback REST:', socketError);
        }

        const request = updatePassengerLocation({
          bookingId: booking.id,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          ...metadata,
        });
        requestGuard.attach(request);
        const response = await request.unwrap();
        recordLocationDelivery(`passenger:${booking.id}`);
        if (!requestGuard.isCurrent() || isCancelled || isExitingRef.current) return;

        if (response.autoProgress?.events?.length && isMountedRef.current) {
          const bookingEvents = response.autoProgress.events.filter(
            (event) => event.bookingId === booking.id,
          );
          const tripDestinationEvents = response.autoProgress.events.filter(
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
              presentPickupNotice(event as BookingAutoProgressEvent);
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
              presentDestinationApproachNotice(event as BookingAutoProgressEvent);
            }
            if (event.type === 'dropoff_confirmed') {
              presentArrivalModal();
            }
          });
          tripDestinationEvents.forEach((event) => {
            presentTripDestinationNotice(event as BookingAutoProgressEvent);
          });
          refetchBooking();
          if (tripDestinationEvents.length > 0) {
            refetchTrip();
          }
        }
      } catch (error) {
        if (requestGuard.isCurrent() && !isCancelled) {
          warnThrottled('[PassengerNavigation] Position passager non envoyée:', error);
        }
      } finally {
        requestGuard.finish();
      }
    };

    const startPassengerLocationSharing = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (isCancelled || !isMountedRef.current || isExitingRef.current) return;
        if (permission.status !== 'granted') {
          showDialog({
            variant: 'warning',
            title: 'Localisation requise',
            message:
              "Activez la localisation pour permettre la confirmation automatique de la prise en charge et de l'arrivée.",
          });
          return;
        }

        void startPassengerBackgroundLocationTracking(booking.id, {
          requestMissingPermissions: true,
        });

        let initialLocation: Location.LocationObject | null = null;
        try {
          initialLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch {
          initialLocation = await Location.getLastKnownPositionAsync({});
        }

        if (initialLocation) {
          // A slow first upload must not delay installation of the foreground GPS watcher.
          void sendLocation(initialLocation);
        }

        if (isCancelled || !isMountedRef.current) return;
        const subscription = subscribeRideLocation(
          `passenger:${booking.id}`,
          {
            accuracy: Location.Accuracy.High,
            timeInterval: PASSENGER_LOCATION_SEND_INTERVAL_MS,
            distanceInterval: PASSENGER_LOCATION_DISTANCE_INTERVAL_METERS,
          },
          (location) => {
            void sendLocation(location);
          },
        );

        if (isCancelled || !isMountedRef.current) {
          subscription.remove();
          return;
        }

        passengerLocationSubscriptionRef.current = subscription;
      } catch (error) {
        console.warn('[PassengerNavigation] Suivi GPS passager indisponible:', error);
      }
    };

    void startPassengerLocationSharing();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || isCancelled) return;

      void trackingSocket.resumeBoardingDetection(tripId).catch((error) => {
        console.warn('[PassengerNavigation] Reprise détection embarquement impossible:', error);
      });
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then(sendLocation)
        .catch((error) => {
          console.warn('[PassengerNavigation] Position de reprise indisponible:', error);
        });
    });

    return () => {
      isCancelled = true;
      appStateSubscription.remove();
      passengerLocationSubscriptionRef.current?.remove();
      passengerLocationSubscriptionRef.current = null;
    };
  }, [
    beginLocationRequest,
    booking?.droppedOff,
    booking?.id,
    booking?.status,
    isKinshasaTrip,
    isFocused,
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
    showDialog,
    tripId,
    updatePassengerLocation,
  ]);

  return {

  };
}
