import { useCallback, useState, type SetStateAction } from 'react';
import type { Booking, TripPaymentMode } from '@/types';
import type { StoredBookingPaymentState } from '@/features/arrival-payment/paymentTypes';

/** Missing data never implies cash. A pending provider transaction cannot switch modes. */
export function useBookingPaymentMode(booking: Booking | null, stored?: StoredBookingPaymentState, isBusy = false) {
  const [draft, setDraft] = useState<{ bookingId: string; mode: TripPaymentMode | null } | null>(null);
  const [failedBookingId, setFailedBookingId] = useState<string | null>(null);
  const reportPaymentFailure = useCallback((bookingId: string) => setFailedBookingId(bookingId), []);
  const isLocked = isBusy || Boolean(booking?.tokenCashFallbackAt || stored?.bookingPaymentOrderNumber || stored?.walletTopUpOrderNumber || stored?.walletTopUpIntent || stored?.mixedCashIntent || booking?.mixedPaymentAt)
    || booking?.paymentStatus === 'succeeded' || Boolean(booking?.cashReceivedAt);
  const confirmedMode = (booking?.paymentStatus === 'succeeded' || booking?.cashReceivedAt || booking?.mixedPaymentAt) ? booking.paymentMode : null;
  const selectedMode = booking?.tokenCashFallbackAt ? 'cash' : stored?.bookingPaymentOrderNumber ? 'electronic'
    : stored?.walletTopUpOrderNumber || stored?.walletTopUpIntent ? 'points'
    : confirmedMode ? confirmedMode
    : draft?.bookingId === booking?.id && draft ? draft.mode : booking?.paymentMode ?? null;
  const setSelectedMode = useCallback((next: SetStateAction<TripPaymentMode | null>) => {
    if (!booking?.id || isLocked) return;
    setDraft({ bookingId: booking.id, mode: typeof next === 'function' ? next(selectedMode) : next });
    setFailedBookingId(current => current === booking.id ? null : current);
  }, [booking?.id, selectedMode, isLocked]);
  // Restore a confirmed provider failure when reopening the form. A local choice
  // dismisses this suggestion; an unresolved order always takes precedence.
  const restoredFailure = (booking?.paymentStatus === 'failed' || booking?.paymentStatus === 'cancelled')
    && draft?.bookingId !== booking?.id;
  return { selectedMode, setSelectedMode, reportPaymentFailure,
    canChangeFailedPaymentMode: Boolean(booking && (failedBookingId === booking.id || restoredFailure) && !isLocked) };
}
