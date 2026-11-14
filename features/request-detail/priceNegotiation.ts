import type { DriverOffer } from '@/types';

export function negotiationActions(offer: DriverOffer, actor: 'driver' | 'passenger') {
  const pending = offer.status === 'pending' && !offer.existingTripId;
  return {
    counter: pending && actor === 'passenger' && offer.negotiationStage === 'driver_initial',
    final: pending && actor === 'driver' && offer.negotiationStage === 'passenger_counter',
    accept: pending && (actor === 'driver' ? offer.negotiationStage === 'passenger_counter' : offer.negotiationStage !== 'passenger_counter'),
  };
}

export type PriceAlternatives = { requestId: string; offerId: string; generatedAt: string; radiusKm: number;
  recent: number; older: number; truncated: boolean };

export function alternativesMessage(data: PriceAlternatives | undefined, requestId: string, offerId: string, now = Date.now()) {
  if (!data || data.requestId !== requestId || data.offerId !== offerId ||
      !Number.isFinite(Date.parse(data.generatedAt)) || Math.abs(now - Date.parse(data.generatedAt)) > 90000 ||
      !Number.isInteger(data.recent) || data.recent < 0 || !Number.isInteger(data.older) || data.older < 0 ||
      !Number.isFinite(data.radiusKm) || data.radiusKm <= 0) return 'Disponibilité des autres conducteurs inconnue pour le moment.';
  if (data.recent > 0) return `${data.truncated ? 'Au moins ' : ''}${data.recent} autre${data.recent > 1 ? 's' : ''} conducteur${data.recent > 1 ? 's' : ''} repéré${data.recent > 1 ? 's' : ''} récemment à moins de ${data.radiusKm} km. Leur accord n’est pas garanti.`;
  return data.older > 0 ? 'D’autres positions sont connues, mais anciennes. Trouver un autre conducteur peut prendre du temps.'
    : 'Aucun autre conducteur repéré autour du départ. La recherche peut prendre du temps.';
}
