const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const words = tree => nodes(tree).filter(n => n.type === 'Text').flatMap(n => n.props.children).filter(v => typeof v === 'string' || typeof v === 'number').join(' ');
function fixture() {
  const hooks = hookHarness(), paths = [], queries = [];
  const io = { active: true, recharges: 0, refreshes: 0 };
  const data = { commissionRate: 0.05, proPrice: 5000, currency: 'CDF', durationDays: 30,
    pro: { isActive: false, endDate: null }, trial: { startDate: '2026-08-01', endDate: '2026-08-31' },
    cash: { enabled: false, availableTokens: 0, reservedTokens: 0, coverageAmount: 0, debtTokens: 0 } };
  const response = { currentData: data, isFetching: false, error: null, refetch: () => { io.refreshes++; } };
  const props = { userId: 'synthetic-driver', onRecharge: () => { io.recharges++; } };
  const Component = loader({ react: { ...React, ...hooks.react },
    'react-native': { Text: 'Text', View: 'View', TouchableOpacity: 'Button', StyleSheet: { create: x => x, hairlineWidth: 1 } },
    'expo-router': { useRouter: () => ({ push: path => paths.push(path) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => io.active },
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: (...args) => { queries.push(args); return response; } },
  })('features/driver-payments/DriverCommissionPanel.tsx').DriverCommissionPanel;
  return { io, data, props, response, paths, queries, render: () => hooks.render(() => Component(props)) };
}

test('cash reserve shows the essentials only and keeps recharge directly accessible', () => {
  const f = fixture(), tree = f.render(), copy = words(tree);
  assert.match(copy, /Réserve cash/); assert.match(copy, /0\s+jetons/);
  assert.match(copy, /Nouvelles courses cash indisponibles/);
  assert.doesNotMatch(copy, /Pro|bonus|Couvre environ|Aucun jeton réservé/);
  const recharge = nodes(tree).find(n => n.props.accessibilityLabel === 'Recharger les jetons pour la réserve cash');
  assert.ok(recharge.props.style.minHeight >= 44); recharge.props.onPress(); assert.equal(f.io.recharges, 1);
});

test('details reveal server terms and collapse without affecting the balance', () => {
  const f = fixture();
  const toggle = () => nodes(f.render()).find(n => n.props.accessibilityLabel === 'Détails de la réserve cash');
  assert.equal(toggle().props.accessibilityState.expanded, false);
  toggle().props.onPress(); const copy = words(f.render());
  assert.match(copy, /5\s+%/); assert.match(copy, /Seuls les jetons achetés/);
  assert.match(copy, /courses déjà confirmées/); assert.match(copy, /CDF/); assert.match(copy, /30\s+jours/);
  assert.match(copy, /Pro inactif/);
  assert.equal(toggle().props.accessibilityState.expanded, true); toggle().props.onPress();
  assert.doesNotMatch(words(f.render()), /Pro/); assert.equal(f.data.cash.availableTokens, 0);
});

test('reserved funds and debt stay visible even when details are collapsed', () => {
  const f = fixture(); f.data.cash.reservedTokens = 3; f.data.cash.debtTokens = 2;
  const copy = words(f.render()); assert.match(copy, /3\s+jetons réservés/);
  assert.match(copy, /À régulariser :\s+2/); assert.match(copy, /prochaine recharge/);
  assert.doesNotMatch(copy, /Pro/);
});

test('network failure does not expose stale amounts or claim cash is available', () => {
  const f = fixture(); f.data.cash.enabled = true; f.data.cash.availableTokens = 99;
  f.response.error = { status: 'FETCH_ERROR' };
  let tree = f.render(); assert.doesNotMatch(words(tree), /99|Paiements cash disponibles/);
  assert.match(words(tree), /Réserve indisponible/);
  const retry = nodes(tree).find(n => n.type === 'Button' && words(n).includes('Réessayer'));
  retry.props.onPress(); assert.equal(f.io.refreshes, 1);
  f.response.isFetching = true; tree = f.render();
  assert.equal(nodes(tree).find(n => n.props.accessibilityState?.busy).props.disabled, true);
});

test('Pro dates are readable, including a missing end date, and queries still pause offscreen', () => {
  const f = fixture(); f.data.pro = { isActive: true, endDate: null };
  nodes(f.render()).find(n => n.props.accessibilityLabel === 'Détails de la réserve cash').props.onPress();
  assert.match(words(f.render()), /Pro actif/); assert.doesNotMatch(words(f.render()), /Invalid Date|1970/);
  f.data.pro.endDate = '2026-12-01T12:00:00Z'; assert.match(words(f.render()), /Pro actif jusqu’au/);
  f.io.active = false; f.render(); assert.equal(f.queries.at(-1)[1].skip, true);
  f.props.onRecharge = undefined;
  nodes(f.render()).find(n => n.props.accessibilityLabel === 'Recharger les jetons pour la réserve cash').props.onPress();
  assert.deepEqual(f.paths, ['/wallet']);
});
