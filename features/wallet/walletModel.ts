import {
  StoredWalletTopUp,
  DRC_PAYMENT_PHONE_PREFIX,
  DRC_PAYMENT_PHONE_REGEX,
  WALLET_CARD_PAYMENT_RETURN_PATH,
  WALLET_TOP_UP_STORAGE_PREFIX,
  RECENT_PENDING_TOP_UP_MAX_AGE_MS,
} from './walletTypes';
import { Colors } from '@/constants/styles';
import type { SubscriptionPaymentMethod, WalletLedgerEntryType, WalletPaymentResponse } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';

export const TOP_UP_METHOD_OPTIONS: {
  id: SubscriptionPaymentMethod;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'mobile_money',
    label: 'Mobile Money',
    hint: 'M-Pesa, Airtel, Orange',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'card',
    label: 'Carte',
    hint: 'Visa ou Mastercard',
    icon: 'card-outline',
  },
];

export const LEDGER_META: Record<
  WalletLedgerEntryType,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  top_up: { label: 'Recharge', icon: 'add-circle-outline', color: Colors.successDark },
  withdrawal: { label: 'Retrait de jetons achetés', icon: 'cash-outline', color: Colors.danger },
  withdrawal_refund: { label: 'Retrait non effectué : jetons restitués', icon: 'return-down-back-outline', color: Colors.successDark },
  admin_adjustment: { label: 'Ajustement du portefeuille', icon: 'swap-horizontal-outline', color: Colors.gray[700] },
  loyalty_reward: { label: 'Fidélité', icon: 'sparkles-outline', color: Colors.secondaryDark },
  booking_payment: { label: 'Trajet payé', icon: 'car-outline', color: Colors.danger },
  booking_refund: { label: 'Remboursement', icon: 'return-down-back-outline', color: Colors.success },
  booking_fare_adjustment: { label: 'Ajustement trajet', icon: 'swap-horizontal-outline', color: Colors.infoDark },
  subscription_payment: { label: 'Abonnement', icon: 'shield-checkmark-outline', color: Colors.danger },
  subscription_reward: { label: 'Bonus abonnement', icon: 'gift-outline', color: Colors.successDark },
  transfer_out: { label: 'Partage envoyé', icon: 'arrow-up-circle-outline', color: Colors.danger },
  transfer_in: { label: 'Partage reçu', icon: 'arrow-down-circle-outline', color: Colors.successDark },
};

export const formatWalletAmount = (amount?: number | string | null, currency?: string | null) => {
  const numericAmount = Number(amount);
  const isTokenCurrency = !currency || currency.toUpperCase() === 'PTS';
  const displayCurrency = currency || 'PTS';
  if (!Number.isFinite(numericAmount)) return `${amount ?? 0} ${displayCurrency}`;

  const absoluteAmount = Math.abs(numericAmount);
  const formatted =
    absoluteAmount % 1 === 0
      ? Math.round(absoluteAmount).toLocaleString('fr-FR')
      : absoluteAmount.toFixed(2);
  const unit = isTokenCurrency
    ? absoluteAmount === 1
      ? 'jeton'
      : 'jetons'
    : displayCurrency;
  return `${numericAmount < 0 ? '-' : ''}${formatted} ${unit}`;
};

export const formatWalletTokenAmount = (amount?: number | string | null) =>
  formatWalletAmount(amount, 'PTS');

export const formatLedgerDescription = (description: string) =>
  description
    .replace(/\bPoints\b/g, 'Jetons')
    .replace(/\bpoints\b/g, 'jetons')
    .replace(/\bpoint\b/g, 'jeton');

export const getPaymentStatusMessage = (message: string | null | undefined, fallback: string) =>
  getApiErrorMessage({ message }, fallback);

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createWalletCardPaymentRedirectUrls = () => {
  const baseUrl = ExpoLinking.createURL(WALLET_CARD_PAYMENT_RETURN_PATH);
  const separator = baseUrl.includes('?') ? '&' : '?';
  const withStatus = (status: 'success' | 'cancel' | 'decline') =>
    `${baseUrl}${separator}status=${status}`;

  return {
    approveUrl: withStatus('success'),
    cancelUrl: withStatus('cancel'),
    declineUrl: withStatus('decline'),
    returnUrl: baseUrl,
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

export const normalizePaymentMessage = (message?: string | null) =>
  (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const isTopUpSucceeded = (response?: WalletPaymentResponse | null) =>
  response?.payment.status === 'succeeded';

export const isTopUpFailed = (response?: WalletPaymentResponse | null) => {
  const status = normalizePaymentMessage(response?.payment.status);
  const message = normalizePaymentMessage(response?.payment.message);

  return (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'declined' ||
    status === 'rejected' ||
    message.includes('annul') ||
    message.includes('cancel') ||
    message.includes('declined') ||
    message.includes('echec') ||
    message.includes('echoue') ||
    message.includes('failed') ||
    message.includes('refuse') ||
    message.includes('rejet') ||
    message.includes('insufficient') ||
    message.includes('solde insuffisant')
  );
};

export const getStoredTopUpKey = (userId?: string | null) =>
  userId ? `${WALLET_TOP_UP_STORAGE_PREFIX}${userId}` : null;

export const parseStoredTopUp = (value?: string | null): StoredWalletTopUp | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredWalletTopUp>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.orderNumber !== 'string' || !parsed.orderNumber.trim()) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (parsed.paymentMethod !== 'card' && parsed.paymentMethod !== 'mobile_money') return null;

    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() - createdAtMs > RECENT_PENDING_TOP_UP_MAX_AGE_MS) return null;

    const amount = Number(parsed.amount);
    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      createdAt,
      message: typeof parsed.message === 'string' ? parsed.message : null,
      orderNumber: parsed.orderNumber,
      paymentMethod: parsed.paymentMethod,
      paymentUrl: typeof parsed.paymentUrl === 'string' ? parsed.paymentUrl : null,
      userId: parsed.userId,
    };
  } catch {
    return null;
  }
};

export const parsePositiveAmount = (value: string) => {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export const normalizePhone = (value?: string | null) => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('243')) return `+${digits}`;
  if (digits.startsWith('0')) return `${DRC_PAYMENT_PHONE_PREFIX}${digits.slice(1)}`;
  if (digits.length === 9) return `${DRC_PAYMENT_PHONE_PREFIX}${digits}`;
  return value?.trim() ?? '';
};

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const resolveRecipientPayload = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  if (isEmail(trimmedValue)) return { recipientEmail: trimmedValue.toLowerCase() };

  const normalizedPhone = normalizePhone(trimmedValue);
  if (DRC_PAYMENT_PHONE_REGEX.test(normalizedPhone)) return { recipientPhone: normalizedPhone };

  if (isUuidLike(trimmedValue)) return { recipientUserId: trimmedValue };
  return null;
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'Date non disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date non disponible';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};
