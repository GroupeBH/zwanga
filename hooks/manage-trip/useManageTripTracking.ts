import type { TrackedLocation } from '@/store/slices/locationSlice';
import type { DialogOptions } from '@/features/dialogs/dialogTypes';
import { ManageAutoProgressEvent, MANAGE_AUTO_PROGRESS_PRIORITY } from '../../features/manage-trip/manageTripModel';
import { useDialog } from '@/components/ui/DialogProvider';
import { trackingSocket } from '@/services/trackingSocket';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { useGetTripByIdQuery } from '@/store/api/tripApi';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo } from 'react';
import type { Trip } from '@/types';

interface Params {
  bookings: Booking[] | undefined;
  locallyAcceptedBookingIds: ReadonlySet<string>;
  bookingsRef: React.RefObject<Booking[] | undefined>;
  showDialogRef: React.RefObject<(options: DialogOptions) => void>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  refetchTripRef: React.RefObject<(() => unknown) | null>;
  refetchTrip: ReturnType<typeof useGetTripByIdQuery>['refetch'];
  refetchBookingsRef: React.RefObject<(() => unknown) | null>;
  refetchBookings: ReturnType<typeof useGetTripBookingsQuery>['refetch'];
  presentedManageAutoProgressKeysRef: React.RefObject<Set<string>>;
  highestManageAutoProgressPriorityRef: React.RefObject<Map<string, number>>;
  lastManageDriverLocationSentAtRef: React.RefObject<number>;
  tripId: string;
  isOwner: boolean;
  trip: Trip | undefined;
  lastKnownLocation: TrackedLocation | null;
}

export function useManageTripTracking({
  bookings,
  locallyAcceptedBookingIds,
  bookingsRef,
  showDialogRef,
  showDialog,
  refetchTripRef,
  refetchTrip,
  refetchBookingsRef,
  refetchBookings,
  presentedManageAutoProgressKeysRef,
  highestManageAutoProgressPriorityRef,
  lastManageDriverLocationSentAtRef,
  tripId,
  isOwner,
  trip,
  lastKnownLocation,
}: Params) {
  const visibleBookings = useMemo(() => {
    if (!bookings || locallyAcceptedBookingIds.size === 0) return bookings;

    return bookings.map((booking) =>
      locallyAcceptedBookingIds.has(booking.id) && booking.status === 'pending'
        ? { ...booking, status: 'accepted' as const }
        : booking,
    );
  }, [bookings, locallyAcceptedBookingIds]);

  useEffect(() => {
    bookingsRef.current = visibleBookings;
  }, [visibleBookings]);

  useEffect(() => {
    showDialogRef.current = showDialog;
  }, [showDialog]);

  useEffect(() => {
    refetchTripRef.current = refetchTrip;
  }, [refetchTrip]);

  useEffect(() => {
    refetchBookingsRef.current = refetchBookings;
  }, [refetchBookings]);

  useEffect(() => {
    presentedManageAutoProgressKeysRef.current.clear();
    highestManageAutoProgressPriorityRef.current.clear();
    lastManageDriverLocationSentAtRef.current = 0;
  }, [tripId]);

  useEffect(() => {
    if (!isOwner || trip?.status !== 'ongoing' || !tripId) {
      return;
    }

    let isCancelled = false;

    void trackingSocket
      .joinTrip(tripId)
      .then(() => {
        if (isCancelled) return;
      })
      .catch((error) => {
        console.warn('[ManageTrip] Connexion tracking impossible:', error);
      });

    const unsubscribeAutoProgress = trackingSocket.subscribeToBookingAutoProgress((payload) => {
      if (isCancelled || payload.tripId !== tripId || payload.events.length === 0) {
        return;
      }

      payload.events
        .slice()
        .sort(
          (first, second) =>
            MANAGE_AUTO_PROGRESS_PRIORITY[first.type] -
            MANAGE_AUTO_PROGRESS_PRIORITY[second.type],
        )
        .forEach((event) => {
          const key = `${tripId}:${event.type}:${event.bookingId ?? event.tripId}`;
          if (presentedManageAutoProgressKeysRef.current.has(key)) {
            return;
          }

          if (event.bookingId) {
            const nextPriority = MANAGE_AUTO_PROGRESS_PRIORITY[event.type];
            const highestPriorityForBooking =
              highestManageAutoProgressPriorityRef.current.get(event.bookingId) ?? -1;
            const approachAfterReadiness = event.type === 'driver_near_pickup' &&
              highestPriorityForBooking <= MANAGE_AUTO_PROGRESS_PRIORITY.passenger_ready_pickup &&
              !presentedManageAutoProgressKeysRef.current.has(`${tripId}:driver_arrived_pickup:${event.bookingId}`);
            if (highestPriorityForBooking > nextPriority && !approachAfterReadiness) {
              return;
            }
            highestManageAutoProgressPriorityRef.current.set(event.bookingId, Math.max(highestPriorityForBooking, nextPriority));
          }

          const booking = bookingsRef.current?.find((item) => item.id === event.bookingId);
          const passengerName = booking?.passengerName || 'le passager';
          const roundedDistance =
            typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
              ? Math.max(1, Math.round(event.distanceMeters))
              : null;
          const distanceText = roundedDistance ? ` Distance detectée: ${roundedDistance} m.` : '';
          const isTripDestinationReachedZone =
            event.type === 'driver_near_destination' &&
            roundedDistance !== null &&
            roundedDistance <= 10;

          const dialogByType: Record<
            ManageAutoProgressEvent['type'],
            {
              variant: 'info' | 'success' | 'warning';
              icon: keyof typeof Ionicons.glyphMap;
              title: string;
              message: string;
            }
          > = {
            driver_near_pickup: {
              variant: 'info',
              icon: 'car-sport',
              title: 'Prise en charge à proximité',
              message: `Vous approchez du point de récupération de ${passengerName}.${distanceText}`,
            },
            driver_arrived_pickup: {
              variant: 'info',
              icon: 'location',
              title: 'Point de récupération atteint',
              message: `Vous êtes arrivé au point de récupération de ${passengerName}. Le passager est notifié.`,
            },
            parties_nearby: {
              variant: 'success',
              icon: 'people',
              title: 'Passager prêt à embarquer',
              message: `${passengerName} est là et prêt à être embarqué.`,
            },
            passenger_ready_pickup: {
              variant: 'success',
              icon: 'hand-left',
              title: "Le passager s'est signalé",
              message: `${passengerName} indique qu'il est au point de récupération.`,
            },
            pickup_confirmed: {
              variant: 'success',
              icon: 'checkmark-circle',
              title: 'Passager embarqué',
              message: `${passengerName} a été embarqué. Vous pouvez continuer vers sa destination.`,
            },
            passenger_no_show: {
              variant: 'info',
              icon: 'person-remove',
              title: 'Passager non embarqué',
              message: `${passengerName} n'a pas été détecté à bord. La réservation est clôturée sans paiement.`,
            },
            passenger_boarding_uncertain: {
              variant: 'warning',
              icon: 'help-circle',
              title: 'Embarquement non confirmé',
              message: `Le trajet est arrivé à destination sans preuve GPS suffisante de l'embarquement de ${passengerName}. La réservation est clôturée sans paiement.`,
            },
            passenger_near_destination: {
              variant: 'info',
              icon: 'flag',
              title: 'Destination passager proche',
              message: `Le point d'arrivée de ${passengerName} va être atteint.${distanceText}`,
            },
            dropoff_confirmed: {
              variant: 'success',
              icon: 'flag',
              title: 'Destination passager atteinte',
              message: `Nous sommes arrivés au point de destination de ${passengerName}.`,
            },
            driver_near_destination: {
              variant: 'info',
              icon: 'flag',
              title: isTripDestinationReachedZone
                ? 'Destination finale atteinte'
                : 'Destination finale proche',
              message: isTripDestinationReachedZone
                ? `Le point d'arrivée du trajet est atteint. Le trajet sera terminé automatiquement dans 10 minutes si le véhicule reste sur place.${distanceText}`
                : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
            },
            driver_arrived_destination: {
              variant: 'success',
              icon: 'flag',
              title: 'Trajet terminé',
              message: `Vous avez atteint la destination finale.${distanceText}`,
            },
          };

          presentedManageAutoProgressKeysRef.current.add(key);
          showDialogRef.current(dialogByType[event.type]);
        });

      void refetchTripRef.current?.();
      void refetchBookingsRef.current?.();
    });

    return () => {
      isCancelled = true;
      void trackingSocket.leaveTrip(tripId);
      unsubscribeAutoProgress();
    };
  }, [isOwner, trip?.status, tripId]);

  useEffect(() => {
    if (
      !isOwner ||
      trip?.status !== 'ongoing' ||
      !tripId ||
      !lastKnownLocation?.coords
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastManageDriverLocationSentAtRef.current < 4000) {
      return;
    }

    lastManageDriverLocationSentAtRef.current = now;
    void trackingSocket
      .updateDriverLocation(tripId, [
        lastKnownLocation.coords.longitude,
        lastKnownLocation.coords.latitude,
      ])
      .catch((error) => {
        console.warn('[ManageTrip] Position conducteur non envoyée:', error);
      });
  }, [
    isOwner,
    lastKnownLocation?.coords?.latitude,
    lastKnownLocation?.coords?.longitude,
    trip?.status,
    tripId,
  ]);

  return {
    visibleBookings,
  };
}
