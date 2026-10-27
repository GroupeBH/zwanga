import { ridePlaybackDeadline } from '@/features/notifications/ridePlaybackDeadline';
import type { RideAlert } from '@/features/notifications/rideAlert';
import { isRideResponseOpen } from '@/features/notifications/rideAlert';
import { getTokenSessionVersion } from './tokenSession';
import { isSelfDriverAlert } from '@/features/notifications/requestOwnership';

const alerts = new Map<string, RideAlert>();
// A visible driver notification remains an entry candidate after its SOUND
// window. It never authorizes a decision: entry verifies it against the server.
const entryOnlyAlerts = new Map<string, RideAlert>();
type RideAlertHandoff = { alert: RideAlert; until: number; attempts: number; retryAt: number };
// A native cancellation may finish during unlock/background transitions. Keep
// its fresh event separately, without authorizing audio before cancellation.
const handoffs = new Map<string, RideAlertHandoff>();
const acknowledged = new Set<string>();
const listeners = new Set<() => void>();
let session = getTokenSessionVersion();
let recipient: string | undefined;
let pathname = '';
let revision = 0;
export const getRideAlertsRevision = () => revision;
function changed() { revision++; listeners.forEach(listener => listener()); }
function checkSession() {
  if (session === getTokenSessionVersion()) return;
  session = getTokenSessionVersion(); alerts.clear(); entryOnlyAlerts.clear(); handoffs.clear(); acknowledged.clear(); recipient = undefined;
}
export function subscribeRideAlerts(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function rememberRideAlert(alert: RideAlert, restoring = false) {
  storeRideAlert(alert, restoring);
}
function canRemember(alert: RideAlert) {
  return !isSelfDriverAlert(alert.data, alert.recipientId) && !acknowledged.has(alert.key) &&
    (!recipient || alert.recipientId === recipient) &&
    (!alert.expiresAt || (Number.isFinite(Date.parse(alert.expiresAt)) && Date.parse(alert.expiresAt) > Date.now()));
}
function storeRideAlert(alert: RideAlert, restoring = false, handedOff = false) {
  checkSession();
  if (!canRemember(alert)) return;
  // Never start yesterday's sound on launch. An already-playing foreground
  // session, however, remains pending until a decision (or the offer expires).
  const ringUntil = ridePlaybackDeadline(alert.data);
  if (alert.data.ringUntil !== undefined && !Number.isFinite(ringUntil)) return;
  if (!handedOff && !alerts.has(alert.key) && (!Number.isFinite(ringUntil) ? restoring : ringUntil <= Date.now())) {
    if (restoring && alert.kind !== 'response' && !entryOnlyAlerts.has(alert.key)) {
      if (entryOnlyAlerts.size >= 50) entryOnlyAlerts.delete(entryOnlyAlerts.keys().next().value!);
      entryOnlyAlerts.set(alert.key, alert); changed();
    }
    return;
  }
  if (recipient && isRideResponseOpen(alert, pathname)) { acknowledgeRideAlerts(a => a.key === alert.key, alert); return; }
  if (!alerts.has(alert.key)) {
    if (alerts.size >= 50) alerts.delete(alerts.keys().next().value!);
    entryOnlyAlerts.delete(alert.key);
    alerts.set(alert.key, alert); changed();
  }
}
/** Three attempts in 30 seconds, in memory only. Never renew a sound deadline
 * from a duplicate or start a handoff for an already stale notification. */
export function pendingRideAlertHandoffs(userId: string) {
  checkSession();
  for (const [key, handoff] of handoffs)
    if (handoff.until <= Date.now() || !canRemember(handoff.alert)) handoffs.delete(key);
  return [...handoffs.values()].filter(item => item.alert.recipientId === userId);
}
export function beginRideAlertHandoff(alert: RideAlert): RideAlertHandoff | undefined {
  pendingRideAlertHandoffs(alert.recipientId);
  if (!canRemember(alert)) return;
  let handoff = handoffs.get(alert.key);
  if (!handoff) {
    const ringUntil = ridePlaybackDeadline(alert.data);
    if (!alerts.has(alert.key) && !(ringUntil > Date.now())) return;
    handoff = { alert, until: Date.now() + 30000, attempts: 0, retryAt: 0 };
    if (handoffs.size >= 50) handoffs.delete(handoffs.keys().next().value!);
    handoffs.set(alert.key, handoff);
  }
  if (handoff.attempts >= 3 || handoff.retryAt > Date.now()) return;
  handoff.attempts++; handoff.retryAt = Date.now() + 3000;
  changed();
  return handoff;
}
export function completeRideAlertHandoff(handoff: RideAlertHandoff) {
  pendingRideAlertHandoffs(handoff.alert.recipientId);
  if (handoffs.get(handoff.alert.key) !== handoff) return;
  handoffs.delete(handoff.alert.key);
  storeRideAlert(handoff.alert, false, true);
}
export function pendingRideAlerts(userId: string): RideAlert[] {
  checkSession();
  for (const [key, alert] of alerts) if (alert.expiresAt && Date.parse(alert.expiresAt) <= Date.now()) alerts.delete(key);
  return [...alerts.values()].filter(alert => alert.recipientId === userId);
}
/** Routing only. Never pass these candidates to the sound or speech player. */
export function pendingRideEntryAlerts(userId: string): RideAlert[] {
  const audible = pendingRideAlerts(userId);
  for (const [key, alert] of entryOnlyAlerts)
    if (alert.expiresAt && Date.parse(alert.expiresAt) <= Date.now()) entryOnlyAlerts.delete(key);
  return [...audible, ...[...entryOnlyAlerts.values()].reverse().filter(alert => alert.recipientId === userId)];
}
export function acknowledgeRideAlerts(match: (alert: RideAlert) => boolean, extra?: RideAlert) {
  checkSession();
  if (extra) acknowledged.add(extra.key);
  for (const [key, alert] of alerts) if (match(alert)) { alerts.delete(key); acknowledged.add(key); }
  for (const [key, alert] of entryOnlyAlerts) if (match(alert)) { entryOnlyAlerts.delete(key); acknowledged.add(key); }
  for (const [key, handoff] of handoffs) if (match(handoff.alert)) { handoffs.delete(key); acknowledged.add(key); }
  while (acknowledged.size > 100) acknowledged.delete(acknowledged.values().next().value!);
  changed();
}
export function setRideAlertScreen(userId: string, path: string) {
  checkSession(); recipient = userId; pathname = path;
  acknowledgeRideAlerts(alert => alert.recipientId === userId && isRideResponseOpen(alert, path));
}
export function clearRideAlertSession() { alerts.clear(); entryOnlyAlerts.clear(); handoffs.clear(); acknowledged.clear(); recipient = undefined; pathname = ''; changed(); }
