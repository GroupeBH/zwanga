import { isInvitationId } from '@/features/notifications/driverInvitation';
import { getUserIdFromToken } from '@/utils/jwt';
import { getTokenSessionVersion } from './tokenSession';
import { boundedRideAudio } from './rideAudioDiagnostics';

const inFlight = new Map<string, Promise<void>>();

/** Only called by a deliberate refusal. Never count merely opening/leaving a screen. */
export async function reportNearbyRequestRefusal(userId: string, requestId: string): Promise<void> {
  if (!isInvitationId(userId) || !isInvitationId(requestId)) throw new Error('Commande invalide.');
  const version = getTokenSessionVersion();
  const key = `${version}:${userId}:${requestId}`;
  const previous = inFlight.get(key);
  if (previous) return previous;
  const work = (async () => {
    const { getTokens } = await import('./tokenStorage');
    const { accessToken } = await boundedRideAudio(getTokens({ throwOnError: true }));
    if (!accessToken || getUserIdFromToken(accessToken) !== userId || version !== getTokenSessionVersion()) throw new Error('Session expirée. Reconnectez-vous.');
    const [{ store }, { driverDispatchApi }] = await Promise.all([import('@/store'), import('@/store/api/driverDispatchApi')]);
    if (version !== getTokenSessionVersion()) throw new Error('Session expirée. Reconnectez-vous.');
    const request = store.dispatch(driverDispatchApi.endpoints.declineNearbyRequest.initiate(requestId));
    try { await request.unwrap(); } finally { request.reset(); }
    if (version !== getTokenSessionVersion()) throw new Error('Session expirée. Reconnectez-vous.');
  })();
  inFlight.set(key, work);
  try { await work; } finally { if (inFlight.get(key) === work) inFlight.delete(key); }
}
