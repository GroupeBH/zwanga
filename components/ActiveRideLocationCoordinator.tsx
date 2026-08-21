import { startDriverBackgroundLocationTracking, stopDriverBackgroundLocationTracking } from '@/services/driverBackgroundLocationTask';
import { startPassengerBackgroundLocationTracking, stopPassengerBackgroundLocationTracking } from '@/services/passengerBackgroundLocationTask';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

const ACTIVE_RIDE_REFRESH_INTERVAL_MS = 15_000;

/**
 * Keeps native background-location tasks aligned with the active rides returned by the backend.
 * The native tasks continue independently when React Native is backgrounded or the screen sleeps.
 */
export function ActiveRideLocationCoordinator() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const activeDriverTripIdRef = useRef<string | null>(null);
  const activePassengerBookingIdRef = useRef<string | null>(null);

  const {
    data: myTrips = [],
    isSuccess: areTripsLoaded,
    refetch: refetchTrips,
  } = useGetMyTripsQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: ACTIVE_RIDE_REFRESH_INTERVAL_MS,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: myBookings = [],
    isSuccess: areBookingsLoaded,
    refetch: refetchBookings,
  } = useGetMyBookingsQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: ACTIVE_RIDE_REFRESH_INTERVAL_MS,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const activeDriverTrip = useMemo(
    () => myTrips.find((trip) => trip.status === 'ongoing') ?? null,
    [myTrips],
  );
  const activePassengerBooking = useMemo(
    () =>
      myBookings.find(
        (booking) =>
          booking.status === 'accepted' &&
          booking.trip?.status === 'ongoing' &&
          !booking.droppedOff &&
          !booking.droppedOffConfirmedByPassenger,
      ) ?? null,
    [myBookings],
  );

  const driverTripId = activeDriverTrip?.id ?? null;
  const passengerBookingId = activePassengerBooking?.id ?? null;
  const driverArrivalCoordinate = useMemo(() => {
    if (!activeDriverTrip?.arrival?.hasCoordinates) return null;
    return normalizeTripMapCoordinate(
      activeDriverTrip.arrival.lat,
      activeDriverTrip.arrival.lng,
    );
  }, [
    activeDriverTrip?.arrival?.hasCoordinates,
    activeDriverTrip?.arrival?.lat,
    activeDriverTrip?.arrival?.lng,
  ]);

  useEffect(() => {
    activeDriverTripIdRef.current = isAuthenticated ? driverTripId : null;

    if (!isAuthenticated) {
      void stopDriverBackgroundLocationTracking();
      return;
    }
    if (!areTripsLoaded) return;

    if (!driverTripId) {
      void stopDriverBackgroundLocationTracking();
      return;
    }

    void startDriverBackgroundLocationTracking(driverTripId, {
      arrivalCoordinate: driverArrivalCoordinate,
      requestMissingPermissions: true,
    }).then(() => {
      if (activeDriverTripIdRef.current !== driverTripId) {
        void stopDriverBackgroundLocationTracking(driverTripId);
      }
    });
  }, [
    areTripsLoaded,
    driverArrivalCoordinate,
    driverTripId,
    isAuthenticated,
  ]);

  useEffect(() => {
    activePassengerBookingIdRef.current = isAuthenticated
      ? passengerBookingId
      : null;

    if (!isAuthenticated) {
      void stopPassengerBackgroundLocationTracking();
      return;
    }
    if (!areBookingsLoaded) return;

    if (!passengerBookingId) {
      void stopPassengerBackgroundLocationTracking();
      return;
    }

    void startPassengerBackgroundLocationTracking(passengerBookingId, {
      requestMissingPermissions: true,
    }).then(() => {
      if (activePassengerBookingIdRef.current !== passengerBookingId) {
        void stopPassengerBackgroundLocationTracking(passengerBookingId);
      }
    });
  }, [
    areBookingsLoaded,
    isAuthenticated,
    passengerBookingId,
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      void refetchTrips();
      void refetchBookings();
    });

    return () => subscription.remove();
  }, [isAuthenticated, refetchBookings, refetchTrips]);

  return null;
}
