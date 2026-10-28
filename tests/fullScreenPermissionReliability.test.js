const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, os = 'android', modern = false, api = 36) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [];
  const appState = { currentState: 'active' };
  const env = { active: true, owner: 'driver', failure: false, settings: async () => {},
    bound: promise => promise,
    status: { optIn: false, allowed: false, notificationsAllowed: true } };
  const bridge = {
    getFullScreenStatus: async id => {
      calls.push(['read', id]); if (env.failure) throw Error('bridge unavailable'); return env.status;
    },
    setFullScreenOptIn: async (id, enabled) => { calls.push(['set', id, enabled]); return true; },
  };
  if (modern) bridge.requestFullScreenPermission = async id => {
    calls.push(['review', id]); await env.settings();
    env.status = { ...env.status, optIn: true }; return 'settings-opened';
  };
  const hook = loader({ react: hooks.react,
    'react-native': { AppState: appState, Platform: { OS: os, Version: api }, NativeModules: { ZwangaDriverAlerts: bridge } },
    '@/services/rideAudioDiagnostics': { boundedRideAudio: (promise, ms) => env.bound(promise, ms) },
    '@/services/driverAlertChannel': { openDriverAlertSettings: async options => {
      calls.push(['notifications', options]); await env.settings(options);
    } },
  })('hooks/notifications/useDriverFullScreenPermission.ts').useDriverFullScreenPermission;
  t.after(() => hooks.unmount());
  return { env, appState, calls, render: () => hooks.render(() => hook(env.owner, env.active)) };
}

test('transient full-screen status failure gets one bounded retry and recovers', async t => {
  const f = fixture(t); f.env.failure = true; f.render(); await tick();
  assert.equal(f.render().error, true); assert.equal(f.render().permission, null);
  f.env.failure = false; t.mock.timers.tick(1999); await tick(); assert.equal(f.calls.length, 1);
  t.mock.timers.tick(1); await tick(); assert.deepEqual(f.render().permission, f.env.status);
  assert.equal(f.render().error, false);
});

test('explicit review opens Android even when the initial grant is allowed; only return validates it', async t => {
  const f = fixture(t, 'android', true);
  f.env.status.allowed = true; f.render(); await tick();
  assert.equal(f.render().settingsReviewAvailable, true);
  await f.render().setOptIn(true);
  assert.deepEqual(f.calls, [['read', 'driver'], ['review', 'driver']]);
  assert.equal(f.render().permission, null, 'opening Settings is not an authorization result');
  f.env.active = false; f.render();
  f.env.active = true; f.render(); await tick();
  assert.deepEqual(f.render().permission, { optIn: true, allowed: true, notificationsAllowed: true });
});

test('returning without granting full screen keeps permission denied despite local consent', async t => {
  const f = fixture(t, 'android', true); f.render(); await tick();
  await f.render().setOptIn(true);
  assert.equal(f.render().permission, null);
  f.env.active = false; f.render(); f.env.active = true; f.render(); await tick();
  assert.equal(f.render().permission.optIn, true);
  assert.equal(f.render().permission.allowed, false);
  await f.render().setOptIn(false);
  assert.equal(f.calls.filter(c => c[0] === 'review').length, 1, 'withdrawal never launches Settings');
});

test('explicit Settings review is single flight and cannot outlive logout or background', async t => {
  const f = fixture(t, 'android', true); f.render(); await tick();
  let release; f.env.settings = () => new Promise(resolve => { release = resolve; });
  const pending = f.render().setOptIn(true); await tick();
  await f.render().setOptIn(true);
  assert.equal(f.calls.filter(c => c[0] === 'review').length, 1);
  f.env.owner = 'other'; f.render(); await tick(); release(); await pending;
  assert.equal(f.render().permission.optIn, false, 'the old account result is discarded');
  f.appState.currentState = 'background'; await f.render().setOptIn(true);
  assert.equal(f.calls.filter(c => c[0] === 'review').length, 1);
});

test('settings review launch failure is visible and never infers a grant', async t => {
  const f = fixture(t, 'android', true); f.render(); await tick();
  f.env.settings = async () => { throw Error('OEM settings unavailable'); };
  await f.render().setOptIn(true);
  assert.equal(f.render().error, true); assert.equal(f.render().permission, null);
  assert.equal(f.env.status.optIn, false);
});

test('Android 13 keeps its existing consent flow without a special-access review', async t => {
  const legacy = fixture(t, 'android', true, 33); legacy.render(); await tick();
  assert.equal(legacy.render().settingsReviewAvailable, false);
  await legacy.render().setOptIn(true);
  assert.equal(legacy.calls.some(c => c[0] === 'review'), false);
  assert.ok(legacy.calls.some(c => c[0] === 'set'));
});

test('a persistent full-screen error never starts endless retrying or native settings', async t => {
  const f = fixture(t); f.env.failure = true; f.render(); await tick();
  t.mock.timers.tick(2000); await tick(); t.mock.timers.tick(100000); await tick();
  assert.deepEqual(f.calls, [['read', 'driver'], ['read', 'driver']]);
});

test('a disabled build does not offer unsupported full-screen permission or trigger retries', async t => {
  const disabled = fixture(t); disabled.env.status = null; disabled.render(); await tick();
  assert.equal(disabled.render().permission, null); assert.equal(disabled.render().error, false);
  t.mock.timers.tick(10000); await tick(); assert.equal(disabled.calls.length, 1);
});

test('iOS never calls the Android permission bridge', async t => {
  const f = fixture(t, 'ios'); f.render(); await tick(); await f.render().setOptIn(true);
  await f.render().openNotifications();
  assert.deepEqual(f.calls, []); assert.equal(f.render().permission, null);
});

test('native background state blocks a stale tap before React updates, as well as the retry', async t => {
  const f = fixture(t); f.env.failure = true; f.render(); await tick();
  f.appState.currentState = 'background'; await f.render().setOptIn(true);
  await f.render().openNotifications(); f.render().retry(); f.render();
  t.mock.timers.tick(2000); await tick();
  assert.deepEqual(f.calls, [['read', 'driver']]);
  f.env.active = false; f.render(); f.env.failure = false;
  f.appState.currentState = 'active'; f.env.active = true; f.render(); await tick();
  assert.deepEqual(f.render().permission, f.env.status);
  await f.render().setOptIn(true); assert.ok(f.calls.some(c => c[0] === 'set'));
});

test('opening settings is single-flight and does not infer notification permission', async t => {
  const f = fixture(t); f.env.status.notificationsAllowed = false; f.render(); await tick();
  let release; f.env.settings = () => new Promise(resolve => { release = resolve; });
  const first = f.render().openNotifications(); await f.render().openNotifications();
  assert.equal(f.calls.filter(c => c[0] === 'notifications').length, 1);
  assert.equal(f.render().busy, true); assert.equal(f.render().permission.notificationsAllowed, false);
  const action = f.calls.find(c => c[0] === 'notifications')[1];
  assert.equal(action.application, true); assert.equal(action.current(), true);
  release(); await first; assert.equal(action.current(), false);
  assert.equal(f.render().busy, false); assert.equal(f.render().permission.notificationsAllowed, false);
  f.env.active = false; f.render();
  f.env.status = { ...f.env.status, notificationsAllowed: true }; f.env.active = true; f.render(); await tick();
  assert.equal(f.render().permission.notificationsAllowed, true);
  assert.equal(f.calls.some(c => c[0] === 'set'), false);
});

test('a delayed settings action cannot open after timeout or changing accounts', async t => {
  const f = fixture(t); f.render(); await tick();
  f.env.settings = () => new Promise(() => {});
  f.env.bound = (promise, ms) => ms === 2000 ? Promise.reject(Error('timeout')) : promise;
  await f.render().openNotifications();
  const expired = f.calls.find(c => c[0] === 'notifications')[1];
  assert.equal(expired.current(), false); assert.equal(f.render().error, true);
  assert.equal(f.render().busy, false);
  f.env.bound = promise => promise;
  let release; f.env.settings = () => new Promise(resolve => { release = resolve; });
  const pending = f.render().openNotifications();
  const stale = f.calls.filter(c => c[0] === 'notifications').at(-1)[1];
  f.env.owner = 'other'; f.render(); await tick(); assert.equal(stale.current(), false);
  release(); await pending; assert.equal(f.render().error, false);
});

test('manual retry rechecks without granting or opening settings', async t => {
  const f = fixture(t); f.env.failure = true; f.render(); await tick();
  f.env.failure = false; f.render().retry(); f.render(); await tick();
  assert.equal(f.render().error, false); assert.deepEqual(f.render().permission, f.env.status);
  assert.deepEqual(f.calls, [['read', 'driver'], ['read', 'driver']]);
  t.mock.timers.tick(3000); await tick(); assert.equal(f.calls.length, 2);
});

test('channel settings are explicit, do not grant fullscreen and reject malformed readiness', async t => {
  const f = fixture(t); f.env.status.channelReady = false; f.render(); await tick();
  assert.equal(f.render().permission.channelReady, false);
  await f.render().openNotifications(false);
  assert.equal(f.calls.find(c => c[0] === 'notifications')[1].application, false);
  assert.equal(f.calls.some(c => c[0] === 'set'), false);
  f.env.status.channelReady = 'true'; f.render().retry(); f.render(); await tick();
  assert.equal(f.render().error, true);
});
