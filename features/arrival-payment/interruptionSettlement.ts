import type { Booking } from '@/types';

/** Presentation only: the server owns the distance calculation, minimum and subsidy. */
export function getInterruptionDistanceLabel(booking: Booking): string | null {
  const travelled = booking.travelledDistanceMeters;
  const planned = booking.plannedDistanceMeters;
  if (!booking.interruptionFareLocked || typeof travelled !== 'number' ||
      !Number.isFinite(travelled) || travelled < 0) return null;
  const km = (meters: number) => (meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return typeof planned === 'number' && Number.isFinite(planned) && planned > 0
    ? `${km(travelled)} km parcourus sur ${km(planned)} km prévus`
    : `${km(travelled)} km parcourus`;
}

export function getDriverInterruptionSettlementMessage(booking: Booking): string {
  const distance = getInterruptionDistanceLabel(booking);
  const prefix = distance ? `${distance}.\n\n` : '';
  // Missing/invalid amounts must never become a fictitious free ride or the full trip price.
  const amount = booking.paymentAmount == null || booking.paymentAmount === '' ? NaN : Number(booking.paymentAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return `${prefix}La descente est confirmée. Le montant à régler n’est pas encore disponible. Consultez la réservation après actualisation.`;
  }
  if (amount === 0) return `${prefix}Aucun montant à demander au passager : ce trajet est gratuit pour lui.`;
  const formatted = `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${booking.paymentCurrency || 'CDF'}`;
  if (booking.paymentStatus === 'succeeded') {
    return `${prefix}Montant du trajet effectué : ${formatted}.\nPaiement déjà réglé${booking.paymentMode === 'points' ? ' en jetons' : ''}. Ne demandez pas ce montant une seconde fois au passager.`;
  }
  if (booking.paymentMode === 'cash') {
    return `${prefix}À recevoir du passager en cash : ${formatted}.\nLa descente est confirmée, mais cela ne confirme pas la remise de l’argent.`;
  }
  return `${prefix}Montant à régler par le passager : ${formatted}.\n${booking.paymentMode === 'points' ? 'Paiement en jetons' : booking.paymentMode === 'electronic' ? 'Paiement électronique' : 'Paiement'} en attente dans son application. Ce montant n’est pas encore confirmé comme payé.`;
}
