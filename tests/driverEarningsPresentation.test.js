const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } };
const load = loader({ react: React, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } });
const { CashRevenueSummary } = load('features/driver-earnings/CashRevenueSummary.tsx');
const { DriverEarningRow } = load('features/driver-earnings/DriverEarningRow.tsx');
const { PayoutHistory } = load('features/driver-earnings/PayoutHistory.tsx');
const { formatAmount } = load('features/driver-earnings/payoutModel.ts');
const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements)
  : [node, ...elements(node.props?.children)];
const textContent = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(textContent).join('')
  : typeof node === 'object' ? textContent(node.props?.children) : String(node);

test('cash is explicitly non-withdrawable, confirmed and separate from credits, without an action', () => {
  const tree = CashRevenueSummary({ amount: 12000, currency: 'CDF' });
  const text = textContent(tree);
  assert.match(text, /Cash reçu des passagers/);
  assert.match(text, /Non retirable/);
  assert.match(text, /réceptions confirmées/);
  assert.match(text, /Exclu du solde retirable/);
  assert.ok(text.includes(formatAmount(12000, 'CDF')));
  assert.equal(elements(tree).filter(node => node.type === 'Button').length, 0);
});

test('missing or invalid cash totals never pretend to be zero; a genuine zero is shown', () => {
  for (const amount of [undefined, null, NaN, Infinity, -1]) {
    const tree = CashRevenueSummary({ amount, currency: 'CDF' });
    assert.equal(elements(tree).find(node => node.props?.testID === 'driver-cash-received').props.children, '—');
    assert.match(textContent(tree), /total cash est indisponible/);
  }
  const tree = CashRevenueSummary({ amount: 0, currency: 'CDF' });
  assert.equal(elements(tree).find(node => node.props?.testID === 'driver-cash-received').props.children, '0 CDF');
});

const earning = { id: 'earning-A', paymentMode: 'cash', status: 'available', grossAmount: 3000,
  netAmount: 3000, currency: 'CDF', createdAt: '2026-09-29T10:00:00Z' };

test('cash-mode ledger entry is presented as a Zwanga-funded credit, never passenger cash', () => {
  const text = textContent(DriverEarningRow({ earning }));
  assert.match(text, /Participation Zwanga/);
  assert.match(text, /Financée par Zwanga, hors espèces reçues/);
  assert.match(text, /Crédit net : \+/);
  assert.doesNotMatch(text, /Non retirable/);
});

test('electronic and token credits retain their labels; cancelled credits have no positive-gain marker', () => {
  for (const [paymentMode, label] of [['electronic', 'Paiement électronique'], ['points', 'Paiement en jetons']]) {
    assert.ok(textContent(DriverEarningRow({ earning: { ...earning, paymentMode } })).includes(label));
  }
  const text = textContent(DriverEarningRow({ earning: { ...earning, status: 'cancelled' } }));
  assert.match(text, /Annulé · Non crédité/);
  assert.doesNotMatch(text, /Crédit net|\+/);
});

test('only succeeded payouts are labelled withdrawn; pending and failed states stay distinct', () => {
  for (const [status, label] of [['succeeded', 'Retiré'], ['initiated', 'Retrait en cours'], ['failed', 'Échec — montant disponible']]) {
    const tree = PayoutHistory({ payouts: [{ id: 'payout-A', status, amount: 3000, currency: 'CDF',
      phone: '0891234567', createdAt: earning.createdAt }], availableBalance: 9500, busy: false, canRetry: true });
    assert.ok(textContent(tree).includes(label));
    if (status === 'succeeded') assert.doesNotMatch(textContent(tree), /Réessayer/);
  }
});
