const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('permission offers coalesce and deduplicate confirmed operations within one identity session', () => {
  let version = 1, notifications = 0;
  const s = loader({ '@/services/tokenSession': { getTokenSessionVersion: () => version } })('services/tripLocationPermission.ts');
  s.subscribeTripLocationPermission(() => { throw Error('broken optional UI'); });
  s.subscribeTripLocationPermission(() => { notifications++; });
  assert.doesNotThrow(() => s.offerTripLocationPermission('request', 'r', 1));
  const first = s.getTripLocationPermissionOffer();
  s.offerTripLocationPermission('request', 'r', 1); assert.equal(notifications, 1);
  s.offerTripLocationPermission('booking', 'b', 1); assert.equal(s.getTripLocationPermissionOffer(), first);
  s.finishTripLocationPermission(first); assert.equal(s.getTripLocationPermissionOffer(), null);
  s.offerTripLocationPermission('booking', 'b', 1); assert.equal(s.getTripLocationPermissionOffer(), null);
  s.offerTripLocationPermission('request', 'r2', 1); assert.ok(s.getTripLocationPermissionOffer());
  version = 2; assert.equal(s.getTripLocationPermissionOffer(), null);
  s.offerTripLocationPermission('booking', 'late', 1); assert.equal(s.getTripLocationPermissionOffer(), null);
  s.offerTripLocationPermission('booking', 'new', 2);
  s.finishTripLocationPermission(first); assert.equal(s.getTripLocationPermissionOffer().id, 'new');
});

function fixture(t, { os = 'android', foreground = false, background = false, canAskAgain = true } = {}) {
  const hooks = hookHarness(), calls = [];
  const env = { active: true, version: 1, userId: 'passenger', foreground, background, canAskAgain,
    grantForeground: true, grantBackground: true, prompt: null, readError: false, settingsError: false };
  const appState = { currentState: 'active' };
  const hook = loader({
    react: hooks.react,
    'react-native': { AppState: appState, Platform: { OS: os },
      Linking: { openSettings: async () => { calls.push('settings'); if (env.settingsError) throw Error('settings'); } } },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/services/nearbyDriverLocation': {
      isNearbyDriverLocationEnabled: async () => { calls.push('read-driver'); return true; },
      setNearbyDriverLocationEnabled: async () => calls.push('write-driver'),
      ensureNearbyDriverLocation: async () => calls.push('driver-gps'),
    },
    'expo-location': {
      getForegroundPermissionsAsync: async () => {
        if (env.readError) throw Error('read');
        return { granted: env.foreground, canAskAgain: env.canAskAgain };
      },
      getBackgroundPermissionsAsync: async () => ({ granted: env.background, canAskAgain: env.canAskAgain }),
      requestForegroundPermissionsAsync: async () => {
        calls.push('foreground'); env.foreground = env.grantForeground;
        return { granted: env.foreground, canAskAgain: env.canAskAgain };
      },
      requestBackgroundPermissionsAsync: async () => {
        calls.push('background'); if (env.prompt) await env.prompt;
        env.background = env.grantBackground;
        return { granted: env.background, canAskAgain: env.canAskAgain };
      },
    },
  })('hooks/profile/useNearbyLocationPermission.ts').useNearbyLocationPermission;
  const render = () => hooks.render(() => hook({ userId: env.userId, driver: false, purpose: 'passenger-trip',
    active: env.active, available: true, deferTrackingToCoordinator: true }));
  const active = value => { env.active = value; appState.currentState = value ? 'active' : 'background'; render(); };
  t.after(() => hooks.unmount());
  return { env, calls, render, active, hooks,
    ready: async () => { render(); await tick(); return render(); },
    confirm: async () => { render().setConsent(true); await render().authorize(); return render(); } };
}

test('passenger explicit action requests foreground before background without touching driver GPS or preferences', async t => {
  const f = fixture(t); await f.ready(); assert.deepEqual(f.calls, []);
  await f.render().authorize(); assert.deepEqual(f.calls, []);
  const result = await f.confirm();
  assert.deepEqual(f.calls, ['foreground', 'background']);
  assert.equal(result.permission, true); assert.equal(result.consent, false); assert.equal(result.busy, false);
  await result.disable(); assert.deepEqual(f.calls, ['foreground', 'background']);
});

test('foreground refusal never requests background and Later remains harmless', async t => {
  const f = fixture(t); f.env.grantForeground = false; await f.ready();
  const result = await f.confirm(); assert.equal(result.permission, false);
  result.defer(); assert.equal(f.render().consent, false); assert.deepEqual(f.calls, ['foreground']);
});

test('Android permanent denial requires an explicit settings action and is refreshed on return', async t => {
  const f = fixture(t, { foreground: true, canAskAgain: false }); await f.ready();
  assert.equal(f.render().settingsRequired, true);
  await f.confirm(); assert.deepEqual(f.calls, []);
  await f.render().openSettings(); assert.deepEqual(f.calls, ['settings']);
  f.active(false); f.env.background = true; f.active(true); await tick();
  assert.equal(f.render().permission, true); assert.equal(f.render().consent, false);
  assert.deepEqual(f.calls, ['settings']);
});

test('iOS silently denied Always (Allow Once) offers settings instead of an endless native prompt loop', async t => {
  const f = fixture(t, { os: 'ios', foreground: true }); f.env.grantBackground = false; await f.ready();
  assert.equal((await f.confirm()).settingsRequired, true); assert.deepEqual(f.calls, ['background']);
  f.active(false); f.active(true); await tick();
  assert.equal(f.render().settingsRequired, true);
  await f.render().openSettings(); assert.deepEqual(f.calls, ['background', 'settings']);
  f.active(false); f.env.background = true; f.active(true); await tick();
  assert.equal(f.render().permission, true);
});

test('permission failure and settings failure are retryable, never a failed booking', async t => {
  const f = fixture(t, { foreground: true, canAskAgain: false }); f.env.readError = true;
  assert.equal((await f.ready()).loadError, true);
  f.env.readError = false; f.render().retry(); await f.ready();
  f.env.settingsError = true; f.render().setConsent(true); await f.render().openSettings();
  assert.equal(f.render().busy, false); assert.match(f.render().message, /Impossible de terminer/);
  f.env.settingsError = false; await f.render().openSettings(); assert.deepEqual(f.calls, ['settings', 'settings']);
});

test('double tap, logout and unmount cannot complete a stale permission activation', async t => {
  const f = fixture(t, { foreground: true }); await f.ready();
  let resolve; f.env.prompt = new Promise(done => { resolve = done; });
  f.render().setConsent(true);
  const first = f.render().authorize(); const second = f.render().authorize(); await tick();
  assert.deepEqual(f.calls, ['background']);
  f.env.version++; f.env.userId = 'next'; f.render();
  resolve(); await Promise.all([first, second]); f.hooks.unmount();
  assert.deepEqual(f.calls, ['background']);
});

test('a passenger deferring while native dialog is open never enables tracking on its late result', async t => {
  const f = fixture(t, { foreground: true }); await f.ready();
  let resolve; f.env.prompt = new Promise(done => { resolve = done; }); f.render().setConsent(true);
  const task = f.render().authorize(); await tick(); f.render().defer(); await task;
  resolve(); await tick();
  assert.equal(f.render().permission, false); assert.equal(f.render().consent, false);
  assert.deepEqual(f.calls, ['background']);
});
