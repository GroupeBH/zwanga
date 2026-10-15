import { EMPTY_HOME_BOOKINGS, HOME_AUTO_PROGRESS_PRIORITY, isKinshasaHomeTrip } from '@/features/home/homeModel';
import { trackingSocket } from '@/services/trackingSocket';
import type { Booking } from '@/types';
import {
  isCoordinateInKinshasaBounds
} from '@/utils/tripCoordinates';
import { useEffect, useRef } from 'react';

import { getHomeTrackingDialog } from '@/features/home/homeTrackingDialogs';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeLocation } from '@/hooks/home/useHomeLocation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
type Props =
  Pick<ReturnType<typeof useHomeContext>,
    'showDialog'
    | 'isFocused'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'activeBookings'
    | 'activePassengerBooking'
    | 'refetchMyBookings'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverBookings'
    | 'refetchOngoingDriverBookings'
    | 'ongoingDriverTrip'
  >
  & Pick<ReturnType<typeof useHomeTripSelection>,
    'activeHomeTrip'
  >
  & Pick<ReturnType<typeof useHomeLocation>,
    'liveUserCoordinate'
  >;
export function useHomeTracking({
  showDialog,
  activeBookings,
  activePassengerBooking,
  ongoingDriverBookings,
  refetchMyBookings,
  refetchOngoingDriverBookings,
  activeHomeTrip,
  ongoingDriverTrip,
  isFocused,
  liveUserCoordinate,
}: Props) {
  const presentedHomeAutoProgressKeysRef = useRef<Set<string>>(new Set());

  const highestHomeAutoProgressPriorityRef = useRef<Map<string, number>>(new Map());

  const lastHomeDriverLocationSentAtRef = useRef(0);

  const activeBookingsRef = useRef<Booking[]>(EMPTY_HOME_BOOKINGS);

  const activePassengerBookingRef = useRef<Booking | null>(null);
  const activeHomeTripRef = useRef(activeHomeTrip);
  activeHomeTripRef.current = activeHomeTrip;

  const ongoingDriverBookingsRef = useRef<Booking[]>(EMPTY_HOME_BOOKINGS);

  const showDialogRef = useRef(showDialog);

  const refetchMyBookingsRef = useRef<(() => unknown) | null>(null);

  const refetchOngoingDriverBookingsRef = useRef<(() => unknown) | null>(null);

  useEffect(() => {
    activeBookingsRef.current = activeBookings;
  }, [activeBookings]);

  useEffect(() => {
    activePassengerBookingRef.current = activePassengerBooking;
  }, [activePassengerBooking]);

  useEffect(() => {
    ongoingDriverBookingsRef.current = ongoingDriverBookings;
  }, [ongoingDriverBookings]);

  useEffect(() => {
    showDialogRef.current = showDialog;
  }, [showDialog]);

  useEffect(() => {
    refetchMyBookingsRef.current = refetchMyBookings;
  }, [refetchMyBookings]);

  useEffect(() => {
    refetchOngoingDriverBookingsRef.current = refetchOngoingDriverBookings;
  }, [refetchOngoingDriverBookings]);

  const homeTrackingTripId = activeHomeTrip?.id ?? null;

  const isHomeDriverTracking = Boolean(
    ongoingDriverTrip?.id && homeTrackingTripId === ongoingDriverTrip.id,
  );

  const isOngoingDriverTripKinshasa = isKinshasaHomeTrip(ongoingDriverTrip);

  useEffect(() => {
    presentedHomeAutoProgressKeysRef.current.clear();
    highestHomeAutoProgressPriorityRef.current.clear();
    lastHomeDriverLocationSentAtRef.current = 0;
  }, [homeTrackingTripId]);

  useEffect(() => {
    if (!isFocused || !homeTrackingTripId) {
      return;
    }

    let isCancelled = false;

    void trackingSocket
      .joinTrip(homeTrackingTripId)
      .catch((error) => {
        console.warn('[Home] Connexion au suivi du trajet indisponible:', error);
      });

    // Keep trip lifecycle events; positions of other users are not consumed on Home.
    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (isCancelled || payload.tripId !== homeTrackingTripId || payload.events.length === 0) {
        return;
      }

      const passengerBookingId =
        activePassengerBookingRef.current?.tripId === homeTrackingTripId
          ? activePassengerBookingRef.current.id
          : activeBookingsRef.current.find(
            (booking) =>
              booking.tripId === homeTrackingTripId &&
              booking.status === 'accepted' &&
              !booking.droppedOff &&
              !booking.droppedOffConfirmedByPassenger,
          )?.id ?? null;

      payload.events
        .filter((event) => {
          if (event.type === 'driver_near_destination' || event.type === 'driver_arrived_destination') {
            return isHomeDriverTracking;
          }
          if (!event.bookingId) {
            return false;
          }
          if (isHomeDriverTracking) {
            return true;
          }
          return event.bookingId === passengerBookingId && event.type !== 'passenger_ready_pickup';
        })
        .sort(
          (first, second) =>
            HOME_AUTO_PROGRESS_PRIORITY[first.type] -
            HOME_AUTO_PROGRESS_PRIORITY[second.type],
        )
        .forEach((event) => {
          const key = `${homeTrackingTripId}:${event.type}:${event.bookingId ?? event.tripId}`;
          if (presentedHomeAutoProgressKeysRef.current.has(key)) {
            return;
          }

          if (event.bookingId) {
            const nextPriority = HOME_AUTO_PROGRESS_PRIORITY[event.type];
            const highestPriorityForBooking =
              highestHomeAutoProgressPriorityRef.current.get(event.bookingId) ?? -1;
            const approachAfterReadiness = event.type === 'driver_near_pickup' &&
              highestPriorityForBooking <= HOME_AUTO_PROGRESS_PRIORITY.passenger_ready_pickup &&
              !presentedHomeAutoProgressKeysRef.current.has(`${homeTrackingTripId}:driver_arrived_pickup:${event.bookingId}`);
            if (highestPriorityForBooking > nextPriority && !approachAfterReadiness) {
              return;
            }
            highestHomeAutoProgressPriorityRef.current.set(event.bookingId, Math.max(highestPriorityForBooking, nextPriority));
          }

          const booking =
            (isHomeDriverTracking ? ongoingDriverBookingsRef.current.find((item) => item.id === event.bookingId)
              : activePassengerBookingRef.current?.id === event.bookingId ? activePassengerBookingRef.current : null) ??
            activeBookingsRef.current.find((item) => item.id === event.bookingId) ??
            null;

          presentedHomeAutoProgressKeysRef.current.add(key);
          showDialogRef.current(getHomeTrackingDialog(event, booking, isHomeDriverTracking, activeHomeTripRef.current));
        });

      if (isHomeDriverTracking) {
        void refetchOngoingDriverBookingsRef.current?.();
      } else {
        void refetchMyBookingsRef.current?.();
      }
    });

    return () => {
      isCancelled = true;
      void trackingSocket.leaveTrip(homeTrackingTripId);
      unsubscribeAutoProgress();
    };
  }, [
    homeTrackingTripId,
    isFocused,
    isHomeDriverTracking,
    isOngoingDriverTripKinshasa,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      !isHomeDriverTracking ||
      !homeTrackingTripId ||
      !liveUserCoordinate
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastHomeDriverLocationSentAtRef.current < 4000) {
      return;
    }

    if (isOngoingDriverTripKinshasa && !isCoordinateInKinshasaBounds(liveUserCoordinate)) {
      console.warn('[Home] Position live conducteur hors Kinshasa ignoree:', {
        tripId: homeTrackingTripId,
        coordinate: liveUserCoordinate,
      });
      return;
    }

    lastHomeDriverLocationSentAtRef.current = now;
    void trackingSocket
      .updateDriverLocation(homeTrackingTripId, [
        liveUserCoordinate.longitude,
        liveUserCoordinate.latitude,
      ])
      .catch((error) => {
        console.warn('[Home] Position conducteur non envoyée:', error);
      });
  }, [
    homeTrackingTripId,
    isFocused,
    isHomeDriverTracking,
    isOngoingDriverTripKinshasa,
    liveUserCoordinate,
  ]);

}
