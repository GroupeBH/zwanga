const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture() {
  let saved = null, running = false, stopWait, permissionWait;
  const starts = [], stops = [];
  const location = {
    Accuracy: { High: 4 }, ActivityType: { AutomotiveNavigation: 1 }, PermissionStatus: { GRANTED: 'granted' },
    getForegroundPermissionsAsync: async () => { if (permissionWait) await permissionWait; return { status: 'granted' }; },
    getBackgroundPermissionsAsync: async () => ({ status: 'granted' }), hasServicesEnabledAsync: async () => true,
    hasStartedLocationUpdatesAsync: async () => running,
    startLocationUpdatesAsync: async (_name, options) => { starts.push(options); running = true; },
    stopLocationUpdatesAsync: async () => { stops.push('stop'); if (stopWait) await stopWait; running = false; },
  };
  const load = loader({
    '@react-native-async-storage/async-storage': { getItem: async () => saved, setItem: async (_k, value) => { saved = value; }, removeItem: async () => { saved = null; } },
    'react-native': { Platform: { OS: 'ios' } }, 'expo-location': location,
    'expo-task-manager': { isAvailableAsync: async () => true, isTaskDefined: () => true },
    '@/services/tokenRefresh': {}, '@/store': {}, '@/store/api/tripApi': {}, './rideLocationStream': {},
  });
  return { module: load('services/driverBackgroundLocationTask.ts'), starts, stops, running: () => running,
    session: () => saved && JSON.parse(saved), delayStop: p => { stopWait = p; }, delayPermission: p => { permissionWait = p; } };
}

test('a delayed stop of A cannot stop the newly started B task', async () => {
  const f = fixture(); await f.module.startDriverBackgroundLocationTracking('A');
  const stop = deferred(); f.delayStop(stop.promise);
  const stopping = f.module.stopDriverBackgroundLocationTracking('A'); await tick();
  let finished = false;
  const starting = f.module.startDriverBackgroundLocationTracking('B').then(result => { finished = true; return result; });
  await tick(); assert.equal(finished, false);
  stop.resolve(); await stopping; assert.equal(await starting, true);
  assert.equal(f.running(), true); assert.equal(f.session().tripId, 'B'); assert.equal(f.starts.length, 2);
});

test('logout while permission awaits invalidates the late start', async () => {
  const f = fixture(), permission = deferred(); f.delayPermission(permission.promise);
  const starting = f.module.startDriverBackgroundLocationTracking('A');
  await f.module.stopDriverBackgroundLocationTracking(); permission.resolve();
  assert.equal(await starting, false); assert.equal(f.running(), false); assert.equal(f.session(), null);
});

test('a scoped stale stop cannot clear or stop a newer session', async () => {
  const f = fixture(); await f.module.startDriverBackgroundLocationTracking('B');
  await f.module.stopDriverBackgroundLocationTracking('A');
  assert.equal(f.running(), true); assert.equal(f.session().tripId, 'B'); assert.equal(f.stops.length, 0);
});

test('new trips never inherit another destination; restarting the same one preserves it', async () => {
  const f = fixture(), arrivalCoordinate = { latitude: -4.3, longitude: 15.3 };
  await f.module.startDriverBackgroundLocationTracking('A', { arrivalCoordinate });
  await f.module.startDriverBackgroundLocationTracking('A'); assert.deepEqual(f.session().arrivalCoordinate, arrivalCoordinate);
  await f.module.startDriverBackgroundLocationTracking('B'); assert.equal(f.session().arrivalCoordinate, null);
});
