import type { Route } from '@/store/api/googleMapsApi';
import { decodeFullPolyline, MAX_DECODED_ROUTE_POINTS, type RoutePoint } from './safePolyline';

/** Same first-route step geometry as the server's 100 m check, without overview sampling. */
export function bookingRouteCoordinates(route: Route): RoutePoint[] {
  if (!Array.isArray(route?.legs) || !route.legs.length) return [];
  const points: RoutePoint[] = [];
  let encodedLength = 0, steps = 0;
  for (const leg of route.legs) {
    if (!Array.isArray(leg?.steps) || !leg.steps.length) return [];
    for (const step of leg.steps) {
      if (++steps > 10_000 || typeof step?.polyline !== 'string') return [];
      encodedLength += step.polyline.length;
      if (encodedLength > 500_000) return [];
      const decoded = decodeFullPolyline(step.polyline);
      if (decoded.length < 2 || points.length + decoded.length > MAX_DECODED_ROUTE_POINTS) return [];
      const previous = points[points.length - 1], first = decoded[0];
      // Never invent a connecting road between disjoint steps.
      if (previous && (previous.latitude !== first.latitude || previous.longitude !== first.longitude)) return [];
      for (let i = previous ? 1 : 0; i < decoded.length; i++) points.push(decoded[i]);
    }
  }
  return points;
}
