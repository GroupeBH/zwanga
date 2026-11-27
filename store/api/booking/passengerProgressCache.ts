import type { AppDispatch, RootState } from '@/store';
import type { Booking } from '@/types';
import { bookingApi } from '../bookingApi';
import { passengerRideStage } from '@/features/passenger-navigation/passengerRideProgress';

export function mergePassengerProgress(current: Booking, incoming: Booking) {
  if (current.id !== incoming.id || current.tripId !== incoming.tripId || current.passengerId !== incoming.passengerId ||
      Date.parse(current.updatedAt) > Date.parse(incoming.updatedAt) ||
      (current.status === 'cancelled' && incoming.status !== 'cancelled') ||
      (current.status === 'completed' && incoming.status !== 'completed')) return;
  const rank = { waiting: 0, pickup: 1, dropoff: 2 };
  if (rank[passengerRideStage(current)] > rank[passengerRideStage(incoming)]) return;
  // Booking and trip reads have independent revisions. Never downgrade a closed/started trip.
  const trip = current.trip && (current.trip.status === 'completed' || current.trip.status === 'cancelled' ||
    (current.trip.status === 'ongoing' && incoming.trip?.status === 'upcoming'))
    ? current.trip : incoming.trip ?? current.trip;
  Object.assign(current, incoming, { trip });
}

/** Fan out one authoritative GET; no simulated arrival, payment or write to the server. */
export const applyPassengerProgress = (booking: Booking, userId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    if (!userId || getState().auth.user?.id !== userId || booking.passengerId !== userId) return;
    const mergeList = (items: Booking[]) => items.forEach(item => mergePassengerProgress(item, booking));
    dispatch(bookingApi.util.updateQueryData('getBookingById', booking.id, current => mergePassengerProgress(current, booking)));
    dispatch(bookingApi.util.updateQueryData('getMyActivityBookings', undefined, items => {
      mergeList(items);
      // Keep the final receipt/payment reachable if the activity list removed the ride first.
      if (!items.some(item => item.id === booking.id) && passengerRideStage(booking) === 'dropoff') items.push(booking);
    }));
    dispatch(bookingApi.util.updateQueryData('getMyBookings', undefined, mergeList));
    dispatch(bookingApi.util.updateQueryData('getMyBookingsForTrip', booking.tripId, mergeList));
    dispatch(bookingApi.util.updateQueryData('getTripBookings', booking.tripId, mergeList));
  };
