import { createRouteAnalysisCache } from './routeAnalysis';
import { normalizeCoordinateList, type NavigationCoordinate } from './coordinateModel';
import { trimPolylineFromCurrentPosition } from './routeProgress';

/** One immutable route + two position results. Disposal follows the screen lifecycle. */
export function createPassengerRouteAnalysis() {
  const index = createRouteAnalysisCache();
  let source: NavigationCoordinate[] | undefined;
  let route: NavigationCoordinate[] = [];
  let destinationKey = '';
  let destinationProjection: ReturnType<typeof index.analyze> = null;
  function prepare(coordinates: NavigationCoordinate[]) {
    if (source === coordinates) return;
    source = coordinates; route = normalizeCoordinateList(coordinates);
    destinationKey = ''; destinationProjection = null;
  }
  return {
    heading(coordinates: NavigationCoordinate[], current: NavigationCoordinate | null) {
      prepare(coordinates);
      const result = current ? index.analyze(route, current) : null;
      return result && result.alignment.distanceKm <= 0.1 ? result.alignment.heading : 0;
    },
    remaining(coordinates: NavigationCoordinate[], current: NavigationCoordinate | null,
      destination: NavigationCoordinate | null) {
      prepare(coordinates);
      const key = destination ? `${destination.latitude}:${destination.longitude}` : 'none';
      if (key !== destinationKey) {
        destinationKey = key;
        destinationProjection = destination ? index.analyze(route, destination) : null;
      }
      const position = current ? index.analyze(route, current) : null;
      // Keep the established coordinate deduplication, distance and fallback semantics.
      return trimPolylineFromCurrentPosition(current, route, destination, { analysis: {
        route, current: position?.progress.closestPoint ?? null,
        destination: destinationProjection?.progress.closestPoint ?? null,
      } });
    },
    getStats: index.getStats,
  };
}
