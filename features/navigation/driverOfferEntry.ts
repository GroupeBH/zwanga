import type { DriverOfferWithTripRequest, TripRequest } from '@/types';
import { isRequestUnassigned, isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';

/** An offer is a state of its request, never a separate navigation destination. */
export function latestDriverOffer(offers: readonly DriverOfferWithTripRequest[], userId: string) {
  return offers.filter(offer => offer.driverId === userId &&
    offer.tripRequestId === offer.tripRequest?.id && offer.tripRequest.passenger?.id !== userId &&
    ((offer.status === 'pending' && ['pending', 'offers_received'].includes(offer.tripRequest.status)) ||
      (offer.status === 'accepted' && offer.tripRequest.status === 'driver_selected')) &&
    isTripRequestWithinAcceptanceWindow(offer.tripRequest))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.id.localeCompare(b.id))[0];
}

export function isResumableOfferRequest(request: TripRequest, offer: DriverOfferWithTripRequest, userId: string) {
  const accepted = request.status === 'driver_selected' && request.selectedDriverId === userId && !request.tripId;
  return request.id === offer.tripRequestId && request.passengerId !== userId &&
    (isRequestUnassigned(request) || accepted) && isTripRequestWithinAcceptanceWindow(request) &&
    request.offers?.some(item => item.id === offer.id && item.driverId === userId &&
      item.tripRequestId === request.id && item.status === (accepted ? 'accepted' : 'pending')) === true;
}
