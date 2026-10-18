import { Platform } from 'react-native';
import type MapView from 'react-native-maps';
import type { EdgePadding, Region } from 'react-native-maps';
import { normalizeTripMapCoordinate, type MapCoordinate } from '@/utils/tripCoordinates';

export type MapLayout = { width: number; height: number };
type Point = MapCoordinate | null | undefined;

export function getCameraCoordinates(points: readonly Point[]) {
  const seen = new Set<string>();
  const result: MapCoordinate[] = [];
  for (const point of points) {
    const coordinate = point && normalizeTripMapCoordinate(point.latitude, point.longitude);
    if (!coordinate) continue;
    const key = `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(coordinate);
  }
  return result;
}

export function getNavigationCameraRegion(points: readonly Point[]): Region {
  const coordinates = getCameraCoordinates(points);
  if (!coordinates.length) {
    return { latitude: -4.441931, longitude: 15.266293, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  }
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const { latitude, longitude } of coordinates) {
    minLat = Math.min(minLat, latitude); maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude); maxLng = Math.max(maxLng, longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.01),
  };
}

/** Keep at least 40% of each measured axis available for the native bounds calculation. */
export function clampCameraPadding(padding: EdgePadding, layout: MapLayout | null): EdgePadding | null {
  if (!layout || !Number.isFinite(layout.width) || !Number.isFinite(layout.height)
    || layout.width <= 0 || layout.height <= 0) return null;
  const safe = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  const top = safe(padding.top), bottom = safe(padding.bottom);
  const left = safe(padding.left), right = safe(padding.right);
  const vertical = Math.min(1, layout.height * 0.6 / Math.max(1, top + bottom));
  const horizontal = Math.min(1, layout.width * 0.6 / Math.max(1, left + right));
  return { top: top * vertical, bottom: bottom * vertical, left: left * horizontal, right: right * horizontal };
}

export function fitNavigationCamera(
  map: MapView, points: readonly Point[], layout: MapLayout | null,
  options: { edgePadding: EdgePadding; animated?: boolean; durationMs?: number; singleCoordinateDelta?: number },
) {
  const coordinates = getCameraCoordinates(points);
  const edgePadding = clampCameraPadding(options.edgePadding, layout);
  if (!coordinates.length || !edgePadding) return false;
  // On iOS, avoid overlapping native animations when GPS/route responses arrive during presentation.
  const animated = Platform.OS !== 'ios' && options.animated !== false;
  const region = getNavigationCameraRegion(coordinates);
  const almostSinglePoint = coordinates.every(point =>
    Math.abs(point.latitude - region.latitude) < 0.00001 && Math.abs(point.longitude - region.longitude) < 0.00001);
  if (almostSinglePoint) {
    const delta = options.singleCoordinateDelta;
    map.animateToRegion({ ...region,
      ...(delta && Number.isFinite(delta) && delta > 0 ? { latitudeDelta: delta, longitudeDelta: delta } : {}),
    }, animated ? options.durationMs ?? 320 : 0);
  } else {
    map.fitToCoordinates(coordinates, { edgePadding, animated });
  }
  return true;
}
