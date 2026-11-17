import type { LocationObject } from 'expo-location';
import { MAX_ACCEPTABLE_GPS_ACCURACY_METERS } from './routeProgress';

export const TRIP_COMPLETION_FIX_MAX_AGE_MS = 30_000;

/** A displayed/cached position is not necessarily a valid arrival observation. */
export function isTripCompletionTimestamp(timestamp: unknown, startedAt?: string | null) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return false;
  const now = Date.now();
  if (timestamp > now || now - timestamp > TRIP_COMPLETION_FIX_MAX_AGE_MS) return false;
  if (startedAt) {
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start) || timestamp < start) return false;
  }
  return true;
}

export function isTripCompletionLocation(location: LocationObject | null, startedAt?: string | null): location is LocationObject {
  const accuracy = location?.coords?.accuracy;
  return Boolean(location && location.mocked !== true &&
    isTripCompletionTimestamp(location.timestamp, startedAt) &&
    typeof accuracy === 'number' && Number.isFinite(accuracy) &&
    accuracy >= 0 && accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_METERS);
}
