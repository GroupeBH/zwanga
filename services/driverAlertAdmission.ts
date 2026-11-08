import { parseRideAlert } from '@/features/notifications/rideAlert';
import { getUserIdFromToken, isTokenExpired } from '@/utils/jwt';
import { beginRideAlertHandoff, discardRideAlertHandoff } from './rideAlertSession';
import { boundedRideAudio } from './rideAudioDiagnostics';
import { checkRideRing, refreshRideRingValidation } from './rideRingValidation';
import { dismissDriverAlertFallback } from './driverAlertFallback';
import { getTokenSessionVersion } from './tokenSession';
import { getTokens } from './tokenStorage';

/** An unavailable check is retryable, never permission to sound. Reuse the
 * bounded, session-scoped handoff queue rather than starting another player. */
export async function admitDriverAlert(data: Record<string, unknown>, userId: string, renew = false) {
  const version = getTokenSessionVersion();
  const verdict = await (renew ? refreshRideRingValidation(data) : checkRideRing(data));
  if (version !== getTokenSessionVersion()) return false;
  if (verdict === 'allowed') return true;
  const alert = parseRideAlert(data);
  if (verdict === 'unavailable') {
    const { refreshToken } = await boundedRideAudio(getTokens({ throwOnError: true })).catch(() => ({ refreshToken: null }));
    if (version === getTokenSessionVersion() && refreshToken && !isTokenExpired(refreshToken) &&
        getUserIdFromToken(refreshToken) === userId && alert?.recipientId === userId)
      beginRideAlertHandoff(alert);
    // Preserve any existing OS card while the network is unavailable.
  } else {
    if (alert) discardRideAlertHandoff(alert.key);
    await dismissDriverAlertFallback(data);
  }
  return false;
}
