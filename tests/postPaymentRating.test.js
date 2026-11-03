const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const mocks = { 'expo-linking': { createURL: () => 'zwanga://payment' } };
const load = loader(mocks);
const { buildPaymentCompletionSummary: summary } = load('features/arrival-payment/buildPaymentCompletionSummary.ts');
const { selectArrivedPaymentBooking: select } = load('features/arrival-payment/paymentModel.ts');
const { resolvePaymentReceipt: receipt } = load('features/arrival-payment/resolvePaymentReceipt.ts');
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'completed',
  paymentMode: 'points', paymentStatus: 'succeeded', paymentAmount: 3500, paymentCurrency: 'CDF' };
const build = patch => summary({ ...booking, ...patch }, undefined, [], {});

for (const mode of ['points', 'electronic', 'cash']) {
  test(`${mode}: confirmed completed booking offers the correct driver rating, never before arrival`, () => {
    const patch = mode === 'cash' ? { paymentStatus: 'not_required', cashReceivedAt: '2026-11-03T11:00:00Z' } : {};
    assert.equal(build({ paymentMode: mode, ...patch }).ratingTripId, 'trip');
    assert.equal(build({ paymentMode: mode, ...patch, status: 'accepted' }).ratingTripId, undefined);
    assert.equal(build({ paymentMode: mode, ...patch, status: 'cancelled' }).ratingTripId, undefined);
  });
}
test('pending/failed payments, top-up and unconfirmed cash never offer a paid rating action', () => {
  for (const status of ['pending', 'failed', 'cancelled', 'not_required']) {
    assert.equal(build({ paymentStatus: status }).ratingTripId, undefined);
  }
  for (const patch of [{}, { mixedPaymentAt: 'date', mixedTokenAmount: 650 }, { tokenCashFallbackAt: 'date' }]) {
    const value = build({ ...patch, paymentMode: 'cash', paymentStatus: 'not_required' });
    assert.equal(value.cashInstructions, true); assert.equal(value.ratingTripId, undefined);
  }
  assert.equal(build({ paymentAmount: 0, paymentMode: null, paymentStatus: 'not_required' }).ratingTripId, 'trip');
});
test('mixed cash receipt upgrades once the driver confirms collection; stale or unrelated lists cannot undo success', () => {
  const partial = { ...booking, paymentMode: 'cash', paymentStatus: 'not_required', mixedPaymentAt: 'date', mixedTokenAmount: 650 };
  const initial = summary(partial, undefined, [], {});
  const received = receipt(initial, { ...partial, cashReceivedAt: '2026-11-03T11:00:00Z' }, true, undefined, []);
  assert.equal(received.ratingTripId, 'trip'); assert.equal(received.cashInstructions, false);
  assert.equal(receipt(received, partial, false, undefined, []), received);
  assert.equal(receipt(received, { ...partial, id: 'other' }, false, undefined, []), received);
  const early = build({ status: 'accepted' });
  assert.equal(receipt(early, booking, true, undefined, []).ratingTripId, 'trip');
});
test('cash confirmed after closing instructions presents one actual receipt, even with clock skew', () => {
  const now = Date.parse('2026-11-03T11:00:00Z');
  const cash = { ...booking, paymentMode: 'cash', paymentStatus: 'not_required', updatedAt: new Date(now).toISOString() };
  const stored = { booking: { acknowledgedAt: new Date(now).toISOString() } };
  assert.equal(select([cash], stored, now), null);
  const paid = { ...cash, cashReceivedAt: new Date(now + 2000).toISOString() };
  assert.equal(select([paid], stored, now)?.id, 'booking');
  stored.booking.acknowledgedCashReceivedAt = paid.cashReceivedAt;
  assert.equal(select([paid], stored, now), null, 'server clock ahead must not repeatedly reopen the receipt');
});

function navigation(receiptValue = build({})) {
  const hooks = hookHarness(), events = []; let current = true;
  const { useArrivalPaymentNavigation } = loader({ ...mocks, react: hooks.react })('hooks/arrival-payment/useArrivalPaymentNavigation.ts');
  const params = { completionSummary: receiptValue, acknowledgeBooking: (...args) => events.push(['ack', ...args]),
    isSessionCurrent: () => current, setCompletionSummary: value => { events.push(['receipt', value]); params.completionSummary = value; },
    setIsClosingForNavigation: value => events.push(['closing', value]), router: { push: route => events.push(['route', route]) } };
  return { hooks, params, events, invalidate: () => { current = false; }, render: () => hooks.render(() => useArrivalPaymentNavigation(params)) };
}
test('rating waits for modal removal, keeps the paid trip identity and ignores double taps', () => {
  const f = navigation(); const api = f.render();
  api.handleRateDriver(); api.handleRateDriver(); api.handleOpenInvoice(); api.handleDismissSummary();
  assert.equal(f.events.filter(e => e[0] === 'ack').length, 1);
  assert.equal(f.events.some(e => e[0] === 'route'), false);
  f.params.arrivalBooking = { id: 'other', tripId: 'other-trip' };
  const closed = f.render(); closed.handleModalDismiss(); closed.handleModalDismiss();
  assert.deepEqual(f.events.filter(e => e[0] === 'route'), [['route', { pathname: '/rate/[id]', params: { id: 'trip' } }]]);
  f.hooks.unmount();
});
test('session end cancels rating navigation; dismissing a receipt never forces rating', () => {
  const f = navigation(); f.render().handleRateDriver(); f.invalidate(); f.render().handleModalDismiss();
  assert.equal(f.events.some(e => e[0] === 'route'), false); f.hooks.unmount();
  const g = navigation(); g.render().handleDismissSummary(); g.render().handleModalDismiss();
  assert.equal(g.events.some(e => e[0] === 'route'), false); g.hooks.unmount();
});
test('early receipt uses pre-arrival acknowledgement; invoice transition remains available', () => {
  const f = navigation(build({ status: 'accepted' })); f.render().handleRateDriver(); assert.equal(f.events.length, 0);
  f.render().handleDismissSummary(); assert.deepEqual(f.events[0], ['ack', 'booking', true, undefined]);
  f.hooks.unmount();
  const g = navigation({ ...build({}), paymentHistoryId: 'invoice' });
  g.render().handleOpenInvoice(); assert.equal(g.events.some(e => e[0] === 'route'), false);
  g.render().handleModalDismiss();
  assert.deepEqual(g.events.find(e => e[0] === 'route')[1], { pathname: '/payment-history', params: { paymentId: 'invoice' } });
  g.hooks.unmount();
});

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
test('paid footer offers rating, optional dismissal and invoice without initiating another payment', () => {
  const { ArrivalPaymentActions } = loader({ react: React, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      Keyboard: { dismiss() {} }, StyleSheet: { create: x => x, hairlineWidth: 1 } },
  })('features/arrival-payment/ArrivalPaymentActions.tsx');
  let rated = 0, closed = 0;
  const props = { completionSummary: { ...build({}), invoiceUrl: '/payment-history' },
    onRateDriver: () => rated++, onDone: () => closed++, onPay: () => assert.fail('already paid') };
  const tree = ArrivalPaymentActions(props);
  const buttons = all(tree).filter(n => n.type === 'Button');
  assert.deepEqual(buttons.map(words), ['Noter le conducteur', 'Pas maintenant', 'Voir la facture']);
  buttons[0].props.onPress(); buttons[1].props.onPress(); assert.equal(rated, 1); assert.equal(closed, 1);
  props.completionSummary = build({ status: 'accepted' });
  assert.doesNotMatch(words(ArrivalPaymentActions(props)), /Noter le conducteur/);
});
