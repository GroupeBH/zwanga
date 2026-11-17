import type { LocationObject } from 'expo-location';

export type LocationHistorySample = {
  latitude: number; longitude: number; accuracy: number; recordedAt: string;
};

/** Retain real recent fixes only; older evidence must never become a fresh fix. */
export function locationBatch(locations: LocationObject[], now = Date.now()): LocationHistorySample[] {
  const unique = new Map<number, LocationHistorySample>();
  for (const point of locations) {
    const c = point?.coords;
    if (!c || point.mocked === true || !Number.isFinite(point.timestamp) ||
      point.timestamp <= 0 || point.timestamp > now || now-point.timestamp>90_000 ||
      !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) ||
      Math.abs(c.latitude)>90 || Math.abs(c.longitude)>180 ||
      typeof c.accuracy !== 'number' || !Number.isFinite(c.accuracy) || c.accuracy<0 || c.accuracy>70) continue;
    if (!unique.has(point.timestamp)) unique.set(point.timestamp, {
      latitude:c.latitude, longitude:c.longitude, accuracy:c.accuracy,
      recordedAt:new Date(point.timestamp).toISOString(),
    });
  }
  return [...unique.entries()].sort((a,b)=>a[0]-b[0]).slice(-10).map(([,p])=>p);
}
