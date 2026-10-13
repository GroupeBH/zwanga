import type { Booking } from '@/types';

/** Match the server's completed-booking rule, not the public trip's passenger list. */
export function getPassengersToRate(bookings: Booking[] | undefined, tripId: string) {
  const seen = new Set<string>();
  return (bookings ?? []).filter(booking => {
    if (booking.tripId !== tripId || booking.status !== 'completed' || !booking.passengerId || seen.has(booking.passengerId)) return false;
    seen.add(booking.passengerId);
    return true;
  }).map(booking => ({ id: booking.passengerId, name: booking.passengerName || 'Passager', seats: booking.numberOfSeats }));
}
