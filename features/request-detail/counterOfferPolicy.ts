import type { TripRequest } from '@/types';

export function counterOfferPrice(input: string): number | null {
  const value = input.trim();
  if (!/^\d{1,7}$/.test(value)) return null;
  const price = Number(value);
  return Number.isSafeInteger(price) && price > 0 && price <= 1000000 ? price : null;
}

export function pendingPriceOffers(request: TripRequest) {
  if (!['pending', 'offers_received'].includes(request.status) || request.selectedDriverId || request.tripId) return [];
  return (request.offers ?? []).filter(offer => offer.status === 'pending' && !offer.existingTripId);
}
