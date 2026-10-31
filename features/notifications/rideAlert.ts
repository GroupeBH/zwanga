import { isInvitationId, parseDriverInvitation } from './driverInvitation';
import { isRemoteNearbyRequestAlert, isRemoteRequestAcceptanceAlert } from './rideSound';
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
  const id = data.bookingId ?? data.tripRequestId;
  if (!isRemoteRequestAcceptanceAlert(data) || !isInvitationId(data.passengerId) || !isInvitationId(id)) return null;
  return { kind: 'response', id, recipientId: data.passengerId,
    key: `ride-response-${data.type}-${id}-${data.status ?? 'accepted'}`, data };
}

/** Match complete route segments, never a prefix or a driver's account role. */
export function isRideResponseOpen(alert: RideAlert, pathname: string): boolean {
  if (alert.kind !== 'response') return false;
  const { tripId, bookingId, tripRequestId } = alert.data;
  return (isInvitationId(tripId) && pathname === `/trip/${tripId}`) ||
    (isInvitationId(bookingId) && pathname === `/booking/navigate/${bookingId}`) ||
    (isInvitationId(tripRequestId) && [`/request-details/${tripRequestId}`, `/request/${tripRequestId}`].includes(pathname));
}
