const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('a remounted reader waits for an older native write even after the writer deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { serializePaymentStorage } = loader()('features/arrival-payment/paymentStorage.ts');
  const gate = deferred(); let disk = 'old', reads = 0;
  const first = assert.rejects(serializePaymentStorage('account-key', async () => { await gate.promise; disk = 'new'; }));
  await flush(); t.mock.timers.tick(8001); await first;
  const reader = serializePaymentStorage('account-key', async () => { reads++; return disk; });
  await flush(); assert.equal(reads, 0); gate.resolve();
  assert.equal(await reader, 'new'); assert.equal(reads, 1);
});

function environment(storage) {
  const h = hookHarness();
  const load = loader({ react: h.react, '@react-native-async-storage/async-storage': storage,
    'expo-linking': { createURL: () => '' } });
  const { usePaymentPersistence } = load('hooks/arrival-payment/usePaymentPersistence.ts');
  return { h, render: () => h.render(() => usePaymentPersistence('account', true)) };
}

test('a hung native read releases the screen to recovery after 8s, never to a new payment', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred(), writes = [];
  const storage = { getItem: () => gate.promise, setItem: async (...args) => { writes.push(args); } };
  const e = environment(storage); t.after(() => e.h.unmount()); e.render();
  t.mock.timers.tick(8001); await flush();
  assert.equal(e.render().isStoredStateLoaded, true);
  assert.equal(e.render().isStorageLoading, false); assert.match(e.render().storageError, /Ne payez pas/);
  assert.equal(await e.render().persistBookingState('b', { walletTopUpOrderNumber: 'lost' }), false);
  gate.resolve(JSON.stringify({ stale: { walletTopUpOrderNumber: 'old' } })); await flush();
  assert.deepEqual(e.render().storedState, {}); assert.equal(writes.length, 0);
  storage.getItem = async () => JSON.stringify({ booking: { walletTopUpOrderNumber: 'retained' } });
  e.render().retryPaymentStorage(); e.render(); await flush();
  assert.equal(e.render().storageError, ''); assert.equal(e.render().storedState.booking.walletTopUpOrderNumber, 'retained');
});

test('corrupt payment state remains recoverable and is not overwritten as an empty cache', async t => {
  let writes = 0;
  const e = environment({ getItem: async () => '{broken', setItem: async () => { writes++; } });
  t.after(() => e.h.unmount()); e.render(); await flush();
  assert.ok(e.render().storageError); assert.equal(e.render().isStoredStateLoaded, true);
  assert.equal(await e.render().persistBookingState('b', { acknowledgedAt: 'now' }), false);
  assert.equal(writes, 0);
});

test('timed-out writes retain the latest snapshot and do not overlap the native operation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred(), written = [];
  const e = environment({ getItem: async () => null, setItem: async (_key, value) => {
    written.push(JSON.parse(value)); if (written.length === 1) await gate.promise;
  } });
  t.after(() => e.h.unmount()); e.render(); await flush();
  const first = e.render().persistBookingState('a', { walletTopUpOrderNumber: 'order-a' });
  t.mock.timers.tick(8001); assert.equal(await first, false); assert.ok(e.render().storageError);
  await e.render().persistBookingState('b', { walletTopUpIntent: 'unknown' });
  e.render().retryPaymentStorage(); e.render(); await flush(); assert.equal(written.length, 1);
  gate.resolve(); await flush(); assert.equal(written.length, 2);
  assert.equal(written[1].a.walletTopUpOrderNumber, 'order-a'); assert.equal(written[1].b.walletTopUpIntent, 'unknown');
  assert.equal(e.render().storageError, '');
});
