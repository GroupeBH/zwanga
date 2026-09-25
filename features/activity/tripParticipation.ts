import type { Booking, Trip } from '@/types';

/** Account capability never grants ownership of a particular trip. */
export function ownsTrip(trip: Pick<Trip, 'driverId' | 'driver'> | null | undefined, userId?: string | null) {
  return Boolean(userId && trip?.driverId === userId
    && (!trip.driver?.id || trip.driver.id === userId));
}

export function isActivePassengerBooking(booking: Booking, userId?: string | null) {
  return Boolean(userId && booking.passengerId === userId && booking.tripId
    && booking.status === 'accepted'
    && !booking.droppedOff && !booking.droppedOffConfirmedByPassenger
    && (!booking.trip || (booking.trip.id === booking.tripId && !ownsTrip(booking.trip, userId))));
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
