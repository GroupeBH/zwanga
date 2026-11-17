const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const destination = { latitude: -4.3, longitude: 15.3 };
const point = (north, east = 0) => ({ latitude: destination.latitude + north / 111_320,
  longitude: destination.longitude + east / (111_320 * Math.cos(destination.latitude * Math.PI / 180)) });
// A curved route can start on the extension of its final segment.
const route = [point(1000), point(500, 500), point(-100), destination];
const { evaluateDestinationPassage } = loader()('utils/navigation/tripCompletion.ts');

for (const distance of [60, 1000, 5000]) {
  test(`starting ${distance}m beyond the destination plane is not an observed arrival`, () => {
    const result = evaluateDestinationPassage({ destinationCoordinate: destination,
      driverCoordinate: point(distance), routeCoordinates: route });
    assert.equal(result.shouldComplete, false);
    assert.equal(result.hasPassedDestinationOnRoute, false);
  });
}

test('a stationary driver and a recalculated route cannot manufacture a crossing', () => {
  for (const reference of [route, [point(-300), destination]]) {
    const result = evaluateDestinationPassage({ destinationCoordinate: destination,
      driverCoordinate: point(1000), previousDriverCoordinate: point(1000), routeCoordinates: reference });
    assert.equal(result.shouldComplete, false);
  }
});

test('a kilometre-scale GPS jump across the destination cannot finish the trip', () => {
  assert.equal(evaluateDestinationPassage({ destinationCoordinate: destination,
    previousDriverCoordinate: point(-1000), driverCoordinate: point(1000), routeCoordinates: route }).shouldComplete, false);
});

test('true arrival, short observed crossing and an approach before arrival remain distinct', () => {
  assert.equal(evaluateDestinationPassage({ destinationCoordinate: destination, driverCoordinate: point(10) }).shouldComplete, true);
  assert.equal(evaluateDestinationPassage({ destinationCoordinate: destination,
    previousDriverCoordinate: point(-100), driverCoordinate: point(100) }).shouldComplete, true);
  assert.equal(evaluateDestinationPassage({ destinationCoordinate: destination,
    previousDriverCoordinate: point(-100), driverCoordinate: point(-60), routeCoordinates: route }).shouldComplete, false);
});

function navigationFixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const hooks = hookHarness(), completions = [];
  const { useDriverRouteProgressTracking } = loader({ react: hooks.react,
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: value => value } },
    'react-native-maps': { PROVIDER_GOOGLE: 'google' }, 'expo-location': {},
    '@/utils/routeHelpers': loader()('utils/routes/routeGeometry.ts'),
  })('hooks/driver-navigation/useDriverRouteProgressTracking.ts');
  const ref = current => ({ current });
  const props = {
    data: { tripId: 'published-test-trip', isTripOngoing: true, trip: { startedAt: new Date(999_000).toISOString() },
      tripDepartureCoordinate: route[0], tripArrivalCoordinate: destination },
    refs: { currentLocationRef: ref(null), tripDestinationNearSinceMsRef: ref(null) },
    mapState: { currentLocation: null, waypoints: [], livePassengerLocations: {}, lastTripCompletionCheckCoordinateRef: ref(null) },
    notices: {}, completion: { getTripDestinationReferenceRoute: () => route,
      presentTripDestinationNotice: () => {}, tryCompleteTripFromNavigation: distance => completions.push(distance) },
  };
  t.after(() => hooks.unmount());
  return { props, completions, sample(coordinate, overrides = {}) {
    props.mapState.currentLocation = { coords: { ...coordinate, accuracy: 5 }, timestamp: Date.now(), ...overrides };
    hooks.render(() => useDriverRouteProgressTracking(props));
  } };
}

test('published trip navigation never sends completion at opening or route refresh far from arrival', t => {
  const f = navigationFixture(t);
  f.sample(route[0]); f.sample(route[0]);
  t.mock.timers.tick(5000); f.sample(point(990));
  assert.equal(f.completions.length, 0);
  t.mock.timers.tick(5000); f.sample(point(-100));
  assert.equal(f.completions.length, 0);
  t.mock.timers.tick(5000); f.sample(point(10));
  assert.equal(f.completions.length, 1);
});

for (const [label, overrides] of [
  ['cached', { timestamp: 900_000 }], ['before start', { timestamp: 998_000 }],
  ['future', { timestamp: 1_010_000 }], ['mocked', { mocked: true }],
  ['uncertain', { coords: { ...destination, accuracy: 500 } }],
]) {
  test(`navigation does not finish from a ${label} fix at the destination`, t => {
    const f = navigationFixture(t);
    f.sample(destination, overrides);
    assert.equal(f.completions.length, 0);
  });
}
