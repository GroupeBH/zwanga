import { EMPTY_HOME_BOOKINGS, HOME_AUTO_PROGRESS_PRIORITY, isFreshLivePassengerLocation, isKinshasaHomeTrip } from '@/features/home/homeModel';
import type { LivePassengerLocation } from '@/features/home/homeTypes';
import {
  type PassengerLocationPayload,
  trackingSocket
} from '@/services/trackingSocket';
import type { Booking } from '@/types';
import {
  isCoordinateInKinshasaBounds,
  normalizeTripMapCoordinate
} from '@/utils/tripCoordinates';
import { useEffect, useRef, useState } from 'react';

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

  const ongoingDriverBookingsRef = useRef<Booking[]>(EMPTY_HOME_BOOKINGS);

  const showDialogRef = useRef(showDialog);

  const refetchMyBookingsRef = useRef<(() => unknown) | null>(null);

  const refetchOngoingDriverBookingsRef = useRef<(() => unknown) | null>(null);

  const [liveDriverPassengerLocations, setLiveDriverPassengerLocations] = useState<
    Record<string, LivePassengerLocation>
  >({});

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
      setLiveDriverPassengerLocations({});
      return;
    }

    let isCancelled = false;
    setLiveDriverPassengerLocations({});

    void trackingSocket
      .joinTrip(homeTrackingTripId)
      .then(() => {
        if (isCancelled) return;
        if (isHomeDriverTracking) {
          void trackingSocket.requestPassengerLocations(homeTrackingTripId);
        } else {
          void trackingSocket.requestDriverLocation(homeTrackingTripId);
        }
      })
      .catch((error) => {
        console.warn('[Home] Connexion au suivi du trajet indisponible:', error);
      });

    const unsubscribePassengerLocation = trackingSocket.subscribeToPassengerLocation(
      (payload: PassengerLocationPayload) => {
        if (
          isCancelled ||
          !isHomeDriverTracking ||
          payload.tripId !== homeTrackingTripId ||
          !payload.bookingId ||
          !payload.coordinates
        ) {
          return;
        }

        const coordinate = normalizeTripMapCoordinate(
          payload.coordinates[1],
          payload.coordinates[0],
        );
        if (!coordinate) return;
        const liveLocation = {
          coordinate,
          updatedAt: payload.updatedAt,
        };

        if (!isFreshLivePassengerLocation(liveLocation)) {
          console.warn('[Home] Position passager socket trop ancienne ignoree:', {
            bookingId: payload.bookingId,
            updatedAt: payload.updatedAt,
          });
          return;
        }

        if (isOngoingDriverTripKinshasa && !isCoordinateInKinshasaBounds(coordinate)) {
          console.warn('[Home] Position passager socket hors Kinshasa ignoree:', {
            bookingId: payload.bookingId,
            coordinate,
          });
          return;
        }

        setLiveDriverPassengerLocations((current) => ({
          ...current,
          [payload.bookingId]: liveLocation,
        }));
      },
    );

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
            return event.type !== 'driver_near_pickup';
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
            if (highestPriorityForBooking > nextPriority) {
              return;
            }
            highestHomeAutoProgressPriorityRef.current.set(event.bookingId, nextPriority);
          }

          const booking =
            ongoingDriverBookingsRef.current.find((item) => item.id === event.bookingId) ??
            activeBookingsRef.current.find((item) => item.id === event.bookingId) ??
            null;

          presentedHomeAutoProgressKeysRef.current.add(key);
          showDialogRef.current(getHomeTrackingDialog(event, booking, isHomeDriverTracking));
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
      unsubscribePassengerLocation();
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
  return { liveDriverPassengerLocations };
}
