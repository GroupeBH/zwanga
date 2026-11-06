import { isInvitationId, parseDriverInvitation } from './driverInvitation';
import { isCounterOfferAlert, isDriverOfferAcceptanceAlert, isRemoteNearbyRequestAlert, isRemoteRequestAcceptanceAlert } from './rideSound';
import { mapDriverAlertGeneration, nearbyRideAlertKey } from './mapDriverAlert';

export type RideAlert = {
  key: string; recipientId: string; kind: 'booking' | 'dispatch' | 'nearby' | 'response'; id: string;
  data: Record<string, unknown>; expiresAt?: string;
};

export function parseRideAlert(data: Record<string, unknown> | undefined): RideAlert | null {
  if (!data) return null;
  // Notifee stores string data; preserve the generation across socket -> card -> restore.
  if (mapDriverAlertGeneration(data)) data = { ...data, mapDriverPriority: 'true' };
  const invitation = parseDriverInvitation(data);
  if (invitation) return { ...invitation, recipientId: invitation.driverId,
    key: `driver-${invitation.kind}-${invitation.id}`, data };
  if (isRemoteNearbyRequestAlert(data)) return { kind: 'nearby', id: data.tripRequestId as string,
    recipientId: data.driverId as string, key: nearbyRideAlertKey(data.tripRequestId as string, mapDriverAlertGeneration(data)), data,
    expiresAt: typeof data.alertExpiresAt === 'string' ? data.alertExpiresAt : undefined };
  const driverAcceptance = isDriverOfferAcceptanceAlert(data);
  const id = driverAcceptance ? data.tripRequestId : data.bookingId ?? data.tripRequestId;
  const recipientId = driverAcceptance ? data.driverId : data.passengerId;
  if (!isRemoteRequestAcceptanceAlert(data) || !isInvitationId(recipientId) || !isInvitationId(id)) return null;
  return { kind: 'response', id, recipientId,
    key: `ride-response-${data.type}-${id}-${isCounterOfferAlert(data) || driverAcceptance ? data.offerId : data.status ?? 'accepted'}`, data,
    ...(isCounterOfferAlert(data) && typeof data.ringUntil === 'string' ? { expiresAt: data.ringUntil } : {}) };
}

/** Match complete route segments, never a prefix or a driver's account role. */
export function isRideResponseOpen(alert: RideAlert, pathname: string): boolean {
  if (alert.kind !== 'response') return false;
  // A price is a decision, not an accepted-ride information message.
  // Its explicit controls (or expiry) acknowledge the alert, not route focus.
  if (isCounterOfferAlert(alert.data)) return false;
  const { tripId, bookingId, tripRequestId } = alert.data;
  return (isInvitationId(tripId) && pathname === `/trip/${tripId}`) ||
    (isInvitationId(bookingId) && pathname === `/booking/navigate/${bookingId}`) ||
    (isInvitationId(tripRequestId) && [`/request-details/${tripRequestId}`, `/request/${tripRequestId}`].includes(pathname));
}
