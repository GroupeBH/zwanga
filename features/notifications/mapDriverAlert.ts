import { isInvitationId } from './driverInvitation';

export type MapDriverAlertGeneration = { offerId: string; expiresAt: string };

/** Only an explicit, server-issued map choice may renew a request's alert. */
export function mapDriverAlertGeneration(data: Record<string, unknown> | undefined): MapDriverAlertGeneration | undefined {
  if (data?.type !== 'trip_request_nearby' ||
      (data.mapDriverPriority !== true && data.mapDriverPriority !== 'true') ||
      !isInvitationId(data.offerId) || typeof data.alertExpiresAt !== 'string' ||
      !Number.isFinite(Date.parse(data.alertExpiresAt))) return;
  return { offerId: data.offerId, expiresAt: data.alertExpiresAt };
}

export function nearbyRideAlertKey(id: string, priority?: MapDriverAlertGeneration) {
  return `driver-nearby-${id}${priority ? `:${priority.offerId}` : ''}`;
}

/** A late copy of the earlier alert cannot reclaim a more recent card. */
export function isNewerMapDriverAlert(next: MapDriverAlertGeneration | undefined, previous: MapDriverAlertGeneration | undefined) {
  return !!next && (!previous || Date.parse(next.expiresAt) > Date.parse(previous.expiresAt));
}
