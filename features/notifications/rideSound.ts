import { isInvitationId } from './driverInvitation';

/** These alerts are already displayed by APNs/FCM (unlike headless driver invitations). */
export function isRemoteRequestAcceptanceAlert(data: Record<string, unknown> | undefined): boolean {
  return data?.type === 'trip_request_accepted' && data.ringAlert === 'request-accepted-v1';
}

/** Scheduled request alert: tapping opens details, never authorizes a decision. */
export function isRemoteNearbyRequestAlert(data: Record<string, unknown> | undefined): boolean {
  return data?.type === 'trip_request_nearby' && data.ringAlert === 'nearby-request-v1' &&
    isInvitationId(data.driverId) && isInvitationId(data.tripRequestId);
}
