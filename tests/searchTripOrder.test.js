const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { sortSearchTrips } = loader()('features/search/sortSearchTrips.ts');
const origin = { latitude: -4.34, longitude: 15.28 };
const trip = (id, time, distance, price = 1000) => ({ id, price, departureTime: `2030-01-01T${time}:00Z`,
  departure: distance === null ? {} : { lat: -4.34, lng: 15.28 + distance }, arrival: {}, availableSeats: 4 });
test('cached trips rank by departure date, then proximity, then stable ID, without mutating cache', () => {
  const trips = Object.freeze([trip('late-near', '15:00', 0), trip('early-far', '10:00', 1),
    trip('early-near', '10:00', 0), trip('unknown', '10:00', null)]);
  assert.deepEqual(sortSearchTrips(trips, false, origin).map(t => t.id), ['early-near', 'early-far', 'unknown', 'late-near']);
  assert.equal(trips[0].id, 'late-near');
  assert.deepEqual(sortSearchTrips(trips, false, null).map(t => t.id), ['early-far', 'early-near', 'unknown', 'late-near']);
  assert.equal(sortSearchTrips([trip('later-cheap', '15:00', 1, 500), ...trips], true, origin)[0].id, 'later-cheap');
});
test('remote global ordering is not replaced by a per-page mobile sort', () => {
  const h = hookHarness(), { useSearchResults } = loader({ react: h.react })('hooks/search/useSearchResults.ts');
  const remoteTrips = [trip('first-server', '10:00', 1), trip('second-server', '10:00', 0)];
  const result = h.render(() => useSearchResults({ remoteTrips, storedTrips: [], advancedTrips: null, searchMode: 'trips',
    departure: '', arrival: '', desiredSeats: 1, sortMode: 'early', tripCoordinate: origin, driverCoordinate: null,
    availableTripRequests: [], serverOrderedTrips: true, isDriverAccount: false }));
  assert.deepEqual(result.filteredTrips, remoteTrips); h.unmount();
});
test('sort origin can arrive late, stays stable across location updates and resets on account change', () => {
  const h = hookHarness(); let coords = null, reads = 0;
  const { useSearchSortOrigin } = loader({ react: h.react,
    '@/store/hooks': { useAppSelector: selector => selector({ location: { get lastKnownLocation() { reads++; return { coords }; } } }) },
  })('hooks/search/useSearchSortOrigin.ts');
  const render = (user = 'one', active = true) => h.render(() => useSearchSortOrigin(user, active));
  assert.equal(render(), null); coords = origin; assert.deepEqual(render(), origin);
  const before = reads; coords = { latitude: -4.4, longitude: 15.4 };
  assert.deepEqual(render(), origin); assert.equal(reads, before);
  assert.deepEqual(render('one', false), origin); assert.equal(reads, before);
  assert.deepEqual(render('two'), coords); h.unmount();
});
