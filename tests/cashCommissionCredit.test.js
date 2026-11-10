const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { estimateCashCommission } = loader()('utils/cashCommission.ts');
const finance = () => ({ commissionRate: 0.05, cashCommissionRate: 0.05,
  cash: { enabled: true, availableTokens: 0, availableCreditTokens: 25, debtLimitTokens: 25,
    debtTokens: 0, moneyPerToken: 100, blocked: false } });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const words = tree => nodes(tree).filter(n => n.type === 'Text').flatMap(n => n.props.children).join(' ');

test('5% of all seats fits exactly 25 tokens / 2500 FC; higher amounts are blocked', () => {
  assert.deepEqual(estimateCashCommission(finance(), 10000, 5), { required: 25, debt: 25, debtAmount: 2500, totalDebt: 25, remainingCredit: 25, allowed: true });
  assert.equal(estimateCashCommission(finance(), 10000, 6).allowed, false);
  assert.equal(estimateCashCommission(finance(), 50020).allowed, false);
  const state = finance(); state.cash.availableTokens = 15;
  assert.deepEqual(estimateCashCommission(state, 10000, 5), { required: 25, debt: 10, debtAmount: 1000, totalDebt: 10, remainingCredit: 25, allowed: true });
});
test('existing debt consumes the allowance; blocked wallets, invalid inputs and old backends do not authorize credit', () => {
  const state = finance(); state.cash.debtTokens = 0.01;
  assert.equal(estimateCashCommission(state, 1000).allowed, true);
  state.cash.debtTokens = 25.01;
  assert.equal(estimateCashCommission(state, 1000).allowed, false);
  state.cash.debtTokens = 0; state.cash.blocked = true;
  assert.equal(estimateCashCommission(state, 1000).allowed, false);
  state.cash.blocked = false; delete state.cash.availableCreditTokens;
  assert.equal(estimateCashCommission(state, 1000).allowed, false);
  assert.equal(estimateCashCommission(undefined, 1000), null);
  for (const price of [NaN, Infinity, -1]) assert.equal(estimateCashCommission(finance(), price), null);
  for (const seats of [0, 1.5, NaN]) assert.equal(estimateCashCommission(finance(), 1000, seats), null);
});
test('publication accounts for per-passenger rounding without understating commission', () => {
  assert.equal(estimateCashCommission(finance(), 1010, 5).required, 2.55);
});
test('six-trip advance keeps the 5% fee and debt, then requires full funding without renewal', () => {
  const state = finance(); state.cash.moneyPerToken = 10;
  state.cash.debtTokens = 30; state.cash.availableCreditTokens = 0; state.cash.debtLimitTokens = 0;
  state.cash.creditAllowance = { eligible: true, remainingTrips: 1, tripLimit: 6, completedTrips: 5, reservedTrips: 0, oneTime: true };
  const preview = estimateCashCommission(state, 10000);
  assert.equal(preview.allowed, true); assert.equal(preview.required, 50);
  assert.equal(preview.debt, 50); assert.equal(preview.totalDebt, 80);
  state.cash.blocked = true; assert.equal(estimateCashCommission(state, 10000).allowed, false);
  state.cash.blocked = false; state.cash.creditAllowance.remainingTrips = 0;
  assert.equal(estimateCashCommission(state, 10000).allowed, false);
  state.cash.availableTokens = 100;
  assert.equal(estimateCashCommission(state, 10000).allowed, false, 'settle outstanding debt first');
  state.cash.debtTokens = 0;
  assert.equal(estimateCashCommission(state, 10000).allowed, true);
  state.cash.availableTokens = 49;
  assert.equal(estimateCashCommission(state, 10000).allowed, false);
});

test('missing or invalid entitlement never grants a six-trip advance', () => {
  const state = finance(); state.cash.availableCreditTokens = 0; state.cash.debtLimitTokens = 0;
  assert.equal(estimateCashCommission(state, 10000).allowed, false);
  state.cash.creditAllowance = { eligible: false, remainingTrips: 6, tripLimit: 6, oneTime: true };
  assert.equal(estimateCashCommission(state, 10000).allowed, false);
  state.cash.creditAllowance.eligible = true; state.cash.creditAllowance.oneTime = false;
  assert.equal(estimateCashCommission(state, 10000).allowed, false);
});

test('cash acceptance notice shows forecast, current due and hides stale balances offline', () => {
  const hooks = hookHarness(); const data = finance(); let online = true;
  const props = { amount: 20000 };
  const response = { currentData: data, isError: false };
  const Component = loader({ react: { ...React, ...hooks.react },
    'react-native': { Text: 'Text', StyleSheet: { create: x => x } }, '@/store/hooks': { useAppSelector: () => ({ id: 'driver' }) }, '@/store/selectors': {},
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => online, displayReadOptions: enabled => ({ skip: !enabled }) },
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => response },
  })('features/driver-payments/CashCommissionNotice.tsx').CashCommissionNotice;
  const render = () => words(hooks.render(() => Component(props)));
  assert.match(render(), /5 % : 10 jetons/); assert.match(render(), /Dette totale estimée/);
  data.cash.debtTokens = 7; props.confirmed = true;
  assert.match(render(), /Reste dû : 700 FC/); assert.match(render(), /courses confirmées/); assert.doesNotMatch(render(), /Aucun nouveau cash/);
  online = false; assert.doesNotMatch(render(), /7 jetons/); assert.match(render(), /vérification/);
  online = true; response.isError = true; assert.doesNotMatch(render(), /7 jetons/);
  response.isError = false; props.confirmed = false; data.cash.debtTokens = 0;
  data.cash.creditAllowance = { eligible: true, remainingTrips: 2, tripLimit: 6, completedTrips: 4, reservedTrips: 0, oneTime: true };
  assert.match(render(), /Commission cash de 5 %/);
  assert.match(render(), /2 trajet/);
  assert.match(render(), /Commission due, pas offerte/); assert.match(render(), /4\/6/);
  online = false; assert.doesNotMatch(render(), /offerte/);
  hooks.unmount();
});
