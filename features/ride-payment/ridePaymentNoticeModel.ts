import type { Booking, TripPaymentMode } from '@/types';
import type { TripPaymentOptions } from '@/store/api/driverFinanceApi';
import { canChooseCash } from '@/features/arrival-payment/cashFallback';

const labels: Record<TripPaymentMode, string> = { cash: 'Cash', points: 'Jetons', electronic: 'Mobile Money / carte' };
export type RidePaymentNoticeModel = { title: string; detail: string; tone: 'normal' | 'warning' | 'paid' };

export function ridePaymentNotice(booking: Booking, options?: TripPaymentOptions, offline = false): RidePaymentNoticeModel | null {
  if (!['accepted', 'completed'].includes(booking.status)) return null;
  const mode = booking.paymentMode && labels[booking.paymentMode];
  const amount = booking.paymentAmount;
  const free = amount !== null && amount !== undefined && String(amount).trim() !== '' && Number(amount) === 0;
  // An offline snapshot cannot certify settlement or authorize a change to cash.
  if (offline) return { title: mode ? `Paiement prévu · ${mode}` : 'Paiement à confirmer',
    detail: 'Hors connexion · vérifiez le règlement dans Zwanga avant de payer.', tone: 'warning' };
  if (booking.cashReceivedAt || booking.paymentStatus === 'succeeded') return {
    title: `Paiement confirmé${booking.mixedPaymentAt ? ' · Jetons + cash' : mode ? ` · ${mode}` : ''}`,
    detail: 'Rien à payer de nouveau.', tone: 'paid',
  };
  if (booking.paymentStatus === 'initiated') return { title: 'Paiement en cours de vérification',
    detail: 'Ne payez pas une seconde fois, même en cash.', tone: 'warning' };
  if (booking.mixedPaymentAt) return { title: 'Paiement · Jetons + cash',
    detail: 'Jetons débités. Seul le complément cash reste à confirmer.', tone: 'normal' };
  if (free) return { title: 'Trajet gratuit', detail: 'Aucun paiement demandé.', tone: 'paid' };
  if (options?.cashException) return { title: mode ? `Paiement prévu · ${mode}` : 'Paiement à confirmer',
    detail: options.cashException.message, tone: 'warning' };
  if (booking.paymentMode === 'cash') return { title: 'Paiement prévu · Cash',
    detail: 'À remettre à l’arrivée. Le conducteur confirme l’encaissement.', tone: 'normal' };

  const accepted = [...new Set(options?.acceptedPaymentModes ?? [])]
    .filter(value => labels[value] && options?.availablePaymentModes.includes(value));
  const methods = accepted.length ? `Acceptés : ${accepted.map(value => labels[value]).join(' · ')}.` : '';
  const cash = !options ? 'Disponibilité à vérifier dans le paiement.'
    : canChooseCash(options) ? 'Pour passer au cash, choisissez-le dans le paiement.'
    : 'Cash non autorisé actuellement.';
  return { title: mode ? `Paiement prévu · ${mode}` : 'Mode de paiement à confirmer',
    detail: [methods, cash].filter(Boolean).join(' '), tone: options && !canChooseCash(options) ? 'warning' : 'normal' };
}
