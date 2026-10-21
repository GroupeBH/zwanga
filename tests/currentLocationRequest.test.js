const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const fix = { coords: { latitude: -4.3, longitude: 15.3, accuracy: 20 }, timestamp: 1000 };

function fixture(overrides = {}) {
  const watches = [];
  const api = loader({ 'expo-location': {
    Accuracy: { Balanced: 3, High: 4 }, getLastKnownPositionAsync: async () => null,
    watchPositionAsync: async (options, callback, error) => {
      const watch = { options, callback, error, removed: 0, remove() { this.removed++; } };
      watches.push(watch); return watch;
    }, ...overrides,
  } })('services/currentLocationRequest.ts');
  return { ...api, watches,
    read: (signal = new AbortController().signal) => api.requestCurrentLocation(true, signal, { fallback: false }),
  };
}

test('concurrent callers share a cancellable GPS watch; aborting one does not cancel the other', async () => {
  const f = fixture(), first = new AbortController();
  const a = f.read(first.signal), b = f.read(); await tick();
  assert.equal(f.watches.length, 1);
  first.abort(); assert.equal(await a, null); assert.equal(f.watches[0].removed, 0);
  f.watches[0].callback(fix); assert.equal(await b, fix);
  assert.equal(f.watches[0].removed, 1);
});

test('no fix stops GPS at the deadline and subsequent requests can recover', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), a = f.read(); await tick();
  t.mock.timers.tick(f.CURRENT_POSITION_TIMEOUT_MS); assert.equal(await a, null);
  assert.equal(f.watches[0].removed, 1);
  const b = f.read(); await tick(); assert.equal(f.watches.length, 2);
  f.watches[0].callback(fix); assert.equal(f.watches[1].removed, 0, 'old fixes cannot finish a new request');
  f.watches[1].callback(fix); assert.equal(await b, fix); assert.equal(f.watches[1].removed, 1);
});

test('late native watch registration is removed and retries cannot accumulate unresolved registrations', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let register, callback, starts = 0, removed = 0;
  const f = fixture({ watchPositionAsync: (_options, onPosition) => {
    starts++; callback = onPosition; return new Promise(resolve => { register = resolve; });
  } });
  const a = f.read(); await tick(); t.mock.timers.tick(f.CURRENT_POSITION_TIMEOUT_MS);
  assert.equal(await a, null);
  for (let i = 0; i < 5; i++) assert.equal(await f.read(), null);
  assert.equal(starts, 1);
  register({ remove() { removed++; } }); await tick(); assert.equal(removed, 1);
  callback(fix);
  const controller = new AbortController(), b = f.read(controller.signal); await tick();
  assert.equal(starts, 2); controller.abort(); assert.equal(await b, null);
  register({ remove() { removed++; } }); await tick(); assert.equal(removed, 2);
});

test('a callback before registration completes is cleaned up, and invalid coordinates are ignored', async () => {
  let removed = 0;
  const f = fixture({ watchPositionAsync: async (_options, callback) => {
    callback(undefined); callback({});
    callback({ ...fix, coords: { latitude: NaN, longitude: 15 } });
    callback(fix); return { remove() { removed++; } };
  } });
  assert.equal(await f.read(), fix); await tick(); assert.equal(removed, 1);
});

test('permission/native failures release all waiters; teardown errors never reject the UI', async () => {
  const f = fixture({ watchPositionAsync: async () => { throw Error('denied'); } });
  assert.deepEqual(await Promise.all([f.read(), f.read()]), [null, null]);
  const g = fixture(); const pending = g.read(); await tick();
  g.watches[0].remove = () => { throw Error('already removed'); };
  g.watches[0].error('provider unavailable'); assert.equal(await pending, null);
});

test('already cancelled callers neither start GPS nor read native cache', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture({ getLastKnownPositionAsync: () => assert.fail('no cache read') });
  assert.equal(await f.read(controller.signal), null); assert.equal(f.watches.length, 0);
});
