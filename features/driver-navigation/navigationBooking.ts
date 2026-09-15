import { RouteCoordinate, LivePassengerLocation, FRESH_DRIVER_LOCATION_MAX_AGE_MS } from './navigationModel';
import type { Booking, Trip } from '@/types';
import { normalizeTripMapCoordinate } from '@/utils/tripCoordinates';
import { isFreshLocationTimestamp } from '@/utils/navigation/routeProgress';
import * as Location from 'expo-location';

export const hasBookingPickupCompleted = (booking?: Booking | null): boolean =>
  Boolean(
    booking?.pickedUp ||
      booking?.pickedUpConfirmedByPassenger ||
      booking?.pickedUpAt ||
      booking?.pickedUpConfirmedAt,
  );

export const hasBookingDropoffCompleted = (booking?: Booking | null): boolean =>
  Boolean(
    booking?.status === 'completed' ||
      booking?.droppedOff ||
      booking?.droppedOffConfirmedByPassenger ||
      booking?.droppedOffAt ||
      booking?.droppedOffConfirmedAt,
  );

export const getTripLocationLabel = (
  location: Trip['departure'] | Trip['arrival'] | undefined,
  fallback: string,
) => (location?.address || location?.name || fallback).trim();

export const getBookingPickupLabel = (booking: Booking | null | undefined, trip?: Trip | null) => {
  const tripLabel = getTripLocationLabel(trip?.departure, 'Point de récupération');
  const bookingLabel = (booking?.passengerOrigin || booking?.passengerOriginReference || '').trim();
  const hasPassengerCoordinate = Boolean(
    normalizeTripMapCoordinate(
      booking?.passengerOriginCoordinates?.latitude,
      booking?.passengerOriginCoordinates?.longitude,
    ),
  );

  return hasPassengerCoordinate ? bookingLabel || tripLabel : tripLabel || bookingLabel;
};

export const getBookingDropoffLabel = (booking: Booking | null | undefined, trip?: Trip | null) => {
  const tripLabel = getTripLocationLabel(trip?.arrival, 'Point de destination');
  const bookingLabel = (
    booking?.passengerDestination ||
    booking?.passengerDestinationReference ||
    ''
  ).trim();
  const hasPassengerCoordinate = Boolean(
    normalizeTripMapCoordinate(
      booking?.passengerDestinationCoordinates?.latitude,
      booking?.passengerDestinationCoordinates?.longitude,
    ),
  );

  return hasPassengerCoordinate ? bookingLabel || tripLabel : tripLabel || bookingLabel;
};

export const getBookingDropoffCoordinate = (
  booking: Booking,
  fallbackCoordinate: RouteCoordinate | null,
) =>
  normalizeTripMapCoordinate(
    booking.passengerDestinationCoordinates?.latitude,
    booking.passengerDestinationCoordinates?.longitude,
  ) ?? fallbackCoordinate;

export const isFreshLocationObject = (
  location: Location.LocationObject | null,
  maxAgeMs = FRESH_DRIVER_LOCATION_MAX_AGE_MS,
): location is Location.LocationObject => {
  if (!location) {
    return false;
  }

  if (!normalizeTripMapCoordinate(location.coords.latitude, location.coords.longitude)) {
    return false;
  }

  const timestamp = Number(location.timestamp);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
};

export const normalizeDriverLocationObject = (
  location: Location.LocationObject | null,
): Location.LocationObject | null => {
  if (!location) {
    return null;
  }

  const coordinate = normalizeTripMapCoordinate(
    location.coords.latitude,
    location.coords.longitude,
  );
  if (!coordinate) {
    return null;
  }

  return {
    ...location,
    coords: {
      ...location.coords,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    },
  };
};

export const isFreshLivePassengerLocation = (
  location: LivePassengerLocation | undefined,
  maxAgeMs = FRESH_DRIVER_LOCATION_MAX_AGE_MS,
) => {
  if (!location) {
    return false;
  }

  if (!location.updatedAt) {
    return true;
  }

  const timestamp = new Date(location.updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
};

export const hasFreshBookingPassengerLocation = (booking: Booking) => {
  if (!booking.passengerLocationUpdatedAt) {
    return false;
  }

  return isFreshLocationTimestamp(new Date(booking.passengerLocationUpdatedAt).getTime());
};
