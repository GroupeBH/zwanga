import * as Location from 'expo-location';

export const CURRENT_POSITION_TIMEOUT_MS = 10_000;
export const CACHED_POSITION_TIMEOUT_MS = 2_000;
type PositionRead = {
  listeners: Set<(value: Location.LocationObject | null) => void>;
  settled: boolean;
  value: Location.LocationObject | null;
  onIdle?: () => void;
};
const pendingReads = new Map<string, PositionRead>();
const startingWatches = new Set<number>();

// Cached reads have no cancellation handle: share them until the native call settles.
function sharedRead(key: string, read: () => Promise<Location.LocationObject | null>) {
  const current = pendingReads.get(key);
  if (current) return current;
  const request: PositionRead = { listeners: new Set(), settled: false, value: null };
  pendingReads.set(key, request);
  const finish = (value: Location.LocationObject | null) => {
    request.settled = true;
    request.value = value;
    if (pendingReads.get(key) === request) pendingReads.delete(key);
    for (const listener of request.listeners) listener(value);
    request.listeners.clear();
  };
  void Promise.resolve().then(read).then(finish, () => finish(null));
  return request;
}

/** A short-lived, shared watch can be stopped even when GPS never produces a fix. */
function sharedFreshRead(accuracy: Location.Accuracy): PositionRead {
  const key = `fresh:${accuracy}`;
  const current = pendingReads.get(key);
  if (current) return current;
  // If registration itself hangs in the native bridge, do not accumulate watchers.
  // A late subscription is removed below; the next attempt can then register again.
  if (startingWatches.has(accuracy)) return { listeners: new Set(), settled: true, value: null };
  const request: PositionRead = { listeners: new Set(), settled: false, value: null };
  let subscription: Location.LocationSubscription | undefined;
  const remove = (watch: Location.LocationSubscription | undefined) => {
    try { watch?.remove(); } catch { /* native teardown must not reject a caller */ }
  };
  const finish = (value: Location.LocationObject | null) => {
    if (request.settled) return;
    request.settled = true;
    request.value = value;
    if (pendingReads.get(key) === request) pendingReads.delete(key);
    remove(subscription);
    for (const listener of request.listeners) listener(value);
    request.listeners.clear();
  };
  request.onIdle = () => finish(null);
  pendingReads.set(key, request);
  startingWatches.add(accuracy);
  void Promise.resolve().then(async () => {
    if (request.settled) return;
    subscription = await Location.watchPositionAsync({
      accuracy, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false,
    }, location => {
      if (!location?.coords) return;
      const { latitude, longitude } = location.coords;
      if (Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
          Number.isFinite(longitude) && Math.abs(longitude) <= 180) finish(location);
    }, () => finish(null));
    // The callback/timeout can run BEFORE the native subscription promise resolves.
    if (request.settled) remove(subscription);
  }).catch(() => finish(null)).finally(() => { startingWatches.delete(accuracy); });
  return request;
}

function boundedRead(request: PositionRead, ms: number, signal: AbortSignal) {
  return new Promise<Location.LocationObject | null>(resolve => {
    if (signal.aborted) {
      if (!request.listeners.size) request.onIdle?.();
      resolve(null); return;
    }
    if (request.settled) { resolve(request.value); return; }
    let done = false;
    const finish = (value: Location.LocationObject | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      request.listeners.delete(finish);
      if (!request.listeners.size && !request.settled) request.onIdle?.();
      resolve(value);
    };
    const cancel = () => finish(null);
    const timer = setTimeout(cancel, ms);
    signal.addEventListener('abort', cancel, { once: true });
    // Timed-out consumers are removed even if the native request never settles.
    request.listeners.add(finish);
  });
}

export async function requestCurrentLocation(nearby: boolean, signal: AbortSignal,
  options: { maxAge?: number; requiredAccuracy?: number; fallback?: boolean } = {}) {
  const cached = (maxAge: number, requiredAccuracy: number) => boundedRead(
    sharedRead(`cached:${maxAge}:${requiredAccuracy}`, () => Location.getLastKnownPositionAsync({ maxAge, requiredAccuracy })),
    CACHED_POSITION_TIMEOUT_MS, signal,
  );
  if (signal.aborted) return null;
  const recent = await cached(options.maxAge ?? 2 * 60_000, options.requiredAccuracy ?? (nearby ? 250 : 100));
  if (signal.aborted) return null;
  if (recent) return recent;
  const accuracy = nearby ? Location.Accuracy.Balanced : Location.Accuracy.High;
  const fresh = await boundedRead(sharedFreshRead(accuracy), CURRENT_POSITION_TIMEOUT_MS, signal);
  if (signal.aborted) return null;
  if (fresh) return fresh;
  if (options.fallback === false) return null;
  return cached(15 * 60_000, 1000);
}
