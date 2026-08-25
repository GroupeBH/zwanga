import { startDriverBackgroundLocationTracking, stopDriverBackgroundLocationTracking } from '@/services/driverBackgroundLocationTask';
import {
  sendPassengerLocationSample,
  startPassengerBackgroundLocationTracking,
  stopPassengerBackgroundLocationTracking,
} from '@/services/passengerBackgroundLocationTask';
import {
  PASSENGER_TRACKING_PREARM_PAST_GRACE_MS,
  PASSENGER_TRACKING_PREARM_WINDOW_MS,
} from '@/constants/rideProgress';
import { useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyTripsQuery, useGetTripByIdQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

const ACTIVE_RIDE_REFRESH_INTERVAL_MS = 15_000;

const isIncompletePassengerBooking = (booking: {
  status: string;
  droppedOff?: boolean;
  droppedOffConfirmedByPassenger?: boolean;
}) =>
  ['pending', 'accepted', 'no_show'].includes(booking.status) &&
  !booking.droppedOff &&
  !booking.droppedOffConfirmedByPassenger;

const isInsidePassengerTrackingWindow = (departureTime?: string | null) => {
  if (!departureTime) return false;
  const departureTimestamp = new Date(departureTime).getTime();
  if (!Number.isFinite(departureTimestamp)) return false;

  const offsetFromNow = departureTimestamp - Date.now();
  return (
    offsetFromNow <= PASSENGER_TRACKING_PREARM_WINDOW_MS &&
    offsetFromNow >= -PASSENGER_TRACKING_PREARM_PAST_GRACE_MS
  );
};

/**
 * Keeps native background-location tasks aligned with the active rides returned by the backend.
 * The native tasks continue independently when React Native is backgrounded or the screen sleeps.
 */
export function ActiveRideLocationCoordinator() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const activeDriverTripIdRef = useRef<string | null>(null);
  const activePassengerBookingIdRef = useRef<string | null>(null);
  const passengerBackgroundStartPromiseRef = useRef<Promise<boolean> | null>(null);
  const passengerForegroundSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

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
  const activePassengerBooking = useMemo(() => {
    const incompleteBookings = myBookings.filter(isIncompletePassengerBooking);
    const ongoingBooking = incompleteBookings.find(
      (booking) =>
        (booking.status === 'accepted' || booking.status === 'no_show') &&
        booking.trip?.status === 'ongoing',
    );
    if (ongoingBooking) return ongoingBooking;

    // Pre-arm the native task while the app is still awake. It will wait for the backend trip
    // status before sending positions, then continue even if iOS suspends the React Native app.
    return (
      incompleteBookings
        .filter((booking) =>
          isInsidePassengerTrackingWindow(booking.trip?.departureTime) ||
          (!booking.trip && booking.status === 'accepted'),
        )
        .sort((first, second) => {
          const firstDeparture = new Date(first.trip?.departureTime ?? 0).getTime();
          const secondDeparture = new Date(second.trip?.departureTime ?? 0).getTime();
          return Math.abs(firstDeparture - Date.now()) - Math.abs(secondDeparture - Date.now());
        })[0] ?? null
    );
  }, [myBookings]);

  const driverTripId = activeDriverTrip?.id ?? null;
  const passengerBookingId = activePassengerBooking?.id ?? null;
  const passengerTripId = activePassengerBooking?.tripId ?? null;
  const { data: passengerTripSnapshot } = useGetTripByIdQuery(passengerTripId ?? '', {
    skip: !isAuthenticated || !passengerTripId,
    pollingInterval: 5000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const passengerTripStatus =
    passengerTripSnapshot?.status ?? activePassengerBooking?.trip?.status ?? null;
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
      passengerBackgroundStartPromiseRef.current = null;
      void stopPassengerBackgroundLocationTracking();
      return;
    }
    if (!areBookingsLoaded) return;

    if (!passengerBookingId) {
      passengerBackgroundStartPromiseRef.current = null;
      void stopPassengerBackgroundLocationTracking();
      return;
    }

    const startPromise = startPassengerBackgroundLocationTracking(passengerBookingId, {
      requestMissingPermissions: true,
      tripId: passengerTripId,
      waitForActiveTrip: passengerTripStatus !== 'ongoing',
    });
    passengerBackgroundStartPromiseRef.current = startPromise;
    void startPromise.then(() => {
      if (activePassengerBookingIdRef.current !== passengerBookingId) {
        void stopPassengerBackgroundLocationTracking(passengerBookingId);
      }
    });
  }, [
    areBookingsLoaded,
    isAuthenticated,
    passengerBookingId,
    passengerTripId,
    passengerTripStatus,
  ]);

  useEffect(() => {
    const canSendPassengerLocationInForeground = Boolean(
      isAuthenticated &&
        passengerBookingId &&
        (activePassengerBooking?.status === 'accepted' ||
          activePassengerBooking?.status === 'no_show') &&
        passengerTripStatus === 'ongoing',
    );

    if (!canSendPassengerLocationInForeground || !passengerBookingId) {
      passengerForegroundSubscriptionRef.current?.remove();
      passengerForegroundSubscriptionRef.current = null;
      return;
    }

    let cancelled = false;
    const sendLocation = (location: Location.LocationObject) => {
      if (cancelled) return;
      void sendPassengerLocationSample(passengerBookingId, location);
    };

    const startForegroundFallback = async () => {
      await passengerBackgroundStartPromiseRef.current;
      if (cancelled) return;

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED || cancelled) return;

      try {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        sendLocation(currentLocation);
      } catch (error) {
        console.warn('[ActiveRideLocation] Position passager initiale indisponible:', error);
      }

      if (cancelled) return;
      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 0,
          },
          sendLocation,
        );
        if (cancelled) {
          subscription.remove();
          return;
        }

        passengerForegroundSubscriptionRef.current?.remove();
        passengerForegroundSubscriptionRef.current = subscription;
      } catch (error) {
        console.warn('[ActiveRideLocation] Suivi passager au premier plan indisponible:', error);
      }
    };

    void startForegroundFallback();
    return () => {
      cancelled = true;
      passengerForegroundSubscriptionRef.current?.remove();
      passengerForegroundSubscriptionRef.current = null;
    };
  }, [
    activePassengerBooking?.status,
    isAuthenticated,
    passengerBookingId,
    passengerTripStatus,
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
