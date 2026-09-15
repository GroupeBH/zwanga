import { useEffect, useMemo } from 'react';
import type { Trip, Booking } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  booking: Booking | undefined;
  trip: Trip | undefined;
  bookingId: string;
  tripId: string;
  tripDepartureCoordinate: MapCoordinate | null;
  tripArrivalCoordinate: MapCoordinate | null;
  pickupCoordinate: MapCoordinate | null;
  dropoffCoordinate: MapCoordinate | null;
  isTripOngoing: boolean;
  driverLocation: { latitude: number; longitude: number; } | null;
  passengerLocation: { latitude: number; longitude: number; } | null;
}

export function usePassengerRouteContext({
  booking,
  trip,
  bookingId,
  tripId,
  tripDepartureCoordinate,
  tripArrivalCoordinate,
  pickupCoordinate,
  dropoffCoordinate,
  isTripOngoing,
  driverLocation,
  passengerLocation,
}: Params) {
  useEffect(() => {
    if (!booking?.id && !trip?.id) {
      return;
    }

    console.log('[PassengerNavigation] route endpoint coordinates', {
      bookingId,
      tripId,
      tripDeparture: {
        raw: {
          lat: trip?.departure?.lat,
          lng: trip?.departure?.lng,
          hasCoordinates: trip?.departure?.hasCoordinates,
        },
        normalized: tripDepartureCoordinate,
      },
      tripArrival: {
        raw: {
          lat: trip?.arrival?.lat,
          lng: trip?.arrival?.lng,
          hasCoordinates: trip?.arrival?.hasCoordinates,
        },
        normalized: tripArrivalCoordinate,
      },
      pickup: {
        raw: booking?.passengerOriginCoordinates ?? null,
        normalized: pickupCoordinate,
      },
      dropoff: {
        raw: booking?.passengerDestinationCoordinates ?? null,
        normalized: dropoffCoordinate,
      },
    });
  }, [
    booking?.id,
    booking?.passengerDestinationCoordinates,
    booking?.passengerOriginCoordinates,
    bookingId,
    dropoffCoordinate,
    pickupCoordinate,
    trip?.arrival?.hasCoordinates,
    trip?.arrival?.lat,
    trip?.arrival?.lng,
    trip?.departure?.hasCoordinates,
    trip?.departure?.lat,
    trip?.departure?.lng,
    trip?.id,
    tripArrivalCoordinate,
    tripDepartureCoordinate,
    tripId,
  ]);

  const hasPassengerPickedUp = Boolean(
    booking?.pickedUp || booking?.pickedUpConfirmedByPassenger || booking?.pickedUpAt,
  );
  const hasPassengerDroppedOff = Boolean(
    booking?.droppedOff ||
      booking?.droppedOffConfirmedByPassenger ||
      booking?.droppedOffAt ||
      booking?.status === 'completed',
  );
  const isPassengerOnboard = hasPassengerPickedUp && !hasPassengerDroppedOff;
  const activePassengerDestination = useMemo(() => {
    if (!hasPassengerPickedUp) {
      return pickupCoordinate;
    }

    if (!hasPassengerDroppedOff) {
      return dropoffCoordinate;
    }

    return dropoffCoordinate;
  }, [
    dropoffCoordinate,
    hasPassengerDroppedOff,
    hasPassengerPickedUp,
    pickupCoordinate,
  ]);
  const routeOriginCoordinate = useMemo(() => {
    if (isTripOngoing && driverLocation) {
      return driverLocation;
    }

    return !hasPassengerPickedUp
      ? passengerLocation ?? pickupCoordinate
      : pickupCoordinate ?? passengerLocation;
  }, [
    driverLocation,
    hasPassengerPickedUp,
    isTripOngoing,
    passengerLocation,
    pickupCoordinate,
  ]);
  const passengerRouteSignature = [
    booking?.id ?? 'booking',
    hasPassengerPickedUp ? 'picked' : 'pickup',
    hasPassengerDroppedOff ? 'dropped' : 'active',
    activePassengerDestination?.latitude.toFixed(6) ?? 'no-lat',
    activePassengerDestination?.longitude.toFixed(6) ?? 'no-lng',
  ].join(':');

  return {
    routeOriginCoordinate,
    activePassengerDestination,
    hasPassengerPickedUp,
    passengerRouteSignature,
    isPassengerOnboard,
    hasPassengerDroppedOff,
  };
}
