import type { Booking } from '@/types';
import { calculateDistanceMeters } from '@/utils/navigation/routeProgress';
import { normalizeTripMapCoordinate, getGeoPointCoordinate } from '@/utils/tripCoordinates';

export const EARLY_PAYMENT_DISTANCE_METERS = 1000;
export const EARLY_PAYMENT_LOCATION_MAX_AGE_MS = 30_000;

export function isOnboardDigitalBooking(booking: Booking, passengerId: string) {
  return booking.passengerId === passengerId && booking.status === 'accepted' &&
    booking.trip?.status === 'ongoing' && Boolean(booking.pickedUp || booking.pickedUpAt) &&
    !booking.droppedOff && !booking.droppedOffConfirmedByPassenger && !booking.droppedOffAt &&
    !booking.interruptionFareLocked && ['electronic', 'points'].includes(booking.paymentMode ?? '');
}

export function isNearPaymentDestination(
  booking: Booking,
  coordinates: { latitude: number; longitude: number } | null,
  updatedAt: string | null | undefined,
  now = Date.now(),
) {
  const age = updatedAt ? now - Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(age) || age < -5000 || age > EARLY_PAYMENT_LOCATION_MAX_AGE_MS || !coordinates) return false;
  const position = normalizeTripMapCoordinate(coordinates.latitude, coordinates.longitude);
  const personal = booking.passengerDestinationCoordinates;
  const arrival = booking.trip?.arrival;
  const destination = personal
    ? normalizeTripMapCoordinate(personal.latitude, personal.longitude)
    : arrival?.hasCoordinates ? normalizeTripMapCoordinate(arrival.lat, arrival.lng) : null;
  return Boolean(position && destination &&
    calculateDistanceMeters(position, destination) <= EARLY_PAYMENT_DISTANCE_METERS + 0.000001);
}

export function hasNearbyStoredPosition(booking: Booking) {
  return isNearPaymentDestination(booking, booking.passengerLocationCoordinates ?? null, booking.passengerLocationUpdatedAt) ||
    isNearPaymentDestination(booking, getGeoPointCoordinate(booking.trip?.currentLocation), booking.trip?.lastLocationUpdateAt);
}
