const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function app(t, trackingProfile = 'navigation') {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100_000 });
  const hooks = hookHarness(), actions = [], watches = [], listeners = new Set();
  const AppState = { currentState: 'active', addEventListener: (_, fn) => {
    listeners.add(fn); return { remove: () => listeners.delete(fn) };
  } };
  const dispatch = action => actions.push(action);
  const load = loader({ react: hooks.react, 'react-native': { AppState }, 'expo-location': {
    Accuracy: { High: 'high', Balanced: 'balanced' }, PermissionStatus: { GRANTED: 'granted' },
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    hasServicesEnabledAsync: async () => true,
    watchPositionAsync: async (options, callback) => {
      const subscription = { options, callback, removed: 0, remove() { this.removed++; } };
      watches.push(subscription); return subscription;
    },
  }, '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: () => null },
  '@/store/selectors': {}, '@/utils/throttledWarning': { warnThrottled() {} } });
  const { useUserLocation } = load('hooks/useUserLocation.ts');
  const props = { autoRequest: true, trackingProfile, rideLocationKey: 'driver:trip' };
  const render = () => hooks.render(() => useUserLocation(props));
  const fix = () => ({ timestamp: Date.now(), coords: { latitude: -4.32, longitude: 15.3, accuracy: 10 } });
  const updates = () => actions.filter(action => action.type === 'location/setLastKnownLocation');
  t.after(() => hooks.unmount());
  return { render, props, hooks, watches, updates, fix,
    stream: load('services/rideLocationStream.ts') };
}

test('Home/management reuse ongoing ride samples, throttle only Redux, and leave boarding delivery unchanged', async t => {
  const env = app(t);
  env.render(); await flush();
  let rideSamples = 0;
  const navigation = env.stream.subscribeRideLocation('driver:trip', {}, () => rideSamples++);
  t.after(() => navigation.remove());
  assert.equal(env.watches.length, 1, 'no second GPS source for a navigation subscriber');
  assert.equal(env.watches[0].options.distanceInterval, 0, 'stationary fixes remain available');
  for (let second = 0; second < 600; second++) {
    env.stream.publishNativeRideLocation('driver:trip', env.fix());
    t.mock.timers.tick(1000);
  }
  assert.equal(rideSamples, 600, 'automatic boarding/dropoff stream is not throttled');
  assert.equal(env.updates().length, 120, 'iOS 1 Hz callbacks no longer update Redux each second');
  assert.equal(env.watches.length, 1);
  assert.equal(env.watches[0].removed, 1, 'native task supersedes fallback');
  env.props.autoRequest = false; env.render();
  env.stream.publishNativeRideLocation('driver:trip', env.fix());
  assert.equal(rideSamples, 601);
  assert.equal(env.updates().length, 120, 'hidden screen does not consume positions');
});

test('nearby iOS tracking caps UI dispatches without adding timers and rejects invalid coordinates', async t => {
  const env = app(t, 'nearby'); env.props.rideLocationKey = null;
  env.render(); await flush();
  const watch = env.watches[0];
  watch.callback({ ...env.fix(), coords: { latitude: null, longitude: 15 } });
  watch.callback({ ...env.fix(), coords: { latitude: 0, longitude: 0 } });
  assert.equal(env.updates().length, 0);
  for (let second = 0; second < 600; second++) {
    watch.callback(env.fix()); t.mock.timers.tick(1000);
  }
  assert.equal(env.updates().length, 40);
  env.hooks.unmount();
  watch.callback(env.fix()); assert.equal(env.updates().length, 40);
  assert.equal(watch.removed, 1);
});

test('changing a ride unsubscribes the old channel and unmount closes all foreground watches', async t => {
  const env = app(t); env.render(); await flush();
  env.props.rideLocationKey = 'driver:next'; env.render(); await flush();
  assert.equal(env.watches.length, 2);
  assert.equal(env.watches[0].removed, 1);
  env.watches[0].callback(env.fix());
  env.stream.publishNativeRideLocation('driver:trip', env.fix());
  assert.equal(env.updates().length, 0);
  env.watches[1].callback(env.fix()); assert.equal(env.updates().length, 1);
  env.hooks.unmount();
  assert.equal(env.watches[1].removed, 1);
  t.mock.timers.tick(60_000);
  assert.equal(env.watches.length, 2);
});
