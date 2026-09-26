import type { Booking, Trip } from '@/types';
import { PASSENGER_TRACKING_PREARM_PAST_GRACE_MS, PASSENGER_TRACKING_PREARM_WINDOW_MS } from '@/constants/rideProgress';
import { isUnfinishedPassengerBooking, selectOngoingParticipation } from './tripParticipation';

/** A pending reservation may be prearmed, but must never take over a live driver trip. */
export function selectRideTracking(userId: string | undefined, trips: readonly Trip[],
  bookings: readonly Booking[], trackingBookingId?: string | null, now = Date.now()) {
  const incomplete = bookings.filter(booking => isUnfinishedPassengerBooking(booking, userId));
  const participation = selectOngoingParticipation(userId, trips, bookings);
  const ongoingPassenger = incomplete.find(booking => booking.id === participation?.bookingId)
    ?? incomplete.find(booking => ['accepted', 'no_show'].includes(booking.status) && booking.trip?.status === 'ongoing');
  if (ongoingPassenger) return { driver: null, passenger: ongoingPassenger };
  if (participation?.role === 'driver') return { driver: participation.trip, passenger: null };
  const signalled = incomplete.find(booking => booking.id === trackingBookingId);
  if (signalled) return { driver: null, passenger: signalled };
  const passenger = incomplete.filter(booking => {
    if (!booking.trip && booking.status === 'accepted') return true;
    const timestamp = new Date(booking.trip?.departureTime ?? '').getTime();
    const offset = timestamp - now;
    return Number.isFinite(timestamp) && offset <= PASSENGER_TRACKING_PREARM_WINDOW_MS
      && offset >= -PASSENGER_TRACKING_PREARM_PAST_GRACE_MS;
  }).sort((a, b) => Math.abs(new Date(a.trip?.departureTime ?? 0).getTime() - now)
    - Math.abs(new Date(b.trip?.departureTime ?? 0).getTime() - now))[0] ?? null;
  return { driver: null, passenger };
}
