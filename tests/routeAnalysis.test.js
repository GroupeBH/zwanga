const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { createRouteAnalysisCache } = load('utils/navigation/routeAnalysis.ts');
const { getPolylineProgress, distanceFromCoordinateToPolyline, isRouteDeviationConfirmed } = load('utils/navigation/routeProgress.ts');
const { getRouteAlignedPosition } = load('utils/routes/routeGeometry.ts');
const point = (lat, lng) => ({ latitude: lat, longitude: lng });
const longRoute = (count = 4000) => Array.from({ length: count }, (_, i) =>
  point(-4.32 + Math.sin(i * 0.009) * 0.006, 15.2 + i * 0.000025));
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${message}: ${actual} vs ${expected}`);

function sameAnalysis(cache, route, current, context = 'trip:pickup') {
  const actual = cache.analyze(route, current, context);
  const expected = getPolylineProgress(current, route);
  const alignment = getRouteAlignedPosition(current, route, Infinity);
  if (!expected) { assert.equal(actual, null); return; }
  const progress = actual.progress;
  assert.equal(progress.closestPoint.segmentIndex, expected.closestPoint.segmentIndex);
  close(progress.closestPoint.coordinate.latitude, expected.closestPoint.coordinate.latitude, 'latitude');
  close(progress.closestPoint.coordinate.longitude, expected.closestPoint.coordinate.longitude, 'longitude');
  close(progress.closestPoint.distanceMeters, expected.closestPoint.distanceMeters, 'deviation');
  close(progress.distanceFromStartMeters, expected.distanceFromStartMeters, 'progress');
  close(progress.distanceToEndMeters, expected.distanceToEndMeters, 'remaining');
  close(progress.routeDistanceMeters, expected.routeDistanceMeters, 'total');
  close(actual.alignment.distanceKm, alignment.distance, 'heading distance');
  close(actual.alignment.heading, alignment.heading, 'heading');
  for (const limit of [55, 80]) {
    assert.equal(progress.closestPoint.distanceMeters > limit, expected.closestPoint.distanceMeters > limit);
  }
}

test('indexed geometry matches both original projections across a long route, reversing and distant fixes', () => {
  const route = longRoute();
  const cache = createRouteAnalysisCache();
  for (let i = 0; i < route.length; i += 37) sameAnalysis(cache, route,
    point(route[i].latitude + 0.00013, route[i].longitude - 0.00007));
  for (let i = route.length - 1; i >= 0; i -= 79) sameAnalysis(cache, route,
    point(route[i].latitude - 0.00045, route[i].longitude));
  for (const current of [point(-4.2, 15.4), point(-4.5, 15.2), point(-12, 29), point(4, 13)]) {
    sameAnalysis(cache, route, current);
  }
  assert.equal(cache.getStats().builds, 1);
});

test('self intersections, parallel roads, ties, duplicate vertices and short segments retain original decisions', () => {
  const a = point(-4.32, 15.3), b = point(-4.31, 15.31);
  const cases = [
    [a, b, point(-4.31, 15.3), point(-4.32, 15.31), a],
    [a, b, a, b, a],
    [a, a, a, b, b],
    [a, point(-4.32, 15.32), point(-4.3199, 15.32), point(-4.3199, 15.3)],
    [a, point(-4.31999, 15.3), point(-4.31998, 15.3)],
  ];
  for (const route of cases) {
    const cache = createRouteAnalysisCache();
    for (const current of [...route, point(-4.315, 15.305), point(-4.31995, 15.31)]) {
      sameAnalysis(cache, route, current);
    }
  }
});

test('deterministic randomized routes agree with the exhaustive oracle without heading/progress metric substitution', () => {
  let seed = 98412;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trace = 0; trace < 25; trace++) {
    const route = Array.from({ length: 160 }, () => point(-5 + random(), 15 + random()));
    const cache = createRouteAnalysisCache();
    for (let i = 0; i < 20; i++) sameAnalysis(cache, route, point(-5 + random(), 15 + random()));
  }
});

test('route replacement, waypoint/trip scope changes and long silence reset bounded cached work', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  const cache = createRouteAnalysisCache(), route = longRoute(120);
  const first = cache.analyze(route, route[20], 'trip:pickup');
  assert.equal(cache.analyze(route, route[20], 'trip:pickup'), first);
  assert.equal(cache.getStats().cacheHits, 1);
  sameAnalysis(cache, route, route[25], 'trip:pickup');
  sameAnalysis(cache, route, route[26], 'trip:pickup');
  assert.equal(cache.getStats().retainedResults, 2);
  cache.analyze(route, route[20], 'trip:dropoff');
  assert.equal(cache.getStats().builds, 2);
  cache.analyze([...route].reverse(), route[20], 'trip:dropoff');
  assert.equal(cache.getStats().builds, 3);
  cache.analyze(route, route[20], 'other-trip:dropoff');
  const before = cache.getStats();
  t.mock.timers.tick(11_000);
  sameAnalysis(cache, route, route[20], 'other-trip:dropoff');
  assert.equal(cache.getStats().builds, before.builds);
  assert.equal(cache.getStats().queries, before.queries + 1);
  for (const bad of [[], [route[0]], [route[0], point(NaN, 15)]]) {
    assert.equal(cache.analyze(bad, route[0]), null);
  }
  assert.equal(cache.analyze(route, point(0, 0)), null);
});

test('recalculation keeps the 55 m threshold, accuracy, consecutive fixes and cooldown contract', () => {
  const route = [point(-4.4, 15.3), point(-4.3, 15.3)];
  const cache = createRouteAnalysisCache();
  for (const meters of [0, 54.99, 55, 55.01, 80, 140]) {
    const current = point(-4.35, 15.3 + meters / (111195 * Math.cos(-4.35 * Math.PI / 180)));
    const actual = cache.analyze(route, current).progress.closestPoint.distanceMeters;
    const expected = distanceFromCoordinateToPolyline(current, route);
    for (const accuracy of [null, 10, 81]) for (const count of [0, 1, 2, 3]) {
      const options = { gpsAccuracyMeters: accuracy, consecutiveOffRouteCount: count,
        nowMs: 100_000, lastRecalculationAtMs: 0, routeDeviationThresholdMeters: 55,
        confirmationCount: 2, minRecalculationIntervalMs: 12_000 };
      assert.equal(isRouteDeviationConfirmed({ ...options, distanceFromRouteMeters: actual }),
        isRouteDeviationConfirmed({ ...options, distanceFromRouteMeters: expected }));
    }
  }
});

test('long-route updates examine far fewer segments without restricting search to a forward-only window', () => {
  const route = longRoute(8000), cache = createRouteAnalysisCache();
  cache.analyze(route, route[1000]);
  const before = cache.getStats();
  for (let i = 1001; i < 1201; i++) cache.analyze(route, point(route[i].latitude + 0.00002, route[i].longitude));
  const examined = cache.getStats().segments - before.segments;
  assert.ok(examined < 200 * route.length / 10, `examined ${examined} segments`);
  sameAnalysis(cache, route, route[20], ''); // Sudden return to a much earlier segment still finds it.
});
