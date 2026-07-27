import {
  DEVIATION_CONFIRMATION_COUNT,
  MIN_ROUTE_RECALC_INTERVAL_MS,
  ROUTE_DEVIATION_THRESHOLD_METERS,
  calculatePolylineDistanceMeters,
  isPlausibleLocationUpdate,
  isRouteDeviationConfirmed,
  normalizeCoordinate,
  resolveActiveDestination,
  trimPolylineFromCurrentPosition,
  type NavigationCoordinate,
} from '../utils/navigation/routeProgress';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${actual}`);
  }
}

const a: NavigationCoordinate = { latitude: -4.4, longitude: 15.3 };
const b: NavigationCoordinate = { latitude: -4.399, longitude: 15.3 };
const c: NavigationCoordinate = { latitude: -4.398, longitude: 15.3 };
const d: NavigationCoordinate = { latitude: -4.397, longitude: 15.3 };
const route = [a, b, c, d];

const exact = trimPolylineFromCurrentPosition(b, route, d);
assert(exact.isRouteUsable, 'vehicle exactly on the polyline should keep the route usable');
assertClose(exact.remainingCoordinates[0].latitude, b.latitude, 0.000001, 'route should start at current position');
assert(exact.distanceMeters < calculatePolylineDistanceMeters(route), 'traveled segment should be removed');

const between = trimPolylineFromCurrentPosition(
  { latitude: -4.3995, longitude: 15.3 },
  route,
  d,
);
assert(between.isRouteUsable, 'vehicle between two route points should keep the route usable');
assertClose(between.remainingCoordinates[0].latitude, -4.3995, 0.000001, 'remaining route should start between points');
assert(
  between.distanceMeters < calculatePolylineDistanceMeters(route) &&
    between.distanceMeters > calculatePolylineDistanceMeters([b, c, d]),
  'remaining route should remove only the already traveled portion',
);

const slightlyOffRoute = trimPolylineFromCurrentPosition(
  { latitude: -4.3995, longitude: 15.3002 },
  route,
  d,
);
assert(slightlyOffRoute.isRouteUsable, 'slight GPS drift should not invalidate the route');

assert(
  !isRouteDeviationConfirmed({
    distanceFromRouteMeters: ROUTE_DEVIATION_THRESHOLD_METERS + 20,
    gpsAccuracyMeters: 20,
    consecutiveOffRouteCount: DEVIATION_CONFIRMATION_COUNT - 1,
    nowMs: 60_000,
    lastRecalculationAtMs: 0,
  }),
  'one or two off-route samples should not trigger rerouting',
);
assert(
  isRouteDeviationConfirmed({
    distanceFromRouteMeters: ROUTE_DEVIATION_THRESHOLD_METERS + 20,
    gpsAccuracyMeters: 20,
    consecutiveOffRouteCount: DEVIATION_CONFIRMATION_COUNT,
    nowMs: MIN_ROUTE_RECALC_INTERVAL_MS + 1,
    lastRecalculationAtMs: 0,
  }),
  'several reliable off-route samples should trigger rerouting after cooldown',
);

assert(!normalizeCoordinate(0, 0), '0,0 should be rejected');
assert(!normalizeCoordinate(Number.NaN, 15.3), 'NaN should be rejected');
assert(
  !isPlausibleLocationUpdate({
    previous: a,
    current: { latitude: -4.35, longitude: 15.35 },
    previousTimestamp: 1000,
    currentTimestamp: 2000,
  }),
  'impossible GPS jump should be rejected',
);

const farRoute = [
  { latitude: -11.6, longitude: 27.5 },
  { latitude: -11.5, longitude: 27.6 },
];
const farResult = trimPolylineFromCurrentPosition(a, farRoute, d);
assert(!farResult.isRouteUsable, 'polyline far from current position and destination should be rejected');

const pickup = { id: 'pickup-1', kind: 'pickup' as const, completed: false, coordinate: b };
const dropoff = { id: 'dropoff-1', kind: 'dropoff' as const, completed: false, coordinate: c };
assert(resolveActiveDestination([pickup, dropoff], d)?.id === 'pickup-1', 'pickup should be active before boarding');
assert(
  resolveActiveDestination([{ ...pickup, completed: true }, dropoff], d)?.id === 'dropoff-1',
  'passenger destination should be active after pickup',
);
assert(
  resolveActiveDestination(
    [
      { ...pickup, completed: true },
      { ...dropoff, completed: true },
      { id: 'pickup-2', kind: 'pickup' as const, completed: false, coordinate: d },
    ],
    a,
  )?.id === 'pickup-2',
  'next active destination should be used after a first dropoff',
);
assert(
  resolveActiveDestination(
    [
      { ...pickup, completed: true },
      { ...dropoff, completed: true },
    ],
    d,
  )?.id === 'trip-destination',
  'final destination should be used when no active stop remains',
);

console.log('navigation-route-progress tests passed');
