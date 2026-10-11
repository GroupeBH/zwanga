import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { getActiveDriverBackgroundTripSession } from './driverBackgroundLocationSession';
import { getActiveTrackingSession } from './background/passengerTaskLifecycle';
import { getTokens } from './tokenStorage';
import { getTokenSessionVersion } from './tokenSession';
import { decodeJWT } from '@/utils/jwt';
import { isUsableNearbyDriverPosition, NEARBY_DRIVER_INTERVAL_MS } from './nearbyDriverLocationPolicy';
import { sendNearbyDriverPosition } from './nearbyDriverPositionDelivery';
import { invalidateNativeRideLocation, publishNativeRideLocation } from './rideLocationStream';

export const NEARBY_DRIVER_LOCATION_TASK = 'zwanga-nearby-driver-location-v1';
// Keep the former key for native callbacks from an already registered installation.
const OWNER_KEY = 'zwanga.nearbyDriverLocationConsent.v1';
const disabledKey = (userId: string) => `zwanga.nearbyDriverLocationDisabled.v1:${userId}`;
let work: Promise<unknown> = Promise.resolve();
let revision = 0;
let stoppedSessionVersion: number | null = null;
let owner: string | null | undefined;
let preference: { userId: string; disabled: boolean } | undefined;
let permissionCheck: { revision: number; version: number; until: number; promise: Promise<boolean> } | undefined;
const listeners = new Set<() => void>();
const serial = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = work.then(operation); work = next.catch(() => undefined); return next;
};
const changed = () => { for (const listener of listeners) listener(); };

export function subscribeNearbyDriverLocation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function readOwner() {
  if (owner === undefined) owner = await AsyncStorage.getItem(OWNER_KEY);
  return owner;
}
async function readEnabled(userId: string) {
  if (preference?.userId !== userId) {
    preference = { userId, disabled: await AsyncStorage.getItem(disabledKey(userId)) === '1' };
  }
  return !preference.disabled;
}
export function isNearbyDriverLocationEnabled(userId: string) {
  return serial(() => readEnabled(userId));
}
export async function hasActiveRideLocationSession() {
  return Boolean(await getActiveDriverBackgroundTripSession() || await getActiveTrackingSession());
}
async function stopNative() {
  permissionCheck = undefined;
  if (owner) invalidateNativeRideLocation(`nearby:${owner}`);
  if (Platform.OS !== 'web' && await TaskManager.isAvailableAsync() &&
    await Location.hasStartedLocationUpdatesAsync(NEARBY_DRIVER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(NEARBY_DRIVER_LOCATION_TASK);
  }
}

/** Called after a trip session is persisted, before starting its precise GPS. */
export function pauseNearbyDriverLocation() {
  revision++;
  return serial(stopNative);
}

/** Logout stops collection, but keeps each account's explicit opt-out. */
export function clearNearbyDriverLocation({ endSession = true }: { endSession?: boolean } = {}) {
  if (owner) invalidateNativeRideLocation(`nearby:${owner}`);
  revision++; owner = null;
  if (endSession) stoppedSessionVersion = getTokenSessionVersion();
  return serial(async () => {
    owner = null;
    try { await AsyncStorage.removeItem(OWNER_KEY); }
    finally { await stopNative(); changed(); }
  });
}

export function setNearbyDriverLocationEnabled(userId: string, enabled: boolean, version = getTokenSessionVersion()) {
  if (version !== getTokenSessionVersion()) return Promise.resolve();
  const generation = ++revision;
  return serial(async () => {
    if (generation !== revision || version !== getTokenSessionVersion()) return;
    const { accessToken } = await getTokens({ throwOnError: true });
    const claims = accessToken ? decodeJWT(accessToken) : null;
    if (generation !== revision || version !== getTokenSessionVersion() ||
      (claims?.sub ?? claims?.userId) !== userId) return;
    if (!enabled) {
      if (owner) invalidateNativeRideLocation(`nearby:${owner}`);
      preference = { userId, disabled: true }; owner = null;
      try { await AsyncStorage.setItem(disabledKey(userId), '1'); }
      finally {
        try { await AsyncStorage.removeItem(OWNER_KEY); }
        finally { await stopNative(); changed(); }
      }
    } else {
      await AsyncStorage.removeItem(disabledKey(userId));
      if (generation !== revision || version !== getTokenSessionVersion()) return;
      preference = { userId, disabled: false }; changed();
    }
  });
}

// iOS does not defer foreground callbacks. Share the native permission read rather
// than crossing the bridge for every sample; explicit resume/start still rechecks.
function callbackPermission(version: number, generation: number) {
  if (permissionCheck?.revision === generation && permissionCheck.version === version && Date.now() < permissionCheck.until) {
    return permissionCheck.promise;
  }
  const entry = { revision: generation, version, until: Date.now() + 30_000,
    promise: Location.getBackgroundPermissionsAsync().then(result => result.granted) };
  permissionCheck = entry;
  void entry.promise.catch(() => { if (permissionCheck === entry) permissionCheck = undefined; });
  return entry.promise;
}

/** Automatic for authorized drivers unless explicitly disabled; never requests OS permission. */
export function ensureNearbyDriverLocation(userId: string) {
  const generation = revision, version = getTokenSessionVersion();
  return serial(async () => {
    const current = () => generation === revision && version === getTokenSessionVersion() && version !== stoppedSessionVersion;
    if (!current() || Platform.OS === 'web' || AppState.currentState !== 'active') return false;
    if (!(await readEnabled(userId)) || await hasActiveRideLocationSession()) {
      await stopNative(); return false;
    }
    const { accessToken } = await getTokens({ throwOnError: true });
    const claims = accessToken ? decodeJWT(accessToken) : null;
    if (!current()) return false;
    if ((claims?.sub ?? claims?.userId) !== userId) { await stopNative(); return false; }
    const permission = await Location.getBackgroundPermissionsAsync();
    if (!permission.granted || !(await Location.hasServicesEnabledAsync())) {
      await stopNative(); return false;
    }
    if (!current() || AppState.currentState !== 'active' || !(await TaskManager.isAvailableAsync())) return false;
    if (await readOwner() !== userId) {
      await stopNative();
      if (!current()) return false;
      await AsyncStorage.setItem(OWNER_KEY, userId);
      if (!current()) { await AsyncStorage.removeItem(OWNER_KEY); return false; }
      owner = userId;
    }
    if (!(await Location.hasStartedLocationUpdatesAsync(NEARBY_DRIVER_LOCATION_TASK))) {
      if (!current() || AppState.currentState !== 'active') return false;
      await Location.startLocationUpdatesAsync(NEARBY_DRIVER_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: NEARBY_DRIVER_INTERVAL_MS,
        deferredUpdatesInterval: NEARBY_DRIVER_INTERVAL_MS,
        distanceInterval: 0, // A stationary driver still needs a fresh server lease.
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Other,
        showsBackgroundLocationIndicator: true,
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: 'Commandes proches de vous',
          notificationBody: 'Position actualisée pour recevoir les commandes. Réglages dans Profil → Alertes conducteur.',
          notificationColor: '#FF6B35', killServiceOnDestroy: true,
        } : undefined,
      });
    }
    if (!current()) { await stopNative(); return false; }
    return true;
  });
}

export async function handleNearbyDriverLocations(locations: Location.LocationObject[]) {
  let latest: Location.LocationObject | undefined;
  for (const location of locations) {
    if (Number.isFinite(location?.timestamp) && (!latest || location.timestamp > latest.timestamp)) latest = location;
  }
  if (!latest || !isUsableNearbyDriverPosition(latest)) return;
  const version = getTokenSessionVersion(), generation = revision;
  const userId = await serial(readOwner);
  const current = () => version === getTokenSessionVersion() && generation === revision && owner === userId;
  if (!current()) return;
  if (!userId || !(await serial(() => readEnabled(userId))) || await hasActiveRideLocationSession()) {
    if (current()) await pauseNearbyDriverLocation();
    return;
  }
  if (!(await callbackPermission(version, generation))) {
    if (current()) await pauseNearbyDriverLocation();
    return;
  }
  if (!current()) return;
  // Feed the map before any network wait. Home no longer needs a parallel GPS watcher.
  publishNativeRideLocation(`nearby:${userId}`, latest);
  if (await sendNearbyDriverPosition(userId, latest, current) === 'stop' && current()) {
    await pauseNearbyDriverLocation();
  }
}

// Registered at module scope for a native callback without mounted React screens.
try {
  if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(NEARBY_DRIVER_LOCATION_TASK)) {
    TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(NEARBY_DRIVER_LOCATION_TASK,
      async ({ data, error }) => {
        if (error) return;
        try { await handleNearbyDriverLocations(data?.locations ?? []); }
        catch { /* No raw coordinates/tokens in logs; retry on the next native fix. */ }
      });
  }
} catch { /* Unsupported native runtime: foreground discovery remains available. */ }
