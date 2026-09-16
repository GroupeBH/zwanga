const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, pending = false) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
  let active = true, activityListener;
  const watches = [], subscriptions = [];
  const stream = loader({
    'expo-location': { watchPositionAsync: (_options, callback) => {
      const watch = { callback, removed: 0, resolve: null };
      watches.push(watch);
      const subscription = { remove: () => watch.removed++ };
      return pending ? new Promise(resolve => { watch.resolve = () => resolve(subscription); }) : Promise.resolve(subscription);
    } },
    './appActivity': {
      isAppActive: () => active,
      subscribeAppActivity: fn => { activityListener = fn; return () => { activityListener = null; }; },
    },
    '@/utils/throttledWarning': { warnThrottled() {} },
  })('services/rideLocationStream.ts');
  const subscribe = (key, callback) => {
    const subscription = stream.subscribeRideLocation(key, {}, callback);
    subscriptions.push(subscription);
    return subscription;
  };
  const fix = (timestamp = Date.now()) => ({ timestamp, coords: { latitude: -4.32, longitude: 15.3, accuracy: 10 } });
  t.after(() => subscriptions.forEach(subscription => subscription.remove()));
  return { ...stream, subscribe, fix, watches, active(value) { active = value; activityListener?.(); }, hasActivityListener: () => !!activityListener };
}

test('screens share a foreground fallback, then reuse native GPS without a second watcher', async t => {
  const env = fixture(t);
  let first = 0, second = 0;
  const a = env.subscribe('driver:trip', () => first++);
  const b = env.subscribe('driver:trip', () => second++);
  await flush();
  assert.equal(env.watches.length, 1);
  env.watches[0].callback(env.fix());
  assert.equal(first, 1); assert.equal(second, 1);
  env.publishNativeRideLocation('driver:trip', env.fix());
  assert.equal(env.watches[0].removed, 1);
  env.watches[0].callback(env.fix()); // late callback from the removed watcher
  assert.equal(first, 2); assert.equal(second, 2);
  a.remove();
  for (let i = 0; i < 1800; i++) {
    t.mock.timers.tick(2000);
    env.publishNativeRideLocation('driver:trip', env.fix());
  }
  assert.equal(env.watches.length, 1, 'no GPS subscription churn over an hour of native updates');
  assert.equal(first, 2);
  assert.equal(second, 1802);
  b.remove(); b.remove();
  assert.equal(env.hasActivityListener(), false);
  t.mock.timers.tick(60_000);
  assert.equal(env.watches.length, 1);
});

test('a silent native task resumes foreground GPS within the boarding freshness window', async t => {
  const env = fixture(t);
  env.subscribe('passenger:booking', () => {});
  await flush();
  env.publishNativeRideLocation('passenger:booking', env.fix());
  t.mock.timers.tick(6000);
  assert.equal(env.watches.length, 1);
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(env.watches.length, 2);
  env.publishNativeRideLocation('passenger:booking', env.fix());
  assert.equal(env.watches[1].removed, 1);
});

test('backgrounding stops foreground GPS and timers; returning and unmounting cleanly transfer ownership', async t => {
  const env = fixture(t);
  let updates = 0;
  const sub = env.subscribe('driver:trip', () => updates++);
  await flush();
  env.active(false);
  assert.equal(env.watches[0].removed, 1);
  env.publishNativeRideLocation('driver:trip', env.fix());
  assert.equal(updates, 0);
  t.mock.timers.tick(120_000);
  assert.equal(env.watches.length, 1);
  env.active(true);
  await flush();
  assert.equal(env.watches.length, 2);
  sub.remove();
  assert.equal(env.watches[1].removed, 1);
  env.publishNativeRideLocation('driver:trip', env.fix());
  assert.equal(updates, 0);
});

test('late watcher initialization cannot survive unmount or native takeover', async t => {
  const env = fixture(t, true);
  const sub = env.subscribe('driver:trip', () => assert.fail('late GPS callback'));
  env.publishNativeRideLocation('passenger:other', env.fix());
  assert.equal(env.watches[0].removed, 0);
  sub.remove();
  env.watches[0].resolve();
  await flush();
  assert.equal(env.watches[0].removed, 1);
  env.watches[0].callback(env.fix());
  let updates = 0;
  env.subscribe('driver:new', () => updates++);
  env.publishNativeRideLocation('driver:new', env.fix());
  env.watches[1].resolve();
  await flush();
  assert.equal(env.watches[1].removed, 1);
  assert.equal(updates, 1);
});

test('stale, future and invalid native samples never shut down the working fallback', async t => {
  const env = fixture(t);
  let updates = 0;
  env.subscribe('passenger:booking', () => updates++);
  await flush();
  env.publishNativeRideLocation('passenger:booking', env.fix(Date.now() - 9000));
  env.publishNativeRideLocation('passenger:booking', env.fix(Date.now() + 30_000));
  env.publishNativeRideLocation('passenger:booking', { ...env.fix(), coords: { latitude: NaN, longitude: 15 } });
  assert.equal(updates, 0);
  assert.equal(env.watches[0].removed, 0);
});
