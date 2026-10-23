import type { Booking } from '@/types';
import type { StoredBookingPaymentState } from './paymentTypes';

export function isTokenCashFallback(booking: Booking) {
  return booking.paymentMode === 'cash' && booking.paymentStatus === 'not_required' &&
    Boolean(booking.tokenCashFallbackAt && Number.isFinite(Date.parse(booking.tokenCashFallbackAt))) &&
    Number.isFinite(Number(booking.paymentAmount)) && Number(booking.paymentAmount) > 0 && !booking.mixedPaymentAt;
}

/** Only a validated server receipt is persisted, never an optimistic cash choice. */
export function tokenCashFallbackReceipt(booking: Booking) {
  return JSON.stringify({ id: booking.id, tokenCashFallbackAt: booking.tokenCashFallbackAt,
    paymentMode: booking.paymentMode, paymentStatus: booking.paymentStatus,
    paymentAmount: booking.paymentAmount, paymentCurrency: booking.paymentCurrency });
}

export function restoreTokenCashFallback(booking: Booking, stored?: StoredBookingPaymentState): Booking {
  if (booking.tokenCashFallbackAt || booking.paymentStatus === 'succeeded' || booking.mixedPaymentAt ||
      !stored?.tokenCashFallbackReceipt) return booking;
  try {
    const receipt = JSON.parse(stored.tokenCashFallbackReceipt);
    if (receipt.id !== booking.id || !isTokenCashFallback(receipt) ||
        typeof receipt.paymentCurrency !== 'string') return booking;
    return { ...booking, paymentMode: 'cash', paymentStatus: 'not_required',
      tokenCashFallbackAt: receipt.tokenCashFallbackAt, paymentAmount: receipt.paymentAmount,
      paymentCurrency: receipt.paymentCurrency };
  } catch { return booking; }
}
