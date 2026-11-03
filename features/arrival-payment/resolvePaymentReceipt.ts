import { buildPaymentCompletionSummary } from './buildPaymentCompletionSummary';
import type { PaymentCompletionSummary } from './paymentTypes';
import type { Booking, PaymentHistoryItem, WalletSummary } from '@/types';

/** Keep the mutation receipt authoritative, but allow confirmed arrival/cash to enrich it. */
export function resolvePaymentReceipt(summary: PaymentCompletionSummary | null, booking: Booking | null,
  succeeded: boolean, wallet: WalletSummary | undefined, history: PaymentHistoryItem[]) {
  if (summary) {
    if (booking?.id !== summary.bookingId) return summary;
    const fresh = buildPaymentCompletionSummary(booking, wallet, history, { channel: summary.channel });
    if (fresh && ((summary.cashInstructions && fresh.cashReceivedAt) ||
      (!summary.ratingTripId && fresh.ratingTripId))) return fresh;
    return summary;
  }
  return booking && (succeeded || booking.mixedPaymentAt || booking.tokenCashFallbackAt)
    ? buildPaymentCompletionSummary(booking, wallet, history, {}) : null;
}
