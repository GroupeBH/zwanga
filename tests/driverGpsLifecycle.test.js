const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture() {
  let saved = null, running = false, stopWait, permissionWait, deleteWait, deleteFails = false, readFails = false;
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
    '@react-native-async-storage/async-storage': { getItem: async () => {
      if (readFails) throw Error('synthetic read failure'); return saved;
    }, setItem: async (_k, value) => { saved = value; }, removeItem: async () => {
      if (deleteWait) await deleteWait;
      if (deleteFails) throw Error('synthetic storage failure');
      saved = null;
    } },
    'react-native': { Platform: { OS: 'ios' } }, 'expo-location': location,
    'expo-task-manager': { isAvailableAsync: async () => true, isTaskDefined: () => true },
    '@/services/tokenRefresh': {}, '@/store': {}, '@/store/api/tripApi': {}, './rideLocationStream': {},
    '../nearbyDriverLocation': { pauseNearbyDriverLocation: async () => { stops.push('discovery'); } },
  });
  return { module: load('services/driverBackgroundLocationTask.ts'), starts, stops, running: () => running,
    readSession: () => load('services/driverBackgroundLocationSession.ts').getActiveDriverBackgroundTripSession(),
    failDelete: value => { deleteFails = value; }, delayDelete: p => { deleteWait = p; },
    restoreUnreadableNativeTrip: () => { running = true; readFails = true; },
    session: () => saved && JSON.parse(saved), delayStop: p => { stopWait = p; }, delayPermission: p => { permissionWait = p; } };
}

test('explicit trip stop stops native GPS and invalidates callbacks even when disk removal fails', async () => {
  const f = fixture(); await f.module.startDriverBackgroundLocationTracking('A');
  f.failDelete(true); await f.module.stopDriverBackgroundLocationTracking('A');
  assert.equal(f.running(), false); assert.equal(await f.readSession(), null);
  assert.deepEqual(f.stops, ['discovery', 'stop']);
  assert.equal(f.session().tripId, 'A', 'failed disk deletion is not claimed as persisted');
  f.failDelete(false); await f.module.stopDriverBackgroundLocationTracking('A');
  assert.equal(f.session(), null, 'the same removal can be retried');
});

test('global logout can stop a restored native task even with unreadable storage; scoped unknown stops remain conservative', async () => {
  const f = fixture(); f.restoreUnreadableNativeTrip();
  await f.module.stopDriverBackgroundLocationTracking('unknown');
  assert.equal(f.running(), true, 'unknown scope cannot stop a possibly different trip');
  await f.module.stopDriverBackgroundLocationTracking();
  assert.equal(f.running(), false, 'explicit global logout must not depend on disk availability');
  assert.deepEqual(f.stops, ['stop']);
});

test('a timed-out disk removal still stops GPS, and cannot later erase a new trip', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); await f.module.startDriverBackgroundLocationTracking('A');
  const deletion = deferred(); f.delayDelete(deletion.promise);
  const stopping = f.module.stopDriverBackgroundLocationTracking('A'); await tick();
  t.mock.timers.tick(8000); await stopping;
  assert.equal(f.running(), false);
  const starting = f.module.startDriverBackgroundLocationTracking('B'); await tick();
  assert.equal(f.running(), false, 'a new start cannot race the old disk removal');
  deletion.resolve(); assert.equal(await starting, true);
  assert.equal(f.session().tripId, 'B'); assert.equal(f.running(), true);
});

test('failed storage never turns an old scoped stop into a stop of another trip', async () => {
  const f = fixture(); await f.module.startDriverBackgroundLocationTracking('B');
  f.failDelete(true); await f.module.stopDriverBackgroundLocationTracking('A');
  assert.equal(f.running(), true); assert.equal((await f.readSession()).tripId, 'B');
  assert.deepEqual(f.stops, ['discovery']);
});

test('in-ride GPS keeps its existing fast profile and stops nearby discovery first', async () => {
  const f = fixture(); await f.module.startDriverBackgroundLocationTracking('trip');
  assert.deepEqual(f.stops, ['discovery']);
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].timeInterval, 8000);
  assert.equal(f.starts[0].deferredUpdatesInterval, 2000);
  assert.equal(f.starts[0].accuracy, 4);
});

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
  assert.equal(f.running(), true); assert.equal(f.session().tripId, 'B');
  assert.deepEqual(f.stops, ['discovery']);
});

test('new trips never inherit another destination; restarting the same one preserves it', async () => {
  const f = fixture(), arrivalCoordinate = { latitude: -4.3, longitude: 15.3 };
  await f.module.startDriverBackgroundLocationTracking('A', { arrivalCoordinate });
  await f.module.startDriverBackgroundLocationTracking('A'); assert.deepEqual(f.session().arrivalCoordinate, arrivalCoordinate);
  await f.module.startDriverBackgroundLocationTracking('B'); assert.equal(f.session().arrivalCoordinate, null);
});
