import type { TripRequest } from '@/types';
import { parseRideAlert } from '@/features/notifications/rideAlert';
import { pendingPriceOffers } from './counterOfferPolicy';

/** Reconstruct only server-confirmed pending prices, with the push identity.
 * Reading again never extends either the sound or the decision deadline. */
export function passengerOfferAlerts(request: TripRequest, userId: string, readStartedAt: number, now = Date.now()) {
  if (request.passengerId !== userId || !Number.isFinite(readStartedAt) || readStartedAt > now) return [];
  const window = request.responseWindow;
  if (window && window.phase !== 'passenger') return [];
  const serverNow = window ? Date.parse(window.serverNow) : now;
  if (!Number.isFinite(serverNow)) return [];
  const offset = window ? readStartedAt - serverNow : 0;
  return pendingPriceOffers(request).flatMap(offer => {
    const created = Date.parse(offer.createdAt);
    const expires = Math.min(Date.parse(request.departureDateMax),
      window ? Date.parse(window.expiresAt) : created + 120_000) + offset;
    const ringUntil = Math.min(created + offset + 60_000, expires);
    if (!Number.isFinite(created) || created > serverNow + 5000 || !Number.isFinite(expires) || expires <= now) return [];
    const alert = parseRideAlert({ type: 'driver_offer', ringAlert: 'counter-offer-v1', role: 'passenger',
      passengerId: userId, driverId: offer.driverId, tripRequestId: request.id, offerId: offer.id,
      pricePerSeat: offer.pricePerSeat, numberOfSeats: request.numberOfSeats, ringUntil: new Date(ringUntil).toISOString(),
      alertExpiresAt: new Date(expires).toISOString() });
    return alert ? [alert] : [];
  });
}
