import {
  TripDetailAutoProgressEvent,
  TRIP_DETAIL_AUTO_PROGRESS_PRIORITY,
} from '../../features/trip-detail/tripDetailModel';
import { useDialog } from '@/components/ui/DialogProvider';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import type { Trip, User } from '@/types';

interface Params {
  tripBookings: Booking[] | undefined;
  myBookings: Booking[] | undefined;
  trip: Trip | undefined;
  user: User | null;
  isTripDriver: boolean;
  presentedTripDetailAutoProgressKeysRef: React.RefObject<Set<string>>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  activeBooking: Booking | null;
  bookingForTrip: Booking | null;
  highestTripDetailAutoProgressPriorityRef: React.RefObject<Map<string, number>>;
}

export function useTripDetailProgressNotices({
  tripBookings,
  myBookings,
  trip,
  user,
  isTripDriver,
  presentedTripDetailAutoProgressKeysRef,
  showDialog,
  activeBooking,
  bookingForTrip,
  highestTripDetailAutoProgressPriorityRef,
}: Params) {
  const getTripDetailPassengerName = useCallback(
    (bookingId: string) => {
      const matchedBooking =
        tripBookings?.find((booking) => booking.id === bookingId) ??
        myBookings?.find((booking) => booking.id === bookingId) ??
        null;

      return matchedBooking?.passengerName || 'Le passager';
    },
    [myBookings, tripBookings],
  );

  const presentTripDetailAutoProgressEvent = useCallback(
    (event: TripDetailAutoProgressEvent) => {
      if (!trip || !user) {
        return;
      }

      if (event.type === 'driver_near_destination' || event.type === 'driver_arrived_destination') {
        if (!isTripDriver) {
          return;
        }

        const key = `${trip.id}:${event.type}`;
        if (presentedTripDetailAutoProgressKeysRef.current.has(key)) {
          return;
        }

        const roundedDistance =
          typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
            ? Math.max(1, Math.round(event.distanceMeters))
            : null;
        const isTripCompletedEvent = event.type === 'driver_arrived_destination';
        const distanceText = roundedDistance
          ? isTripCompletedEvent
            ? ` Arrivée détectée a ${roundedDistance} m.`
            : ` Distance détectée: ${roundedDistance} m.`
          : '';
        const isReachedZone =
          !isTripCompletedEvent && roundedDistance !== null && roundedDistance <= 10;

        presentedTripDetailAutoProgressKeysRef.current.add(key);
        showDialog({
          variant: isTripCompletedEvent ? 'success' : 'info',
          icon: 'flag',
          title: isTripCompletedEvent
            ? 'Trajet terminé'
            : isReachedZone
              ? 'Destination finale atteinte'
              : 'Destination finale proche',
          message: isTripCompletedEvent
            ? `Vous avez atteint la destination finale.${distanceText}`
            : isReachedZone
              ? `Le point d'arrivée du trajet est atteint. Le trajet sera terminé automatiquement dans 10 minutes si le véhicule reste sur place.${distanceText}`
              : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
        });
        return;
      }

      if (!event.bookingId) {
        return;
      }

      const passengerBookingId = activeBooking?.id ?? bookingForTrip?.id ?? null;
      const isPassengerEvent = passengerBookingId === event.bookingId;

      if (!isTripDriver && !isPassengerEvent) {
        return;
      }

      if (event.type === 'driver_near_pickup' && !isPassengerEvent) {
        return;
      }

      if (event.type === 'passenger_ready_pickup' && !isTripDriver) {
        return;
      }

      const key = `${trip.id}:${event.type}:${event.bookingId}`;
      if (presentedTripDetailAutoProgressKeysRef.current.has(key)) {
        return;
      }

      const nextPriority = TRIP_DETAIL_AUTO_PROGRESS_PRIORITY[event.type];
      const highestPriorityForBooking =
        highestTripDetailAutoProgressPriorityRef.current.get(event.bookingId) ?? -1;
      if (highestPriorityForBooking > nextPriority) {
        return;
      }

      const passengerName = getTripDetailPassengerName(event.bookingId);
      const roundedDistance =
        typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
          ? Math.max(10, Math.round(event.distanceMeters / 10) * 10)
          : null;
      const distanceText = roundedDistance ? ` Distance détectée: environ ${roundedDistance} m.` : '';

      const dialogByType: Record<
        Exclude<
          TripDetailAutoProgressEvent['type'],
          'driver_near_destination' | 'driver_arrived_destination'
        >,
        {
          variant: 'info' | 'success' | 'warning' | 'danger';
          icon: keyof typeof Ionicons.glyphMap;
          title: string;
          message: string;
        }
      > = {
        driver_near_pickup: {
          variant: 'info',
          icon: 'car-sport',
          title: 'Le conducteur sera bient\u00f4t l\u00e0',
          message: `Le conducteur sera bient\u00f4t au point de r\u00e9cup\u00e9ration.${distanceText}`,
        },
        driver_arrived_pickup: {
          variant: 'info',
          icon: 'location',
          title: isTripDriver ? 'Point de r\u00e9cup\u00e9ration atteint' : 'Le conducteur est l\u00e0',
          message: isTripDriver
            ? `Vous \u00eates arriv\u00e9 au point de r\u00e9cup\u00e9ration de ${passengerName}.`
            : 'Le conducteur est arriv\u00e9 au point de r\u00e9cup\u00e9ration. Vous pouvez vous signaler.',
        },
        parties_nearby: {
          variant: 'info',
          icon: 'people',
          title: isTripDriver ? 'Passager pr\u00eat \u00e0 embarquer' : 'Vous \u00eates au point',
          message: isTripDriver
            ? `${passengerName} est l\u00e0 et pr\u00eat \u00e0 \u00eatre embarqu\u00e9.`
            : 'Vous \u00eates au point de r\u00e9cup\u00e9ration. Signalez-vous au conducteur si vous \u00eates pr\u00eat.',
        },
        passenger_ready_pickup: {
          variant: 'success',
          icon: 'hand-left',
          title: "Le passager s'est signal\u00e9",
          message: `${passengerName} indique qu'il est au point de r\u00e9cup\u00e9ration.`,
        },
        pickup_confirmed: {
          variant: 'success',
          icon: 'checkmark-circle',
          title: isTripDriver ? 'Passager embarqu\u00e9' : 'Prise en charge confirm\u00e9e',
          message: isTripDriver
            ? `${passengerName} a \u00e9t\u00e9 embarqu\u00e9. Vous pouvez continuer vers sa destination.`
            : 'Votre prise en charge est confirm\u00e9e. Vous \u00eates maintenant en route vers votre destination.',
        },
        passenger_no_show: {
          variant: 'info',
          icon: 'person-remove',
          title: isTripDriver ? 'Passager non embarqu\u00e9' : 'Non-embarquement d\u00e9tect\u00e9',
          message: isTripDriver
            ? `${passengerName} n'a pas \u00e9t\u00e9 embarqu\u00e9. La r\u00e9servation est cl\u00f4tur\u00e9e sans paiement.`
            : "Votre embarquement n'a pas \u00e9t\u00e9 d\u00e9tect\u00e9. Aucun paiement n'est effectu\u00e9.",
        },
        passenger_boarding_uncertain: {
          variant: 'warning',
          icon: 'help-circle',
          title: 'Embarquement non confirmé',
          message: isTripDriver
            ? `Le trajet est arrivé à destination sans preuve GPS suffisante de l'embarquement de ${passengerName}. La réservation est clôturée sans paiement.`
            : "Le trajet est arrivé à destination sans preuve GPS suffisante de votre embarquement. Aucun paiement n'est effectué.",
        },
        passenger_near_destination: {
          variant: 'info',
          icon: 'flag',
          title: isTripDriver ? 'Destination passager proche' : 'Votre arrivée approche',
          message: isTripDriver
            ? `Le point d'arrivée de ${passengerName} va être atteint.${distanceText}`
            : `Votre point d'arrivée va être atteint.${distanceText}`,
        },
        dropoff_confirmed: {
          variant: 'success',
          icon: 'flag',
          title: isTripDriver ? 'Destination atteinte' : 'Arriv\u00e9e confirm\u00e9e',
          message: isTripDriver
            ? `Nous sommes arriv\u00e9s au point de destination de ${passengerName}.`
            : 'Votre arriv\u00e9e \u00e0 destination est confirm\u00e9e.',
        },
      };

      const dialog = dialogByType[event.type];
      presentedTripDetailAutoProgressKeysRef.current.add(key);
      highestTripDetailAutoProgressPriorityRef.current.set(event.bookingId, nextPriority);
      showDialog(dialog);
    },
    [
      activeBooking?.id,
      bookingForTrip?.id,
      getTripDetailPassengerName,
      isTripDriver,
      showDialog,
      trip,
      user,
    ],
  );

  return {
    presentTripDetailAutoProgressEvent,
  };
}
