import type { Booking } from '@/types';

export function getConfirmedDropoffs(bookings: Booking[], tripId: string) {
  const time = (booking: Booking) => Date.parse(booking.droppedOffAt ?? booking.droppedOffConfirmedAt ?? booking.updatedAt) || 0;
  return bookings.filter(booking => booking.tripId === tripId &&
    (booking.status === 'completed' || (booking.status === 'accepted' &&
      (booking.droppedOff || booking.droppedOffConfirmedByPassenger || booking.droppedOffAt))))
    .sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id));
}

// Refetches, payment changes and reordered receipts must not undo a dismissal.
export function getDropoffReceiptsKey(bookings: Booking[], tripId: string) {
  return JSON.stringify([tripId, ...bookings.map(booking => booking.id).sort()]);
}
