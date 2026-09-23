const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture() {
  const counts = { reads: 0, writes: 0, removes: 0 };
  let stored = JSON.stringify({ tripId: 'trip', arrivalCoordinate: { latitude: -4.4, longitude: 15.4 },
    lastDriverCoordinate: { latitude: -4.3, longitude: 15.3 }, nearDestinationSinceMs: null,
    autoCompleteDistanceMeters: null, autoCompleteDwellMs: null });
  const load = loader({
    '@react-native-async-storage/async-storage': {
      getItem: async () => { counts.reads++; return stored; },
      setItem: async (_key, value) => { counts.writes++; stored = value; },
      removeItem: async () => { counts.removes++; stored = null; },
    },
    'expo-location': {}, 'react-native': { Platform: { OS: 'ios' } },
    './driverTaskLifecycle': { stopRegisteredDriverBackgroundLocationTask: async () => {} },
    '@/services/tokenRefresh': {}, '@/store': {}, '@/store/api/tripApi': {},
  });
  return { counts, value: () => stored, session: load('services/driverBackgroundLocationSession.ts'),
    completion: load('services/background/driverTripCompletion.ts') };
}

test('one hour of identical samples loads once and writes no identical checkpoint', async () => {
  const f = fixture();
  for (let i = 0; i < 1800; i++) await f.completion.evaluateBackgroundTripEnd('trip', [{
    timestamp: Date.now(), coords: { latitude: -4.3, longitude: 15.3, accuracy: 5 },
  }]);
  assert.deepEqual(f.counts, { reads: 1, writes: 0, removes: 0 });
});

test('changed fixes and dwell state remain durable; concurrent writes cannot restore a stopped trip', async () => {
  const f = fixture();
  await f.session.updateActiveDriverBackgroundTripSession(current => ({ ...current,
    nearDestinationSinceMs: 123, lastDriverCoordinate: { latitude: -4.39, longitude: 15.39 } }));
  assert.equal(JSON.parse(f.value()).nearDestinationSinceMs, 123); assert.equal(f.counts.writes, 1);
  await Promise.all([
    f.session.updateActiveDriverBackgroundTripSession(current => ({ ...current, nearDestinationSinceMs: 456 })),
    f.session.clearActiveDriverBackgroundTripId('trip'),
    f.session.updateActiveDriverBackgroundTripSession(current => ({ ...current, nearDestinationSinceMs: 789 })),
  ]);
  assert.equal(f.value(), null); assert.equal(await f.session.getActiveDriverBackgroundTripSession(), null);
});

test('stopping the previous ride never deletes a newly started ride', async () => {
  const f = fixture();
  await f.session.setActiveDriverBackgroundTripId('new-trip');
  assert.equal(await f.session.clearActiveDriverBackgroundTripId('trip'), false);
  assert.equal(JSON.parse(f.value()).tripId, 'new-trip');
});
