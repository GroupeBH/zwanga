const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native location requests require foreground and current context without consuming the dialog lock', async () => {
  const app = { currentState: 'background' }, calls = [];
  const { requestLocationPermission: request } = loader({ 'react-native': { AppState: app } })('services/locationPermissionWait.ts');
  const native = async () => { calls.push('prompt'); return 'granted'; };
  await assert.rejects(request(native), /DEFERRED/);
  app.currentState = 'active'; await assert.rejects(request(native, () => false), /DEFERRED/);
  assert.deepEqual(calls, []); assert.equal(await request(native), 'granted');
  assert.deepEqual(calls, ['prompt']);
});

test('an already visible OS dialog may finish after leaving the app, and keeps its mutex until then', async () => {
  const app = { currentState: 'active' };
  const { requestLocationPermission: request } = loader({ 'react-native': { AppState: app } })('services/locationPermissionWait.ts');
  let release; const first = request(() => new Promise(resolve => { release = resolve; }));
  app.currentState = 'inactive'; await assert.rejects(request(async () => {}), /DEFERRED/);
  app.currentState = 'active'; await assert.rejects(request(async () => {}), /PROMPT_PENDING/);
  app.currentState = 'background'; release('granted'); assert.equal(await first, 'granted');
  app.currentState = 'active'; assert.equal(await request(async () => 'granted'), 'granted');
});

test('automatic ride tracking waits for another permission flow, then rechecks foreground before requesting', async () => {
  for (const background of [false, true]) {
    const app = { currentState: 'active' }, calls = [];
    const { requestLocationPermission: request } = loader({ 'react-native': { AppState: app } })('services/locationPermissionWait.ts');
    let release; const first = request(() => new Promise(resolve => { release = resolve; }));
    const next = request(async () => { calls.push('next'); return 'granted'; }, undefined, true);
    // Observe rejection immediately to avoid an unhandled rejection in the deferred case.
    const observed = next.then(value => value, error => error.message);
    assert.deepEqual(calls, []);
    if (background) app.currentState = 'background';
    release(); await first;
    assert.equal(await observed, background ? 'LOCATION_PERMISSION_DEFERRED' : 'granted');
    assert.deepEqual(calls, background ? [] : ['next']);
  }
});

function trackingFixture(role, foregroundGranted) {
  const app = { currentState: 'active' }, calls = [];
  let release;
  const read = new Promise(resolve => { release = resolve; });
  const permission = granted => ({ status: granted ? 'granted' : 'undetermined', granted });
  const load = loader({
    'react-native': { Platform: { OS: 'ios' }, AppState: app },
    'expo-location': { PermissionStatus: { GRANTED: 'granted' },
      getForegroundPermissionsAsync: async () => { if (!foregroundGranted) await read; return permission(foregroundGranted); },
      getBackgroundPermissionsAsync: async () => { await read; return permission(false); },
      requestForegroundPermissionsAsync: async () => { calls.push('foreground'); return permission(true); },
      requestBackgroundPermissionsAsync: async () => { calls.push('background'); return permission(true); },
      hasServicesEnabledAsync: async () => true,
    },
    'expo-task-manager': { isAvailableAsync: async () => true, isTaskDefined: () => true },
    './background/driverTaskLifecycle': { isDriverBackgroundLocationAvailable: async () => true },
    './background/driverGpsProfile': { reserveDriverGpsStart: () => 1, startDriverGpsProfile: async () => { calls.push('start'); return true; } },
    './background/passengerGpsProfile': { reservePassengerGpsStart: () => 1, startPassengerGpsProfile: async () => { calls.push('start'); return true; } },
    './background/passengerTaskLifecycle': { getActiveTrackingSession: async () => null },
    './background/driverTripCompletion': {}, './background/passengerTrackingReads': {},
    '@/services/driverBackgroundLocationSession': {}, '@/services/tokenRefresh': {},
    './locationDelivery': {}, './rideLocationStream': {}, '@/store': {}, '@/store/api/tripApi': {}, '@/store/api/bookingApi': {},
  });
  const file = role === 'driver' ? 'services/driverBackgroundLocationTask.ts' : 'services/passengerBackgroundLocationTask.ts';
  const module = load(file);
  const start = role === 'driver' ? module.startDriverBackgroundLocationTracking : module.startPassengerBackgroundLocationTracking;
  return { app, calls, release, start: () => start('synthetic-ride', { requestMissingPermissions: true }) };
}

for (const role of ['driver', 'passenger']) {
  for (const foreground of [true, false]) {
    test(`${role}: leaving during a ${foreground ? 'background' : 'foreground'} permission read defers the prompt without treating it as a refusal`, async () => {
      const f = trackingFixture(role, foreground), task = f.start(); await tick();
      f.app.currentState = 'background'; f.release();
      assert.equal(await task, false); assert.deepEqual(f.calls, []);
      f.app.currentState = 'active'; assert.equal(await f.start(), true);
      assert.deepEqual(f.calls, foreground ? ['background', 'start'] : ['foreground', 'background', 'start']);
    });
  }
}
