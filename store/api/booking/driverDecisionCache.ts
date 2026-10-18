import type { AppDispatch, RootState } from '@/store';
import type { Booking } from '@/types';
import { bookingApi } from '../bookingApi';
import { tripApi } from '../tripApi';

export type DriverBookingDecision = 'accepted' | 'rejected' | 'cancelled';

/** Apply only an acknowledged decision. Never estimate seat counts or financial fields. */
export const applyDriverBookingDecision = (source: Booking, status: DriverBookingDecision,
  driverId: string, response?: Booking) => (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState();
  if (!driverId || state.auth.user?.id !== driverId) return;
  const trip = tripApi.endpoints.getTripById.select(source.tripId)(state).data;
  if ((trip?.driverId ?? source.trip?.driverId) !== driverId) return;
  if (response && (response.id !== source.id || response.tripId !== source.tripId || response.status !== status)) return;
  const merge = (current: Booking) => {
    if (current.id !== source.id || current.tripId !== source.tripId || current.passengerId !== source.passengerId) return;
    if (current.status !== source.status) return; // Do not undo a subsequent dropoff/cancellation.
    if (response && Date.parse(current.updatedAt) > Date.parse(response.updatedAt)) return;
    Object.assign(current, response ?? {}, { status, trip: current.trip ?? response?.trip,
      passengerName: response?.passengerName ?? current.passengerName,
      passengerAvatar: response?.passengerAvatar ?? current.passengerAvatar,
      passengerPhone: response?.passengerPhone ?? current.passengerPhone });
  };
  dispatch(bookingApi.util.updateQueryData('getTripBookings', source.tripId, bookings => bookings.forEach(merge)));
  dispatch(bookingApi.util.updateQueryData('getBookingById', source.id, merge));
};
