const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');

function tracking(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  let alignments = 0;
  const { createDriverLocationListener, normalizeHeading } = loader({
    'react-native': { Platform: { OS: 'android' } },
    '@/utils/routeHelpers': { getRouteAlignedPosition: () => { alignments++; return null; } },
  })('features/driver-navigation/driverLocationListener.ts');
  const ref = current => ({ current });
  const calls = { send: 0, state: 0, step: 0, route: 0, animate: 0, stop: 0, position: 0 };
  const mapState = {
    isMountedRef: ref(true), isTripOngoingRef: ref(true), isMapReadyRef: ref(true),
    appStateRef: ref('active'), lastAcceptedDriverCoordinateRef: ref(null),
    lastAcceptedDriverTimestampRef: ref(null), driverMarkerAnimationRef: ref(null),
    stopDriverMarkerAnimation: () => calls.stop++,
    driverPosition: {
      timing: () => ({ start: () => calls.animate++ }),
      setValue: () => calls.position++,
    },
    setHeading: update => update(0), setCurrentLocation: () => calls.state++,
  };
  const refs = {
    isExitingRef: ref(false), currentLocationRef: ref(null),
    hasFetchedInitialDriverRouteRef: ref(false), routeFetchedRef: ref(false),
    routeCoordinatesRef: ref([]), offRouteSampleCountRef: ref(0),
    lastOffRouteRerouteAtRef: ref(0), isReroutingRef: ref(false),
    fetchRouteRef: ref(async () => { calls.route++; }),
    evaluatePickupBypassRef: ref(null), updateCurrentStepRef: ref(() => calls.step++),
  };
  let cancelled = false;
  const create = () => createDriverLocationListener({
    data: { tripId: 'trip-1' }, mapState, refs,
    isCancelled: () => cancelled, sendDriverLocationToTracking: () => calls.send++,
  });
  const listener = create();
  const fix = (extra = {}) => ({
    timestamp: Date.now(),
    coords: { latitude: -4.32, longitude: 15.3, accuracy: 10, heading: 90, speed: 2 },
    ...extra,
  });
  return { calls, mapState, refs, create, listener, fix, normalizeHeading, alignments: () => alignments, cancel: () => { cancelled = true; } };
}

test('GPS callback preserves independent state, backend and step throttles during repeated native updates', t => {
  const env = tracking(t);
  for (let index = 0; index < 1000; index++) env.listener(env.fix());
  assert.equal(env.calls.send, 1);
  assert.equal(env.calls.state, 1);
  assert.equal(env.calls.step, 1);
  assert.equal(env.calls.route, 1);
  t.mock.timers.tick(5000);
  env.listener(env.fix());
  assert.equal(env.calls.send, 1, 'the original strict interval boundary is preserved');
  t.mock.timers.tick(1);
  env.listener(env.fix());
  assert.equal(env.calls.send, 2);
  assert.equal(env.calls.state, 2);
  assert.equal(env.calls.step, 2);
});

test('effect cancellation, unmount and navigation exit reject late GPS callbacks before any side effect', t => {
  const env = tracking(t);
  env.cancel();
  env.listener(env.fix());
  assert.equal(env.refs.currentLocationRef.current, null);
  assert.ok(Object.values(env.calls).every(value => value === 0));
  const mountedEnv = trackingWithoutClock(env);
  mountedEnv.mapState.isMountedRef.current = false;
  mountedEnv.listener(mountedEnv.fix());
  assert.ok(Object.values(env.calls).every(value => value === 0));
  mountedEnv.mapState.isMountedRef.current = true;
  mountedEnv.refs.isExitingRef.current = true;
  mountedEnv.listener(mountedEnv.fix());
  assert.ok(Object.values(env.calls).every(value => value === 0));
});

function trackingWithoutClock(env) {
  const { createDriverLocationListener } = loader({
    'react-native': { Platform: { OS: 'android' } },
    '@/utils/routeHelpers': { getRouteAlignedPosition: () => null },
  })('features/driver-navigation/driverLocationListener.ts');
  return { ...env, listener: createDriverLocationListener({
    data: { tripId: 'trip-1' }, mapState: env.mapState, refs: env.refs,
    isCancelled: () => false, sendDriverLocationToTracking: () => env.calls.send++,
  }) };
}

test('invalid, stale, inaccurate and implausibly distant fixes do not reach the backend', t => {
  const env = tracking(t);
  const valid = env.fix();
  env.listener({ ...valid, coords: { ...valid.coords, latitude: NaN } });
  env.listener({ ...valid, timestamp: Date.now() - 600_000 });
  assert.equal(env.calls.send, 0);
  env.listener(env.fix());
  assert.equal(env.calls.send, 1);
  t.mock.timers.tick(6000);
  env.listener(env.fix({ coords: { ...valid.coords, accuracy: 100 } }));
  env.listener(env.fix({ coords: { ...valid.coords, latitude: 10 } }));
  assert.equal(env.calls.send, 1);
});

test('a new GPS subscription resets its throttles but keeps the initial route guard', t => {
  const env = tracking(t);
  env.listener(env.fix());
  env.create()(env.fix());
  assert.equal(env.calls.send, 2);
  assert.equal(env.calls.route, 1);
});

test('hidden maps and background apps never start native marker animations', t => {
  const env = tracking(t);
  env.mapState.isMapReadyRef.current = false;
  env.listener(env.fix());
  env.mapState.isMapReadyRef.current = true;
  env.mapState.appStateRef.current = 'background';
  env.listener(env.fix());
  assert.equal(env.calls.animate, 0);
  assert.equal(env.calls.position, 1, 'no writes to the native map while backgrounded');
  assert.equal(env.calls.stop, 2);
  assert.equal(env.normalizeHeading(-10), 350);
  assert.equal(env.normalizeHeading(370), 10);
});

test('iOS-style frequent callbacks do not repeatedly traverse the route or animate a stationary marker', t => {
  const env = tracking(t);
  let safetyChecks = 0;
  env.refs.evaluatePickupBypassRef.current = () => safetyChecks++;
  for (let i = 0; i < 1000; i++) env.listener(env.fix());
  assert.equal(env.alignments(), 1);
  assert.equal(env.calls.animate, 1);
  assert.equal(safetyChecks, 1000, 'render throttling never skips the validated safety samples');
  t.mock.timers.tick(2000);
  env.listener(env.fix());
  assert.equal(env.alignments(), 2);
  assert.equal(env.calls.animate, 1, 'a stationary vehicle does not keep an animation running');
  t.mock.timers.tick(2000);
  const next = env.fix();
  env.listener({ ...next, coords: { ...next.coords, latitude: next.coords.latitude + 0.0001 } });
  assert.equal(env.calls.animate, 2, 'movement updates the marker');
});
