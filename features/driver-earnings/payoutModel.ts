import type { DriverPayout } from '@/types';
import { getErrorStatus, isAmbiguousTransportError } from '@/utils/errorHelpers';

export const PAYOUT_PENDING_MESSAGE = 'Zwanga vérifie le versement de vos gains vers votre Mobile Money. Aucun paiement ne vous est demandé.';
export const PAYOUT_REVIEW_MESSAGE = 'La confirmation n’est pas encore disponible. Le montant reste réservé pour éviter un double versement. Contactez l’assistance avec la référence ci-dessous.';

export function normalizePayoutPhone(value?: string | null): string | null {
  let phone = (value ?? '').trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  else if (phone.startsWith('00243')) phone = phone.slice(2);
  else if (/^0\d{9}$/.test(phone)) phone = `243${phone.slice(1)}`;
  else if (/^[89]\d{8}$/.test(phone)) phone = `243${phone}`;
  return /^243\d{9}$/.test(phone) ? `+${phone}` : null;
}

export function isPayoutPending(payout: Pick<DriverPayout, 'status'>): boolean {
  return payout.status === 'pending' || payout.status === 'initiated';
}

export function isPayoutOutcomeUncertain(error: unknown): boolean {
  const status = getErrorStatus(error);
  return isAmbiguousTransportError(error) || status === 'PARSING_ERROR' ||
    typeof status !== 'number' || status >= 500;
}

function describeRefusal(value?: string | null): string {
  const message = (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/solde chauffeur|minimum|solde conducteur/.test(message)) return 'Le montant demandé dépasse le solde disponible ou ne respecte pas le minimum. Actualisez vos revenus.';
  if (/identite|kyc/.test(message)) return 'Votre identité doit être vérifiée avant le versement de vos gains.';
  if (/numero|telephone|phone/.test(message) && /invalid|incomplet|requis/.test(message)) return 'Vérifiez le numéro Mobile Money choisi pour ce versement (par exemple 0891234567).';
  if (/solde|insufficient|insuffisant|balance|zwanga ne peut/.test(message)) return 'Zwanga ne peut pas effectuer ce versement pour le moment. Vos gains sont conservés. Contactez l’assistance.';
  if (/token|merchant|marchand|configur|indisponible|unauthoriz|forbidden/.test(message)) return 'Le service de versement Zwanga est indisponible. Contactez l’assistance si le problème persiste.';
  return 'Le versement n’a pas abouti. Vérifiez que votre numéro possède un compte Mobile Money actif, ou contactez l’assistance.';
}

export function getPayoutMessage(payout: DriverPayout): string {
  if (payout.status === 'succeeded') return 'Zwanga a versé vos gains sur votre compte Mobile Money.';
  if (payout.status === 'cancelled') return 'Versement annulé. Le montant est à nouveau disponible dans vos revenus.';
  if (isPayoutPending(payout)) return payout.requiresReview || !payout.orderNumber ? PAYOUT_REVIEW_MESSAGE : PAYOUT_PENDING_MESSAGE;
  return describeRefusal(payout.paymentMessage ?? payout.failureReason);
}

export function getPayoutErrorMessage(error: unknown): string {
  if (isPayoutOutcomeUncertain(error)) return 'La réponse n’a pas pu être confirmée. Vérifiez cette même demande avant de lancer un autre versement.';
  const status = getErrorStatus(error);
  if (status === 401) return 'Reconnectez-vous pour vérifier votre demande de versement.';
  if (status === 429) return 'Trop de tentatives. Patientez un instant avant de vérifier votre demande.';
  const data = (error as { data?: { message?: unknown } })?.data;
  return describeRefusal(typeof data?.message === 'string' ? data.message : null);
}

export const formatAmount = (value?: number | string | null, currency = 'CDF') => {
  const amount = Number(value ?? 0);
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)} ${currency}`;
};

export const formatDate = (value?: string | null) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date indisponible';
};

export const maskPhone = (value?: string | null) => {
  if (!value) return 'numéro du profil';
  const phone = value.trim();
  return phone.length > 8 ? `${phone.slice(0, 5)}•••${phone.slice(-4)}` : phone;
};
