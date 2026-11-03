import type { Booking, Trip } from '@/types';

/** No amount guesses: a partial token payment still requires its cash receipt. */
export function getPaidRequestCompletionKey(trip: Trip | undefined, bookings: Booking[] | undefined, driverId: string | undefined) {
  if (!driverId || trip?.driverId !== driverId || trip.status !== 'ongoing' || !trip.tripRequestId || !bookings?.length) return null;
  const participants = bookings.filter(booking => booking.tripId === trip.id &&
    ['pending', 'accepted', 'completed'].includes(booking.status));
  if (!participants.length || participants.some(booking => booking.status !== 'completed' ||
    !(booking.paymentStatus === 'succeeded' || (booking.paymentMode === 'cash' && booking.cashReceivedAt) ||
      booking.paymentAmount === 0))) return null;
  return `${driverId}:${trip.id}`;
}
