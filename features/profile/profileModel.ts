
export { DRC_MOBILE_MONEY_PREFIX } from './paymentPhone';
export { DRC_MOBILE_MONEY_REGEX } from './paymentPhone';
export { normalizePaymentPhone } from './paymentPhone';
export { formatCongolesePaymentPhone } from './paymentPhone';
export { isValidCongolesePaymentPhone } from './paymentPhone';
import type { PaymentHistoryItem, SubscriptionPaymentMethod, SubscriptionPaymentResponse, SubscriptionPlan, Vehicle } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export const formatSubscriptionAmount = (amount?: number | string, currency?: string) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `5000 ${currency || 'CDF'}`;
  const formatted = numericAmount % 1 === 0 ? Math.round(numericAmount).toString() : numericAmount.toFixed(2);
  return `${formatted} ${currency || 'CDF'}`;
};

export const formatSubscriptionEndDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatReferralTokens = (value?: number | string | null) => {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return '0';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(numericValue);
};

export const getPlanLabel = (plan?: SubscriptionPlan | null) => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'yearly') return 'annuel';
  return 'mensuel';
};

export type SubscriptionPaymentChannel = 'mpesa' | 'airtel' | 'orange' | 'card';

export type SubscriptionModalStep = 'method' | 'payment';

export type SubscriptionCardPaymentResult = 'success' | 'cancel' | 'decline';

export type SubscriptionPaymentCheckOutcome = 'success' | 'pending' | 'failed' | 'error';

export type SubscriptionPaymentStage =
  | 'idle'
  | 'preparing'
  | 'phone_confirmation'
  | 'card_redirect'
  | 'operator_confirmation'
  | 'zwanga_activation'
  | 'waiting_long'
  | 'success'
  | 'failed';

export type SubscriptionPaymentProgressStatus = 'done' | 'current' | 'waiting' | 'paused' | 'error';

export type SubscriptionPaymentProgressStep = {
  key: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: SubscriptionPaymentProgressStatus;
  title: string;
};

export type StoredSubscriptionPayment = {
  channel: SubscriptionPaymentChannel;
  createdAt: string;
  message?: string | null;
  orderNumber: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentUrl?: string | null;
  userId: string;
};

export const ZWANGA_DOCUMENTS_PACK_URL = 'https://zwanga-app.com/demande-documents';

export const SUBSCRIPTION_CARD_PAYMENT_RETURN_PATH = 'subscriptions/payment';

export const SUBSCRIPTION_RECENT_PENDING_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;

export const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INITIAL_DELAY_MS = 3500;

export const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_INTERVAL_MS = 8000;

export const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_TIMEOUT_MS = 180000;

export const SUBSCRIPTION_MOBILE_MONEY_AUTO_CHECK_MAX_ATTEMPTS = 15;

export const SUBSCRIPTION_DEFERRED_BACKEND_SYNC_DELAY_MS = 5000;

export const createCardPaymentRedirectUrls = () => {
  const baseUrl = ExpoLinking.createURL(SUBSCRIPTION_CARD_PAYMENT_RETURN_PATH);
  const withStatus = (status: SubscriptionCardPaymentResult) =>
    `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}status=${status}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
  };
};

export const SUBSCRIPTION_PAYMENT_OPTIONS: {
  id: SubscriptionPaymentChannel;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
    {
      id: 'mpesa',
      label: 'M-Pesa',
      hint: 'Paiement Mobile Money',
      icon: 'phone-portrait-outline',
    },
    {
      id: 'airtel',
      label: 'Airtel Money',
      hint: 'Paiement Mobile Money',
      icon: 'phone-portrait-outline',
    },
    {
      id: 'orange',
      label: 'Orange Money',
      hint: 'Paiement Mobile Money',
      icon: 'phone-portrait-outline',
    },
    {
      id: 'card',
      label: 'Carte',
      hint: 'Visa ou Mastercard',
      icon: 'card-outline',
    },
  ];

export const getApiMessage = (error: any, fallback: string) => {
  return getApiErrorMessage(error, fallback);
};

export type VehicleFormData = Pick<Vehicle, 'type' | 'brand' | 'model' | 'color' | 'licensePlate'>;

export const normalizeVehicleField = (value: string) => value.trim().toLowerCase();

export const vehicleMatchesFormData = (vehicle: Vehicle, data: VehicleFormData) =>
  vehicle.type === data.type &&
  normalizeVehicleField(vehicle.brand) === normalizeVehicleField(data.brand) &&
  normalizeVehicleField(vehicle.model) === normalizeVehicleField(data.model) &&
  normalizeVehicleField(vehicle.color) === normalizeVehicleField(data.color) &&
  normalizeVehicleField(vehicle.licensePlate) === normalizeVehicleField(data.licensePlate);

export const isSubscriptionPaymentComplete = (response?: SubscriptionPaymentResponse | null) =>
  response?.subscription?.status === 'active' || response?.payment?.status === 'succeeded';

export const normalizeSubscriptionPaymentMessage = (message?: string | null) =>
  (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const isDeclinedSubscriptionPaymentMessage = (message?: string | null) => {
  const normalizedMessage = normalizeSubscriptionPaymentMessage(message);
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

export const getSubscriptionPaymentFailureMessage = (message?: string | null) => {
  const normalizedMessage = normalizeSubscriptionPaymentMessage(message);
  if (normalizedMessage.includes('annul') || normalizedMessage.includes('cancel')) {
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

  if (normalizedMessage.includes('solde insuffisant') || normalizedMessage.includes('insufficient')) {
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
    return 'Paiement non abouti. Aucun montant confirmé ; vous pouvez relancer une nouvelle tentative.';
  }

  return getApiErrorMessage(
    { message },
    'Le paiement a échoué. Vous pouvez réessayer ou choisir un autre moyen de paiement.',
  );
};

export const getSubscriptionPaymentStatusMessage = (message: string | null | undefined, fallback: string) =>
  getApiErrorMessage({ message }, fallback);

export const isTerminalFailedSubscriptionPaymentStatus = (status?: string | null) => {
  const normalizedStatus = normalizeSubscriptionPaymentMessage(status);
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

export const isSubscriptionPaymentFailed = (response?: SubscriptionPaymentResponse | null) =>
  isTerminalFailedSubscriptionPaymentStatus(response?.payment?.status) ||
  isTerminalFailedSubscriptionPaymentStatus(response?.subscription?.status) ||
  isDeclinedSubscriptionPaymentMessage(response?.payment?.message) ||
  isDeclinedSubscriptionPaymentMessage(response?.payment?.statusCode);

export const getCardPaymentResultFromUrl = (url?: string | null): SubscriptionCardPaymentResult | null => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('status=success') || lowerUrl.includes('/success')) return 'success';
  if (lowerUrl.includes('status=cancel') || lowerUrl.includes('/cancel')) return 'cancel';
  if (lowerUrl.includes('status=decline') || lowerUrl.includes('/decline')) return 'decline';
  return null;
};

export const getSubscriptionPendingPaymentKey = (userId?: string | null) =>
  userId ? `zwanga:subscription:pending-payment:${userId}` : null;

export const getSubscriptionPaymentMethodForChannel = (channel: SubscriptionPaymentChannel): SubscriptionPaymentMethod =>
  channel === 'card' ? 'card' : 'mobile_money';

export const isSubscriptionPaymentChannel = (value: unknown): value is SubscriptionPaymentChannel =>
  value === 'mpesa' || value === 'airtel' || value === 'orange' || value === 'card';

export const parseStoredSubscriptionPayment = (value?: string | null): StoredSubscriptionPayment | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredSubscriptionPayment>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.orderNumber !== 'string' || !parsed.orderNumber.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (!isSubscriptionPaymentChannel(parsed.channel)) return null;

    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() - createdAtMs > SUBSCRIPTION_RECENT_PENDING_PAYMENT_MAX_AGE_MS) return null;

    const paymentMethod =
      parsed.paymentMethod === 'card' || parsed.paymentMethod === 'mobile_money'
        ? parsed.paymentMethod
        : getSubscriptionPaymentMethodForChannel(parsed.channel);

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
    !isDeclinedSubscriptionPaymentMessage(payment.message) &&
    !isDeclinedSubscriptionPaymentMessage(payment.statusCode) &&
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs <= SUBSCRIPTION_RECENT_PENDING_PAYMENT_MAX_AGE_MS
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

export const buildStoredSubscriptionPaymentFromHistory = (
  payment: PaymentHistoryItem,
  userId: string,
  fallbackChannel: SubscriptionPaymentChannel,
): StoredSubscriptionPayment | null => {
  if (!payment.orderNumber || !userId) return null;

  const channel = payment.method === 'card' ? 'card' : fallbackChannel === 'card' ? 'mpesa' : fallbackChannel;
  return {
    channel,
    createdAt: payment.createdAt,
    message: getSubscriptionPaymentStatusMessage(
      payment.message,
      'Tentative récente retrouvée côté Zwanga.',
    ),
    orderNumber: payment.orderNumber,
    paymentMethod: payment.method === 'card' ? 'card' : 'mobile_money',
    paymentUrl: payment.paymentUrl,
    userId,
  };
};

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const openExternalUrl = async (url: string) => {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch (browserError) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch (linkingError) {
      console.warn('[Profile] External URL fallback failed:', linkingError);
    }

    console.warn('[Profile] External URL open failed:', browserError);
    throw new Error('Impossible d ouvrir le lien externe.');
  }
};
