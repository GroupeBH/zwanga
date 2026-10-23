import type { Booking } from '@/types';
import type { StoredBookingPaymentState } from './paymentTypes';

/** Preserve a confirmed split if a list cache/older API still returns the original fare. */
export function restoreMixedCashReceipt(booking: Booking, stored?: StoredBookingPaymentState): Booking {
  if (booking.mixedPaymentAt || booking.paymentStatus === 'succeeded' || !stored?.mixedCashReceipt) return booking;
  try {
    const saved = JSON.parse(stored.mixedCashReceipt) as Partial<Booking>;
    const cash = Number(saved.paymentAmount), tokens = Number(saved.mixedTokenAmount), quantity = Number(saved.mixedTokenQuantity);
    if (saved.id !== booking.id || saved.paymentCurrency !== booking.paymentCurrency ||
        ![cash, tokens, quantity].every(v => Number.isFinite(v) && v > 0) ||
        !saved.mixedPaymentAt || !Number.isFinite(Date.parse(saved.mixedPaymentAt))) return booking;
    return { ...booking, paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: cash,
      mixedTokenAmount: tokens, mixedTokenQuantity: quantity, mixedPaymentAt: saved.mixedPaymentAt };
  } catch { return booking; }
}

export function serializeMixedCashReceipt(booking: Booking): string {
  return JSON.stringify({ id: booking.id, paymentAmount: booking.paymentAmount, paymentCurrency: booking.paymentCurrency,
    mixedTokenAmount: booking.mixedTokenAmount, mixedTokenQuantity: booking.mixedTokenQuantity, mixedPaymentAt: booking.mixedPaymentAt });
}
