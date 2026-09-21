import { useCallback, useState, type SetStateAction } from 'react';
import type { Booking, TripPaymentMode } from '@/types';
import type { StoredBookingPaymentState } from '@/features/arrival-payment/paymentTypes';

/** Missing data never implies cash. A pending provider transaction cannot switch modes. */
export function useBookingPaymentMode(booking: Booking | null, stored?: StoredBookingPaymentState) {
  const [draft, setDraft] = useState<{ bookingId: string; mode: TripPaymentMode | null } | null>(null);
  const selectedMode = stored?.bookingPaymentOrderNumber ? 'electronic'
    : stored?.walletTopUpOrderNumber ? 'points'
    : draft?.bookingId === booking?.id && draft ? draft.mode : booking?.paymentMode ?? null;
  const setSelectedMode = useCallback((next: SetStateAction<TripPaymentMode | null>) => {
    if (!booking?.id || stored?.bookingPaymentOrderNumber || stored?.walletTopUpOrderNumber) return;
    setDraft({ bookingId: booking.id, mode: typeof next === 'function' ? next(selectedMode) : next });
  }, [booking?.id, selectedMode, stored?.bookingPaymentOrderNumber, stored?.walletTopUpOrderNumber]);
  return { selectedMode, setSelectedMode };
}
