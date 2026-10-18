import { useCallback, useState, type SetStateAction } from 'react';
import type { Booking, TripPaymentMode } from '@/types';
import type { StoredBookingPaymentState } from '@/features/arrival-payment/paymentTypes';

/** Missing data never implies cash. A pending provider transaction cannot switch modes. */
export function useBookingPaymentMode(booking: Booking | null, stored?: StoredBookingPaymentState, isBusy = false) {
  const [draft, setDraft] = useState<{ bookingId: string; mode: TripPaymentMode | null } | null>(null);
  const [failedBookingId, setFailedBookingId] = useState<string | null>(null);
  const reportPaymentFailure = useCallback((bookingId: string) => setFailedBookingId(bookingId), []);
  const isLocked = isBusy || Boolean(stored?.bookingPaymentOrderNumber || stored?.walletTopUpOrderNumber)
    || booking?.paymentStatus === 'succeeded' || Boolean(booking?.cashReceivedAt);
  const confirmedMode = (booking?.paymentStatus === 'succeeded' || booking?.cashReceivedAt) ? booking.paymentMode : null;
  const selectedMode = stored?.bookingPaymentOrderNumber ? 'electronic'
    : stored?.walletTopUpOrderNumber ? 'points'
    : confirmedMode ? confirmedMode
    : draft?.bookingId === booking?.id && draft ? draft.mode : booking?.paymentMode ?? null;
  const setSelectedMode = useCallback((next: SetStateAction<TripPaymentMode | null>) => {
    if (!booking?.id || isLocked) return;
    setDraft({ bookingId: booking.id, mode: typeof next === 'function' ? next(selectedMode) : next });
    setFailedBookingId(current => current === booking.id ? null : current);
  }, [booking?.id, selectedMode, isLocked]);
  return { selectedMode, setSelectedMode, reportPaymentFailure,
    canChangeFailedPaymentMode: Boolean(booking && failedBookingId === booking.id && !isLocked) };
}
