const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { walletAnnouncement: build } = loader()('features/wallet/walletAnnouncement.ts');
const summary = {
  account: { id: 'wallet-test', userId: 'user-test', balance: 100, currency: 'PTS', withdrawableBalance: 60 },
  withdrawal: { enabled: true, blocked: false, availableMoney: 600, currency: 'CDF', minimumTokens: 1, nonWithdrawableTokens: 40 },
};
const account = overrides => ({ ...summary, account: { ...summary.account, ...overrides } });
const withdrawal = overrides => ({ ...summary, withdrawal: { ...summary.withdrawal, ...overrides } });

test('wallet voice separates actual usable, cash-convertible and non-withdrawable tokens', () => {
  const message = build(summary, 'user-test');
  assert.match(message.text, /100 jetons disponibles pour payer/);
  assert.match(message.text, /60 jetons sont convertibles en argent, soit 600 francs congolais/);
  assert.match(message.text, /40 jetons servent uniquement à payer, sans retrait possible/);
  assert.match(message.text, /identité vérifiée/);
  assert.match(message.text, /bonus de fidélité ne sont pas retirables/);
  assert.doesNotMatch(message.text, /wallet-test|user-test/);
  assert.equal(build({ ...summary, recentEntries: [{ id: 'new-history' }],
    account: { ...summary.account, updatedAt: 'updated' } }, 'user-test').key, message.key);
  assert.notEqual(build(account({ balance: 120 }), 'user-test').key, message.key);
});

test('zero and loyalty-only wallets never imply that bonuses can be withdrawn', () => {
  const zero = { ...account({ balance: 0, withdrawableBalance: 0 }),
    withdrawal: { ...summary.withdrawal, availableMoney: 0, nonWithdrawableTokens: 0 } };
  assert.match(build(zero, 'user-test').text, /0 jetons disponibles.*Aucun jeton n’est convertible/);
  const bonus = { ...account({ withdrawableBalance: 0 }),
    withdrawal: { ...summary.withdrawal, availableMoney: 0, nonWithdrawableTokens: 100 } };
  assert.match(build(bonus, 'user-test').text, /100 jetons servent uniquement à payer/);
  assert.doesNotMatch(build(bonus, 'user-test').text, /100 jetons sont convertibles/);
});

test('explicit server ban takes priority over historical purchased balances and keeps gains separate', () => {
  const policy = withdrawal({ enabled: false, blocked: true, availableMoney: 0, nonWithdrawableTokens: 100,
    disabledReason: { code: 'TOKEN_WITHDRAWALS_DISABLED', message: 'Do not read raw server strings.' } });
  const text = build(policy, 'user-test', 'pending').text;
  assert.match(text, /100 jetons disponibles pour payer/);
  assert.match(text, /ne peuvent pas être retirés en argent/);
  assert.match(text, /gains de trajets et de parrainage.*conditions de retrait séparées/);
  assert.match(text, /ancien retrait reste à vérifier/);
  assert.doesNotMatch(text, /60 jetons sont convertibles|part retirable est indisponible|Do not read/);
});

test('cash commission reserves follow the displayed clamp and withdrawals in progress are disclosed separately', () => {
  const value = { ...account({ reservedCashCommissionBalance: '50', reservedWithdrawalBalance: '5' }),
    withdrawal: { ...summary.withdrawal, nonWithdrawableTokens: 0, availableMoney: 500 } };
  const text = build(value, 'user-test').text;
  assert.match(text, /50 jetons disponibles.*50 jetons sont convertibles/);
  assert.match(text, /50 jetons sont réservés aux commissions cash/);
  assert.match(text, /5 jetons sont déjà engagés dans des retraits/);
  assert.doesNotMatch(text, /10 jetons sont convertibles|55 jetons disponibles/);
});

test('disabled, blocked, uncertain and below-minimum withdrawals are not promised as immediately available', () => {
  assert.match(build(withdrawal({ enabled: false }), 'user-test').text, /temporairement indisponibles/);
  assert.match(build(withdrawal({ blocked: true }), 'user-test').text, /bloqués.*assistance/);
  assert.match(build(account({ withdrawalsBlocked: true }), 'user-test').text, /bloqués/);
  assert.match(build(withdrawal({ minimumTokens: 100 }), 'user-test').text, /au moins 100 jetons/);
  assert.match(build(summary, 'user-test', 'pending').text, /reste à vérifier.*pas deux fois/);
  assert.match(build(summary, 'user-test', 'storage').text, /assistance avant de recommencer/);
  assert.match(build(summary, 'user-test', 'history').text, /Actualisez les retraits/);
});

test('unavailable, foreign-account, malformed and partial balances cannot invent money or zero tokens', () => {
  for (const value of [undefined, {}, account({ userId: 'other' }), account({ currency: 'USD' }),
    ...[null, '', ' ', 'oops', -1, Infinity, true, Number.MAX_VALUE].map(balance => account({ balance }))]) {
    assert.equal(build(value, 'user-test'), null);
  }
  assert.equal(build(summary, undefined), null);
  assert.equal(build(account({ reservedCashCommissionBalance: 101 }), 'user-test'), null);
  for (const value of [{ account: summary.account }, account({ withdrawableBalance: undefined }),
    account({ withdrawableBalance: 110 }), withdrawal({ nonWithdrawableTokens: 101 })]) {
    assert.match(build(value, 'user-test').text, /part retirable est indisponible/);
    assert.doesNotMatch(build(value, 'user-test').text, /Aucun jeton n’est convertible/);
  }
  assert.doesNotMatch(build(withdrawal({ currency: 'unknown' }), 'user-test').text, /unknown|600/);
  assert.match(build(account({ balance: '100.25', withdrawableBalance: '60' }), 'user-test').text, /100,25 jetons/);
  const single = { ...account({ balance: 1, withdrawableBalance: 1 }),
    withdrawal: { ...summary.withdrawal, nonWithdrawableTokens: 0, availableMoney: 10 } };
  assert.match(build(single, 'user-test').text, /1 jeton disponible.*1 jeton est convertible/);
  assert.doesNotMatch(build(withdrawal({ currency: undefined }), 'user-test').text, /undefined|600/);
});

test('wallet hook waits for its balance, preserves a sentence through refresh, and stops outside the visible account screen', () => {
  const hooks = hookHarness(); let active = true, user = { id: 'user-test' };
  const load = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => active },
    '@/store/hooks': { useAppSelector: () => user }, '@/store/selectors': {},
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
  });
  const { useWalletAnnouncement } = load('hooks/wallet/useWalletAnnouncement.ts');
  const registry = load('services/paymentSpeechSource.ts');
  const props = { summary, userId: user.id, visible: true, loading: false, fetching: true, error: false };
  const render = () => { hooks.render(() => useWalletAnnouncement(props)); hooks.render(() => useWalletAnnouncement(props)); };
  const read = () => registry.readPaymentSpeech(user.id, 0);
  render(); assert.equal(read(), undefined, 'wait for the fresh summary, even if cache exists');
  props.fetching = false; render(); assert.equal(read().kind, 'wallet');
  const first = read(); registry.consumePaymentSpeech(first); render(); assert.equal(read(), first);
  props.fetching = true; render(); assert.equal(read(), first, 'refetch does not cut speech');
  props.fetching = false; props.summary = { ...summary }; render(); assert.equal(read(), first);
  props.error = true; render(); assert.equal(read(), undefined, 'stale values are not spoken as current');
  props.error = false; render(); assert.ok(read());
  props.visible = false; render(); assert.equal(read(), undefined, 'closed/modal-covered wallet is silent');
  props.visible = true; render(); active = false; render(); assert.equal(read(), undefined);
  active = true; render(); user = { id: 'other' }; props.userId = user.id; render();
  assert.equal(read(), undefined); assert.equal(registry.readPaymentSpeech('user-test', 0), undefined);
  props.summary = account({ userId: 'other' }); render(); assert.ok(read());
  hooks.unmount(); assert.equal(read(), undefined);
});
