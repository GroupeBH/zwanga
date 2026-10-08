export type RoutePoint = { latitude: number; longitude: number };

// Bounds apply before decoding/allocation, including to data from older servers.
export const MAX_ENCODED_ROUTE_LENGTH = 100_000;
export const MAX_DECODED_ROUTE_POINTS = 10_000;
export const MAX_PREVIEW_ROUTE_POINTS = 512;

export function isValidRoutePoint(point: unknown): point is RoutePoint {
  if (!point || typeof point !== 'object') return false;
  const { latitude, longitude } = point as RoutePoint;
  return typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

/** Reject the entire invalid route instead of connecting unrelated surviving points. */
export function boundedRoutePoints(value: unknown, limit = MAX_PREVIEW_ROUTE_POINTS): RoutePoint[] {
  if (!Array.isArray(value) || value.length > MAX_DECODED_ROUTE_POINTS ||
      value.length < 2 || !value.every(isValidRoutePoint)) return [];
  const count = Math.max(2, Math.min(MAX_PREVIEW_ROUTE_POINTS, Math.floor(limit) || 2));
  if (value.length <= count) return value;
  return Array.from({ length: count }, (_, index) =>
    value[Math.round(index * (value.length - 1) / (count - 1))]);
}

/** Google polyline precision 5. Strict integer/continuation checks avoid partial routes. */
export function decodeSafePolyline(encoded: unknown): RoutePoint[] {
  if (typeof encoded !== 'string' || encoded.length > MAX_ENCODED_ROUTE_LENGTH) return [];
  let index = 0;
  const readDelta = (): number | null => {
    let result = 0;
    for (let shift = 0; shift <= 25; shift += 5) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result += (byte & 31) * 2 ** shift;
      if (byte < 32) return result % 2 ? -(result + 1) / 2 : result / 2;
    }
    return null;
  };
  const points: RoutePoint[] = [];
  let latitude = 0, longitude = 0;
  while (index < encoded.length) {
    if (points.length >= MAX_DECODED_ROUTE_POINTS) return [];
    const latDelta = readDelta(), lngDelta = readDelta();
    if (latDelta === null || lngDelta === null) return [];
    latitude += latDelta;
    longitude += lngDelta;
    const point = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
    if (!isValidRoutePoint(point)) return [];
    points.push(point);
  }
  return boundedRoutePoints(points);
}

/** No argument spreading: even a large caller-owned array cannot overflow the stack. */
export function routeBounds(points: readonly RoutePoint[]) {
  let minLatitude = Infinity, maxLatitude = -Infinity;
  let minLongitude = Infinity, maxLongitude = -Infinity;
  if (!points.length || points.length > MAX_DECODED_ROUTE_POINTS) return null;
  for (const point of points) {
    if (!isValidRoutePoint(point)) return null;
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
  }
  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}
