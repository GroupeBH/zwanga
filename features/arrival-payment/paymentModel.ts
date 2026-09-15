import { PaymentChannel } from './paymentTypes';
import { PAYMENT_STATE_STORAGE_PREFIX, BOOKING_CARD_PAYMENT_RETURN_PATH } from './paymentPolicy';
import * as ExpoLinking from 'expo-linking';
import type {
  Booking,
  BookingPaymentResponse,
  PaymentHistoryItem,
  SubscriptionPaymentMethod,
  TripPaymentMode,
  WalletLedgerEntry,
  WalletSummary,
} from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';

export function normalizeAmount(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

export function formatMoney(value: number, currency?: string | null) {
  const normalizedCurrency = currency?.trim().toUpperCase() || 'CDF';
  const suffix = normalizedCurrency === 'CDF' ? 'FC' : normalizedCurrency;
  return `${formatNumber(value)} ${suffix}`;
}

export function formatPoints(value: number) {
  return `${formatNumber(value)} jeton${value > 1 ? 's' : ''}`;
}

export function formatPaymentPhone(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('243') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+243${digits.slice(1)}`;
  if (digits.length === 9) return `+243${digits}`;
  return value?.trim();
}

export function normalizePaymentPhone(value?: string | null) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed.startsWith('+') ? '+' : '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function getPaymentMethodForChannel(channel: PaymentChannel): SubscriptionPaymentMethod {
  return channel === 'card' ? 'card' : 'mobile_money';
}

export function isPaymentChannel(value: unknown): value is PaymentChannel {
  return value === 'mpesa' || value === 'airtel' || value === 'orange' || value === 'card';
}

export function getPaymentChannelLabel(channel?: PaymentChannel) {
  switch (channel) {
    case 'mpesa':
      return 'M-Pesa';
    case 'airtel':
      return 'Airtel Money';
    case 'orange':
      return 'Orange Money';
    case 'card':
      return 'Carte';
    default:
      return 'Mobile Money';
  }
}

export function getPaymentModeLabel(mode?: TripPaymentMode | null, channel?: PaymentChannel) {
  if (mode === 'points') return 'Jetons Zwanga';
  if (mode === 'cash') return 'Paiement en espèces';
  if (mode === 'electronic') return getPaymentChannelLabel(channel);
  return 'Paiement';
}

export function getPaymentFailureMessage(message?: string | null) {
  return getApiErrorMessage(
    { message },
    "Le paiement n'a pas été confirmé. Vous pouvez réessayer.",
  );
}

export function getPaymentStatusMessage(message: string | null | undefined, fallback: string) {
  return getApiErrorMessage({ message }, fallback);
}

export function isPaymentSucceeded(response: BookingPaymentResponse) {
  return response.payment.status === 'succeeded' || response.booking.paymentStatus === 'succeeded';
}

export function createBookingCardPaymentRedirectUrls(bookingId: string) {
  const baseUrl = ExpoLinking.createURL(BOOKING_CARD_PAYMENT_RETURN_PATH);
  const separator = baseUrl.includes('?') ? '&' : '?';
  const withStatus = (status: 'success' | 'cancel' | 'decline') =>
    `${baseUrl}${separator}status=${status}&bookingId=${encodeURIComponent(bookingId)}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
}

export function getCardPaymentResultFromUrl(url?: string | null) {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
}

export function hasPassengerArrived(booking: Booking) {
  return Boolean(
    booking.status === 'completed' ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      booking.droppedOffAt,
  );
}

export function getArrivalTimestamp(booking: Booking) {
  const timestamp = booking.droppedOffAt ?? booking.droppedOffConfirmedAt ?? booking.updatedAt;
  const parsed = timestamp ? new Date(timestamp).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isFinanciallyPending(booking: Booking) {
  const amount = normalizeAmount(booking.paymentAmount);
  if (amount === 0) return false;
  if (booking.paymentStatus === 'succeeded') return false;
  if (booking.paymentMode === 'cash' && booking.paymentStatus === 'not_required') return false;
  return true;
}

export function matchesBookingEntity(value: string | null | undefined, booking: Booking) {
  if (!value) return false;
  return [
    booking.id,
    booking.tripId,
    booking.paymentReference,
    booking.paymentTransactionId,
  ]
    .filter(Boolean)
    .some((candidate) => String(candidate) === String(value));
}

export function findBookingPaymentHistory(
  payments: PaymentHistoryItem[] | undefined,
  booking: Booking,
) {
  return (
    payments
      ?.filter((payment) => {
        if (payment.purpose !== 'trip_booking') return false;
        return (
          matchesBookingEntity(payment.relatedEntityId, booking) ||
          matchesBookingEntity(payment.reference, booking) ||
          matchesBookingEntity(payment.orderNumber, booking)
        );
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
}

export function getLedgerEntryAmount(entry?: WalletLedgerEntry | null) {
  const amount = normalizeAmount(entry?.amount);
  return amount === null ? 0 : amount;
}

export function findBookingRewardEntry(wallet: WalletSummary | undefined | null, booking: Booking) {
  return (
    wallet?.recentEntries
      ?.filter((entry) => {
        if (entry.type !== 'loyalty_reward') return false;
        if (getLedgerEntryAmount(entry) <= 0) return false;
        return (
          matchesBookingEntity(entry.relatedEntityId, booking) ||
          matchesBookingEntity(entry.paymentTransactionId, booking)
        );
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
}

export function getStorageKey(userId: string) {
  return `${PAYMENT_STATE_STORAGE_PREFIX}${userId}`;
}
