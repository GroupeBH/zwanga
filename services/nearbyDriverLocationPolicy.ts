import type { LocationObject } from 'expo-location';

export const NEARBY_DRIVER_INTERVAL_MS = 60_000;
export const NEARBY_DRIVER_HEARTBEAT_MS = 120_000;

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
  if (next.timestamp <= previous.timestamp || now - sentAt < NEARBY_DRIVER_INTERVAL_MS) return false;
  if (now - sentAt >= NEARBY_DRIVER_HEARTBEAT_MS) return true;
  const rad = Math.PI / 180;
  const dLat = (next.coords.latitude - previous.coords.latitude) * rad;
  const dLon = (next.coords.longitude - previous.coords.longitude) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(previous.coords.latitude * rad) *
    Math.cos(next.coords.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, a))) >= 100;
}
