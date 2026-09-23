const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { readHistoryPage } = loader()('store/api/financeHistoryPage.ts');
const item = i => ({ id: String(i), createdAt: new Date(i * 1000).toISOString() });

test('financial histories request a bounded cursor page; no full read on transient or later-page failures', async () => {
  const calls = [], page = { data: [item(1)], nextCursor: 'opaque', total: 2000 };
  const response = await readHistoryPage(async args => { calls.push(args); return { data: page }; }, '/page', '/legacy', {}, { filter: 'pending' });
  assert.equal(response.data, page);
  assert.deepEqual(calls, [{ url: '/page', params: { limit: 25, filter: 'pending' } }]);
  for (const [status, args] of [[503, {}], [401, {}], [404, { before: 'opaque' }]]) {
    let count = 0;
    const result = await readHistoryPage(async () => { count++; return { error: { status } }; }, '/page', '/legacy', args);
    assert.equal(result.error.status, status); assert.equal(count, 1);
  }
});

test('rolling deployment fallback keeps all older transactions accessible instead of truncating them', async () => {
  const records = Array.from({ length: 130 }, (_, i) => item(i));
  const read = async args => typeof args === 'string' ? { data: records } : { error: { status: 404 } };
  const loaded = []; let before;
  do {
    const { data } = await readHistoryPage(read, '/page', '/legacy', { before, limit: 25 });
    assert.ok(data.data.length <= 25); loaded.push(...data.data); before = data.nextCursor;
  } while (before);
  assert.equal(loaded.length, 130); assert.equal(new Set(loaded.map(row => row.id)).size, 130);
});

test('paging retains only cursors and a changed filter starts at the first page', () => {
  const hooks = hookHarness();
  const { useHistoryCursor } = loader({ react: hooks.react })('hooks/useHistoryCursor.ts');
  const render = (scope = 'all') => hooks.render(() => useHistoryCursor(scope));
  render().next('second'); assert.equal(render().before, 'second');
  render().next('third'); render().previous(); assert.equal(render().before, 'second');
  assert.equal(render('pending').page, 1); assert.equal(render('pending').before, undefined);
  hooks.unmount();
});

test('financial screens virtualize operations, retain receipts and obtain totals independently of loaded rows', () => {
  const payments = fs.readFileSync('app/payment-history.tsx', 'utf8');
  const earnings = fs.readFileSync('app/driver-earnings.tsx', 'utf8');
  for (const source of [payments, earnings]) { assert.match(source, /<FlatList/); assert.doesNotMatch(source, /(?:filteredPayments|sortedEarnings)\.map/); }
  assert.match(payments, /useGetPaymentHistorySummaryQuery/);
  assert.match(payments, /handleDownloadPayment\(selectedPayment\)/);
  assert.match(earnings, /useDriverPayout\(/);
  assert.match(earnings, /useGetMyDriverSettlementQuery/);
});
