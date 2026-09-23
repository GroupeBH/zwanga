const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const trip = (id, driverId, price = 2000) => Object.freeze({
  id, driverId, price, availableSeats: 4, departureTime: '2026-09-20T10:00:00Z',
  departure: { name: 'Gombe' }, arrival: { name: 'UPN' },
});
const own = trip('own', 'me', 0), other = trip('other', 'another-driver');
const nested = Object.freeze({ ...trip('nested-owner', undefined), driver: { id: 'me' } });
const trips = Object.freeze([own, other, nested]);
function setup(overrides = {}) {
  const hooks = hookHarness();
  const { useSearchResults } = loader({ react: hooks.react })('hooks/search/useSearchResults.ts');
  const params = { advancedTrips: null, remoteTrips: undefined, storedTrips: [], searchMode: 'trips',
    departure: '', arrival: '', desiredSeats: 1, sortMode: 'cheap', driverCoordinate: null,
    availableTripRequests: [], isDriverAccount: true, currentUser: { id: 'me' }, ...overrides };
  return { params, hooks, render: () => hooks.render(() => useSearchResults(params)) };
}

for (const source of ['advancedTrips', 'remoteTrips', 'storedTrips']) {
  test(`search hides owned trips from ${source} without changing the shared cache`, () => {
    const app = setup({ [source]: trips });
    const result = app.render();
    assert.deepEqual(result.filteredTrips.map(item => item.id), ['other']);
    assert.equal(result.baseTrips, trips);
    assert.deepEqual(trips.map(item => item.id), ['own', 'other', 'nested-owner']);
    app.hooks.unmount();
  });
}

test('ownership updates when the signed-in account changes and preserves guest results', () => {
  const app = setup({ remoteTrips: trips });
  assert.deepEqual(app.render().filteredTrips.map(item => item.id), ['other']);
  app.params.currentUser = { id: 'another-driver' };
  assert.deepEqual(app.render().filteredTrips.map(item => item.id), ['own', 'nested-owner']);
  app.params.currentUser = undefined;
  assert.equal(app.render().filteredTrips.length, 3);
  app.hooks.unmount();
});

test('memoization, seat/route filters and sorting still work after ownership exclusion', () => {
  const app = setup({ remoteTrips: Object.freeze([own, other, trip('cheaper', 'third-driver', 1000)]) });
  const first = app.render().filteredTrips;
  for (let i = 0; i < 100; i++) {
    app.params.currentUser = { id: 'me', name: `Profile refresh ${i}` };
    assert.equal(app.render().filteredTrips, first);
  }
  assert.deepEqual(first.map(item => item.id), ['cheaper', 'other']);
  app.params.desiredSeats = 5; assert.equal(app.render().filteredTrips.length, 0);
  app.params.desiredSeats = 4; app.params.departure = 'Gombe';
  assert.equal(app.render().filteredTrips.length, 2);
  app.params.departure = 'Unknown'; assert.equal(app.render().filteredTrips.length, 0);
  app.hooks.unmount();
});

test('hidden search keeps its snapshot without reading new routes, but clears it across accounts', () => {
  const app = setup({ remoteTrips: trips });
  const before = app.render();
  app.params.isScreenActive = false;
  app.params.remoteTrips = [{ get id() { throw new Error('Hidden list must not be traversed'); } }];
  assert.equal(app.render().filteredTrips, before.filteredTrips);
  assert.equal(app.render().baseTrips, before.baseTrips);
  app.params.currentUser = { id: 'another-user' };
  assert.deepEqual(app.render().filteredTrips, []);
  assert.deepEqual(app.render().baseTrips, []);
  app.params.remoteTrips = trips; app.params.isScreenActive = true;
  assert.equal(app.render().filteredTrips.length, 3);
  app.hooks.unmount();
});
