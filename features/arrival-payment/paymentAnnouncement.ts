import type { PaymentCompletionSummary } from './paymentTypes';
import type { DriverPaymentNotice } from '@/features/driver-payments/paymentNoticeModel';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';

function spokenMoney(amount: number | null | undefined, currency: string) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  const unit = currency.toUpperCase() === 'CDF' ? 'francs congolais' : currency.toUpperCase() === 'USD' ? 'dollars' : null;
  return unit ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(amount)} ${unit}` : null;
}
function message(role: string, id: string, phase: string, amount: number | null, currency: string, text: string): RideEntryMessage {
  return { key: `payment:${role}:${id}:${phase}:${amount}:${currency}`, text };
}

export function passengerPaymentAnnouncement({ bookingId, amount, currency, receipt, pending, failed, beforeArrival }: {
  bookingId?: string; amount: number | null; currency: string; receipt?: PaymentCompletionSummary | null;
  pending: boolean; failed: boolean; beforeArrival: boolean;
}): RideEntryMessage | null {
  const id = receipt?.bookingId ?? bookingId;
  if (!id) return null;
  if (receipt) {
    const value = receipt.cashInstructions ? receipt.cashRemainder ?? receipt.amount : receipt.amount;
    const money = spokenMoney(value, receipt.currency);
    if (!money) return null;
    const text = receipt.cashInstructions
      ? `${receipt.mixedTokenAmount ? 'La part en jetons est réglée. ' : ''}Remettez ${money} en espèces au conducteur${receipt.beforeArrival ? ' à l’arrivée' : ''}. Il confirmera la réception.`
      : receipt.amount === 0 ? 'Ce trajet est gratuit. Vous n’avez rien à payer.'
      : `Paiement de ${money} confirmé. Vous n’avez rien à payer de nouveau.`;
    return message('passenger', id, receipt.cashInstructions ? 'cash-due' : 'paid', value, receipt.currency, text);
  }
  if (pending) return message('passenger', id, 'pending', amount, currency,
    'Votre paiement reste à vérifier. Ne payez pas une deuxième fois. Suivez les indications affichées.');
  if (failed) return message('passenger', id, 'error', amount, currency,
    'Le paiement n’est pas confirmé. Consultez les indications affichées pour continuer.');
  const money = spokenMoney(amount, currency);
  return money ? message('passenger', id, 'due', amount, currency,
    `${beforeArrival ? 'Vous pouvez préparer votre paiement. ' : ''}Le montant à régler est de ${money}. Choisissez votre moyen de paiement sur l’écran.`) : null;
}

export function driverPaymentAnnouncement(notice: Pick<DriverPaymentNotice, 'bookingId' | 'amount' | 'currency' | 'mode' | 'partial' | 'cashRemainder'> | null,
  cashReceived = false): RideEntryMessage | null {
  if (!notice) return null;
  const money = spokenMoney(notice.amount, notice.currency);
  if (!money) return null;
  if (notice.partial) {
    const rest = spokenMoney(notice.cashRemainder, notice.currency);
    return rest ? message('driver', notice.bookingId, 'partial', notice.amount, notice.currency,
      `${money} reçus en jetons Zwanga. Il reste ${rest} à recevoir en espèces.`) : null;
  }
  const cash = notice.mode === 'cash';
  return message('driver', notice.bookingId, cash && !cashReceived ? 'cash-due' : 'paid', notice.amount, notice.currency,
    cash ? cashReceived ? `Réception de ${money} en espèces confirmée.`
      : `Le passager doit vous remettre ${money} en espèces. Confirmez seulement après avoir reçu l’argent.`
      : `Le paiement d’un passager de ${money} est confirmé${notice.mode === 'points' ? ' en jetons Zwanga' : ''}. Ne lui demandez pas de payer de nouveau.`);
}
