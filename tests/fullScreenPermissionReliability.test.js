const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, os = 'android') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [];
  const appState = { currentState: 'active' };
  const env = { active: true, owner: 'driver', failure: false,
    status: { optIn: false, allowed: false, notificationsAllowed: true } };
  const bridge = {
    getFullScreenStatus: async id => {
      calls.push(['read', id]); if (env.failure) throw Error('bridge unavailable'); return env.status;
    },
    setFullScreenOptIn: async (id, enabled) => { calls.push(['set', id, enabled]); return true; },
  };
  const hook = loader({ react: hooks.react,
    'react-native': { AppState: appState, Platform: { OS: os }, NativeModules: { ZwangaDriverAlerts: bridge } },
    '@/services/rideAudioDiagnostics': { boundedRideAudio: promise => promise },
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
  assert.deepEqual(f.calls, []); assert.equal(f.render().permission, null);
});

test('native background state blocks a stale tap before React updates, as well as the retry', async t => {
  const f = fixture(t); f.env.failure = true; f.render(); await tick();
  f.appState.currentState = 'background'; await f.render().setOptIn(true);
  t.mock.timers.tick(2000); await tick();
  assert.deepEqual(f.calls, [['read', 'driver']]);
  f.env.active = false; f.render(); f.env.failure = false;
  f.appState.currentState = 'active'; f.env.active = true; f.render(); await tick();
  assert.deepEqual(f.render().permission, f.env.status);
  await f.render().setOptIn(true); assert.ok(f.calls.some(c => c[0] === 'set'));
});
