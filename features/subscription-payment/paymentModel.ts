import {
  PaymentChannel,
  StoredPayment,
  CARD_PAYMENT_RETURN_PATH,
  RECENT_PENDING_PAYMENT_MAX_AGE_MS,
  DRC_MOBILE_MONEY_PREFIX,
  DRC_MOBILE_MONEY_REGEX,
} from './paymentTypes';
import type {
  PaymentHistoryItem,
  SubscriptionPaymentMethod,
  SubscriptionPaymentResponse,
  SubscriptionPlan,
} from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';

export const PAYMENT_OPTIONS: {
  id: PaymentChannel;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'mpesa', label: 'M-Pesa', hint: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'airtel', label: 'Airtel Money', hint: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'orange', label: 'Orange Money', hint: 'Mobile Money', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Carte', hint: 'Visa ou Mastercard', icon: 'card-outline' },
  { id: 'points', label: 'Jetons', hint: 'Solde Zwanga', icon: 'wallet-outline' },
];

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const formatSubscriptionAmount = (amount?: number | string, currency?: string) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `5000 ${currency || 'CDF'}`;
  const formatted =
    numericAmount % 1 === 0 ? Math.round(numericAmount).toString() : numericAmount.toFixed(2);
  return `${formatted} ${currency || 'CDF'}`;
};

export const formatPointsAmount = (amount?: number | string | null, currency?: string | null) => {
  const numericAmount = Number(amount);
  const displayCurrency = currency || 'PTS';
  if (!Number.isFinite(numericAmount)) return `${amount ?? 0} ${displayCurrency}`;

  const formatted =
    numericAmount % 1 === 0
      ? Math.round(numericAmount).toLocaleString('fr-FR')
      : numericAmount.toFixed(2);
  const unit = !currency || currency.toUpperCase() === 'PTS'
    ? Math.abs(numericAmount) === 1
      ? 'jeton'
      : 'jetons'
    : displayCurrency;
  return `${formatted} ${unit}`;
};

export const getPlanLabel = (plan?: SubscriptionPlan | null) => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'yearly') return 'annuel';
  return 'mensuel';
};

export const createCardPaymentRedirectUrls = () => {
  const baseUrl = ExpoLinking.createURL(CARD_PAYMENT_RETURN_PATH);
  const withStatus = (status: 'success' | 'cancel' | 'decline') =>
    `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}status=${status}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
};

export const normalizePaymentPhone = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed.startsWith('+') ? '+' : '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

export const formatCongolesePaymentPhone = (value?: string | null) => {
  const normalized = normalizePaymentPhone(value);
  if (!normalized) return '';

  const digits = normalized.replace(/\D/g, '');
  if (digits.startsWith('243') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `${DRC_MOBILE_MONEY_PREFIX}${digits.slice(1)}`;
  if (digits.length === 9) return `${DRC_MOBILE_MONEY_PREFIX}${digits}`;
  return normalized;
};

export const isValidCongolesePaymentPhone = (value?: string | null) =>
  DRC_MOBILE_MONEY_REGEX.test(formatCongolesePaymentPhone(value));

export const normalizePaymentMessage = (message?: string | null) =>
  (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const isDeclinedPaymentMessage = (message?: string | null) => {
  const normalizedMessage = normalizePaymentMessage(message);
  return (
    normalizedMessage.includes('annul') ||
    normalizedMessage.includes('cancel') ||
    normalizedMessage.includes('declined') ||
    normalizedMessage.includes('echec') ||
    normalizedMessage.includes('echoue') ||
    normalizedMessage.includes('failed') ||
    normalizedMessage.includes('failure') ||
    normalizedMessage.includes('refuse') ||
    normalizedMessage.includes('rejet') ||
    normalizedMessage.includes('non abouti') ||
    normalizedMessage.includes('non aboutit') ||
    normalizedMessage.includes('not completed') ||
    normalizedMessage.includes('not complete') ||
    normalizedMessage.includes('not successful') ||
    normalizedMessage.includes('solde insuffisant') ||
    normalizedMessage.includes('unsuccessful') ||
    normalizedMessage.includes('insufficient')
  );
};

export const getPaymentFailureMessage = (message?: string | null) => {
  const normalizedMessage = normalizePaymentMessage(message);
  if (
    normalizedMessage.includes('annul') ||
    normalizedMessage.includes('cancel')
  ) {
    return 'Paiement annulé. Aucun montant confirmé; vous pouvez réessayer.';
  }

  if (
    normalizedMessage.includes('declined by the operator') ||
    normalizedMessage.includes('declined') ||
    normalizedMessage.includes('refuse') ||
    normalizedMessage.includes('rejet')
  ) {
    return "Paiement refusé par l'opérateur. Aucun montant confirmé.";
  }

  if (
    normalizedMessage.includes('solde insuffisant') ||
    normalizedMessage.includes('insufficient')
  ) {
    return 'Paiement échoué : solde insuffisant.';
  }

  if (
    normalizedMessage.includes('non abouti') ||
    normalizedMessage.includes('non aboutit') ||
    normalizedMessage.includes('not completed') ||
    normalizedMessage.includes('not complete') ||
    normalizedMessage.includes('not successful') ||
    normalizedMessage.includes('unsuccessful') ||
    normalizedMessage.includes('echec') ||
    normalizedMessage.includes('echoue') ||
    normalizedMessage.includes('failed') ||
    normalizedMessage.includes('failure')
  ) {
    return 'Paiement non abouti. Aucun montant confirmé; vous pouvez relancer une nouvelle tentative.';
  }

  return getApiErrorMessage(
    { message },
    'Le paiement a échoué. Vous pouvez réessayer ou choisir un autre moyen.',
  );
};

export const getPaymentStatusMessage = (message: string | null | undefined, fallback: string) =>
  getApiErrorMessage({ message }, fallback);

export const isPaymentComplete = (response?: SubscriptionPaymentResponse | null) =>
  response?.subscription?.status === 'active' || response?.payment?.status === 'succeeded';

export const isTerminalFailedStatus = (status?: string | null) => {
  const normalizedStatus = normalizePaymentMessage(status);
  return (
    normalizedStatus === 'cancel' ||
    normalizedStatus === 'cancelled' ||
    normalizedStatus === 'canceled' ||
    normalizedStatus === 'decline' ||
    normalizedStatus === 'declined' ||
    normalizedStatus === 'expired' ||
    normalizedStatus === 'failed' ||
    normalizedStatus === 'payment_failed' ||
    normalizedStatus === 'rejected'
  );
};

export const isPaymentFailed = (response?: SubscriptionPaymentResponse | null) =>
  isTerminalFailedStatus(response?.payment?.status) ||
  isTerminalFailedStatus(response?.subscription?.status) ||
  isDeclinedPaymentMessage(response?.payment?.message) ||
  isDeclinedPaymentMessage(response?.payment?.statusCode);

export const isNetworkOrTimeoutError = (error: any) =>
  error?.status === 'FETCH_ERROR' || error?.status === 'TIMEOUT_ERROR';

export const getStoredPaymentKey = (userId?: string | null) =>
  userId ? `zwanga:subscription:pending-payment:${userId}` : null;

export const getPaymentMethodForChannel = (channel: PaymentChannel): SubscriptionPaymentMethod | null => {
  if (channel === 'points') return null;
  return channel === 'card' ? 'card' : 'mobile_money';
};

export const isPaymentChannel = (value: unknown): value is PaymentChannel =>
  value === 'mpesa' || value === 'airtel' || value === 'orange' || value === 'card';

export const parseStoredPayment = (value?: string | null): StoredPayment | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredPayment>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.orderNumber !== 'string' || !parsed.orderNumber.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (!isPaymentChannel(parsed.channel)) return null;

    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() - createdAtMs > RECENT_PENDING_PAYMENT_MAX_AGE_MS) return null;

    const fallbackPaymentMethod = getPaymentMethodForChannel(parsed.channel);
    const paymentMethod =
      parsed.paymentMethod === 'card' || parsed.paymentMethod === 'mobile_money'
        ? parsed.paymentMethod
        : getPaymentMethodForChannel(parsed.channel);
    if (!paymentMethod || !fallbackPaymentMethod) return null;

    return {
      channel: parsed.channel,
      createdAt,
      message: typeof parsed.message === 'string' ? parsed.message : null,
      orderNumber: parsed.orderNumber,
      paymentMethod,
      paymentUrl: typeof parsed.paymentUrl === 'string' ? parsed.paymentUrl : null,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
};

export const isRecentPendingSubscriptionPayment = (payment: PaymentHistoryItem) => {
  const purpose = String(payment.purpose ?? '').toLowerCase();
  const status = String(payment.status ?? '').toLowerCase();
  const createdAtMs = Date.parse(payment.createdAt);

  return (
    purpose === 'subscription_pro' &&
    Boolean(payment.orderNumber) &&
    (status === 'pending' || status === 'initiated') &&
    !isDeclinedPaymentMessage(payment.message) &&
    !isDeclinedPaymentMessage(payment.statusCode) &&
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs <= RECENT_PENDING_PAYMENT_MAX_AGE_MS
  );
};

export const getMostRecentPendingSubscriptionPayment = (payments?: PaymentHistoryItem[] | null) => {
  if (!payments?.length) return null;
  return (
    payments
      .filter(isRecentPendingSubscriptionPayment)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
};

export const buildStoredPaymentFromHistory = (
  payment: PaymentHistoryItem,
  userId: string,
  fallbackChannel: PaymentChannel,
): StoredPayment | null => {
  if (!payment.orderNumber || !userId) return null;

  const mobileMoneyFallback =
    fallbackChannel === 'mpesa' || fallbackChannel === 'airtel' || fallbackChannel === 'orange'
      ? fallbackChannel
      : 'mpesa';
  const channel = payment.method === 'card' ? 'card' : mobileMoneyFallback;
  return {
    channel,
    createdAt: payment.createdAt,
    message: getPaymentStatusMessage(payment.message, 'Paiement retrouvé côté Zwanga.'),
    orderNumber: payment.orderNumber,
    paymentMethod: payment.method === 'card' ? 'card' : 'mobile_money',
    paymentUrl: payment.paymentUrl,
    userId,
  };
};

export const getCardPaymentResultFromUrl = (url?: string | null) => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
};
