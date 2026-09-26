import { startDriverBackgroundLocationTracking, stopDriverBackgroundLocationTracking } from '@/services/driverBackgroundLocationTask';
import {
  sendPassengerLocationSample,
  startPassengerBackgroundLocationTracking,
  stopPassengerBackgroundLocationTracking,
} from '@/services/passengerBackgroundLocationTask';
import {
  ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
} from '@/constants/rideProgress';
import { useGetMyActivityBookingsQuery as useGetMyBookingsQuery } from '@/store/api/bookingApi';
import { useGetMyActivityTripsQuery as useGetMyTripsQuery, useGetTripByIdQuery } from '@/store/api/tripApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectUser } from '@/store/selectors';
import { selectRideTracking } from '@/features/activity/rideTrackingSelection';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef } from 'react';
import { sharedTripsOptions, sharedBookingsOptions } from '@/features/activity/activityQueryOptions';
import { useActivityTrackingSignal } from '@/hooks/useActivityTrackingSignal';
import { usePathname } from 'expo-router';
import { useAppIsActive } from '@/hooks/useAppIsActive';
import { subscribeBootstrappedRideLocation } from '@/services/rideLocationBootstrap';

const ACTIVE_RIDE_DETAIL_REFRESH_INTERVAL_MS = 30_000;

/**
 * Keeps native background-location tasks aligned with the active rides returned by the backend.
 * The native tasks continue independently when React Native is backgrounded or the screen sleeps.
 */
export function ActiveRideLocationCoordinator() {
  const isAppActive = useAppIsActive();
  const pathname = usePathname();
  const passengerNavigationVisible = pathname.startsWith('/booking/navigate/');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(selectUser)?.id;
  const trackingBookingId = useActivityTrackingSignal();
  const activeDriverTripIdRef = useRef<string | null>(null);
  const activePassengerBookingIdRef = useRef<string | null>(null);
  const passengerStartRef = useRef<Promise<boolean> | null>(null);
  const passengerForegroundSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const {
    data: myTrips = [],
    isSuccess: areTripsLoaded,
  } = useGetMyTripsQuery(undefined, {
    ...sharedTripsOptions,
    skip: !isAuthenticated,
  });
  const {
    data: myBookings = [],
    isSuccess: areBookingsLoaded,
  } = useGetMyBookingsQuery(undefined, {
    ...sharedBookingsOptions,
    skip: !isAuthenticated,
  });

  const { driver: activeDriverTrip, passenger: activePassengerBooking } = useMemo(
    () => selectRideTracking(userId, myTrips, myBookings, trackingBookingId),
    [userId, myTrips, myBookings, trackingBookingId],
  );

  const driverTripId = activeDriverTrip?.id ?? null;
  const passengerTripId = activePassengerBooking?.tripId ?? null;
  const { currentData: passengerTripSnapshot } = useGetTripByIdQuery(passengerTripId ?? '', {
    skip: !isAuthenticated || !passengerTripId,
    pollingInterval: ACTIVE_RIDE_DETAIL_REFRESH_INTERVAL_MS,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: false,
  });
  const passengerTripStatus =
    passengerTripSnapshot?.status ?? activePassengerBooking?.trip?.status ?? null;
  const passengerBookingId = ['completed', 'cancelled'].includes(passengerTripStatus ?? '')
    ? null : activePassengerBooking?.id ?? null;
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
    if (!areTripsLoaded && !passengerBookingId) return;

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
    passengerBookingId,
  ]);

  useEffect(() => {
    activePassengerBookingIdRef.current = isAuthenticated
      ? passengerBookingId
      : null;

    if (!isAuthenticated) {
      passengerStartRef.current = null;
      void stopPassengerBackgroundLocationTracking();
      return;
    }
    if (!areBookingsLoaded) return;

    if (!passengerBookingId) {
      passengerStartRef.current = null;
      void stopPassengerBackgroundLocationTracking();
      return;
    }

    // Foreground resume forces a native health check, even with unchanged ride data.
    if (!isAppActive) return;

    const startPromise = startPassengerBackgroundLocationTracking(passengerBookingId, {
      requestMissingPermissions: true,
      tripId: passengerTripId,
      waitForActiveTrip: passengerTripStatus !== 'ongoing',
    });
    passengerStartRef.current = startPromise;
    void startPromise.then(() => {
      if (activePassengerBookingIdRef.current !== passengerBookingId) {
        void stopPassengerBackgroundLocationTracking(passengerBookingId);
      }
    });
  }, [
    areBookingsLoaded,
    isAppActive,
    isAuthenticated,
    passengerBookingId,
    passengerTripId,
    passengerTripStatus,
  ]);

  useEffect(() => {
    const canSendPassengerLocationInForeground = Boolean(
      isAppActive && !passengerNavigationVisible && isAuthenticated &&
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
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        // The background starter owns the permission dialog; never present a second one.
        await passengerStartRef.current;
        if (cancelled) return;
        permission = await Location.getForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED || cancelled) return;

      if (cancelled) return;
      try {
        const subscription = subscribeBootstrappedRideLocation(
          `passenger:${passengerBookingId}`,
          {
            accuracy: Location.Accuracy.High,
            timeInterval: ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS,
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

    void startForegroundFallback().catch(error => {
      if (!cancelled) console.warn('[ActiveRideLocation] Localisation indisponible:', error);
    });
    return () => {
      cancelled = true;
      passengerForegroundSubscriptionRef.current?.remove();
      passengerForegroundSubscriptionRef.current = null;
    };
  }, [
    activePassengerBooking?.status,
    isAppActive,
    passengerNavigationVisible,
    isAuthenticated,
    passengerBookingId,
    passengerTripStatus,
  ]);

  return null;
}
