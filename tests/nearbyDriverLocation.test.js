const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fix = (now, latitude = 0) => ({ timestamp: now, coords: { latitude, longitude: 0, accuracy: 20 } });
const policy = loader()('services/nearbyDriverLocationPolicy.ts');

test('GPS policy rejects stale, inaccurate, future, mocked and malformed fixes', () => {
  const now = 100000;
  assert.equal(policy.isUsableNearbyDriverPosition(fix(now), now), true);
  for (const value of [fix(now - 30001), fix(now + 5001), fix(now, NaN), fix(now, 91),
    { ...fix(now), mocked: true }, ...[null, -1, Infinity, 251].map(accuracy => ({
      ...fix(now), coords: { ...fix(now).coords, accuracy },
    }))]) assert.equal(policy.isUsableNearbyDriverPosition(value, now), false);
});

test('movement is throttled at 60s; stationary drivers renew at 120s with a new fix', () => {
  const start = 100000, previous = fix(start);
  assert.equal(policy.shouldSendNearbyDriverPosition(null, previous, 0, start), true);
  assert.equal(policy.shouldSendNearbyDriverPosition(previous, fix(start + 59999, 1), start, start + 59999), false);
  assert.equal(policy.shouldSendNearbyDriverPosition(previous, fix(start + 60000, 0.002), start, start + 60000), true);
  assert.equal(policy.shouldSendNearbyDriverPosition(previous, fix(start + 60000, 0.0001), start, start + 60000), false);
  assert.equal(policy.shouldSendNearbyDriverPosition(previous, fix(start + 120000), start, start + 120000), true);
  assert.equal(policy.shouldSendNearbyDriverPosition(previous, previous, start, start + 120000), false);
});

const OWNER_KEY = 'zwanga.nearbyDriverLocationConsent.v1';
const disabledKey = id => `zwanga.nearbyDriverLocationDisabled.v1:${id}`;
function fixture({ savedOwner = 'driver', platform = 'android', disk = new Map(), initialRunning = false } = {}) {
  if (savedOwner && !disk.has(OWNER_KEY)) disk.set(OWNER_KEY, savedOwner);
  let version = 0, trip = null, passenger = null, running = initialRunning, permission = true;
  let waitStart, waitPermission, waitRead, account = 'driver';
  const starts = [], stops = [], sends = [], definitions = [], permissionReads = [], publications = [];
  const appState = { currentState: 'active' };
  const load = loader({
    '@react-native-async-storage/async-storage': {
      getItem: async key => { if (waitRead) await waitRead; return disk.get(key) ?? null; },
      setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); },
    },
    'react-native': { Platform: { OS: platform }, AppState: appState },
    'expo-location': {
      Accuracy: { Balanced: 3 }, ActivityType: { Other: 1 },
      getBackgroundPermissionsAsync: async () => { permissionReads.push(1); if (waitPermission) await waitPermission; return { granted: permission }; },
      hasServicesEnabledAsync: async () => true,
      hasStartedLocationUpdatesAsync: async () => running,
      startLocationUpdatesAsync: async (name, options) => {
        starts.push({ name, options }); if (waitStart) await waitStart; running = true;
      },
      stopLocationUpdatesAsync: async () => { stops.push('stop'); running = false; },
    },
    'expo-task-manager': { isAvailableAsync: async () => true, isTaskDefined: () => false,
      defineTask: (name, handler) => definitions.push({ name, handler }) },
    './driverBackgroundLocationSession': { getActiveDriverBackgroundTripSession: async () => trip },
    './background/passengerTaskLifecycle': { getActiveTrackingSession: async () => passenger },
    './tokenStorage': { getTokens: async () => ({ accessToken: 'test' }) },
    './tokenSession': { getTokenSessionVersion: () => version },
    '@/utils/jwt': { decodeJWT: () => ({ sub: account }) },
    './nearbyDriverPositionDelivery': { sendNearbyDriverPosition: async (...args) => { sends.push(args); return 'sent'; } },
    './rideLocationStream': { publishNativeRideLocation: (...args) => publications.push(args), invalidateNativeRideLocation() {} },
  });
  return { api: load('services/nearbyDriverLocation.ts'), starts, stops, sends, definitions, appState, permissionReads, publications,
    disk, saved: () => disk.get(OWNER_KEY) ?? null, running: () => running, setTrip: value => { trip = value; },
    setPassenger: value => { passenger = value; }, setPermission: value => { permission = value; },
    setAccount: value => { account = value; version++; },
    waitStart: value => { waitStart = value; }, waitPermission: value => { waitPermission = value; },
    waitRead: value => { waitRead = value; },
  };
}

test('authorized drivers start by default without a profile opt-in, bound to the authenticated account', async () => {
  for (const savedOwner of [null, 'someone-else']) {
    const f = fixture({ savedOwner });
    assert.equal(await f.api.isNearbyDriverLocationEnabled('driver'), true);
    assert.equal(await f.api.ensureNearbyDriverLocation('driver'), true);
    assert.equal(f.starts.length, 1); assert.equal(f.saved(), 'driver');
  }
});

test('automatic start still requires system permission, foreground and the correct account', async () => {
  const f = fixture(); f.setPermission(false);
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
  f.setPermission(true); f.appState.currentState = 'background';
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
  assert.equal(f.starts.length, 0);
  f.appState.currentState = 'active'; f.setAccount('someone-else');
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
  assert.equal(f.starts.length, 0);
});

test('balanced profile is started once, with visible indicator and Android foreground notification', async () => {
  const f = fixture();
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), true);
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), true);
  assert.equal(f.starts.length, 1);
  const options = f.starts[0].options;
  assert.equal(options.accuracy, 3); assert.equal(options.timeInterval, 60000);
  assert.equal(options.deferredUpdatesInterval, 60000); assert.equal(options.showsBackgroundLocationIndicator, true);
  assert.equal(options.foregroundService.killServiceOnDestroy, true);
  assert.equal(options.distanceInterval, 0); assert.equal(options.pausesUpdatesAutomatically, false);
  const ios = fixture({ platform: 'ios' }); await ios.api.ensureNearbyDriverLocation('driver');
  assert.equal(ios.starts[0].options.foregroundService, undefined);
});

test('starting a ride pauses discovery before precise GPS; no second reader or upload during rides', async () => {
  for (const passenger of [false, true]) {
    const f = fixture(); await f.api.ensureNearbyDriverLocation('driver');
    if (passenger) f.setPassenger({ bookingId: 'ride' }); else f.setTrip({ tripId: 'ride' });
    await f.api.pauseNearbyDriverLocation();
    assert.equal(f.running(), false);
    assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
    await f.api.handleNearbyDriverLocations([fix(Date.now())]);
    assert.equal(f.starts.length, 1); assert.equal(f.sends.length, 0);
  }
});

test('a logout during a delayed native start stops it and clears its runtime owner', async () => {
  const f = fixture(), delay = deferred(); f.waitStart(delay.promise);
  const start = f.api.ensureNearbyDriverLocation('driver'); await tick();
  const stop = f.api.clearNearbyDriverLocation(); delay.resolve();
  assert.equal(await start, false); await stop;
  assert.equal(f.running(), false); assert.equal(f.saved(), null);
  await f.api.handleNearbyDriverLocations([fix(Date.now())]); assert.equal(f.sends.length, 0);
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false, 'late foreground return during logout stays stopped');
  f.setAccount('driver');
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), true, 'a fresh authenticated session restores the default');
});

test('an account switch clears the former task without blocking the newly authenticated driver', async () => {
  const f = fixture(); await f.api.ensureNearbyDriverLocation('driver');
  f.setAccount('next-driver'); await f.api.clearNearbyDriverLocation({ endSession: false });
  assert.equal(f.running(), false); assert.equal(f.saved(), null);
  assert.equal(await f.api.ensureNearbyDriverLocation('next-driver'), true);
  assert.equal(f.saved(), 'next-driver');
});

test('logout while permission/read awaits cannot resurrect native tracking', async () => {
  for (const kind of ['waitPermission', 'waitRead']) {
    const f = fixture(), delay = deferred(); f[kind](delay.promise);
    const start = f.api.ensureNearbyDriverLocation('driver'); await tick();
    const stop = f.api.clearNearbyDriverLocation(); delay.resolve(); await start; await stop;
    assert.equal(f.starts.length, 0); assert.equal(f.saved(), null);
    assert.equal(await f.api.isNearbyDriverLocationEnabled('driver'), true);
  }
});

test('a delayed permission acceptance cannot enable GPS for a switched account', async () => {
  const f = fixture({ savedOwner: null }); f.setAccount('new-driver');
  await f.api.setNearbyDriverLocationEnabled('driver', true, 0);
  assert.equal(f.saved(), null);
  await f.api.setNearbyDriverLocationEnabled('driver', true, 1);
  assert.equal(f.saved(), null);
});

test('explicit opt-out stops tracking and survives foreground reconciliation, logout and cold restart', async () => {
  const f = fixture(); await f.api.ensureNearbyDriverLocation('driver');
  await f.api.setNearbyDriverLocationEnabled('driver', false);
  assert.equal(f.running(), false); assert.equal(f.saved(), null);
  assert.equal(await f.api.isNearbyDriverLocationEnabled('driver'), false);
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
  await f.api.clearNearbyDriverLocation();
  const restored = fixture({ savedOwner: null, disk: f.disk });
  assert.equal(await restored.api.isNearbyDriverLocationEnabled('driver'), false);
  assert.equal(await restored.api.ensureNearbyDriverLocation('driver'), false);
  restored.setAccount('another-driver');
  assert.equal(await restored.api.ensureNearbyDriverLocation('another-driver'), true);
  assert.equal(await restored.api.isNearbyDriverLocationEnabled('driver'), false);
});

test('re-enabling only removes the opt-out; system permission is still necessary', async () => {
  const f = fixture(); await f.api.setNearbyDriverLocationEnabled('driver', false);
  await f.api.setNearbyDriverLocationEnabled('driver', true);
  f.setPermission(false);
  assert.equal(await f.api.isNearbyDriverLocationEnabled('driver'), true);
  assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
  f.setPermission(true); assert.equal(await f.api.ensureNearbyDriverLocation('driver'), true);
});

test('opt-out racing a delayed native start cannot be undone by automatic reconciliation', async () => {
  const f = fixture(), delay = deferred(); f.waitStart(delay.promise);
  const start = f.api.ensureNearbyDriverLocation('driver'); await tick();
  const disable = f.api.setNearbyDriverLocationEnabled('driver', false); delay.resolve();
  assert.equal(await start, false); await disable;
  assert.equal(f.running(), false); assert.equal(await f.api.ensureNearbyDriverLocation('driver'), false);
});

test('a cold native callback stops a leftover registration for an opted-out account', async () => {
  const disk = new Map([[disabledKey('driver'), '1']]);
  const f = fixture({ disk, initialRunning: true });
  await f.api.handleNearbyDriverLocations([fix(Date.now())]);
  assert.equal(f.sends.length, 0);
  assert.equal(f.running(), false); assert.equal(f.stops.length, 1);
});

test('native callback selects only the latest fix and rechecks revoked permission within 30 seconds', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(), now = Date.now();
  assert.equal(f.definitions.length, 1);
  await f.api.ensureNearbyDriverLocation('driver');
  await f.definitions[0].handler({ data: { locations: [fix(now - 60000), fix(now), fix(now - 100)] } });
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0][1].timestamp, now);
  f.setPermission(false); t.mock.timers.tick(30000);
  await f.api.handleNearbyDriverLocations([fix(Date.now())]);
  assert.equal(f.running(), false); assert.equal(f.sends.length, 1);
});

test('100 foreground callbacks share one permission lookup and publish usable map fixes before network delivery', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(); await f.api.ensureNearbyDriverLocation('driver');
  const initialReads = f.permissionReads.length;
  for (let i = 0; i < 100; i++) {
    t.mock.timers.tick(100);
    await f.api.handleNearbyDriverLocations([fix(Date.now())]);
  }
  assert.equal(f.permissionReads.length - initialReads, 1);
  assert.equal(f.publications.length, 100); assert.equal(f.publications[0][0], 'nearby:driver');
  t.mock.timers.tick(30000); await f.api.handleNearbyDriverLocations([fix(Date.now())]);
  assert.equal(f.permissionReads.length - initialReads, 2);
  await f.api.setNearbyDriverLocationEnabled('driver', false);
  await f.api.handleNearbyDriverLocations([fix(Date.now())]);
  assert.equal(f.publications.length, 101, 'opt-out is immediate, never delayed by the permission cache');
});
