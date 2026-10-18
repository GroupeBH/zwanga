import { Colors } from '@/constants/styles';
import type { PaymentHistoryItem, SubscriptionPaymentStatus } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { InteractionManager } from 'react-native';

export type PaymentFilter = 'all' | 'succeeded' | 'pending' | 'failed';

export const FILTERS: { id: PaymentFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'succeeded', label: 'Validés' },
  { id: 'pending', label: 'En cours' },
  { id: 'failed', label: 'Échecs' },
];

export const statusMeta: Record<
  SubscriptionPaymentStatus,
  { label: string; color: string; backgroundColor: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.warningDark,
    backgroundColor: Colors.warning + '18',
  },
  initiated: {
    label: 'Initié',
    color: Colors.infoDark,
    backgroundColor: Colors.info + '14',
  },
  succeeded: {
    label: 'Validé',
    color: Colors.successDark,
    backgroundColor: Colors.success + '16',
  },
  failed: {
    label: 'Échec',
    color: Colors.danger,
    backgroundColor: Colors.danger + '14',
  },
  cancelled: {
    label: 'Annulé',
    color: Colors.gray[700],
    backgroundColor: Colors.gray[200],
  },
};

export const purposeLabels: Record<string, string> = {
  subscription_pro: 'Abonnement Pro',
  trip_booking: 'Réservation trajet',
  wallet_top_up: 'Recharge de jetons',
  wallet_payout: 'Retrait de jetons achetés',
  referral_payout: 'Retrait de gains de parrainage',
  driver_payout: 'Paiement chauffeur',
  generic: 'Paiement',
};

export const methodLabels: Record<string, string> = {
  mobile_money: 'Mobile Money',
  card: 'Carte',
};

export const filterPayment = (payment: PaymentHistoryItem, filter: PaymentFilter) => {
  if (filter === 'all') return true;
  if (filter === 'pending') {
    return payment.status === 'pending' || payment.status === 'initiated';
  }
  if (filter === 'failed') {
    return payment.status === 'failed' || payment.status === 'cancelled';
  }
  return payment.status === filter;
};

export const formatAmount = (amount: number | string, currency?: string | null) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return `${amount} ${currency || 'CDF'}`;
  }

  return `${Math.round(numericAmount).toLocaleString('fr-FR')} ${currency || 'CDF'}`;
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'Non disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non disponible';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getPaymentTitle = (payment: PaymentHistoryItem) =>
  payment.description?.trim() || purposeLabels[payment.purpose] || 'Paiement';

export const sanitizeFileSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'paiement';

export const formatValue = (value?: string | null) => value?.trim() || 'Non disponible';

export const formatPaymentMessage = (message?: string | null) => {
  if (!message?.trim()) return null;
  return getApiErrorMessage(
    { message },
    'Le statut du paiement est indisponible pour le moment.',
  );
};

export const waitForNativePresentation = () =>
  new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, 120);
    });
  });

export const getPaymentDetailRows = (payment: PaymentHistoryItem) => {
  const meta = statusMeta[payment.status];

  return [
    { label: 'Paiement', value: getPaymentTitle(payment) },
    { label: 'Montant', value: formatAmount(payment.amount, payment.currency) },
    { label: 'Statut', value: meta?.label ?? payment.status },
    { label: 'Type', value: purposeLabels[payment.purpose] || payment.purpose },
    { label: 'Méthode', value: methodLabels[payment.method] ?? payment.method },
    { label: 'Prestataire', value: payment.provider },
    { label: 'Référence Zwanga', value: payment.reference },
    { label: 'Référence prestataire', value: formatValue(payment.orderNumber) },
    { label: 'Référence opérateur', value: formatValue(payment.providerReference) },
    { label: 'Code statut', value: formatValue(payment.statusCode) },
    { label: 'Téléphone', value: formatValue(payment.phone) },
    { label: 'Message', value: formatValue(formatPaymentMessage(payment.message)) },
    { label: 'Créé le', value: formatDate(payment.createdAt) },
    { label: 'Mis à jour le', value: formatDate(payment.updatedAt) },
    { label: 'Validé le', value: formatDate(payment.paidAt) },
    { label: 'Identifiant', value: payment.id },
  ];
};
