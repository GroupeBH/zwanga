import type { Booking, Trip } from '@/types';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { freshEntryData } from '@/features/navigation/entryFreshness';

type BookingRead = Parameters<typeof freshEntryData<Booking>>[0];
export type BookingListSnapshot = { data: Booking[]; fulfilledTimeStamp?: number };

/** A fresh, authenticated focused detail can render before the complete list.
 * A newer list (including []) always wins. Never invent a complete list. */
export function manageBookingPreview(trip: Trip | undefined, userId: string | undefined,
  focusId: string | undefined, read: BookingRead | undefined, list: BookingListSnapshot | undefined,
  now = Date.now()) {
  const focused = read && freshEntryData(read, now);
  if (!trip || !userId || !ownsTrip(trip, userId)) return { bookings: undefined, partial: false };
  if (!focusId || !focused || focused.id !== focusId || focused.tripId !== trip.id || focused.passengerId === userId ||
    (trip.status !== 'upcoming' && trip.status !== 'ongoing') ||
    (list && (list.fulfilledTimeStamp ?? 0) >= (read?.fulfilledTimeStamp ?? 0)))
    return { bookings: list?.data, partial: false };
  const bookings = list?.data.filter(booking => booking.id !== focusId) ?? [];
  return { bookings: [focused, ...bookings], partial: true };
}
