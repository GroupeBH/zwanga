import { parseNearbyPhoneAlert } from '@/features/notifications/rideSound';
import { rememberPendingDriverOpen } from '@/features/notifications/pendingDriverOpen';
import { getUserIdFromToken } from '@/utils/jwt';
import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio, reportRideAudioFailure } from './rideAudioDiagnostics';
import { reportNearbyRequestRefusal } from './nearbyRequestRefusal';

export const isNearbyNotificationAction = (id?: string) =>
  id === 'driver-ignore-nearby' || id === 'driver-review-nearby';
const inFlight = new Map<string, Promise<void>>();

/** No exclusive offer exists here. Refusal dismisses only this driver's alert;
 * acceptance opens the existing vehicle/consent flow, never guesses a vehicle. */
export async function handleNearbyNotificationAction(data: Record<string, unknown> | undefined, action?: string) {
  const invitation = parseNearbyPhoneAlert(data);
  if (!invitation || !isNearbyNotificationAction(action)) return;
  const version = getTokenSessionVersion();
  const key = `${version}:${invitation.driverId}:${invitation.id}:${action}`;
  const previous = inFlight.get(key);
  if (previous) return previous;
  const work = (async () => {
    const { getTokens } = await import('./tokenStorage');
    const { accessToken } = await boundedRideAudio(getTokens({ throwOnError: true }));
    if (!accessToken || getUserIdFromToken(accessToken) !== invitation.driverId || version !== getTokenSessionVersion()) return;
    let declined = false;
    if (action === 'driver-ignore-nearby') {
      try {
        await reportNearbyRequestRefusal(invitation.driverId, invitation.id);
        declined = true;
      } catch { reportRideAudioFailure('NEARBY_REFUSAL_SYNC_FAILED'); }
      if (version !== getTokenSessionVersion()) return;
      const { dismissDriverInvitation } = await import('./driverNotifications');
      if (declined) await boundedRideAudio(dismissDriverInvitation(invitation), 3000).catch(() => {});
    }
    if (version !== getTokenSessionVersion()) return;
    rememberPendingDriverOpen({ type: 'driver_action_result', kind: 'nearby', id: invitation.id, driverId: invitation.driverId,
      ...(declined ? { decision: 'decline', confirmed: true } : {}) });
  })();
  inFlight.set(key, work);
  try { await work; } finally { if (inFlight.get(key) === work) inFlight.delete(key); }
}
