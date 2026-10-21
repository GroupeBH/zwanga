import type { Booking, Trip } from '@/types';
import type { RideAlert } from '@/features/notifications/rideAlert';
import { hasPassengerFinishedRide, ownsTrip } from '@/features/activity/tripParticipation';
import { isSelfDriverAlert } from '@/features/notifications/requestOwnership';

export type PendingBookingEntry = { id: string; tripId?: string; key: string; alertKey?: string };
export type VerifiedBookingEntry = { booking: Booking; trip: Trip };
const bookingKey = (id: string) => `booking:${id}`;
const canManage = (trip: Trip, userId: string) => ownsTrip(trip, userId) &&
  trip.status === 'upcoming' && !trip.startedAt && !trip.isExpired;
const pendingIds = (trip: Trip, userId: string) => trip.reservationSummary?.pendingBookingIds ?? trip.passengers
  ?.filter(passenger => passenger.bookingStatus === 'pending' && passenger.id !== userId).map(passenger => passenger.bookingId) ?? [];

export function selectBookingEntryAlert(alerts: readonly RideAlert[], userId: string, excluded: Set<string>): PendingBookingEntry | undefined {
  const alert = alerts.find(item => item.kind === 'booking' && item.recipientId === userId &&
    !excluded.has(bookingKey(item.id)) && !isSelfDriverAlert(item.data, userId) &&
    (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
  return alert ? { id: alert.id, key: bookingKey(alert.id), alertKey: alert.key,
    tripId: typeof alert.data?.tripId === 'string' ? alert.data.tripId : undefined } : undefined;
}

/** Shared authenticated activity is enough for discovery, even without a push.
 * A delayed departure is not an expiration; the server flags/status decide. */
export function selectPendingBookingEntry(trips: readonly Trip[], userId: string, excluded: Set<string>): PendingBookingEntry | undefined {
  const ordered = trips.filter(trip => canManage(trip, userId))
    .sort((a, b) => (Date.parse(a.departureTime) || 0) - (Date.parse(b.departureTime) || 0) || a.id.localeCompare(b.id));
  for (const trip of ordered) {
    const id = pendingIds(trip, userId).find(value => value && !excluded.has(bookingKey(value)));
    if (id) return { id, tripId: trip.id, key: bookingKey(id) };
  }
}

export function isPendingBookingEntryListed(candidate: PendingBookingEntry, trips: readonly Trip[], userId: string) {
  return trips.some(trip => trip.id === candidate.tripId && canManage(trip, userId) && pendingIds(trip, userId).includes(candidate.id));
}

/** Recheck a single reservation before navigation. Never accept/reject it here. */
export async function verifyPendingBookingEntry(candidate: PendingBookingEntry, userId: string,
  readBooking: (id: string) => Promise<Booking>, readTrip: (id: string) => Promise<Trip>,
  onVerified?: (snapshot: VerifiedBookingEntry) => void) {
  const booking = await readBooking(candidate.id);
  if (booking.id !== candidate.id || booking.status !== 'pending' || booking.passengerId === userId ||
    hasPassengerFinishedRide(booking) || !booking.tripId || (candidate.tripId && booking.tripId !== candidate.tripId)) return null;
  const trip = booking.trip ?? await readTrip(booking.tripId);
  if (trip.id !== booking.tripId || !ownsTrip(trip, userId) || trip.isExpired) return null;
  // A trip started on another device belongs in guidance, not in management.
  if (trip.status === 'ongoing') return `/trip/navigate/${trip.id}` as const;
  if (trip.status !== 'upcoming' || trip.startedAt) return null;
  onVerified?.({ booking, trip });
  return { pathname: '/trip/manage/[id]' as const,
    params: { id: trip.id, bookingId: booking.id, section: 'passengers' } };
}
