import { useEffect } from 'react';
import { bookingApi } from '@/store/api/bookingApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import type { Booking } from '@/types';

/** Reuse a fresh detail response rather than waiting for the next activity-list poll.
 * Never synthesizes a dropoff/payment, starts a request, or modifies another account.
 */
export function useSyncArrivedPaymentBooking(booking: Booking | undefined, enabled: boolean) {
  const dispatch = useAppDispatch();
  const accountId = useAppSelector(selectUser)?.id;
  useEffect(() => {
    if (!enabled || !accountId || !booking || booking.passengerId !== accountId ||
        !(booking.status === 'completed' || booking.droppedOff || booking.droppedOffAt)) return;
    dispatch(bookingApi.util.updateQueryData('getMyActivityBookings', undefined, bookings => {
      const index = bookings.findIndex(item => item.id === booking.id);
      if (index < 0) {
        bookings.push(booking);
        return;
      }
      const current = bookings[index];
      if (current.passengerId !== accountId || Date.parse(current.updatedAt) > Date.parse(booking.updatedAt)) return;
      bookings[index] = { ...current, ...booking, trip: booking.trip ?? current.trip };
    }));
  }, [accountId, booking, dispatch, enabled]);
}
