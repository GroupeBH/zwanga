const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { nativeAppState } = require('./helpers/nativeAppState.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t, os = 'android') {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const hooks = hookHarness(), app = nativeAppState(), calls = [];
  const env = { active: true, permission: { granted: true }, services: false, read: null, prompt: null, settings: null };
  const load = loader({ react: hooks.react,
    'react-native': { AppState: app, Platform: { OS: os }, Linking: {
      sendIntent: async action => { calls.push(action); if (env.settings) await env.settings; },
      openSettings: async () => { calls.push('app-settings'); if (env.settings) await env.settings; },
    } },
    'expo-location': {
      getForegroundPermissionsAsync: async () => { calls.push('read'); if (env.read) await env.read; return env.permission; },
      requestForegroundPermissionsAsync: async () => { calls.push('prompt'); if (env.prompt) await env.prompt; return env.permission; },
      hasServicesEnabledAsync: async () => env.services,
    },
  });
  const { useLocationRecovery } = load('hooks/location-picker/useLocationRecovery.ts');
  t.after(() => hooks.unmount());
  return { hooks, app, env, calls, load,
    render: () => hooks.render(() => useLocationRecovery(() => calls.push('ready'), env.active, env.observe)) };
}

for (const os of ['android', 'ios']) test(`${os}: an explicit activation opens Settings and only a real grant on return retries GPS`, async t => {
  const f = fixture(t, os); f.render(); await tick(); assert.deepEqual(f.calls, [], 'no automatic permission prompt');
  await f.render().recover();
  assert.equal(f.render().issue, 'services');
  assert.equal(f.calls.at(-1), os === 'android' ? 'android.settings.LOCATION_SOURCE_SETTINGS' : 'app-settings');
  assert.equal(f.calls.includes('ready'), false);
  f.app.emit('change', 'background'); f.app.emit('change', 'active'); f.render(); await tick();
  assert.equal(f.render().issue, 'services'); assert.equal(f.calls.includes('ready'), false, 'returning is not a grant');
  await f.render().recover();
  f.env.services = true;
  f.app.emit('change', 'inactive'); f.app.emit('change', 'active'); f.render(); await tick();
  assert.equal(f.render().issue, null); assert.equal(f.calls.filter(x => x === 'ready').length, 1);
  assert.equal(f.calls.includes('prompt'), false);
});

test('blocked foreground permission opens app settings instead of the Android GPS page', async t => {
  const f = fixture(t); f.env.permission = { granted: false, canAskAgain: false };
  await f.render().recover();
  assert.deepEqual(f.calls, ['read', 'app-settings']); assert.equal(f.render().issue, 'settings');
  f.env.permission = { granted: true }; f.env.services = true;
  f.app.emit('blur'); f.app.emit('focus'); f.render(); await tick();
  assert.equal(f.calls.at(-1), 'ready'); assert.equal(f.render().issue, null);
});

test('refusal remains explicit and does not open Settings or start GPS', async t => {
  const f = fixture(t); f.env.permission = { granted: false, canAskAgain: true };
  await f.render().recover();
  assert.deepEqual(f.calls, ['read', 'prompt']); assert.equal(f.render().issue, 'permission');
});

test('double taps share the prompt and human decision time is not a GPS timeout', async t => {
  const f = fixture(t), pending = deferred(); f.env.prompt = pending.promise;
  f.env.permission = { granted: false, canAskAgain: true };
  const job = f.render().recover(); await tick(); await f.render().recover();
  t.mock.timers.tick(120000); await tick();
  assert.equal(f.render().busy, true); assert.deepEqual(f.calls, ['read', 'prompt']);
  f.env.permission = { granted: true }; f.env.services = true; pending.resolve(); await job;
  assert.equal(f.calls.at(-1), 'ready'); assert.equal(f.render().busy, false);
});

test('a manual map choice cancels a pending Settings return and late native reads', async t => {
  const f = fixture(t); await f.render().recover(); f.render().clear();
  f.env.services = true; f.app.emit('blur'); f.app.emit('focus'); f.render(); await tick();
  assert.equal(f.calls.includes('ready'), false);
  const old = deferred(); f.env.read = old.promise;
  const job = f.render().recover(); f.render().clear(); old.resolve(); await job;
  assert.equal(f.calls.includes('ready'), false); assert.equal(f.render().issue, null);
});

test('read timeout releases busy, ignores late results and permits retry', async t => {
  const f = fixture(t), old = deferred(); f.env.read = old.promise;
  const job = f.render().recover(); t.mock.timers.tick(8000); await job;
  assert.equal(f.render().busy, false); assert.match(f.render().error, /Réessayez/);
  old.resolve(); await tick(); assert.equal(f.calls.includes('ready'), false);
  f.env.read = null; f.env.services = true; await f.render().recover(); assert.equal(f.calls.at(-1), 'ready');
});

test('late settings launch and unmount cannot restart the old location action', async t => {
  const f = fixture(t), old = deferred(); f.env.settings = old.promise;
  const job = f.render().recover(); await tick();
  f.hooks.unmount(); f.env.services = true; f.app.emit('blur'); f.app.emit('focus');
  old.resolve(); await job;
  assert.equal(f.calls.includes('ready'), false); assert.equal(f.app.count(), 0);
});

test('resume that arrives before the Settings bridge resolves is checked after the launch finishes', async t => {
  const f = fixture(t), old = deferred(); f.env.settings = old.promise;
  const job = f.render().recover(); await tick(); f.env.services = true;
  f.app.emit('blur'); f.app.emit('focus'); f.render();
  old.resolve(); await job; f.render(); await tick();
  assert.equal(f.calls.filter(x => x === 'ready').length, 1);
});

test('resuming does not open settings or grant background location without an explicit action', async t => {
  const f = fixture(t); f.render(); f.app.emit('blur'); f.app.emit('focus'); f.render(); await tick();
  assert.deepEqual(f.calls, []);
  f.app.currentState = 'background'; await f.render().recover(); assert.deepEqual(f.calls, []);
});

test('permission result arriving before the active render preserves the requested position retry', async t => {
  const f = fixture(t, 'ios'), prompt = deferred();
  f.env.prompt = prompt.promise; f.env.permission = { granted: false, canAskAgain: true };
  const job = f.render().recover(); await tick();
  f.app.emit('change', 'inactive'); f.env.active = false; f.render();
  f.env.permission = { granted: true }; f.env.services = true; prompt.resolve(); await job;
  assert.equal(f.calls.includes('ready'), false);
  f.app.emit('change', 'active'); f.env.active = true; f.render(); await tick();
  assert.equal(f.calls.filter(x => x === 'ready').length, 1);
  assert.equal(f.calls.filter(x => x === 'prompt').length, 1);
});

test('passive observation reveals disabled GPS, never prompts/recentres, and sleeps with the app', async t => {
  const f = fixture(t); f.env.observe = true;
  f.render(); await tick(); assert.equal(f.render().issue, 'services');
  assert.deepEqual(f.calls, ['read']);
  f.env.services = true; f.app.emit('blur'); f.app.emit('focus'); f.render(); await tick();
  assert.equal(f.render().issue, null); assert.equal(f.calls.includes('ready'), false);
  f.app.currentState = 'background'; const count = f.calls.length;
  t.mock.timers.tick(90_000); await tick(); assert.equal(f.calls.length, count);
  f.app.currentState = 'active'; f.env.services = false;
  t.mock.timers.tick(30_000); await tick(); assert.equal(f.render().issue, 'services');
  assert.equal(f.calls.includes('prompt'), false); assert.equal(f.calls.includes('ready'), false);
  f.hooks.unmount(); const finalCount = f.calls.length;
  t.mock.timers.tick(60_000); await tick(); assert.equal(f.calls.length, finalCount);
});
