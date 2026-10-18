import type { LocationObject } from 'expo-location';
import { getTokens } from './tokenStorage';
import { getTokenSessionVersion } from './tokenSession';
import { decodeJWT } from '@/utils/jwt';
import { shouldSendNearbyDriverPosition } from './nearbyDriverLocationPolicy';
import { getRtkErrorStatus } from './background/driverTrackingErrors';

let scope = '';
let previous: LocationObject | null = null;
let sentAt = -Infinity;
let retryAt = -Infinity;
let failures = 0;
let busy = false;

/** Shared by foreground and native callbacks. No disk queue or location history. */
export async function sendNearbyDriverPosition(userId: string, position: LocationObject,
  isCurrent: () => boolean = () => true): Promise<'sent' | 'skipped' | 'stop'> {
  if (busy || !isCurrent()) return 'skipped';
  const version = getTokenSessionVersion();
  const key = `${version}:${userId}`;
  if (scope !== key) {
    scope = key; previous = null; sentAt = retryAt = -Infinity; failures = 0;
  }
  if (Date.now() < retryAt || !shouldSendNearbyDriverPosition(previous, position, sentAt)) return 'skipped';
  busy = true;
  const current = () => isCurrent() && version === getTokenSessionVersion();
  try {
    const { accessToken } = await getTokens({ throwOnError: true });
    if (!current()) return 'skipped';
    const claims = accessToken ? decodeJWT(accessToken) : null;
    if ((claims?.sub ?? claims?.userId) !== userId) return 'stop';
    // Existing authenticated transport refreshes tokens, enforces timeouts and ownership.
    const [{ store }, { driverDispatchApi }] = await Promise.all([import('@/store'), import('@/store/api/driverDispatchApi')]);
    if (!current() || !shouldSendNearbyDriverPosition(previous, position, sentAt)) return 'skipped';
    const request = store.dispatch(driverDispatchApi.endpoints.recordDriverPosition.initiate({
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy!, recordedAt: new Date(position.timestamp).toISOString(),
    }));
    try {
      const data = await request.unwrap();
      if (!current()) return 'skipped';
      if (!data.enabled || !data.automatic) return 'stop';
      previous = position; sentAt = Date.now(); failures = 0; retryAt = -Infinity;
      return 'sent';
    } finally { request.reset(); }
  } catch (error) {
    if (!current()) return 'skipped';
    const status = getRtkErrorStatus(error);
    if (status === 401 || status === 403 || status === 404) return 'stop';
    // Network outage/429: discard the fix and await a fresh one, with bounded backoff.
    retryAt = Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(failures++, 4));
    return 'skipped';
  } finally { busy = false; }
}
