import { AppState, Platform } from 'react-native';
import { getNotificationHref } from '@/utils/notificationNavigation';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { parseDriverInvitation, parseDriverResponseResult } from './driverInvitation';
import { isRemoteNearbyRequestAlert } from './rideSound';

type Press = { data: Record<string, unknown>; body?: string | null };
type Pending = Press & { key: string; at: number; session: number };
const MAX_AGE_MS = 60_000;
let pending: Pending | undefined;
let consumed: Pick<Pending, 'key' | 'at' | 'session'> | undefined;
const listeners = new Set<() => void>();

/** Only an actual notification tap may enqueue a destination. Never launch an
 * OS URL from this bridge; iOS already owns foreground activation on a tap. */
export function rememberIosNotificationOpen(data: Record<string, unknown> | undefined, body?: string | null): boolean {
  if (Platform.OS !== 'ios' || !data || parseDriverInvitation(data) ||
      parseDriverResponseResult(data) || isRemoteNearbyRequestAlert(data)) return false;
  const href = getNotificationHref(data);
  if (!href) return false;
  const key = JSON.stringify([data.type, href]);
  const at = Date.now(), session = getTokenSessionVersion();
  const sinceConsumed = consumed ? at - consumed.at : Infinity;
  // Expo and Notifee may report the same deliberate tap. A later tap is allowed.
  if (consumed?.key === key && consumed.session === session && sinceConsumed >= 0 && sinceConsumed < 1000) return true;
  pending = { data: { ...data }, body, key, at, session };
  void Promise.resolve().then(() => { for (const listener of [...listeners]) listener(); });
  return true;
}

/** Authenticated and public-update consumers claim only their own destination.
 * Cold-start taps wait for navigation/profile readiness; nothing is persisted. */
export function subscribeIosNotificationOpen(
  accepts: (data: Record<string, unknown>) => boolean,
  onPress: (press: Press) => void,
): () => void {
  if (Platform.OS !== 'ios') return () => {};
  let disposed = false;
  const flush = () => {
    if (disposed) return;
    const value = pending;
    if (!value) return;
    const age = Date.now() - value.at;
    if (value.session !== getTokenSessionVersion() || age < 0 || age > MAX_AGE_MS) {
      pending = undefined; return;
    }
    if (AppState.currentState !== 'active' || !accepts(value.data)) return;
    pending = undefined;
    consumed = { key: value.key, at: Date.now(), session: value.session };
    onPress(value);
  };
  listeners.add(flush);
  const subscription = AppState.addEventListener('change', flush);
  flush();
  return () => { disposed = true; listeners.delete(flush); subscription.remove(); };
}
