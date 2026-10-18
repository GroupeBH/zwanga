import type { LocationObject } from 'expo-location';

// Discovery only. In-ride GPS keeps its own, more frequent tracking profile.
export const NEARBY_DRIVER_INTERVAL_MS = 180_000;

/** Match the server contract; never renew eligibility using an old/approximate fix. */
export function isUsableNearbyDriverPosition(value: LocationObject, now = Date.now()) {
  const { latitude, longitude, accuracy } = value.coords;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180 &&
    typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 250 &&
    Number.isFinite(value.timestamp) && now - value.timestamp <= 30_000 && value.timestamp <= now + 5_000 &&
    value.mocked !== true;
}

export function shouldSendNearbyDriverPosition(previous: LocationObject | null, next: LocationObject,
  sentAt: number, now = Date.now()) {
  if (!isUsableNearbyDriverPosition(next, now)) return false;
  if (!previous) return true;
  if (next.timestamp <= previous.timestamp) return false;
  // A slow HTTP response must not push the next native sample into a second
  // 3-minute interval. A fresh fix renews presence even without movement.
  return Math.max(now - sentAt, next.timestamp - previous.timestamp) >= NEARBY_DRIVER_INTERVAL_MS;
}
