const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function homeFixture() {
  const hooks = hookHarness(), reads = {}, actions = [];
  const nearest = { currentData: undefined, isError: false, isFetching: true, refetch: async () => ({ data: [] }) };
  const general = { currentData: undefined, isError: false, isFetching: false, isUninitialized: true, refetch: async () => ({ data: [] }) };
  const { useHomeTripFeed } = loader({ react: hooks.react,
    '@/features/home/homeModel': { HOME_MIN_AVAILABLE_SEATS: 1, HOME_PASSIVE_LIST_POLL_MS: 60000,
      roundCoordinate: n => Number(n.toFixed(3)), hasUpcomingDeparture: () => true },
    '@/store/api/tripApi': {
      useGetTripsByCoordinatesQuery: (payload, options) => { reads.nearby = { payload, options }; return nearest; },
      useGetTripsQuery: (payload, options) => { reads.general = { payload, options }; return general; },
    },
    '@/store/slices/tripsSlice': { setTrips: trips => trips },
  })('hooks/home/useHomeTripFeed.ts');
  const props = { lastKnownLocation: { coords: { latitude: -4.3, longitude: 15.3 } },
    locationRadiusKm: 10, isFocused: true, storedTrips: [], dispatch: action => actions.push(action) };
  return { reads, nearest, general, props, actions, render: () => hooks.render(() => useHomeTripFeed(props)) };
}

test('home waits for nearby results before requesting a general fallback', () => {
  const app = homeFixture(); app.render();
  assert.equal(app.reads.nearby.options.skip, false);
  assert.equal(app.reads.general.options.skip, true);
  app.nearest.currentData = [{ id: 'nearby' }];
  app.nearest.isFetching = false;
  assert.deepEqual(app.render().remoteTrips, [{ id: 'nearby' }]);
  assert.equal(app.reads.general.options.skip, true);
  app.nearest.currentData = [];
  app.general.currentData = [{ id: 'fallback' }];
  assert.deepEqual(app.render().remoteTrips, [{ id: 'fallback' }]);
  assert.equal(app.reads.general.options.skip, false);
});

test('home skips both feeds while hidden, and supports a location/network fallback', () => {
  const app = homeFixture(); app.props.isFocused = false; app.render();
  assert.equal(app.reads.nearby.options.skip, true);
  assert.equal(app.reads.general.options.skip, true);
  app.props.isFocused = true;
  app.nearest.isError = true; app.render();
  assert.equal(app.reads.general.options.skip, false);
  app.props.lastKnownLocation = null; app.render();
  assert.equal(app.reads.nearby.options.skip, true);
  assert.equal(app.reads.general.options.skip, false);
});

test('discovery keeps at most three pages and supports both cursor directions', () => {
  const { buildTripDiscovery } = loader({
    './tripMapper': { mapServerTripToClient: value => ({ id: value.id }) },
  })('store/api/trip/discovery.ts');
  const endpoint = buildTripDiscovery({ infiniteQuery: options => options }).getTripDiscovery;
  assert.equal(endpoint.infiniteQueryOptions.maxPages, 3);
  assert.deepEqual(endpoint.infiniteQueryOptions.getNextPageParam({ nextCursor: 'after' }), { cursor: 'after', direction: 'next' });
  assert.deepEqual(endpoint.infiniteQueryOptions.getPreviousPageParam({ previousCursor: 'before' }), { cursor: 'before', direction: 'previous' });
  const request = endpoint.query({ queryArg: { minSeats: 2 }, pageParam: { cursor: null, direction: 'next' } });
  assert.equal(request.url, '/trips/discovery');
  assert.equal(request.body.limit, 30);
  assert.equal(request.body.minSeats, 2);
  assert.equal(request.body.cursor, undefined);
});
