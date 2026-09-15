import AsyncStorage from '@react-native-async-storage/async-storage';

const RETENTION_MS = 72 * 60 * 60_000;
interface Saved { at: number; data: unknown }
const diskKey = (userId: string) => `@zwanga/active-ride-snapshots/v1/${userId}`;
let writes = Promise.resolve();
const liveFields = new Set(['currentLocation', 'lastLocationUpdateAt', 'passengerLocationCoordinates', 'passengerLocationUpdatedAt']);
async function read(userId: string): Promise<Record<string, Saved>> {
  const raw = await AsyncStorage.getItem(diskKey(userId));
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}
export async function loadRideSnapshot<T>(userId: string, scope: string): Promise<T | undefined> {
  const saved = (await read(userId))[scope];
  return saved && Date.now() - saved.at < RETENTION_MS ? saved.data as T : undefined;
}
export function saveRideSnapshot(userId: string, scope: string, data: unknown) {
  const operation = writes.then(async () => {
    // Keep trip facts, not a history of positions or a stale position labelled LIVE.
    const json = JSON.stringify(data, (key, value) => liveFields.has(key) ? null : value);
    if (!json || json.length > 150_000) return;
    const existing = await read(userId).catch(() => ({} as Record<string, Saved>));
    if (existing[scope] && Date.now() - existing[scope].at < 10 * 60_000 && JSON.stringify(existing[scope].data) === json) return;
    const next = { ...existing, [scope]: { at: Date.now(), data: JSON.parse(json) } };
    const retained = Object.entries(next).filter(([, value]) => Date.now() - value.at < RETENTION_MS)
      .sort((a, b) => b[1].at - a[1].at).slice(0, 6);
    await AsyncStorage.setItem(diskKey(userId), JSON.stringify(Object.fromEntries(retained)));
  });
  writes = operation.catch(() => undefined);
  return operation;
}

export function removeRideSnapshot(userId: string, scope: string) {
  const operation = writes.then(async () => {
    const existing = await read(userId);
    if (!existing[scope]) return;
    delete existing[scope];
    await AsyncStorage.setItem(diskKey(userId), JSON.stringify(existing));
  });
  writes = operation.catch(() => undefined);
  return operation;
}
