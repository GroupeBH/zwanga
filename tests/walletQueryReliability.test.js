const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t, respond) {
  const calls = [];
  const baseApi = createApi({ reducerPath: 'auditWallet', tagTypes: ['Wallet', 'PaymentHistory'],
    baseQuery: async args => { calls.push(args); return respond(args, calls.length); }, endpoints: () => ({}) });
  const api = loader({ './baseApi': { baseApi } })('store/api/walletApi.ts').walletApi;
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: g => g().concat(api.middleware) });
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

test('wallet pages preserve the cursor and normalize ledger fields', async t => {
  const f = fixture(t, () => ({ data: { data: [{ id: 'row', balance_after: '30', created_at: '2026-09-25' }], total: 500, nextCursor: 'next' } }));
  const page = await f.store.dispatch(f.api.endpoints.getWalletLedgerPage.initiate({ before: 'cursor', limit: 25 })).unwrap();
  assert.equal(page.total, 500); assert.equal(page.nextCursor, 'next'); assert.equal(page.data[0].balanceAfter, '30');
  assert.deepEqual(f.calls[0], { url: '/wallet/ledger/page', params: { before: 'cursor', limit: 25 } });
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
