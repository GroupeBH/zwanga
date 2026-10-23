const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const policy = loader()('features/permissions/driverPermissionRepository.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function repository() {
  const data = new Map();
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
  return { data, storage, repo: policy.createDriverPermissionRepository(storage, promise => promise) };
}

test('first visit is silent; publication or a later visit lasting 15 seconds qualifies', async () => {
  const { repo } = repository();
  const first = await repo.visit('driver', 1000);
  assert.equal(policy.isDriverPermissionVisitEligible(first, 1000, true), false);
  assert.equal(policy.isDriverPermissionVisitEligible(first, 2000, false), false);
  assert.equal(policy.isDriverPermissionVisitEligible(first, 2000, true), true);
  assert.equal(await repo.published('driver', 1000), true);
  assert.equal(await repo.published('driver', 2000), false);
  assert.equal(policy.isDriverPermissionVisitEligible(await repo.visit('driver', 1000), 1000, false), true);
});

test('sequential writes preserve publication, per-permission cooldown and account isolation', async () => {
  const { repo, storage } = repository();
  await Promise.all([repo.visit('driver', 1000), repo.published('driver', 1000), repo.prompted('driver', 1000, 'location', 2000)]);
  const reloaded = policy.createDriverPermissionRepository(storage, promise => promise);
  const history = await reloaded.visit('driver', 3000);
  assert.equal(history.publishedVisit, 1000);
  assert.equal(history.promptedAt.location, 2000);
  assert.equal(policy.isDriverPermissionPromptDue(history, 'location', 2000 + policy.DRIVER_PERMISSION_REMINDER_MS - 1), false);
  assert.equal(policy.isDriverPermissionPromptDue(history, 'location', 2000 + policy.DRIVER_PERMISSION_REMINDER_MS), true);
  assert.equal(policy.isDriverPermissionPromptDue(history, 'location', 1000), false);
  assert.equal(policy.isDriverPermissionPromptDue(history, 'fullScreen', 3000), true);
  assert.deepEqual((await repo.visit('other', 3000)).promptedAt, {});
});

test('corrupt history or unavailable storage fails closed; calls are bounded', async () => {
  const bounds = [];
  const repo = policy.createDriverPermissionRepository({ getItem: async () => '{broken', setItem: async () => {} },
    (promise, timeout) => { bounds.push(timeout); return promise; });
  await assert.rejects(repo.visit('driver', 1000));
  assert.deepEqual(bounds, [2000]);
  const broken = policy.createDriverPermissionRepository({ getItem: async () => { throw Error('storage unavailable'); }, setItem: async () => {} }, promise => promise);
  await assert.rejects(broken.published('driver', 1000));
});

function fixture(t, { returning = false, published = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), memory = repository();
  let visit = 1000, version = 1, revision = 0;
  const options = { userId: 'driver', active: true, safe: true, overlayBusy: false,
    locationReady: true, locationNeeded: true, fullScreenNeeded: true };
  const usePrompt = loader({ react: { ...hooks.react, useSyncExternalStore: (_, get) => get() },
    '@/services/appActivity': { getAppActiveSince: () => visit, isAppActive: () => options.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/services/driverPermissionOnboarding': { driverPermissionRepository: memory.repo,
      getDriverPublicationRevision: () => revision, subscribeDriverPublication: () => () => {} },
  })('hooks/notifications/useDriverPermissionPrompt.ts').useDriverPermissionPrompt;
  const render = () => hooks.render(() => usePrompt(options));
  const settle = async () => { render(); await tick(); render(); await tick(); return render(); };
  const ready = (async () => {
    if (returning) { await memory.repo.visit('driver', 500); }
    if (published) { await memory.repo.published('driver', visit); }
    return settle();
  })();
  t.after(() => hooks.unmount());
  return { options, hooks, repo: memory.repo, render, settle, ready,
    visit: value => { visit = value; }, version: value => { version = value; },
    publish: async () => { await memory.repo.published('driver', visit); revision++; } };
}

test('foreground timer never prompts on first use; later visit waits a continuous 15 seconds', async t => {
  const f = fixture(t); await f.ready;
  t.mock.timers.tick(15_000); assert.equal((await f.settle()).selected, null);
  f.options.active = false; f.render(); f.visit(2000); f.options.active = true; await f.settle();
  t.mock.timers.tick(14_999); assert.equal((await f.settle()).selected, null);
  f.options.active = false; f.render(); f.options.active = true; await f.settle();
  t.mock.timers.tick(1); assert.equal((await f.settle()).selected, null);
  t.mock.timers.tick(14_999); assert.equal((await f.settle()).selected, 'location');
});

test('successful publication triggers without timer only after a safe route and closed success overlay', async t => {
  const f = fixture(t); await f.ready;
  f.options.safe = false; f.options.overlayBusy = true; await f.publish();
  assert.equal((await f.settle()).selected, null);
  f.options.safe = true; assert.equal((await f.settle()).selected, null);
  f.options.overlayBusy = false; assert.equal((await f.settle()).selected, 'location');
});

test('location then full screen, no same-visit repetition and persisted cooldown on return', async t => {
  const f = fixture(t, { published: true }); await f.ready;
  let state = await f.settle(); assert.equal(state.selected, 'location');
  state.close(); state = await f.settle(); assert.equal(state.selected, 'fullScreen');
  state.close(); assert.equal((await f.settle()).selected, null);
  f.options.active = false; f.render(); f.visit(2000); f.options.active = true; await f.settle();
  t.mock.timers.tick(15_000); assert.equal((await f.settle()).selected, null);
});

test('already allowed permissions and unavailable full screen do not prompt', async t => {
  const f = fixture(t, { returning: true }); await f.ready;
  f.options.locationNeeded = false; f.options.fullScreenNeeded = false;
  t.mock.timers.tick(15_000); assert.equal((await f.settle()).selected, null);
});

test('in-flight history reservation cannot display over an incoming trip or after logout', async t => {
  const f = fixture(t, { returning: true }); await f.ready;
  t.mock.timers.tick(15_000); f.render();
  f.options.safe = false; f.version(2); f.render(); await tick();
  assert.equal(f.render().selected, null);
});

test('settings interruption preserves the chosen step without adding a second prompt', async t => {
  const f = fixture(t, { published: true }); await f.ready;
  assert.equal((await f.settle()).selected, 'location');
  f.options.active = false; f.options.safe = false; f.render();
  f.visit(2000); f.options.active = true; f.options.safe = true;
  assert.equal((await f.settle()).selected, 'location');
});

test('a late full-screen status read does not cancel the location step being reserved', async t => {
  const f = fixture(t); await f.ready;
  let release;
  const original = f.repo.prompted;
  f.repo.prompted = async (...args) => { await new Promise(resolve => { release = resolve; }); return original(...args); };
  f.options.fullScreenNeeded = false; await f.publish(); await f.settle();
  f.options.fullScreenNeeded = true; f.render();
  release(); await tick();
  assert.equal((await f.settle()).selected, 'location');
});

test('unmount while reserving a prompt cannot present late native UI', async t => {
  const f = fixture(t); await f.ready;
  let release;
  const original = f.repo.prompted;
  f.repo.prompted = async (...args) => { await new Promise(resolve => { release = resolve; }); return original(...args); };
  await f.publish(); await f.settle(); f.hooks.unmount(); release(); await tick();
  assert.equal(f.render().selected, null);
});

test('a failed optional publication marker never rejects trip success', async () => {
  const service = loader({
    '@react-native-async-storage/async-storage': { getItem: async () => { throw Error('offline storage'); }, setItem: async () => {} },
    '@/services/rideAudioDiagnostics': { boundedRideAudio: promise => promise },
    '@/services/appActivity': { getAppActiveSince: () => 1000 },
  })('services/driverPermissionOnboarding.ts');
  await assert.doesNotReject(service.recordDriverPublication('driver'));
  assert.equal(service.getDriverPublicationRevision(), 0);
});
