const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const hooks = hookHarness();
  const io = { state: 'active', online: true, os: 'ios', driver: true, userId: id(1), version: 0,
    calls: [], restored: [], logs: [], read: async () => ({ alerts: [{ key: 'fresh' }], retry: false }) };
  const load = loader({ react: hooks.react,
    'react-native': { Platform: { get OS() { return io.os; } }, AppState: { get currentState() { return io.state; } } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.state === 'active' },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: io.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    '@/services/driverAlertRecovery': { readDriverAlertRecovery: async (user, signal) => {
      io.calls.push({ user, signal }); return io.read();
    } },
    '@/services/rideAlertSession': { rememberRideAlert: (alert, restoring) => io.restored.push({ alert, restoring }) },
    '@/services/rideAudioDiagnostics': { reportRideAudioFailure: code => io.logs.push(code) },
  });
  const hook = load('hooks/notifications/useIosRideAlertRecovery.ts').useIosRideAlertRecovery;
  t.after(() => hooks.unmount());
  return { io, hooks, render: () => hooks.render(() => hook(io.userId, io.driver)) };
}

test('recovery is iOS-driver-only, authenticated, online and active', async t => {
  const f = fixture(t);
  for (const [field, disabled, enabled] of [['state', 'background', 'active'], ['online', false, true],
    ['os', 'android', 'ios'], ['driver', false, true], ['userId', undefined, id(1)]]) {
    f.io[field] = disabled; f.render(); await tick(); assert.equal(f.io.calls.length, 0);
    f.io[field] = enabled;
  }
  f.render(); await tick();
  assert.equal(f.io.calls.length, 1); assert.equal(f.io.restored[0].restoring, true);
  f.render(); await tick(); assert.equal(f.io.calls.length, 1, 'renders do not poll the server');
});

test('errors retry once, remain paced and never expose payloads or block entry', async t => {
  const f = fixture(t); f.io.read = async () => { throw Error('private payload'); };
  f.render(); await tick(); assert.equal(f.io.calls.length, 1);
  t.mock.timers.tick(9999); await tick(); assert.equal(f.io.calls.length, 1);
  t.mock.timers.tick(1); await tick(); assert.equal(f.io.calls.length, 2);
  t.mock.timers.tick(60000); await tick(); assert.equal(f.io.calls.length, 2);
  assert.deepEqual(f.io.logs, ['RESTORE_IOS_SERVER_FAILED', 'RESTORE_IOS_SERVER_FAILED']);
});

test('partial recovery keeps usable alerts and retries only once; empty success does not poll', async t => {
  const f = fixture(t); f.io.read = async () => ({ alerts: [{ key: 'first' }], retry: true });
  f.render(); await tick(); assert.equal(f.io.restored.length, 1);
  f.io.read = async () => ({ alerts: [], retry: false });
  t.mock.timers.tick(10000); await tick(); t.mock.timers.tick(60000); await tick();
  assert.equal(f.io.calls.length, 2); assert.equal(f.io.restored.length, 1);
});

test('backgrounding, logout and offline transitions abort the read and ignore late results', async t => {
  const f = fixture(t);
  for (const [field, value, restore] of [['state', 'background', 'active'], ['userId', undefined, id(1)], ['online', false, true]]) {
    let finish; f.io.read = () => new Promise(resolve => { finish = resolve; });
    f.render(); t.mock.timers.tick(10000); await tick();
    const call = f.io.calls.at(-1); f.io[field] = value; f.render();
    assert.equal(call.signal.aborted, true);
    finish({ alerts: [{ key: 'late' }], retry: false }); await tick();
    assert.deepEqual(f.io.restored, []); f.io[field] = restore;
  }
});

test('a session rotation ignores a late result even before React re-renders', async t => {
  const f = fixture(t); let finish;
  f.io.read = () => new Promise(resolve => { finish = resolve; }); f.render(); await tick();
  f.io.version++; finish({ alerts: [{ key: 'old-session' }], retry: false }); await tick();
  assert.deepEqual(f.io.restored, []);
});

test('rapid active/inactive transitions keep cooldown but eventually recover on re-entry', async t => {
  const f = fixture(t); f.render(); await tick();
  f.io.state = 'inactive'; f.render(); f.io.state = 'active'; f.render();
  t.mock.timers.tick(9999); await tick(); assert.equal(f.io.calls.length, 1);
  t.mock.timers.tick(1); await tick(); assert.equal(f.io.calls.length, 2);
  f.io.state = 'background'; f.render(); f.io.state = 'active'; f.render();
  f.hooks.unmount(); t.mock.timers.tick(60000); await tick(); assert.equal(f.io.calls.length, 2);
});
