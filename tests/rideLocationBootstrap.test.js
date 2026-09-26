const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(r => setImmediate(r));
const fix = time => ({ timestamp: time, coords: { latitude: -4.3, longitude: 15.3, accuracy: 5 } });
function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
  let resolve, emit, removed = 0;
  const received = [];
  const known = new Promise(r => { resolve = r; });
  const load = loader({ 'expo-location': { getLastKnownPositionAsync: () => known },
    './rideLocationStream': { subscribeRideLocation: (_key, _opts, listener) => { emit = listener; return { remove: () => removed++ }; } } });
  const subscription = load('services/rideLocationBootstrap.ts').subscribeBootstrappedRideLocation('driver:A', {}, value => received.push(value));
  t.after(() => subscription.remove());
  return { emit: value => emit(value), resolve, received, subscription, removed: () => removed };
}
test('stream subscription is immediate even if the bootstrap never resolves', async t => {
  const f = fixture(t); f.emit(fix(100_000)); await tick(); assert.equal(f.received.length, 1);
});
test('a late cache response never moves the map back behind a live fix', async t => {
  const f = fixture(t); f.emit(fix(100_000)); f.resolve(fix(99_000)); await tick();
  assert.deepEqual(f.received.map(v => v.timestamp), [100_000]);
});
test('a fresh cached fix bootstraps without any blocking current-position acquisition', async t => {
  const f = fixture(t); f.resolve(fix(99_000)); await tick(); assert.equal(f.received.length, 1);
});
test('bootstrap timeout and unmount ignore late responses without stopping the live stream early', async t => {
  const f = fixture(t); t.mock.timers.tick(2001); f.resolve(fix(100_000)); await tick();
  assert.equal(f.received.length, 0); f.emit(fix(102_000)); assert.equal(f.received.length, 1);
  f.subscription.remove(); f.emit(fix(103_000)); assert.equal(f.received.length, 1);
});
