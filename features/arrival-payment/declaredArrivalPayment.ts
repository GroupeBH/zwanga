import type { Booking } from '@/types';
import { OFFLINE_RIDE_MAX_AGE, type RideOutboxEntry } from '@/features/ride-recovery/rideRecoveryModel';
import type { StoredPaymentState } from './paymentTypes';

/** Opens the existing payment sheet after a durable passenger declaration.
 * This is an intent to view payment, never a fabricated arrival or debit permission.
 */
export function selectDeclaredArrivalBooking(bookings: Booking[], entries: RideOutboxEntry[],
  userId: string | undefined, stored: StoredPaymentState, now = Date.now()): Booking | null {
  if (!userId) return null;
  const latest = new Map<string, RideOutboxEntry>();
  for (const entry of entries) {
    if (entry.actorUserId !== userId || entry.stage !== 'dropoff') continue;
    const previous = latest.get(entry.bookingId);
    if (!previous || Date.parse(entry.occurredAt) >= Date.parse(previous.occurredAt)) latest.set(entry.bookingId, entry);
  }
  return [...latest.values()].filter(entry => {
    const age = now - Date.parse(entry.occurredAt);
    return Number.isFinite(age) && age >= 0 && age <= OFFLINE_RIDE_MAX_AGE && entry.decision === 'confirm' &&
      !['blocked', 'disputed'].includes(entry.state) && !stored[entry.bookingId]?.acknowledgedAt;
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).map(entry => bookings.find(booking =>
    booking.id === entry.bookingId && booking.tripId === entry.tripId && booking.passengerId === userId &&
    ['accepted', 'completed'].includes(booking.status) && !['upcoming', 'cancelled'].includes(booking.trip?.status ?? ''),
  )).find((booking): booking is Booking => Boolean(booking)) ?? null;
}
