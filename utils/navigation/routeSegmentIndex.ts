import type { NavigationCoordinate } from './coordinateModel';

export type SegmentBounds = {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
};
export type SegmentNode = SegmentBounds & {
  start: number; end: number; left?: SegmentNode; right?: SegmentNode;
};

/** Balanced by route order, without sorting/copying the geometry. Construction is O(N). */
export function buildSegmentIndex(route: NavigationCoordinate[], start = 0, end = route.length - 1): SegmentNode | null {
  if (end <= start) return null;
  if (end - start <= 12) {
    const bounds = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };
    for (let i = start; i <= end; i++) {
      bounds.minLat = Math.min(bounds.minLat, route[i].latitude);
      bounds.maxLat = Math.max(bounds.maxLat, route[i].latitude);
      bounds.minLng = Math.min(bounds.minLng, route[i].longitude);
      bounds.maxLng = Math.max(bounds.maxLng, route[i].longitude);
    }
    return { ...bounds, start, end };
  }
  const middle = Math.floor((start + end) / 2);
  const left = buildSegmentIndex(route, start, middle)!;
  const right = buildSegmentIndex(route, middle, end)!;
  return {
    start, end, left, right,
    minLat: Math.min(left.minLat, right.minLat), maxLat: Math.max(left.maxLat, right.maxLat),
    minLng: Math.min(left.minLng, right.minLng), maxLng: Math.max(left.maxLng, right.maxLng),
  };
}

/** Bounding box enclosing a spherical radius, NOT an approximation of route distance.
 * Both existing projections land inside the segment's box. Only disjoint boxes may be skipped.
 * RDC routes do not cross the antimeridian. Near poles/large radii, do not prune longitude.
 */
export function searchBounds(point: NavigationCoordinate, radiusMeters: number): SegmentBounds {
  const angular = (radiusMeters + 0.01) / 6_371_000; // Conservative rounding margin, in metres.
  const latitude = point.latitude * Math.PI / 180;
  const latDelta = angular * 180 / Math.PI;
  const lngDelta = angular >= Math.PI / 2 - Math.abs(latitude)
    ? 180 : Math.asin(Math.min(1, Math.sin(angular) / Math.cos(latitude))) * 180 / Math.PI;
  return { minLat: point.latitude - latDelta, maxLat: point.latitude + latDelta,
    minLng: point.longitude - lngDelta, maxLng: point.longitude + lngDelta };
}

export function intersects(first: SegmentBounds, second: SegmentBounds) {
  return first.minLat <= second.maxLat && first.maxLat >= second.minLat
    && first.minLng <= second.maxLng && first.maxLng >= second.minLng;
}
