const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const destination = { latitude: -4.3, longitude: 15.3 };

function completionFixture(extraSession = {}) {
  const requests = [], stops = [];
  const load = loader({
    'expo-location': {},
    './driverGpsProfile': { stopDriverGpsProfile: async id => { stops.push(id); } },
    '@/services/driverBackgroundLocationSession': {
      getActiveDriverBackgroundTripSession: async () => ({ tripId: 'test-trip', arrivalCoordinate: destination, ...extraSession }),
      updateActiveDriverBackgroundTripSession: async () => {},
    },
    '@/services/tokenRefresh': { hasRecoverableSession: async options => {
      assert.equal(options?.throwOnError, true); return true;
    } },
    '@/store/api/tripApi': { tripApi: { endpoints: { completeTrip: { initiate: id => id } } } },
    '@/store': { store: { dispatch: id => {
      requests.push(id);
      return Object.assign(Promise.resolve({ data: {} }), { reset() {}, abort() {} });
    } } },
  });
  return { api: load('services/background/driverTripCompletion.ts'), requests, stops };
}

test('old, future, simulated and uncertain positions never complete a trip', async () => {
  const now = Date.now(), fix = { timestamp: now, coords: { ...destination, accuracy: 5 } };
  const cases = [
    { ...fix, timestamp: now - 86400000 }, { ...fix, timestamp: now + 60000 },
    { ...fix, timestamp: NaN }, { ...fix, timestamp: 0 }, { ...fix, mocked: true },
    ...[null, undefined, NaN, Infinity, -1, 1000].map(accuracy => ({ ...fix, coords: { ...destination, accuracy } })),
    { ...fix, coords: null }, null,
  ];
  for (const sample of cases) {
    const f = completionFixture();
    assert.equal(await f.api.evaluateBackgroundTripEnd('test-trip', [sample]), false);
    assert.equal(f.requests.length, 0); assert.equal(f.stops.length, 0);
  }
});

test('a recent accurate arrival retains the existing automatic completion', async () => {
  const f = completionFixture();
  assert.equal(await f.api.evaluateBackgroundTripEnd('test-trip', [
    { timestamp: Date.now(), coords: { ...destination, accuracy: 5 } },
  ]), true);
  assert.deepEqual(f.requests, ['test-trip']); assert.deepEqual(f.stops, ['test-trip']);
});

test('an old saved checkpoint cannot invent a crossing, while two fresh observations still detect it', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const before = { latitude: destination.latitude - 0.002, longitude: destination.longitude };
  const after = { latitude: destination.latitude + 0.002, longitude: destination.longitude };
  const f = completionFixture({ lastDriverCoordinate: before });
  assert.equal(await f.api.evaluateBackgroundTripEnd('test-trip', [
    { timestamp: Date.now(), coords: { ...after, accuracy: 5 } },
  ]), false);
  assert.equal(f.requests.length, 0);
  t.mock.timers.tick(8000);
  assert.equal(await f.api.evaluateBackgroundTripEnd('test-trip', [
    { timestamp: Date.now(), coords: { ...before, accuracy: 5 } },
  ]), true);
});

function driverFixture() {
  let callback, tokenFailure = false, diskFailure = false;
  let stored = JSON.stringify({ tripId: 'test-trip' }), stops = 0, sends = 0;
  const load = loader({
    'expo-constants': { expoConfig: { extra: {} } },
    'expo-secure-store': { getItemAsync: async () => {
      if (tokenFailure) throw new Error('temporary secure read failure');
      return 'synthetic-token';
    } },
    './logoutIntent': { hasLogoutIntent: async () => false },
    '../store/api/authRefreshApi': {}, '../store/storeAccessor': {},
    '../utils/jwt': { isTokenExpired: () => false }, './networkRecovery': {},
    '@react-native-async-storage/async-storage': {
      getItem: async () => { if (diskFailure) throw new Error('temporary session read failure'); return stored; },
      setItem: async (_key, value) => { stored = value; }, removeItem: async () => { stored = null; },
    },
    'react-native': { Platform: { OS: 'android' } },
    'expo-location': {
      hasStartedLocationUpdatesAsync: async () => true,
      stopLocationUpdatesAsync: async () => { stops++; },
    },
    'expo-task-manager': {
      isAvailableAsync: async () => true, isTaskDefined: () => false,
      defineTask: (_name, handler) => { callback = handler; },
    },
    '../nearbyDriverLocation': { pauseNearbyDriverLocation: async () => {} },
    './locationDelivery': { isLocationDeliveryPending: () => false, wasLocationDeliveredRecently: () => false, recordLocationDelivery() {} },
    './rideLocationStream': { publishNativeRideLocation() {} },
    '@/store/api/tripApi': { tripApi: { endpoints: { updateDriverLocation: { initiate: value => value } } } },
    '@/store': { store: { dispatch: () => {
      sends++; return Object.assign(Promise.resolve({ data: {} }), { reset() {}, abort() {} });
    } } },
  });
  load('services/driverBackgroundLocationTask.ts');
  return {
    sample: () => callback({ data: { locations: [{ timestamp: Date.now(), coords: { ...destination, accuracy: 5 } }] } }),
    tokenFailure: value => { tokenFailure = value; }, diskFailure: value => { diskFailure = value; },
    stops: () => stops, sends: () => sends, stored: () => stored,
  };
}

test('temporary cold SecureStore failure preserves driver tracking and delivery resumes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const f = driverFixture(); f.tokenFailure(true);
  await f.sample();
  assert.equal(f.stops(), 0); assert.ok(f.stored()); assert.equal(f.sends(), 0);
  f.tokenFailure(false); t.mock.timers.tick(30000); await f.sample();
  assert.equal(f.sends(), 1); assert.equal(f.stops(), 0);
});

test('repeated driver session I/O failures are not interpreted as the end of a ride', async () => {
  const f = driverFixture(); f.diskFailure(true);
  await f.sample(); await f.sample();
  assert.equal(f.stops(), 0); assert.ok(f.stored());
  f.diskFailure(false); await f.sample();
  assert.equal(f.sends(), 1); assert.equal(f.stops(), 0);
});

test('foreground start retry is bounded, backs off and stops immediately on success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { retryGpsStart } = loader()('services/background/retryGpsStart.ts');
  const attempts = [];
  const cancel = retryGpsStart(async attempt => { attempts.push(attempt); return attempt === 2; });
  t.after(cancel); await tick();
  t.mock.timers.tick(29999); await tick(); assert.deepEqual(attempts, [0]);
  t.mock.timers.tick(1); await tick(); assert.deepEqual(attempts, [0, 1]);
  t.mock.timers.tick(60000); await tick(); assert.deepEqual(attempts, [0, 1, 2]);
  t.mock.timers.tick(1_000_000); await tick(); assert.equal(attempts.length, 3);
});

test('background/unmount cancellation prevents retries, including after a delayed failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { retryGpsStart } = loader()('services/background/retryGpsStart.ts');
  let release, attempts = 0;
  const cancel = retryGpsStart(() => { attempts++; return new Promise(resolve => { release = resolve; }); });
  cancel(); release(false); await tick();
  t.mock.timers.tick(1_000_000); await tick(); assert.equal(attempts, 1);
});

test('persistent native errors never create an unlimited restart loop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { retryGpsStart } = loader()('services/background/retryGpsStart.ts');
  let attempts = 0;
  const cancel = retryGpsStart(async () => { attempts++; throw new Error('native unavailable'); });
  t.after(cancel); await tick();
  for (const delay of [30000, 60000, 120000, 1_000_000]) { t.mock.timers.tick(delay); await tick(); }
  assert.equal(attempts, 4);
});
