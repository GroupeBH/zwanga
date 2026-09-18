const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function storage() {
  const data = new Map();
  return { data, getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('a withdrawal intent survives restart with the same key, amount and recipient', async () => {
  const disk = storage();
  const load = () => loader({ '@react-native-async-storage/async-storage': disk, 'expo-crypto': { randomUUID } })('services/walletWithdrawalIntent.ts');
  const api = load();
  const [first, second] = await Promise.all([api.prepareWalletWithdrawalIntent('user', 40, '+243891234567'), api.prepareWalletWithdrawalIntent('user', 40, '+243891234567')]);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.deepEqual(await load().prepareWalletWithdrawalIntent('user', 40, '+243891234567'), first);
  await assert.rejects(api.prepareWalletWithdrawalIntent('user', 41, '+243891234567'));
  await assert.rejects(api.prepareWalletWithdrawalIntent('user', 40, '+243899999999'));
  assert.equal(await api.readWalletWithdrawalIntent('other'), null);
  await api.clearWalletWithdrawalIntent({ ...first, idempotencyKey: randomUUID() });
  assert.deepEqual(await api.readWalletWithdrawalIntent('user'), first);
  await api.clearWalletWithdrawalIntent(first);
  assert.equal(await api.readWalletWithdrawalIntent('user'), null);
});

test('corrupted storage blocks new withdrawals instead of losing an uncertain request', async () => {
  const disk = storage(); disk.data.set('wallet-withdrawal-intent:v1:user', '{broken');
  const api = loader({ '@react-native-async-storage/async-storage': disk, 'expo-crypto': { randomUUID } })('services/walletWithdrawalIntent.ts');
  await assert.rejects(api.prepareWalletWithdrawalIntent('user', 40, '+243891234567'));
  assert.equal(disk.data.get('wallet-withdrawal-intent:v1:user'), '{broken');
});

function app(patch = {}) {
  const hooks = hookHarness(), disk = storage(), dialogs = [], posts = [];
  const state = { user: { id: 'user', phone: '+243891234567' }, active: true, error: null, history: [], ...patch };
  const summary = { account: { balance: 100, withdrawableBalance: 60 }, withdrawal: { enabled: true, blocked: false, currency: 'CDF', moneyPerToken: 100 } };
  const load = loader({
    react: hooks.react, '@react-native-async-storage/async-storage': disk, 'expo-crypto': { randomUUID },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/store/hooks': { useAppSelector: () => state.user }, '@/store/selectors': { selectUser: () => state.user },
    '@/features/driver-earnings/payoutModel': { normalizePayoutPhone: value => /^\+243\d{9}$/.test(value) ? value : null },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '@/store/api/walletApi': {
      useGetWalletWithdrawalsQuery: () => ({ data: state.history }),
      useRequestWalletWithdrawalMutation: () => [body => ({ unwrap: async () => {
        posts.push(body);
        assert.ok(disk.data.has('wallet-withdrawal-intent:v1:user'));
        if (state.error) throw state.error;
        return { ...body, id: 'withdrawal', status: 'initiated', amount: body.tokens * 100, currency: 'CDF', message: 'En attente' };
      } })],
      useCheckWalletWithdrawalMutation: () => [() => ({ unwrap: async () => ({ id: 'withdrawal', status: 'pending' }) })],
    },
  });
  const { useWalletWithdrawal } = load('hooks/wallet/useWalletWithdrawal.ts');
  const render = () => hooks.render(() => useWalletWithdrawal(summary, state.active));
  return { render, state, summary, dialogs, posts, disk, hooks };
}

test('double confirmation submits once and pending is not displayed as success', async () => {
  const f = app(); f.render(); await flush(); let value = f.render();
  value.setTokens('40'); value = f.render(); value.confirm();
  const confirm = f.dialogs.at(-1).actions[1].onPress;
  await Promise.all([confirm(), confirm()]);
  assert.equal(f.posts.length, 1);
  assert.equal(f.dialogs.at(-1).variant, 'info');
  assert.equal(f.disk.data.size, 0);
});

test('lost responses retain the intent and retry uses the same key even with a reduced balance', async () => {
  const f = app({ error: { status: 'FETCH_ERROR' } });
  f.render(); await flush(); let value = f.render(); value.setTokens('40'); value = f.render(); value.confirm();
  await f.dialogs.at(-1).actions[1].onPress();
  f.summary.account.withdrawableBalance = 20;
  value = f.render(); assert.equal(value.canSubmit, true); assert.equal(value.tokens, '40');
  value.setPhone('+243899999999'); value = f.render(); value.confirm();
  await f.dialogs.at(-1).actions[1].onPress();
  assert.equal(f.posts.length, 2); assert.deepEqual(f.posts[0], f.posts[1]);
  assert.equal(f.disk.data.size, 1);
});

test('only a proven pre-submission refusal clears the request, never an ambiguous 400', async () => {
  for (const code of [undefined, 'WALLET_WITHDRAWAL_NOT_RESERVED']) {
    const f = app({ error: { status: 400, data: { code } } });
    f.render(); await flush(); let value = f.render(); value.setTokens('40'); value = f.render(); value.confirm();
    await f.dialogs.at(-1).actions[1].onPress();
    assert.equal(f.disk.data.size, code ? 0 : 1);
  }
});

test('no spending of loyalty balance, no submission after logout/navigation, and storage failure blocks POST', async () => {
  const f = app(); f.render(); await flush(); let value = f.render();
  value.setTokens('80'); value = f.render(); value.confirm(); assert.equal(f.posts.length, 0);
  assert.equal(f.dialogs.at(-1).title, 'Vérifiez le retrait');
  value.setTokens('40'); value = f.render(); value.confirm(); const confirm = f.dialogs.at(-1).actions[1].onPress;
  f.state.user = { id: 'other' }; f.render(); await confirm(); assert.equal(f.posts.length, 0);
  const g = app(); g.render(); await flush(); value = g.render(); value.setTokens('40'); value = g.render(); value.confirm();
  g.disk.setItem = async () => { throw new Error('disk full'); };
  await g.dialogs.at(-1).actions[1].onPress(); assert.equal(g.posts.length, 0); assert.equal(g.render().storageError, true);
});

test('API preserves eligibility fields and older backend summaries fail closed', () => {
  let endpoints;
  const baseApi = { injectEndpoints: options => {
    endpoints = options.endpoints({ query: value => value, mutation: value => value }); return {};
  } };
  loader({ './baseApi': { baseApi } })('store/api/walletApi.ts');
  const parsed = endpoints.getMyWallet.transformResponse({ account: { balance: '100', withdrawableBalance: '60', reservedWithdrawalBalance: '40', withdrawalsBlocked: true }, withdrawal: { enabled: true, blocked: true } });
  assert.equal(parsed.account.withdrawableBalance, 60); assert.equal(parsed.account.reservedWithdrawalBalance, 40);
  assert.equal(parsed.withdrawal.blocked, true);
  const old = endpoints.getMyWallet.transformResponse({ account: { balance: '100' } });
  assert.equal(old.account.withdrawableBalance, 0); assert.equal(old.withdrawal, undefined);
});
