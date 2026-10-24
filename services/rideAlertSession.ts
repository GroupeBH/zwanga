import type { RideAlert } from '@/features/notifications/rideAlert';
import { isRideResponseOpen } from '@/features/notifications/rideAlert';
import { getTokenSessionVersion } from './tokenSession';
import { isSelfDriverAlert } from '@/features/notifications/requestOwnership';

const alerts = new Map<string, RideAlert>();
// A visible driver notification remains an entry candidate after its SOUND
// window. It never authorizes a decision: entry verifies it against the server.
const entryOnlyAlerts = new Map<string, RideAlert>();
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
  session = getTokenSessionVersion(); alerts.clear(); entryOnlyAlerts.clear(); acknowledged.clear(); recipient = undefined;
}
export function subscribeRideAlerts(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function rememberRideAlert(alert: RideAlert, restoring = false) {
  checkSession();
  if (isSelfDriverAlert(alert.data, alert.recipientId) ||
      acknowledged.has(alert.key) || (recipient && alert.recipientId !== recipient)) return;
  if (alert.expiresAt && (!Number.isFinite(Date.parse(alert.expiresAt)) || Date.parse(alert.expiresAt) <= Date.now())) return;
  // Never start yesterday's sound on launch. An already-playing foreground
  // session, however, remains pending until a decision (or the offer expires).
  const ringUntil = Date.parse(String(alert.data.ringUntil ?? ''));
  if (alert.data.ringUntil !== undefined && !Number.isFinite(ringUntil)) return;
  if (!alerts.has(alert.key) && (!Number.isFinite(ringUntil) ? restoring : ringUntil <= Date.now())) {
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
  while (acknowledged.size > 100) acknowledged.delete(acknowledged.values().next().value!);
  changed();
}
export function setRideAlertScreen(userId: string, path: string) {
  checkSession(); recipient = userId; pathname = path;
  acknowledgeRideAlerts(alert => alert.recipientId === userId && isRideResponseOpen(alert, path));
}
export function clearRideAlertSession() { alerts.clear(); entryOnlyAlerts.clear(); acknowledged.clear(); recipient = undefined; pathname = ''; changed(); }
