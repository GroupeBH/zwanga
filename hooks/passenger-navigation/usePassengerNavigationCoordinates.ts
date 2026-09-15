import { isCoordinateInKinshasaBounds, normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { useMemo } from 'react';
import type { Trip, Booking } from '@/types';

interface Params {
  trip: Trip | undefined;
  booking: Booking | undefined;
  bookingId: string;
}

export function usePassengerNavigationCoordinates({
  trip,
  booking,
  bookingId,
}: Params) {
  const tripDepartureCoordinate = useMemo(
    () => normalizeTripMapCoordinate(trip?.departure?.lat, trip?.departure?.lng),
    [trip?.departure?.lat, trip?.departure?.lng],
  );
  const tripArrivalCoordinate = useMemo(
    () => normalizeTripMapCoordinate(trip?.arrival?.lat, trip?.arrival?.lng),
    [trip?.arrival?.lat, trip?.arrival?.lng],
  );
  const isKinshasaTrip = Boolean(
    tripDepartureCoordinate &&
      tripArrivalCoordinate &&
      isCoordinateInKinshasaBounds(tripDepartureCoordinate) &&
      isCoordinateInKinshasaBounds(tripArrivalCoordinate),
  );
  const bookingPickupCoordinate = useMemo(
    () =>
      normalizeTripMapCoordinate(
        booking?.passengerOriginCoordinates?.latitude,
        booking?.passengerOriginCoordinates?.longitude,
      ),
    [
      booking?.passengerOriginCoordinates?.latitude,
      booking?.passengerOriginCoordinates?.longitude,
    ],
  );
  const bookingDropoffCoordinate = useMemo(
    () =>
      normalizeTripMapCoordinate(
        booking?.passengerDestinationCoordinates?.latitude,
        booking?.passengerDestinationCoordinates?.longitude,
      ),
    [
      booking?.passengerDestinationCoordinates?.latitude,
      booking?.passengerDestinationCoordinates?.longitude,
    ],
  );

  const pickupCoordinate = useMemo(() => {
    if (bookingPickupCoordinate) {
      if (isKinshasaTrip && !isCoordinateInKinshasaBounds(bookingPickupCoordinate)) {
        console.warn('[PassengerNavigation] Point de prise en charge hors Kinshasa ignore:', {
          bookingId,
          coordinate: bookingPickupCoordinate,
        });
      } else {
        return bookingPickupCoordinate;
      }
    }

    return tripDepartureCoordinate;
  }, [
    bookingId,
    bookingPickupCoordinate,
    isKinshasaTrip,
    tripDepartureCoordinate,
  ]);

  const dropoffCoordinate = useMemo(() => {
    if (bookingDropoffCoordinate) {
      if (isKinshasaTrip && !isCoordinateInKinshasaBounds(bookingDropoffCoordinate)) {
        console.warn('[PassengerNavigation] Destination passager hors Kinshasa ignoree:', {
          bookingId,
          coordinate: bookingDropoffCoordinate,
          destination: booking?.passengerDestination,
        });
      } else {
        return bookingDropoffCoordinate;
      }
    }

    return tripArrivalCoordinate;
  }, [
    booking?.passengerDestination,
    bookingId,
    bookingDropoffCoordinate,
    isKinshasaTrip,
    tripArrivalCoordinate,
  ]);

  return {
    tripDepartureCoordinate,
    tripArrivalCoordinate,
    pickupCoordinate,
    dropoffCoordinate,
    isKinshasaTrip,
  };
}
