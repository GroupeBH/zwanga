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
};

// Native tasks remain the GPS source, including while the app is visible. Screens only
// open a shared foreground watcher if that source is silent or unavailable.
const channels = new Map<string, Channel>();
const NATIVE_SILENCE_MS = BOARDING_LOCATION_MAX_AGE_MS - 2000;
let watchdog: ReturnType<typeof setInterval> | null = null;
let unsubscribeActivity: (() => void) | null = null;

function checkChannels() { channels.forEach((channel, key) => reconcile(key, channel)); }
function syncActivity() {
  checkChannels();
  if (isAppActive() && !watchdog) watchdog = setInterval(checkChannels, 2000);
  else if (!isAppActive() && watchdog) { clearInterval(watchdog); watchdog = null; }
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
  if (!isAppActive() || Date.now() - channel.lastNativeAt < NATIVE_SILENCE_MS) {
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
  if (!channel) return;
  const age = Date.now() - location.timestamp;
  if (!Number.isFinite(age) || age < -5000 || age >= NATIVE_SILENCE_MS) return;
  if (!Number.isFinite(location.coords.latitude) || !Number.isFinite(location.coords.longitude)) return;
  channel.lastNativeAt = Math.max(channel.lastNativeAt, Math.min(Date.now(), location.timestamp));
  if (channel.fallback || channel.starting) stopFallback(channel);
  deliver(channel, location);
}

export function subscribeRideLocation(
  key: string,
  options: Location.LocationOptions,
  listener: Listener,
): Location.LocationSubscription {
  let channel = channels.get(key);
  if (!channel) {
    channel = { listeners: new Set(), options, lastNativeAt: -Infinity, generation: 0, starting: false, retryAt: 0, fallback: null };
    channels.set(key, channel);
  }
  const current = channel;
  current.listeners.add(listener);
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
    }
  } };
}
