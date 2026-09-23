import type { AppDispatch, RootState } from '@/store';
import type { Booking } from '@/types';
import { isPassengerInterruptionResponse } from '@/features/driver-navigation/passengerInterruptionResponse';
import { bookingApi } from '../bookingApi';
import { tripApi } from '../tripApi';

/** Update only the selected reservation from the authoritative mutation response. */
export const applyPassengerInterruptionResponse = (response: Booking, source: Booking, driverId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState();
    if (!driverId || state.auth.user?.id !== driverId || !source.interruptionRequest?.id) return;
    if (!isPassengerInterruptionResponse(response, source, 'confirm') &&
        !isPassengerInterruptionResponse(response, source, 'reject')) return;
    const trip = tripApi.endpoints.getTripById.select(source.tripId)(state).data;
    if ((trip?.driverId ?? response.trip?.driverId) !== driverId) return;
    const merge = (current: Booking) => {
      if (current.id !== source.id || current.tripId !== source.tripId || current.passengerId !== source.passengerId) return;
      if (current.interruptionRequest && current.interruptionRequest.id !== source.interruptionRequest?.id) return;
      if (Date.parse(current.updatedAt) > Date.parse(response.updatedAt)) return;
      if (current.status === 'cancelled' || (current.status === 'completed' && response.status !== 'completed')) return;
      // Do not replace a newer trip snapshot or erase display identity omitted by a response.
      Object.assign(current, response, { trip: current.trip ?? response.trip,
        passengerName: response.passengerName ?? current.passengerName,
        passengerAvatar: response.passengerAvatar ?? current.passengerAvatar,
        passengerPhone: response.passengerPhone ?? current.passengerPhone,
        interruptionRequest: response.interruptionRequest ?? null });
    };
    dispatch(bookingApi.util.updateQueryData('getTripBookings', source.tripId, bookings => bookings.forEach(merge)));
    dispatch(bookingApi.util.updateQueryData('getBookingById', source.id, merge));
  };
