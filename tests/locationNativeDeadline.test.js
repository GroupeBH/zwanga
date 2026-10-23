const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('native reads expire without unhandled rejection or accepting a late value', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { readLocationNative } = loader()('services/locationNativeDeadline.ts');
  const native = deferred(); const check = assert.rejects(readLocationNative(native.promise), /LOCATION_NATIVE_TIMEOUT/);
  t.mock.timers.tick(8000); await check; native.resolve('late'); await tick();
  assert.equal(await readLocationNative(Promise.resolve('fresh')), 'fresh');
});

test('timed-out native mutations keep their lock through late cleanup, without poisoning caller queues', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { mutateLocationNative } = loader()('services/locationNativeDeadline.ts');
  const native = deferred(), cleanup = deferred(); const calls = [];
  const first = assert.rejects(mutateLocationNative('gps', () => { calls.push('start'); return native.promise; },
    () => { calls.push('late-stop'); return cleanup.promise; }), /LOCATION_NATIVE_TIMEOUT/);
  await tick(); t.mock.timers.tick(8000); await first;
  const blocked = assert.rejects(mutateLocationNative('gps', async () => calls.push('unsafe')), /LOCATION_NATIVE_TIMEOUT/);
  t.mock.timers.tick(8000); await blocked; assert.deepEqual(calls, ['start']);
  native.resolve(); await tick(); assert.deepEqual(calls, ['start', 'late-stop']);
  const next = mutateLocationNative('gps', async () => calls.push('new-start'));
  await tick(); assert.equal(calls.length, 2); cleanup.resolve(); await next;
  assert.deepEqual(calls, ['start', 'late-stop', 'new-start']);
});
