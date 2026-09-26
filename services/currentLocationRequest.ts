import * as Location from 'expo-location';

export const CURRENT_POSITION_TIMEOUT_MS = 10_000;
export const CACHED_POSITION_TIMEOUT_MS = 2_000;
type PositionRead = {
  listeners: Set<(value: Location.LocationObject | null) => void>;
  settled: boolean;
  value: Location.LocationObject | null;
};
const pendingReads = new Map<string, PositionRead>();

// Expo's one-shot request has no cancellation handle. Keep the underlying read
// shared until it settles: retrying a timed-out UI must not multiply GPS requests.
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

function boundedRead(request: PositionRead, ms: number, signal: AbortSignal) {
  return new Promise<Location.LocationObject | null>(resolve => {
    if (signal.aborted) { resolve(null); return; }
    if (request.settled) { resolve(request.value); return; }
    let done = false;
    const finish = (value: Location.LocationObject | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      request.listeners.delete(finish);
      resolve(value);
    };
    const cancel = () => finish(null);
    const timer = setTimeout(cancel, ms);
    signal.addEventListener('abort', cancel, { once: true });
    // Timed-out consumers are removed even if the native request never settles.
    request.listeners.add(finish);
  });
}

export async function requestCurrentLocation(nearby: boolean, signal: AbortSignal) {
  const cached = (maxAge: number, requiredAccuracy: number) => boundedRead(
    sharedRead(`cached:${maxAge}:${requiredAccuracy}`, () => Location.getLastKnownPositionAsync({ maxAge, requiredAccuracy })),
    CACHED_POSITION_TIMEOUT_MS, signal,
  );
  if (signal.aborted) return null;
  const recent = await cached(2 * 60_000, nearby ? 250 : 100);
  if (signal.aborted) return null;
  if (recent) return recent;
  const accuracy = nearby ? Location.Accuracy.Balanced : Location.Accuracy.High;
  const fresh = await boundedRead(sharedRead(`fresh:${accuracy}`,
    () => Location.getCurrentPositionAsync({ accuracy })), CURRENT_POSITION_TIMEOUT_MS, signal);
  if (signal.aborted) return null;
  if (fresh) return fresh;
  return cached(15 * 60_000, 1000);
}
