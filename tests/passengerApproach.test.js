const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const model = loader()('features/notifications/passengerApproach.ts');
const pickup = { latitude: -4.3, longitude: 15.3 };
const trip = { id: 'trip', driverId: 'driver', status: 'ongoing', departure: { lat: -4.4, lng: 15.4 },
  vehicle: { brand: 'Test', model: 'Auto', color: 'bleu', licensePlate: 'TEST' } };
const booking = { id: 'booking', tripId: trip.id, passengerId: 'passenger', status: 'accepted', passengerOriginCoordinates: pickup };
const fix = (distance, time, accuracy) => ({ coordinates: [pickup.longitude, pickup.latitude + distance / 111195],
  updatedAt: new Date(time).toISOString(), ...(accuracy !== undefined ? { accuracy } : {}) });
const message = (state, now) => model.passengerApproachMessage(state, 'journey', trip, now);
const feed = (state, distance, now, accuracy) => model.observePassengerApproach(state, pickup, fix(distance, now, accuracy), now);

test('approach belongs to the passenger reservation, including a driver account travelling as passenger', () => {
  const context = model.passengerApproachContext('passenger', trip, booking);
  assert.deepEqual(context.pickup, pickup);
  assert.notEqual(context.key, model.passengerApproachContext('passenger', { ...trip, driverId: 'replacement' }, booking).key);
  assert.deepEqual(model.passengerApproachContext('passenger', trip, { ...booking, passengerOriginCoordinates: null }).pickup,
    { latitude: -4.4, longitude: 15.4 });
  for (const user of [undefined, 'driver', 'another']) assert.equal(model.passengerApproachContext(user, trip, booking), null);
  for (const status of ['upcoming', 'completed', 'cancelled']) assert.equal(model.passengerApproachContext('passenger', { ...trip, status }, booking), null);
  for (const status of ['pending', 'cancelled', 'rejected', 'no_show', 'completed']) assert.equal(model.passengerApproachContext('passenger', trip, { ...booking, status }), null);
  for (const flag of ['pickedUp', 'pickedUpConfirmedByPassenger', 'droppedOff', 'droppedOffConfirmedByPassenger']) {
    assert.equal(model.passengerApproachContext('passenger', trip, { ...booking, [flag]: true }), null);
  }
  assert.equal(model.passengerApproachContext('passenger', trip, { ...booking, tripId: 'other' }), null);
  assert.equal(model.passengerApproachContext('passenger', { ...trip, driverId: 'passenger' }, booking), null);
  assert.equal(model.passengerApproachContext('passenger', { ...trip, departure: {} }, { ...booking, passengerOriginCoordinates: null }), null);
});

test('started, 100m, 50m and 10m messages follow two distinct fresh positions per band', () => {
  const state = {};
  assert.match(message(state, 100000).text, /conducteur est en route/);
  feed(state, 150, 100000);
  for (const [band, at] of [[100, 105000], [50, 110000], [10, 115000]]) {
    feed(state, band - 2, at, 4);
    assert.notEqual(state.band, band);
    feed(state, band - 3, at + 1000, 4);
    assert.equal(state.band, band);
    assert.equal(message(state, at + 1000).key, `journey:${band}`);
    assert.match(message(state, at + 1000).text, new RegExp(`${band} mètres environ`));
  }
  assert.match(message(state, 116000).text, /Test Auto.*bleu.*TEST.*avant de monter/);
  feed(state, 90, 121000);
  assert.equal(state.band, 10, 'retreat/jitter cannot replay an earlier band');
  assert.equal(message(state, 121000), null, 'do not claim 10m while now 90m away');
  feed(state, 6, 126000);
  assert.equal(message(state, 126000).key, 'journey:10', 'same key lets shared speech deduplicate');
});

test('polling one fix repeatedly cannot confirm a threshold or refresh its age', () => {
  const state = {};
  const sample = fix(80, 100000);
  model.observePassengerApproach(state, pickup, sample, 100000);
  model.observePassengerApproach(state, pickup, sample, 105000);
  assert.equal(state.band, undefined);
  assert.equal(state.fix.time, 100000);
  feed(state, 79, 106000);
  assert.equal(state.band, 100);
  assert.equal(message(state, 121001), null);
});

test('invalid, missing, stale, reversed and implausibly future GPS fixes cannot produce a distance message', () => {
  const invalid = [
    { coordinates: null, updatedAt: new Date(100000).toISOString() },
    { coordinates: [NaN, -4.3], updatedAt: new Date(100000).toISOString() },
    { ...fix(8, 100000), updatedAt: undefined }, { ...fix(8, 100000), updatedAt: 'bad' },
    fix(8, 80000), fix(8, 106000), fix(8, 100000, -1), fix(8, 100000, NaN),
  ];
  for (const sample of invalid) {
    const state = {}; model.observePassengerApproach(state, pickup, sample, 100000);
    assert.equal(state.fix, undefined); assert.equal(state.band, undefined);
  }
  const state = {}; feed(state, 500, 100000);
  model.observePassengerApproach(state, pickup, fix(8, 99000), 100000);
  assert.equal(state.fix.time, 100000);
  feed(state, 8, 101000); feed(state, 7, 102000);
  assert.equal(state.band, undefined, 'hundreds of metres jumped in seconds are ignored');
});

test('reported poor precision blocks close bands; a gap or jitter requires confirmation anew', () => {
  const state = {}; feed(state, 8, 100000, 60); feed(state, 7, 102000, 60);
  assert.equal(state.band, undefined);
  feed(state, 7, 104000, 20); feed(state, 6, 106000, 20);
  assert.equal(state.band, 50, '20m precision cannot support the 10m announcement');
  feed(state, 7, 108000, 4); feed(state, 6, 125000, 4);
  assert.equal(state.band, 50, 'old candidate cannot confirm after a long silence');
  feed(state, 12, 127000, 4); feed(state, 7, 129000, 4);
  assert.equal(state.band, 50);
  feed(state, 6, 130000, 4); assert.equal(state.band, 10);
  feed(state, 6, 132000, 60); assert.equal(message(state, 132000), null);
});

test('a fast approach announces the closest confirmed band, not a stale backlog of distances', () => {
  const state = {}; feed(state, 90, 100000); feed(state, 40, 101000); feed(state, 7, 102000); feed(state, 6, 103000);
  assert.equal(state.band, 10); assert.equal(message(state, 103000).key, 'journey:10');
  state.closed = true; feed(state, 5, 104000);
  assert.equal(message(state, 104000), null); assert.equal(state.fix.time, 103000);
});

test('per-reservation memory survives screen changes, is bounded and resets with the auth session', () => {
  let version = 0;
  const session = loader({ './tokenSession': { getTokenSessionVersion: () => version } })('services/passengerApproachSession.ts');
  const first = session.passengerApproachState('first'); first.band = 10;
  assert.equal(session.passengerApproachState('first'), first);
  assert.equal(session.passengerApproachState('other').band, undefined);
  version++; assert.notEqual(session.passengerApproachState('first'), first);
  const oldest = session.passengerApproachState('oldest');
  for (let i = 0; i < 50; i++) session.passengerApproachState(`next-${i}`);
  assert.notEqual(session.passengerApproachState('oldest'), oldest);
});
