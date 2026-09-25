import type { Booking, Trip } from '@/types';

/** Transport completion is independent of payment collection or the other passengers. */
export function hasPassengerFinishedRide(booking?: Pick<Booking, 'status' | 'droppedOff' |
  'droppedOffConfirmedByPassenger' | 'droppedOffAt' | 'droppedOffConfirmedAt'> | null): boolean {
  return Boolean(booking && (booking.status === 'completed' || booking.droppedOff ||
    booking.droppedOffConfirmedByPassenger || booking.droppedOffAt || booking.droppedOffConfirmedAt));
}

/** Account capability never grants ownership of a particular trip. */
export function ownsTrip(trip: Pick<Trip, 'driverId' | 'driver'> | null | undefined, userId?: string | null) {
  return Boolean(userId && trip?.driverId === userId
    && (!trip.driver?.id || trip.driver.id === userId));
}

export function isUnfinishedPassengerBooking(booking: Booking, userId?: string | null) {
  return Boolean(userId && booking.passengerId === userId && booking.tripId
    && ['pending', 'accepted', 'no_show'].includes(booking.status)
    && !hasPassengerFinishedRide(booking)
    && (!booking.trip || (booking.trip.id === booking.tripId && !ownsTrip(booking.trip, userId)
      && booking.trip.status !== 'completed' && booking.trip.status !== 'cancelled')));
}

export function isActivePassengerBooking(booking: Booking, userId?: string | null) {
  return booking.status === 'accepted' && isUnfinishedPassengerBooking(booking, userId);
}

export function findOngoingPassengerBooking(bookings: readonly Booking[] | undefined, userId?: string | null) {
  return bookings?.find(booking => isActivePassengerBooking(booking, userId)
    && booking.trip?.status === 'ongoing') ?? null;
}

/** A live reservation must not be hidden by a driver's older, still ongoing trip. */
export function selectOngoingParticipation(
  userId: string | undefined, trips: readonly Trip[] | undefined, bookings: readonly Booking[] | undefined,
) {
  if (!userId) return null;
  const booking = findOngoingPassengerBooking(bookings, userId);
  if (booking?.trip) return { trip: booking.trip, role: 'passenger' as const, bookingId: booking.id };
  const trip = trips?.find(candidate => candidate.status === 'ongoing' && ownsTrip(candidate, userId));
  return trip ? { trip, role: 'driver' as const, bookingId: null } : null;
}
