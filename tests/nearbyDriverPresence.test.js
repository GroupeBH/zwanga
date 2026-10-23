const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const h = hookHarness(), appState = { currentState: 'active' }, sent = [];
  const state = { auth: {}, activeRide: false, permission: true, enabled: true, fixes: 0, ensure: 0, fail: false, waitFix: null };
  const load = loader({
    react: h.react, 'react-native': { AppState: appState },
    '@/hooks/useAppIsActive': { useAppIsActive: () => appState.currentState === 'active' },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: enabled => enabled, displayReadOptions: enabled => ({ skip: !enabled }) },
    '@/store/hooks': { useAppSelector: select => select(state) },
    '@/store/selectors': { selectIsAuthenticated: () => true },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: { id: 'driver', role: 'driver' } }) },
    '@/utils/accountRole': { isDriverAccount: () => true },
    '@/store/api/driverDispatchApi': {
      useDriverDispatchStatusQuery: () => ({ data: { enabled: true, automatic: true } }),
      driverDispatchApi: { endpoints: { recordDriverPosition: { initiate: value => value } } },
    },
    '@/services/nearbyDriverLocation': {
      isNearbyDriverLocationEnabled: async () => state.enabled,
      ensureNearbyDriverLocation: async () => { state.ensure++; return true; },
      hasActiveRideLocationSession: async () => state.activeRide,
      subscribeNearbyDriverLocation: () => () => {},
    },
    './nearbyDriverLocation': { isNearbyDriverLocationEnabled: async () => state.enabled },
    'expo-location': { getForegroundPermissionsAsync: async () => ({ granted: state.permission }) },
    '@/services/currentLocationRequest': { requestCurrentLocation: async () => {
      state.fixes++; if (state.waitFix) await state.waitFix;
      return { timestamp: Date.now(), coords: { latitude: 0, longitude: 0, accuracy: 10 } };
    } },
    './tokenStorage': { getTokens: async () => ({ accessToken: 'synthetic' }) },
    '@/utils/jwt': { decodeJWT: () => ({ sub: 'driver' }) },
    './driverBackgroundLocationSession': { getActiveDriverBackgroundTripSession: async () => state.activeRide ? {} : null },
    './background/passengerTaskLifecycle': { getActiveTrackingSession: async () => null },
    '@/store': { store: { dispatch: value => ({
      unwrap: async () => { if (state.fail) throw { status: 'FETCH_ERROR' }; sent.push(value); return { enabled: true, automatic: true }; },
      reset() {},
    }) } },
  });
  const Component = load('components/DriverPresenceCoordinator.tsx').DriverPresenceCoordinator;
  t.after(() => h.unmount());
  return { state, sent, appState, render: () => h.render(Component),
    delivery: load('services/nearbyDriverPositionDelivery.ts') };
}

test('stationary foreground driver sends immediately and every three minutes even with a registered native task', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_000_000 });
  const f = fixture(t); f.render(); await tick();
  assert.equal(f.sent.length, 1); assert.equal(f.state.ensure, 1);
  t.mock.timers.tick(179999); await tick(); assert.equal(f.sent.length, 1);
  t.mock.timers.tick(1); await tick(); assert.equal(f.sent.length, 2);
  t.mock.timers.tick(180000); await tick(); assert.equal(f.sent.length, 3);
  assert.equal(f.sent[0].latitude, f.sent[2].latitude);
  assert.notEqual(f.sent[0].recordedAt, f.sent[2].recordedAt);
});

test('persistent opt-out blocks foreground GPS and disable during a pending fix blocks delivery', async t => {
  const f = fixture(t); f.state.enabled = false;
  f.render(); await tick(); assert.equal(f.state.fixes, 0); assert.equal(f.sent.length, 0);
  f.appState.currentState = 'background'; f.render();
  f.state.enabled = true; f.appState.currentState = 'active';
  let release; f.state.waitFix = new Promise(resolve => { release = resolve; });
  f.render(); await tick(); assert.equal(f.state.fixes, 1);
  f.state.enabled = false; release(); await tick(); assert.equal(f.sent.length, 0);
});

test('a recent native acknowledgement avoids a duplicate foreground GPS read', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_000_000 });
  const f = fixture(t);
  await f.delivery.sendNearbyDriverPosition('driver', { timestamp: Date.now(), coords: { latitude: 0, longitude: 0, accuracy: 10 } });
  f.render(); await tick(); assert.equal(f.state.fixes, 0); assert.equal(f.sent.length, 1);
});

test('foreground watchdog releases timers in background and does not interfere with an active ride', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_000_000 });
  const f = fixture(t); f.state.activeRide = true;
  f.render(); await tick(); assert.equal(f.state.fixes, 0); assert.equal(f.state.ensure, 0);
  f.state.activeRide = false; f.appState.currentState = 'background'; f.render();
  t.mock.timers.tick(360000); await tick(); assert.equal(f.state.fixes, 0);
  f.appState.currentState = 'active'; f.render(); await tick(); assert.equal(f.sent.length, 1);
  f.state.auth.logoutRequestId = 'logout'; f.render();
  t.mock.timers.tick(180000); await tick(); assert.equal(f.sent.length, 1);
});

test('missing foreground permission never starts a one-shot GPS read', async t => {
  const f = fixture(t); f.state.permission = false;
  f.render(); await tick(); assert.equal(f.state.fixes, 0); assert.equal(f.sent.length, 0);
});
