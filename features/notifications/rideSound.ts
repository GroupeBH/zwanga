import { isInvitationId } from './driverInvitation';

export type NearbyPhoneAlert = { kind: 'nearby'; id: string; driverId: string; ringUntil: string; expiresAt?: string };

/** Only v3 Android data-only pushes are locally displayed; never replay a remote v2 alert. */
export function parseNearbyPhoneAlert(data: Record<string, unknown> | undefined): NearbyPhoneAlert | null {
  if (!isRemoteNearbyRequestAlert(data) || data?.delivery !== 'driver-phone-v3' ||
      typeof data.ringUntil !== 'string' || !Number.isFinite(Date.parse(data.ringUntil))) return null;
  return { kind: 'nearby', id: data.tripRequestId as string, driverId: data.driverId as string, ringUntil: data.ringUntil };
}

/** These alerts are already displayed by APNs/FCM (unlike headless driver invitations). */
export function isRemoteRequestAcceptanceAlert(data: Record<string, unknown> | undefined): boolean {
  return data?.type === 'trip_request_accepted' && data.ringAlert === 'request-accepted-v1';
}

/** Scheduled request family (remote v2, Android headless v3): never authorizes a decision. */
export function isRemoteNearbyRequestAlert(data: Record<string, unknown> | undefined): boolean {
  return data?.type === 'trip_request_nearby' && data.ringAlert === 'nearby-request-v1' &&
    isInvitationId(data.driverId) && isInvitationId(data.tripRequestId);
}
