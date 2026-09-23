import {
  normalizeCoordinateList, normalizeCoordinateObject,
  type NavigationCoordinate, type ClosestPolylinePoint, type PolylineProgress,
} from './coordinateModel';
import { calculateBearingDegrees, calculateDistanceMeters, projectPointToSegment } from './routeProgress';
import { pointToLineDistance } from '../routes/routeGeometry';
import { buildSegmentIndex, intersects, searchBounds, type SegmentNode } from './routeSegmentIndex';

export type RouteAnalysis = {
  progress: PolylineProgress;
  alignment: { heading: number; distanceKm: number };
};

/** One bounded, screen-owned cache. Routes are immutable; replacement or scope change invalidates it.
 * Keep the two original projection formulas: heading and deviation must not silently change metrics.
 */
export function createRouteAnalysisCache() {
  let source: NavigationCoordinate[] | null = null;
  let scope: string | undefined;
  let route: NavigationCoordinate[] = [];
  let prefix: number[] = [];
  let root: SegmentNode | null = null;
  let previousSegment = 0;
  let lastQueryAt = -Infinity;
  const results = new Map<string, RouteAnalysis>(); // Latest driver fix + fixed pickup point.
  const stats = { builds: 0, queries: 0, segments: 0, cacheHits: 0 };

  function analyze(polyline: NavigationCoordinate[], point: NavigationCoordinate, context = ''): RouteAnalysis | null {
    if (source !== polyline || scope !== context) {
      source = polyline; scope = context;
      route = normalizeCoordinateList(polyline);
      prefix = [0];
      for (let i = 1; i < route.length; i++) prefix.push(prefix[i - 1] + calculateDistanceMeters(route[i - 1], route[i]));
      root = buildSegmentIndex(route);
      previousSegment = 0; lastQueryAt = -Infinity; results.clear(); stats.builds++;
    }
    const current = normalizeCoordinateObject(point);
    if (!current || !root) return null;
    const key = `${current.latitude}:${current.longitude}`;
    const now = Date.now();
    if (now - lastQueryAt > 10_000 || now < lastQueryAt) {
      previousSegment = 0;
      results.clear();
    }
    lastQueryAt = now;
    const cached = results.get(key);
    if (cached) {
      results.delete(key); results.set(key, cached); stats.cacheHits++;
      return cached;
    }
    stats.queries++;
    let closest: ClosestPolylinePoint | null = null;
    let headingIndex = 0, headingDistance = Infinity;
    let bounds = searchBounds(current, Infinity);
    const seedStart = Math.max(0, previousSegment - 8);
    const seedEnd = Math.min(route.length - 1, previousSegment + 9);
    const consider = (index: number) => {
      stats.segments++;
      const candidate = projectPointToSegment(current, route[index], route[index + 1]);
      if (!closest || candidate.distanceMeters < closest.distanceMeters
        || (candidate.distanceMeters === closest.distanceMeters && index < closest.segmentIndex)) {
        closest = { ...candidate, segmentIndex: index };
      }
      const distance = pointToLineDistance(current, route[index], route[index + 1]);
      if (distance < headingDistance || (distance === headingDistance && index < headingIndex)) {
        headingDistance = distance; headingIndex = index;
      }
      bounds = searchBounds(current, Math.max(closest!.distanceMeters, headingDistance * 1000));
    };
    for (let i = seedStart; i < seedEnd; i++) consider(i);
    const visit = (node: SegmentNode) => {
      if (!intersects(node, bounds)) return;
      if (node.left && node.right) {
        // Visit the last known neighbourhood first, but verify ALL potentially closer branches.
        if (previousSegment >= node.right.start) { visit(node.right); visit(node.left); }
        else { visit(node.left); visit(node.right); }
      } else {
        for (let i = node.start; i < node.end; i++) if (i < seedStart || i >= seedEnd) consider(i);
      }
    };
    visit(root);
    // At least one seed segment exists for every usable route.
    const best = closest as ClosestPolylinePoint | null;
    if (!best) return null;
    previousSegment = best.segmentIndex;
    const partial = calculateDistanceMeters(route[best.segmentIndex], best.coordinate);
    // getPolylineProgress ignores projected points within 2 m of the segment start. Preserve it.
    const distanceFromStartMeters = prefix[best.segmentIndex] + (partial > 2 ? partial : 0);
    const routeDistanceMeters = prefix[prefix.length - 1];
    const result: RouteAnalysis = {
      progress: { closestPoint: best, distanceFromStartMeters, routeDistanceMeters,
        distanceToEndMeters: Math.max(0, routeDistanceMeters - distanceFromStartMeters) },
      alignment: { heading: calculateBearingDegrees(route[headingIndex], route[headingIndex + 1]), distanceKm: headingDistance },
    };
    results.set(key, result);
    if (results.size > 2) results.delete(results.keys().next().value!);
    return result;
  }

  return { analyze, getStats: () => ({ ...stats, retainedResults: results.size }) };
}
