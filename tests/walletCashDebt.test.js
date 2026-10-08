const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const hooks = hookHarness(), queries = [];
  const state = { online: true, userId: 'driver', driver: true, active: true, version: 1, refreshes: 0 };
  const response = { currentData: { cash: { debtTokens: 2, debtAmount: 200, moneyPerToken: 100 } },
    isFetching: false, error: undefined, refetch: async () => { state.refreshes++; return { data: response.currentData }; } };
  const { useWalletCashDebt } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: fn => fn({ zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: (...args) => { queries.push(args); return response; } },
  })('hooks/wallet/useWalletCashDebt.ts');
  const render = () => hooks.render(() => useWalletCashDebt(state.userId, state.driver, state.active));
  return { hooks, state, response, queries, render };
}

test('cash debt is server-owned and absent for zero, missing or invalid debt', () => {
  const f = fixture(); assert.deepEqual(f.render().cashDebt, { tokens: 2, amount: 200 });
  for (const debtTokens of [0, -1, NaN, Infinity, undefined]) {
    f.response.currentData.cash.debtTokens = debtTokens;
    assert.equal(f.render().cashDebt, undefined);
  }
  f.response.currentData = undefined; assert.equal(f.render().cashDebt, undefined);
  f.hooks.unmount();
});

test('loading, errors and offline state never present cached debt as a fresh financial status', () => {
  const f = fixture(); f.response.isFetching = true;
  assert.equal(f.render().cashDebt, undefined); assert.equal(f.render().isFetching, true);
  f.response.isFetching = false; f.response.error = { status: 'FETCH_ERROR' };
  assert.equal(f.render().cashDebt, undefined);
  f.response.error = undefined; f.state.online = false;
  assert.equal(f.render().cashDebt, undefined); assert.equal(f.queries.at(-1)[1].skip, true);
  f.state.online = true;
  assert.deepEqual(f.render().cashDebt, { tokens: 2, amount: 200 });
  assert.equal(f.queries.at(-1)[1].refetchOnMountOrArgChange, true);
  assert.equal(f.queries.at(-1)[1].pollingInterval, 0);
  f.hooks.unmount();
});

test('passengers, signed-out users and inactive screens skip the read and cannot refresh it', async () => {
  for (const patch of [{ driver: false }, { active: false }, { online: false }, { userId: undefined }]) {
    const f = fixture(); Object.assign(f.state, patch);
    const value = f.render(); assert.equal(value.cashDebt, undefined);
    assert.equal(f.queries.at(-1)[1].skip, true);
    await value.refresh(); assert.equal(f.state.refreshes, 0);
    f.hooks.unmount();
  }
});

test('manual refresh includes debt but stale callbacks cannot cross logout or account changes', async () => {
  const f = fixture(); const first = f.render();
  await first.refresh(); assert.equal(f.state.refreshes, 1);
  f.state.userId = 'another-driver'; f.state.version++;
  f.response.currentData = undefined; const next = f.render();
  assert.equal(next.cashDebt, undefined);
  await first.refresh(); assert.equal(f.state.refreshes, 1);
  await next.refresh(); assert.equal(f.state.refreshes, 2);
  f.hooks.unmount(); await next.refresh(); assert.equal(f.state.refreshes, 2);
});

test('older debt responses use server conversion without inventing a missing amount', () => {
  const f = fixture(); delete f.response.currentData.cash.debtAmount;
  assert.deepEqual(f.render().cashDebt, { tokens: 2, amount: 200 });
  delete f.response.currentData.cash.moneyPerToken;
  assert.deepEqual(f.render().cashDebt, { tokens: 2, amount: undefined });
  f.hooks.unmount();
});
