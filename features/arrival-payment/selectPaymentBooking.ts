import type { Booking } from '@/types';
import type { StoredPaymentState } from './paymentTypes';
import { hasPassengerArrived } from './paymentModel';

function confirmedArrivalTime(booking: Booking) {
  const value = Date.parse(booking.droppedOffAt ?? booking.droppedOffConfirmedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

/** A previous unpaid reminder must not masquerade as the ride just completed. */
export function selectPaymentBooking({ bookings, arrived, declared, early, pinnedId, deferredId, stored, busy }: {
  bookings: Booking[]; arrived: Booking | null; declared: Booking | null; early: Booking | null;
  pinnedId: string | null; deferredId: string | null; stored: StoredPaymentState; busy: boolean;
}) {
  const pinned = bookings.find(booking => booking.id === pinnedId) ?? null;
  const pending = pinned ? stored[pinned.id] : undefined;
  if (pinned && (busy || pending?.bookingPaymentOrderNumber || pending?.walletTopUpOrderNumber)) return pinned;
  if (declared) return declared;
  // Only a genuine newer server arrival can replace a visible receipt. A list's
  // updatedAt (payment checks, retries) is not evidence of a new ride.
  const newerArrival = bookings.filter(booking => hasPassengerArrived(booking) &&
    booking.status === 'completed' && !stored[booking.id]?.acknowledgedAt &&
    booking.id !== deferredId && confirmedArrivalTime(booking) > confirmedArrivalTime(arrived ?? booking))
    .sort((left, right) => confirmedArrivalTime(right) - confirmedArrivalTime(left))[0];
  if (newerArrival) return newerArrival;
  if (pinned && pinned.id !== deferredId && (pinned.id === arrived?.id || pinned.id === early?.id)) return pinned;
  return early ?? arrived;
}
