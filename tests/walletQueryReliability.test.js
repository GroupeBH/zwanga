const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t, respond, intents) {
  const calls = [];
  const baseApi = createApi({ reducerPath: 'auditWallet', tagTypes: ['Wallet', 'PaymentHistory'],
    baseQuery: async args => { calls.push(args); return respond(args, calls.length); }, endpoints: () => ({}) });
  const api = loader({ './baseApi': { baseApi }, ...(intents ? { '@/features/wallet/topUpIntent': intents } : {}) })('store/api/walletApi.ts').walletApi;
  const store = configureStore({ reducer: { auth: () => ({ user: { id: 'account' }, isAuthenticated: true }),
    [api.reducerPath]: api.reducer }, middleware: g => g().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { api, store, calls };
}

test('a confirmed topup refreshes the balance without refetching its own status', async t => {
  const f = fixture(t, args => typeof args === 'string' && args.includes('/status')
    ? { data: { payment: { status: 'succeeded' } } } : { data: { account: { balance: 100 } } });
  await f.store.dispatch(f.api.endpoints.getMyWallet.initiate());
  const read = f.store.dispatch(f.api.endpoints.checkWalletTopUpStatus.initiate('synthetic'));
  await read;
  await new Promise(r => setTimeout(r, 30));
  assert.equal(f.calls.filter(url => String(url).includes('/status')).length, 1);
  assert.equal(f.calls.filter(url => url === '/wallet/me').length, 2);
  f.store.dispatch(f.api.util.invalidateTags([{ type: 'Wallet', id: 'ME' }]));
  await new Promise(r => setTimeout(r, 30));
  assert.equal(f.calls.filter(url => String(url).includes('/status')).length, 1);
  read.unsubscribe();
});

test('wallet mutation sends the stable intent key, strips local scope and preserves response mapping', async t => {
  const disk = new Map(); let keys = 0;
  const { createTopUpIntentStore } = loader()('features/wallet/topUpIntent.ts');
  const intents = createTopUpIntentStore({ getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } }, () => `key-${++keys}`);
  const f = fixture(t, (_args, count) => count === 1 ? { error: { status: 'FETCH_ERROR', error: 'lost reply' } }
    : { data: { wallet_account: { user_id: 'account', tokens: '450' }, transaction: { status: 'initiated', order_number: 'order' } } },
  { runWalletTopUpIntent: (...args) => intents.run(...args) });
  const input = { intentScope: 'booking:one', amount: 392, method: 'mobile_money', phone: '+243000000000' };
  await assert.rejects(f.store.dispatch(f.api.endpoints.initiateWalletTopUp.initiate(input)).unwrap());
  const response = await f.store.dispatch(f.api.endpoints.initiateWalletTopUp.initiate(input)).unwrap();
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0], f.calls[1]);
  assert.deepEqual(f.calls[0], { url: '/wallet/topups', method: 'POST', body: {
    amount: 392, method: 'mobile_money', phone: '+243000000000', idempotencyKey: 'key-1' } });
  assert.equal(response.account.balance, '450'); assert.equal(response.payment.orderNumber, 'order');
  assert.equal(response.clientIntentKey, 'key-1');
});

test('wallet pages preserve the cursor and normalize ledger fields', async t => {
  const f = fixture(t, () => ({ data: { data: [{ id: 'row', balance_after: '30', created_at: '2026-09-25' }], total: 500, nextCursor: 'next' } }));
  const page = await f.store.dispatch(f.api.endpoints.getWalletLedgerPage.initiate({ before: 'cursor', limit: 25 })).unwrap();
  assert.equal(page.total, 500); assert.equal(page.nextCursor, 'next'); assert.equal(page.data[0].balanceAfter, '30');
  assert.deepEqual(f.calls[0], { url: '/wallet/ledger/page', params: { before: 'cursor', limit: 25 } });
});

test('recovering a lost reply uses only the recovery endpoint with the original key and payload', async t => {
  const disk = new Map();
  const { createTopUpIntentStore } = loader()('features/wallet/topUpIntent.ts');
  const intent = createTopUpIntentStore({ getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => disk.set(key, value), removeItem: async key => disk.delete(key) }, () => 'original-key');
  await assert.rejects(intent.run('account', 'booking:one', { amount: 392, method: 'mobile_money', phone: 'synthetic' },
    async () => { throw Error('lost reply'); }, () => true));
  const f = fixture(t, () => ({ data: { payment: { status: 'cancelled' } } }), {
    recoverWalletTopUpIntent: (...args) => intent.recover(...args),
  });
  const response = await f.store.dispatch(f.api.endpoints.recoverWalletTopUp.initiate({ intentScope: 'booking:one' })).unwrap();
  assert.deepEqual(f.calls, [{ url: '/wallet/topups/recover', method: 'POST', body: {
    idempotencyKey: 'original-key', amount: 392, method: 'mobile_money', phone: 'synthetic' } }]);
  assert.equal(response.clientIntentKey, 'original-key'); assert.equal(response.payment.status, 'cancelled');
  assert.ok(await intent.readPending('account', 'booking:one'), 'the consumer must acknowledge the terminal response before clearing it');
});

test('old backend fallback reads only the bounded summary, never the full ledger', async t => {
  const f = fixture(t, args => typeof args === 'object' ? { error: { status: 404 } }
    : { data: { recentEntries: Array.from({ length: 30 }, (_, i) => ({ id: String(i) })) } });
  const page = await f.store.dispatch(f.api.endpoints.getWalletLedgerPage.initiate({})).unwrap();
  assert.equal(page.data.length, 30); assert.equal(page.limited, true); assert.equal(page.nextCursor, null);
  assert.deepEqual(f.calls.map(args => typeof args === 'string' ? args : args.url), ['/wallet/ledger/page', '/wallet/me']);
});

test('network errors do not masquerade as an empty history or trigger legacy downloads', async t => {
  const f = fixture(t, () => ({ error: { status: 502 } }));
  await assert.rejects(f.store.dispatch(f.api.endpoints.getWalletLedgerPage.initiate({})).unwrap());
  assert.equal(f.calls.length, 1);
});
