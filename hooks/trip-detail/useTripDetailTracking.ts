import type { TrackedLocation } from '@/store/slices/locationSlice';
import { useTripDetailData } from './useTripDetailData';
import {
  arrayToLatLng,
  TripDetailAutoProgressEvent,
  TRIP_DETAIL_AUTO_PROGRESS_PRIORITY,
} from '../../features/trip-detail/tripDetailModel';
import { trackingSocket } from '@/services/trackingSocket';
import type { Booking } from '@/types';
import React, { useEffect } from 'react';
import type { Trip } from '@/types';

interface Params {
  trip: Trip | undefined;
  canTrackTrip: boolean;
  isTripDriver: boolean;
  tripBookings: Booking[] | undefined;
  activeBooking: Booking | null;
  bookingForTrip: Booking | null;
  tripDetailBookingStateRef: React.RefObject<Map<string, { pickupConfirmed: boolean; dropoffConfirmed: boolean; }>>;
  presentTripDetailAutoProgressEvent: (event: TripDetailAutoProgressEvent) => void;
  setTrackingError: React.Dispatch<React.SetStateAction<string | null>>;
  setLiveDriverUpdatedAt: React.Dispatch<React.SetStateAction<string | null>>;
  setLiveDriverCoordinate: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; } | null>>;
  refetchTrip: ReturnType<typeof useTripDetailData>['refetchTrip'];
  refetchMyBookings: ReturnType<typeof useTripDetailData>['refetchMyBookings'];
  refetchTripBookings: ReturnType<typeof useTripDetailData>['refetchTripBookings'];
  lastKnownLocation: TrackedLocation | null;
}

export function useTripDetailTracking({
  trip,
  canTrackTrip,
  isTripDriver,
  tripBookings,
  activeBooking,
  bookingForTrip,
  tripDetailBookingStateRef,
  presentTripDetailAutoProgressEvent,
  setTrackingError,
  setLiveDriverUpdatedAt,
  setLiveDriverCoordinate,
  refetchTrip,
  refetchMyBookings,
  refetchTripBookings,
  lastKnownLocation,
}: Params) {
  useEffect(() => {
    if (!trip || !canTrackTrip) {
      return;
    }

    const relevantBookings: Booking[] = isTripDriver
      ? tripBookings ?? []
      : ([activeBooking ?? bookingForTrip].filter(Boolean) as Booking[]);

    if (relevantBookings.length === 0) {
      return;
    }

    const nextState = new Map(tripDetailBookingStateRef.current);

    relevantBookings.forEach((booking) => {
      const pickupConfirmed = Boolean(booking.pickedUp && booking.pickedUpConfirmedByPassenger);
      const dropoffConfirmed = Boolean(
        booking.droppedOff || booking.droppedOffConfirmedByPassenger || booking.status === 'completed',
      );
      const previous = tripDetailBookingStateRef.current.get(booking.id);

      if (previous) {
        if (!previous.pickupConfirmed && pickupConfirmed) {
          presentTripDetailAutoProgressEvent({
            type: 'pickup_confirmed',
            bookingId: booking.id,
            tripId: booking.tripId,
            passengerId: booking.passengerId,
            detectedAt: new Date().toISOString(),
          });
        }

        if (!previous.dropoffConfirmed && dropoffConfirmed) {
          presentTripDetailAutoProgressEvent({
            type: 'dropoff_confirmed',
            bookingId: booking.id,
            tripId: booking.tripId,
            passengerId: booking.passengerId,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      nextState.set(booking.id, { pickupConfirmed, dropoffConfirmed });
    });

    tripDetailBookingStateRef.current = nextState;
  }, [
    activeBooking,
    bookingForTrip,
    canTrackTrip,
    isTripDriver,
    presentTripDetailAutoProgressEvent,
    trip,
    tripBookings,
  ]);

  useEffect(() => {
    if (!trip || !canTrackTrip) {
      setTrackingError(null);
      return;
    }
    let isMounted = true;
    trackingSocket
      .joinTrip(trip.id)
      .then(() => trackingSocket.requestDriverLocation(trip.id))
      .catch(() => { });

    const unsubscribeLocation = trackingSocket.subscribeToDriverLocation((payload) => {
      if (!isMounted || payload.tripId !== trip.id) {
        return;
      }
      const nextCoordinate = arrayToLatLng(payload.coordinates ?? null);
      setLiveDriverUpdatedAt(payload.updatedAt ?? new Date().toISOString());
      if (nextCoordinate) {
        setLiveDriverCoordinate(nextCoordinate);
        setTrackingError(null);
      } else {
        setLiveDriverCoordinate(null);
      }
    });

    const unsubscribeErrors = trackingSocket.subscribeToErrors((message) => {
      if (isMounted) {
        setTrackingError(message);
      }
    });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (!isMounted || payload.tripId !== trip.id || payload.events.length === 0) {
        return;
      }

      [...payload.events]
        .sort(
          (first, second) =>
            TRIP_DETAIL_AUTO_PROGRESS_PRIORITY[first.type] -
            TRIP_DETAIL_AUTO_PROGRESS_PRIORITY[second.type],
        )
        .forEach((event) => {
          presentTripDetailAutoProgressEvent(event);
        });

      void refetchTrip();
      void refetchMyBookings();
      void refetchTripBookings();
    });

    return () => {
      isMounted = false;
      trackingSocket.leaveTrip(trip.id);
      unsubscribeLocation();
      unsubscribeErrors();
      unsubscribeAutoProgress();
    };
  }, [
    trip?.id,
    trip?.status,
    canTrackTrip,
    presentTripDetailAutoProgressEvent,
    refetchMyBookings,
    refetchTrip,
    refetchTripBookings,
  ]);

  useEffect(() => {
    if (!trip || !isTripDriver || trip.status !== 'ongoing') {
      return;
    }
    const coords = lastKnownLocation?.coords;
    if (!coords) {
      return;
    }
    trackingSocket.updateDriverLocation(trip.id, [Number(coords.longitude), Number(coords.latitude)]);
  }, [
    trip?.id,
    trip?.status,
    isTripDriver,
    lastKnownLocation?.coords?.latitude,
    lastKnownLocation?.coords?.longitude,
  ]);

  return {

  };
}
