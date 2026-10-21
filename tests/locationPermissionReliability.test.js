const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [];
  const env = { read: null, prompt: null, save: null, active: true, enabled: false, granted: false };
  const { useNearbyLocationPermission } = loader({ react: hooks.react,
    'react-native': { AppState: { currentState: 'active' }, Linking: { openSettings: async () => {} } },
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    'expo-location': {
      getForegroundPermissionsAsync: async () => { if (env.read) await env.read; return { granted: true }; },
      getBackgroundPermissionsAsync: async () => ({ granted: env.granted, canAskAgain: true }),
      requestBackgroundPermissionsAsync: async () => { calls.push('prompt'); if (env.prompt) await env.prompt; env.granted = true; return { granted: true }; },
    },
    '@/services/nearbyDriverLocation': {
      isNearbyDriverLocationEnabled: async () => env.enabled,
      setNearbyDriverLocationEnabled: async (_id, enabled, _version, valid) => {
        calls.push('save'); if (env.save) await env.save; if (valid()) { env.enabled = enabled; calls.push('saved'); }
      },
      ensureNearbyDriverLocation: async () => { calls.push('GPS'); return true; },
    },
  })('hooks/profile/useNearbyLocationPermission.ts');
  t.after(() => hooks.unmount());
  return { env, calls, render: () => hooks.render(() => useNearbyLocationPermission({
    userId: 'driver', driver: true, available: true, active: env.active,
  })) };
}

test('a stalled initial native read exposes retry after 8 seconds and ignores its late reply', async t => {
  const f = fixture(t), old = deferred(); f.env.read = old.promise; f.render();
  t.mock.timers.tick(8000); await tick(); assert.equal(f.render().loadError, true);
  assert.equal(f.render().loaded, false); f.env.read = null;
  f.render().retry(); f.render(); await tick(); assert.equal(f.render().loaded, true);
  old.resolve(); await tick(); assert.equal(f.render().loadError, false); assert.deepEqual(f.calls, []);
});

test('a stalled authorization read releases busy and cannot later open an OS prompt', async t => {
  const f = fixture(t); f.render(); await tick(); f.render().setConsent(true);
  const old = deferred(); f.env.read = old.promise;
  const task = f.render().authorize(); assert.equal(f.render().busy, true);
  t.mock.timers.tick(8000); await task; assert.equal(f.render().busy, false);
  assert.match(f.render().message, /Impossible de terminer/);
  old.resolve(); await tick(); assert.deepEqual(f.calls, []);
});

test('OS prompt has no human deadline; Later cancels activation and prevents overlapping prompts', async t => {
  const f = fixture(t), old = deferred(); f.env.prompt = old.promise;
  f.render(); await tick(); f.render().setConsent(true); const task = f.render().authorize(); await tick();
  t.mock.timers.tick(120000); await tick(); assert.equal(f.render().busy, true);
  f.render().defer(); await task; assert.equal(f.render().busy, false); assert.equal(f.render().consent, false);
  f.render().setConsent(true); await f.render().authorize();
  assert.deepEqual(f.calls, ['prompt']); assert.match(f.render().message, /Fermez d’abord/);
  old.resolve(); await tick(); assert.deepEqual(f.calls, ['prompt']); assert.equal(f.env.enabled, false);
  f.render().setConsent(true); await f.render().authorize();
  assert.deepEqual(f.calls, ['prompt', 'save', 'saved', 'GPS']);
});

test('timed-out persistence cannot reactivate an opt-out or start GPS when it finally completes', async t => {
  const f = fixture(t), old = deferred(); f.env.granted = true; f.env.save = old.promise;
  f.render(); await tick(); f.render().setConsent(true); const task = f.render().authorize(); await tick();
  assert.deepEqual(f.calls, ['save']); t.mock.timers.tick(8000); await task;
  assert.equal(f.render().busy, false); old.resolve(); await tick();
  assert.deepEqual(f.calls, ['save']); assert.equal(f.env.enabled, false);
});
