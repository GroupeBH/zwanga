const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const hooks = hookHarness(), calls = [];
  const app = { currentState: 'active' }, env = { foreground: true, background: false, disclosure: null };
  const params = {
    data: { isFocused: true, isTripOngoing: true, tripId: 'synthetic-trip',
      showDialog: () => calls.push('error'), router: {} },
    mapState: { isMountedRef: { current: true }, locationSubscription: { current: null } },
    refs: { isExitingRef: { current: false }, tripDestinationNearSinceMsRef: { current: null } },
    exitActions: { navigateBackSafely() {}, cleanupNavigationUi() {} },
    promptBackgroundDisclosure: async () => { calls.push('disclosure'); return env.disclosure ? await env.disclosure : true; },
    sendDriverLocationToTracking() {},
  };
  const { useDriverLocationTracking } = loader({ react: hooks.react,
    'react-native': { AppState: app, Platform: { OS: 'ios' } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => app.currentState === 'active' },
    '@/services/appActivity': { isAppActive: () => app.currentState === 'active' },
    'expo-location': { Accuracy: { High: 4 },
      getForegroundPermissionsAsync: async () => ({ status: env.foreground ? 'granted' : 'undetermined' }),
      requestForegroundPermissionsAsync: async () => { calls.push('foreground'); return { status: 'granted' }; },
      getBackgroundPermissionsAsync: async () => ({ status: env.background ? 'granted' : 'undetermined' }),
      requestBackgroundPermissionsAsync: async () => { calls.push('background'); return { status: 'granted' }; },
      hasServicesEnabledAsync: async () => true,
    },
    '../../features/driver-navigation/driverLocationListener': { createDriverLocationListener: () => () => {} },
    '@/services/driverBackgroundLocationTask': {
      startDriverBackgroundLocationTracking: async () => { calls.push('start'); return true; },
      stopDriverBackgroundLocationTracking: async () => calls.push('stop'),
    },
    '@/services/rideLocationBootstrap': { subscribeBootstrappedRideLocation: () => {
      calls.push('subscribe'); return { remove: () => calls.push('unsubscribe') };
    } },
  })('hooks/driver-navigation/useDriverLocationTracking.ts');
  t.after(() => hooks.unmount());
  return { app, env, calls, params, render: () => hooks.render(() => useDriverLocationTracking(params)) };
}

test('driver navigation does not present a location dialog after leaving during disclosure', async t => {
  const f = fixture(t); let release;
  f.env.disclosure = new Promise(resolve => { release = resolve; });
  f.render(); await tick(); assert.deepEqual(f.calls, ['disclosure']);
  f.app.currentState = 'background'; f.render(); release(true); await tick();
  assert.deepEqual(f.calls, ['disclosure']);
  f.app.currentState = 'active'; f.env.disclosure = null; f.render(); await tick();
  assert.deepEqual(f.calls, ['disclosure', 'disclosure', 'background', 'start', 'subscribe']);
});

test('navigation never requests a fresh permission on an inactive screen and preserves live background GPS', async t => {
  const f = fixture(t); f.app.currentState = 'background'; f.env.foreground = false;
  f.render(); await tick(); assert.deepEqual(f.calls, []);
  f.app.currentState = 'active'; f.env.foreground = true; f.env.background = true;
  f.render(); await tick(); assert.deepEqual(f.calls, ['start', 'subscribe']);
  f.app.currentState = 'background'; f.render();
  assert.deepEqual(f.calls, ['start', 'subscribe', 'unsubscribe']);
  f.params.data.isTripOngoing = false; f.render(); assert.ok(f.calls.includes('stop'));
});
