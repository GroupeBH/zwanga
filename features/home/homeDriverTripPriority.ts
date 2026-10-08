import type { Trip } from '@/types';
import { ownsTrip } from '@/features/activity/tripParticipation';
import { DRIVER_UPCOMING_TRIP_HIGHLIGHT_WINDOW_MS } from './homeModel';
import { EMPTY_HIDDEN_HOME_PRIORITIES, homePriorityKeys, type HiddenHomePriorities } from './homePriorityDismissal';

/** Only server-reported active reservations count, never occupied seat estimates. */
export function getDriverTripReservationCounts(trip: Trip, hidden: HiddenHomePriorities = EMPTY_HIDDEN_HOME_PRIORITIES) {
  if (trip.reservationSummary) {
    const pending = trip.reservationSummary.pendingBookingIds.filter(id => !hidden[homePriorityKeys.booking({ id })]).length;
    const accepted = trip.reservationSummary.acceptedCount;
    return { pending, accepted, total: pending + accepted };
  }
  let pending = 0;
  let accepted = 0;
  for (const passenger of trip.passengers ?? []) {
    if (passenger.bookingStatus === 'pending' && (!passenger.bookingId
      || !hidden[homePriorityKeys.booking({ id: passenger.bookingId })])) pending++;
    if (passenger.bookingStatus === 'accepted') accepted++;
  }
  return { pending, accepted, total: pending + accepted };
}

/** Booked, unstarted trips remain visible beyond the three-hour suggestion window.
 * A delayed departure is not a cancellation: the server trip status decides.
 * Sort a new array so the shared query cache and the public map feed stay intact.
 */
export function rankDriverUpcomingTrips(
  trips: readonly Trip[], userId: string | undefined,
  hidden: HiddenHomePriorities = EMPTY_HIDDEN_HOME_PRIORITIES, now = Date.now(),
): Trip[] {
  return trips
    .filter(trip => ownsTrip(trip, userId) && trip.status === 'upcoming' && !trip.startedAt)
    .map(trip => {
      const reservations = getDriverTripReservationCounts(trip, hidden);
      return { trip, reservations, departure: Date.parse(trip.departureTime),
        priority: reservations.pending > 0 ? 0 : reservations.accepted > 0 ? 1 : 2 };
    })
    .filter(({ departure, reservations }) => Number.isFinite(departure)
      && (reservations.total > 0 || (departure >= now && departure <= now + DRIVER_UPCOMING_TRIP_HIGHLIGHT_WINDOW_MS)))
    .sort((a, b) => a.priority - b.priority
      || a.departure - b.departure || a.trip.id.localeCompare(b.trip.id))
    .map(({ trip }) => trip);
}
