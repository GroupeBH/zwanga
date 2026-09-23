import { findBookingPaymentHistory, findBookingRewardEntry, getLedgerEntryAmount, hasPassengerArrived, normalizeAmount } from './paymentModel';
import type { Booking, PaymentHistoryItem, TripPaymentMode, WalletSummary } from '@/types';
import type { PaymentChannel, PaymentCompletionSummary } from './paymentTypes';

export type CompletionOptions = { mode?: TripPaymentMode | null; channel?: PaymentChannel; paymentReference?: string | null };

export function buildPaymentCompletionSummary(booking: Booking, wallet: WalletSummary | undefined,
  history: PaymentHistoryItem[], options: CompletionOptions): PaymentCompletionSummary | null {
  const payment = findBookingPaymentHistory(history, booking);
  const reward = findBookingRewardEntry(wallet, booking);
  // The mutation/status response is authoritative, not an older list refetch.
  const mode = booking.paymentMode ?? options.mode;
  if (!mode) return null;
  const cashReceived = mode === 'cash' && Boolean(booking.cashReceivedAt);
  const cashInstructions = mode === 'cash' && !cashReceived && booking.paymentStatus !== 'succeeded' && normalizeAmount(booking.paymentAmount) !== 0;
  return {
    bookingId: booking.id, beforeArrival: !hasPassengerArrived(booking), mode, channel: options.channel,
    amount: normalizeAmount(booking.paymentAmount) ?? normalizeAmount(payment?.amount) ?? 0,
    currency: booking.paymentCurrency ?? payment?.currency ?? 'CDF',
    walletBalance: normalizeAmount(wallet?.account.balance), earnedPoints: getLedgerEntryAmount(reward),
    earnedPointsKnown: Boolean(reward), paymentHistoryId: payment?.id ?? null,
    invoiceUrl: payment?.id ? '/payment-history?paymentId=' + payment.id : null,
    paymentReference: booking.paymentReference ?? payment?.reference ?? options.paymentReference ?? null,
    cashInstructions,
    driverNotice: cashInstructions
      ? 'Le mode cash est enregistré. Remettez le montant au conducteur si ce n’est pas encore fait.'
      : cashReceived ? 'Le conducteur a confirmé la réception du cash. Vous n’avez rien à payer de nouveau.'
      : 'Le paiement est confirmé. Le conducteur peut consulter son état dans le trajet.',
  };
}
