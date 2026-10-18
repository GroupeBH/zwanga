const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { createPassengerRouteAnalysis } = load('utils/navigation/passengerRouteAnalysis.ts');
const { trimPolylineFromCurrentPosition } = load('utils/navigation/routeProgress.ts');
const { getRouteAlignedPosition } = load('utils/routes/routeGeometry.ts');

test('passenger analysis preserves heading, route segments, distances and fallbacks on a long route', () => {
  const route = Array.from({ length: 8000 }, (_, i) => ({ latitude: -4.32 + Math.sin(i * .009) * .006, longitude: 15.2 + i * .000025 }));
  const cache = createPassengerRouteAnalysis();
  for (const i of [0, 100, 4000, 3998, 7998, 7000]) {
    for (const delta of [0, .00004, .01]) {
      const point = { ...route[i], latitude: route[i].latitude + delta };
      assert.ok(Math.abs(cache.heading(route, point) - (getRouteAlignedPosition(point, route, .1)?.heading ?? 0)) < 1e-10);
      assert.deepEqual(cache.remaining(route, point, route.at(-1)), trimPolylineFromCurrentPosition(point, route, route.at(-1)));
    }
  }
  assert.equal(cache.getStats().builds, 1);
  assert.ok(cache.getStats().retainedResults <= 2);
  assert.ok(cache.getStats().segments < 8000 * 19, 'indexed lookups prune distant segments');
});

test('intersections, duplicate vertices, reversed routes, missing positions and changed destinations remain equivalent', () => {
  const a = { latitude: -4.3, longitude: 15.3 }, b = { latitude: -4.31, longitude: 15.31 };
  const routes = [[], [a], [a, a, b, a, b], [a, b, { latitude: -4.3, longitude: 15.31 }, { latitude: -4.31, longitude: 15.3 }]];
  const cache = createPassengerRouteAnalysis();
  for (const route of routes) for (const point of [null, a, b]) for (const destination of [null, a, b, { latitude: -4.5, longitude: 15.8 }]) {
    assert.deepEqual(cache.remaining(route, point, destination), trimPolylineFromCurrentPosition(point, route, destination));
  }
  const route = routes.at(-1);
  cache.remaining(route, a, b);
  const before = cache.getStats().builds;
  const reversed = [...route].reverse();
  assert.deepEqual(cache.remaining(reversed, a, b), trimPolylineFromCurrentPosition(a, reversed, b));
  assert.equal(cache.getStats().builds, before + 1);
});
