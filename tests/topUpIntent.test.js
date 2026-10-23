const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function environment() {
  const load = loader(), disk = new Map(), sent = [];
  let keys = 0;
  const storage = { getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } };
  const factory = load('features/wallet/topUpIntent.ts').createTopUpIntentStore;
  const make = () => factory(storage, () => `test-key-${++keys}`);
  const send = async body => { sent.push(body); return { payment: { status: 'pending', orderNumber: 'order-a' } }; };
  return { disk, sent, storage, make, api: make(), send,
    payload: { amount: 392, method: 'mobile_money', phone: '+243000000000' } };
}

test('intent is durable before HTTP and a lost response reuses the same key after remount', async () => {
  const e = environment();
  await assert.rejects(e.api.run('account', 'wallet', e.payload, async body => {
    assert.equal(e.disk.size, 1); e.sent.push(body); throw { status: 'FETCH_ERROR' };
  }, () => true));
  const response = await e.make().run('account', 'wallet', e.payload, e.send, () => true);
  assert.equal(e.sent.length, 2); assert.equal(e.sent[0].idempotencyKey, e.sent[1].idempotencyKey);
  assert.equal(response.clientIntentKey, e.sent[0].idempotencyKey);
});

test('two concurrent callers cannot create two intent keys', async () => {
  const e = environment(), gate = deferred();
  const first = e.api.run('account', 'wallet', e.payload, async body => { e.sent.push(body); await gate.promise; return { payment: { status: 'pending' } }; }, () => true);
  await flush(); const second = e.api.run('account', 'wallet', e.payload, e.send, () => true);
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(new Set(e.sent.map(body => body.idempotencyKey)).size, 1);
});

test('recovering a lost reference preserves the order so later status monitoring can acknowledge it', async () => {
  const e = environment();
  await assert.rejects(e.api.run('account', 'booking:one', e.payload, async () => { throw Error('lost'); }, () => true));
  const recovered = await e.make().recover('account', 'booking:one', e.send, () => true);
  assert.equal(recovered.payment.orderNumber, 'order-a');
  assert.equal((await e.make().readPending('account', 'booking:one')).orderNumber, 'order-a');
  await e.make().acknowledge('account', 'booking:one', { status: 'failed', orderNumber: 'order-a' });
  assert.equal(await e.make().readPending('account', 'booking:one'), null);
});

test('unknown outcomes cannot change the amount, method or phone, and never expire by age', async () => {
  const e = environment(); await e.api.run('account', 'wallet', e.payload, e.send, () => true);
  for (const patch of [{ amount: 50 }, { method: 'card' }, { phone: '+243000000001' }]) {
    await assert.rejects(e.api.run('account', 'wallet', { ...e.payload, ...patch }, e.send, () => true), /déjà en cours/);
  }
  assert.equal(e.sent.length, 1);
  assert.deepEqual((await e.make().readPending('account', 'wallet')).payload, e.payload);
});

test('accounts and bookings have separate keys; only a matching terminal result releases one', async () => {
  const e = environment();
  const first = await e.api.run('account', 'wallet', e.payload, e.send, () => true);
  await e.api.run('other', 'wallet', e.payload, e.send, () => true);
  await e.api.run('account', 'booking:one', e.payload, e.send, () => true);
  assert.equal(new Set(e.sent.map(v => v.idempotencyKey)).size, 3);
  await e.api.acknowledge('account', 'wallet', { status: 'pending', orderNumber: 'order-a' }, first.clientIntentKey);
  await e.api.acknowledge('account', 'wallet', { status: 'failed', orderNumber: 'other-order' }, 'stale-key');
  assert.equal(e.disk.size, 3);
  await e.api.acknowledge('account', 'wallet', { status: 'succeeded', orderNumber: 'order-a' });
  await e.api.run('account', 'wallet', e.payload, e.send, () => true);
  assert.notEqual(e.sent[3].idempotencyKey, first.clientIntentKey);
});

test('a native write that times out cannot trigger a late charge or a competing write', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const e = environment(), gate = deferred(); let writes = 0;
  e.storage.setItem = async (key, value) => { writes++; await gate.promise; e.disk.set(key, value); };
  const first = assert.rejects(e.api.run('account', 'wallet', e.payload, e.send, () => true), /sauvegarde/);
  await flush(); t.mock.timers.tick(8001); await first;
  const second = assert.rejects(e.api.run('account', 'wallet', e.payload, e.send, () => true));
  await flush(); t.mock.timers.tick(8001); await second;
  assert.equal(writes, 1); gate.resolve(); await flush(); assert.equal(e.sent.length, 0);
  await e.make().run('account', 'wallet', e.payload, e.send, () => true);
  assert.equal(e.sent[0].idempotencyKey, 'test-key-1');
});

test('storage corruption or read failure never clears an intent or starts a payment', async () => {
  const e = environment(); e.storage.getItem = async () => '{broken';
  await assert.rejects(e.api.run('account', 'wallet', e.payload, e.send, () => true));
  e.storage.getItem = async () => { throw Error('disk'); };
  await assert.rejects(e.api.run('account', 'wallet', e.payload, e.send, () => true));
  assert.equal(e.sent.length, 0);
});

test('logout during durable storage does not send an authenticated mutation', async () => {
  const e = environment(), gate = deferred(); let active = true;
  e.storage.setItem = async () => gate.promise;
  const first = assert.rejects(e.api.run('account', 'wallet', e.payload, e.send, () => active));
  await flush(); active = false; gate.resolve(); await first; assert.equal(e.sent.length, 0);
});

test('wallet recovery restores the original fields, even if only the intent retained the provider order', async t => {
  const h = hookHarness(), events = [];
  const { useWalletTopUpIntentRecovery } = loader({ react: h.react,
    '@/features/wallet/topUpIntent': { readWalletTopUpIntent: async () => ({ orderNumber: 'retained',
      payload: { amount: 392, method: 'mobile_money', phone: '+243000000000' } }) },
  })('hooks/wallet/useWalletTopUpIntentRecovery.ts');
  t.after(() => h.unmount());
  const actions = Object.fromEntries(['setTopUpAmount', 'setTopUpMethod', 'setTopUpPhone', 'setTopUpStage', 'setTopUpStatusMessage']
    .map(name => [name, value => events.push([name, value])]));
  h.render(() => useWalletTopUpIntentRecovery('account', actions)); await flush();
  assert.deepEqual(events.slice(0, 3), [['setTopUpAmount', '392'], ['setTopUpMethod', 'mobile_money'], ['setTopUpPhone', '+243000000000']]);
  assert.equal(events[3][1], 'waiting_long');
});

test('a late wallet intent cannot restore another account or an unmounted screen', async () => {
  const h = hookHarness(), gate = deferred(), events = [];
  const { useWalletTopUpIntentRecovery } = loader({ react: h.react,
    '@/features/wallet/topUpIntent': { readWalletTopUpIntent: async () => gate.promise },
  })('hooks/wallet/useWalletTopUpIntentRecovery.ts');
  const actions = Object.fromEntries(['setTopUpAmount', 'setTopUpMethod', 'setTopUpPhone', 'setTopUpStage', 'setTopUpStatusMessage']
    .map(name => [name, value => events.push([name, value])]));
  h.render(() => useWalletTopUpIntentRecovery('account', actions)); h.unmount();
  gate.resolve({ payload: { amount: 392, method: 'mobile_money' } }); await flush();
  assert.equal(events.length, 0);
});
