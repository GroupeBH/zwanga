import type { AppDispatch, RootState } from '@/store';
import type { Booking, Trip } from '@/types';
import { bookingApi } from '../bookingApi';
import { tripApi } from '../tripApi';

interface Scope {
  tripId: string;
  bookingId: string;
  passengerId: string;
  requestId: string;
}

/** Reuse the successful response; never infer a dropoff, payment or fare from a pause. */
export const applyDriverInterruptionResponse = (response: Trip, scope: Scope) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    if (!scope.passengerId || getState().auth.user?.id !== scope.passengerId || response.id !== scope.tripId) return;
    const interruption = response.interruptionRequest ?? null;
    if (interruption && (interruption.id !== scope.requestId || interruption.tripId !== scope.tripId)) return;
    const current = tripApi.endpoints.getTripById.select(scope.tripId)(getState()).data;
    // Do not restore a request that was already replaced, or regress a finished trip.
    if (current?.interruptionRequest && current.interruptionRequest.id !== scope.requestId) return;
    if (current && ['completed', 'cancelled'].includes(current.status) && current.status !== response.status) return;
    if (current?.interruptionRequest && current.interruptionRequest.status !== 'pending' &&
        current.interruptionRequest.status !== interruption?.status) return;

    const updateTrip = (trip: Trip) => {
      trip.status = response.status;
      trip.interruptionRequest = interruption;
    };
    dispatch(tripApi.util.updateQueryData('getTripById', scope.tripId, updateTrip));
    const updateBooking = (booking: Booking) => {
      if (booking.id !== scope.bookingId || booking.tripId !== scope.tripId || booking.passengerId !== scope.passengerId) return;
      const existing = booking.tripInterruptionRequest ?? booking.trip?.interruptionRequest;
      if (existing && existing.id !== scope.requestId) return;
      booking.tripInterruptionRequest = interruption;
      if (booking.trip?.id === scope.tripId) updateTrip(booking.trip);
    };
    dispatch(bookingApi.util.updateQueryData('getBookingById', scope.bookingId, updateBooking));
    // The global wait/stop sheet subscribes to this activity cache, not the detail.
    dispatch(bookingApi.util.updateQueryData('getMyActivityBookings', undefined, bookings => bookings.forEach(updateBooking)));
    dispatch(bookingApi.util.updateQueryData('getMyBookings', undefined, bookings => bookings.forEach(updateBooking)));
  };
