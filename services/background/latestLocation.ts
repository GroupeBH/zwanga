import type { LocationObject } from 'expo-location';

/** Select without copying/sorting a native batch. Equal timestamps keep the first sample. */
export function latestLocation(locations: readonly LocationObject[] | undefined): LocationObject | null {
  let latest: LocationObject | null = null;
  for (const location of locations ?? []) {
    if (!Number.isFinite(location?.timestamp)) continue;
    if (!latest || location.timestamp > latest.timestamp) latest = location;
  }
  return latest;
}
