import type { TripRequest } from '@/types';
import { parseRideAlert } from '@/features/notifications/rideAlert';

/** Recover a recent accepted price from the existing REST detail, not a new poll.
 * Use the same event identity/deadlines as push and socket; never replay old sound. */
export function driverOfferAcceptanceAlert(request: TripRequest, userId: string, now = Date.now()) {
  if (request.status !== 'driver_selected' || request.selectedDriverId !== userId ||
      request.passengerId === userId) return null;
  const offer = request.offers?.find(item => item.driverId === userId && item.tripRequestId === request.id && item.status === 'accepted');
  const acceptedAt = Date.parse(offer?.acceptedAt ?? '');
  if (!offer || !Number.isFinite(acceptedAt) || acceptedAt > now + 5000 || now >= acceptedAt + 180_000) return null;
  return parseRideAlert({ type: 'offer_accepted', ringAlert: 'offer-accepted-v1', role: 'driver',
    driverId: userId, passengerId: request.passengerId, tripRequestId: request.id, offerId: offer.id,
    pricePerSeat: offer.pricePerSeat, ringUntil: new Date(acceptedAt + 60_000).toISOString(),
    alertExpiresAt: new Date(acceptedAt + 180_000).toISOString() });
}
