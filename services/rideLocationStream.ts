import * as Location from 'expo-location';
import { isAppActive, subscribeAppActivity } from './appActivity';
import { BOARDING_LOCATION_MAX_AGE_MS } from '@/constants/rideProgress';
import { warnThrottled } from '@/utils/throttledWarning';

type Listener = (location: Location.LocationObject) => void;
type Channel = {
  listeners: Set<Listener>;
  options: Location.LocationOptions;
  lastNativeAt: number;
  generation: number;
  starting: boolean;
  retryAt: number;
  fallback: Location.LocationSubscription | null;
  nativeSilenceMs: number;
};

// Native tasks remain the GPS source, including while the app is visible. Screens only
// open a shared foreground watcher if that source is silent or unavailable.
const channels = new Map<string, Channel>();
const NATIVE_SILENCE_MS = BOARDING_LOCATION_MAX_AGE_MS - 2000;
let watchdog: ReturnType<typeof setInterval> | null = null;
let watchdogInterval = 0;
let unsubscribeActivity: (() => void) | null = null;
// One nearby source only, scoped to its account and cleared on native stop/logout.
let nearbySample: { key: string; location: Location.LocationObject } | null = null;

function checkChannels() { channels.forEach((channel, key) => reconcile(key, channel)); }
function syncActivity() {
  checkChannels();
  const interval = Math.min(...Array.from(channels.values(), channel => channel.nativeSilenceMs >= 60_000 ? 15_000 : 2000));
  if (watchdog && (!isAppActive() || interval !== watchdogInterval)) { clearInterval(watchdog); watchdog = null; }
  if (isAppActive() && channels.size && !watchdog) {
    watchdogInterval = interval; watchdog = setInterval(checkChannels, interval);
  }
}

function deliver(channel: Channel, location: Location.LocationObject) {
  if (!isAppActive()) return;
  channel.listeners.forEach((listener) => {
    try { listener(location); }
    catch (error) { warnThrottled('[RideLocation] Réception GPS interrompue :', error); }
  });
}

function stopFallback(channel: Channel) {
  channel.generation += 1;
  channel.starting = false;
  channel.fallback?.remove();
  channel.fallback = null;
}

function reconcile(key: string, channel: Channel) {
  if (!isAppActive() || Date.now() - channel.lastNativeAt < channel.nativeSilenceMs) {
    if (channel.fallback || channel.starting) stopFallback(channel);
    return;
  }
  if (channel.fallback || channel.starting || Date.now() < channel.retryAt) return;
  channel.starting = true;
  const generation = ++channel.generation;
  void Location.watchPositionAsync(channel.options, (location) => {
    if (channels.get(key) === channel && channel.generation === generation) deliver(channel, location);
  }).then((subscription) => {
    if (channels.get(key) !== channel || generation !== channel.generation || !isAppActive()) {
      subscription.remove();
      return;
    }
    channel.starting = false;
    channel.fallback = subscription;
  }).catch((error) => {
    if (channels.get(key) !== channel || generation !== channel.generation) return;
    channel.starting = false;
    channel.retryAt = Date.now() + 15_000;
    warnThrottled('[RideLocation] Suivi GPS de secours indisponible :', error);
  });
}

/** Publish before awaiting network I/O so a slow connection cannot freeze the map. */
export function publishNativeRideLocation(key: string, location: Location.LocationObject) {
  const channel = channels.get(key);
  const age = Date.now() - location.timestamp;
  if (!Number.isFinite(age) || age < -5000 || age >= Math.min(channel?.nativeSilenceMs ?? 30_000, 30_000)) return;
  if (!Number.isFinite(location.coords.latitude) || !Number.isFinite(location.coords.longitude)) return;
  if (key.startsWith('nearby:')) nearbySample = { key, location };
  if (!channel) return;
  channel.lastNativeAt = Math.max(channel.lastNativeAt, Math.min(Date.now(), location.timestamp));
  if (channel.fallback || channel.starting) stopFallback(channel);
  deliver(channel, location);
}

export function subscribeRideLocation(
  key: string,
  options: Location.LocationOptions,
  listener: Listener,
  nativeSilenceMs = NATIVE_SILENCE_MS,
): Location.LocationSubscription {
  let channel = channels.get(key);
  if (!channel) {
    channel = { listeners: new Set(), options, nativeSilenceMs, lastNativeAt: -Infinity, generation: 0, starting: false, retryAt: 0, fallback: null };
    if (nearbySample?.key === key && Date.now() - nearbySample.location.timestamp < nativeSilenceMs) {
      channel.lastNativeAt = Math.min(Date.now(), nearbySample.location.timestamp);
    }
    channels.set(key, channel);
  }
  const current = channel;
  current.listeners.add(listener);
  if (nearbySample?.key === key && Date.now() - nearbySample.location.timestamp < nativeSilenceMs && isAppActive()) {
    listener(nearbySample.location);
  }
  if (!unsubscribeActivity) unsubscribeActivity = subscribeAppActivity(syncActivity);
  syncActivity();
  let removed = false;
  return { remove() {
    if (removed) return;
    removed = true;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      stopFallback(current);
      channels.delete(key);
    }
    if (channels.size === 0) {
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
      unsubscribeActivity?.();
      unsubscribeActivity = null;
    } else syncActivity();
  } };
}

/** An explicit native stop releases its foreground consumers immediately. */
export function invalidateNativeRideLocation(key: string) {
  if (nearbySample?.key === key) nearbySample = null;
  const channel = channels.get(key);
  if (!channel) return;
  channel.lastNativeAt = -Infinity;
  reconcile(key, channel);
}
