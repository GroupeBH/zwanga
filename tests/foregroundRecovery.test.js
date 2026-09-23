const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const ref = current => ({ current });

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  const hooks = hookHarness('recovery');
  const counts = { trips: 0, bookings: 0, snapshots: 0, gps: 0, writes: 0, presentations: 0 };
  let listener, resolveTrip;
  const state = { deferred: false, status: 'ongoing' };
  const load = loader({ react: hooks.react,
    'react-native': { Platform: { OS: 'ios' }, AppState: {
      addEventListener: (_event, fn) => { listener = fn; return { remove: () => { listener = null; } }; },
    } },
    'expo-location': { Accuracy: { High: 4 }, getCurrentPositionAsync: async () => { counts.gps++; return null; } },
    '@/services/trackingSocket': { trackingSocket: { resumeBoardingDetection: async () => {} } },
  });
  const { useDriverForegroundCompletion } = load('hooks/driver-navigation/useDriverForegroundCompletion.ts');
  const { useDriverProgressLifecycle } = load('hooks/driver-navigation/useDriverProgressLifecycle.ts');
  const params = {
    tripId: 'trip', isScreenActive: false, trip: { id: 'trip', status: 'ongoing' },
    tripArrivalCoordinate: { latitude: -4.4, longitude: 15.4 },
    isRestCompletionCheckRunningRef: ref(false), lastRestCompletionCheckAtRef: ref(0),
    refetchTrip: async () => { counts.trips++; return state.deferred ? new Promise(r => { resolveTrip = r; }) : { data: { status: state.status } }; },
    refetchBookings: async () => { counts.bookings++; return { data: [] }; },
    getDriverLocationSnapshot: () => ({ abort: noop, unwrap: async () => { counts.snapshots++; return { coordinates: null }; } }),
    bookingsRef: ref([]), presentCompletedTripFromServerSync: () => { counts.presentations++; },
    completedDuringInactiveCandidateRef: ref(false), lastAcceptedDriverTimestampRef: ref(null), isMountedRef: ref(true),
    lastTripCompletionCheckCoordinateRef: ref(null), lastAcceptedDriverCoordinateRef: ref(null),
    tripDestinationNearSinceMsRef: ref(null), getTripDestinationReferenceRoute: () => [],
    currentLocationRef: ref(null), setCurrentLocation: noop,
    updateDriverLocation: () => { counts.writes++; return { unwrap: async () => ({}) }; },
    tryCompleteTripFromNavigation: noop, appStateRef: ref('active'),
  };
  const mapState = { ...params, isTripOngoingRef: ref(true), pickupNotice: null, setPickupNoticeCountdown: noop };
  const refs = { previousTripStatusRef: ref('ongoing') };
  const render = () => hooks.render(() => {
    const foregroundCompletion = useDriverForegroundCompletion(params);
    useDriverProgressLifecycle({ mapState, foregroundCompletion,
      data: { ...params, isFocused: params.isScreenActive, isTripOngoing: true }, refs,
      completion: { presentCompletedTripFromServerSync: params.presentCompletedTripFromServerSync } });
    return foregroundCompletion;
  });
  t.after(() => hooks.unmount());
  return { params, state, counts, render, hooks, appState: next => listener(next),
    release: status => resolveTrip({ data: { status } }) };
}

test('trip updates do not restart recovery; a hidden navigation never requests GPS or REST', async t => {
  const f = fixture(t);
  for (let i = 0; i < 4; i++) {
    f.params.trip = { ...f.params.trip, revision: i };
    f.render(); await flush(); t.mock.timers.tick(6000);
  }
  assert.equal(f.counts.trips, 0);
  f.params.isScreenActive = true;
  const first = f.render().checkTripCompletionFromRestOnForeground;
  await flush();
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(6000); f.params.trip = { ...f.params.trip, revision: i };
    assert.equal(f.render().checkTripCompletionFromRestOnForeground, first); await flush();
  }
  assert.deepEqual(f.counts, { trips: 1, bookings: 1, snapshots: 1, gps: 1, writes: 0, presentations: 0 });
});

test('returning after sleep reconciles exactly once and keeps server-completed handling', async t => {
  const f = fixture(t); f.params.isScreenActive = true; f.render(); await flush();
  f.appState('background'); f.params.isScreenActive = false; f.render();
  t.mock.timers.tick(60_000); f.state.status = 'completed';
  f.appState('active'); f.params.isScreenActive = true; f.render(); await flush();
  assert.equal(f.counts.trips, 2); assert.equal(f.counts.presentations, 1); assert.equal(f.counts.gps, 1);
});

test('blur or unmount while the server answers never presents a modal or starts a GPS read', async t => {
  const f = fixture(t); f.state.deferred = true; f.params.isScreenActive = true;
  f.render(); f.params.isScreenActive = false; f.render();
  f.release('completed'); await flush();
  assert.equal(f.counts.presentations, 0); assert.equal(f.counts.gps, 0);
  assert.equal(f.params.isRestCompletionCheckRunningRef.current, false);
});

test('a fresh shared-stream fix avoids another high-accuracy GPS acquisition', async t => {
  const f = fixture(t); f.params.isScreenActive = true;
  f.params.currentLocationRef.current = { timestamp: Date.now(), coords: {
    latitude: -4.3, longitude: 15.3, accuracy: 5, speed: 0, heading: 0,
  } };
  f.render(); await flush();
  assert.equal(f.counts.gps, 0); assert.equal(f.counts.writes, 1);
});

test('rapid return starts a new recovery without an obsolete promise unlocking it', async t => {
  const f = fixture(t); const pending = [];
  f.params.refetchTrip = () => new Promise(resolve => pending.push(resolve));
  f.params.isScreenActive = true; f.render();
  f.params.isScreenActive = false; f.render();
  f.params.isScreenActive = true; f.render();
  assert.equal(pending.length, 2);
  pending[0]({ data: { status: 'completed' } }); await flush();
  assert.equal(f.counts.presentations, 0);
  assert.equal(f.params.isRestCompletionCheckRunningRef.current, true);
  pending[1]({ data: { status: 'completed' } }); await flush();
  assert.equal(f.counts.presentations, 1);
  assert.equal(f.params.isRestCompletionCheckRunningRef.current, false);
});
