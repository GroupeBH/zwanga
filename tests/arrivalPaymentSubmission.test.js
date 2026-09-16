const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function app(t, mode = 'points') {
  const hooks = hookHarness();
  const calls = { points: 0, electronic: 0, cash: 0, summary: 0 };
  let resolvePoints;
  const gate = new Promise(resolve => { resolvePoints = resolve; });
  const props = {
    arrivalBooking: { id: 'booking', status: 'accepted', pickedUp: true, paymentMode: mode, paymentAmount: 5000 },
    selectedMode: mode, selectedChannel: 'mpesa', paymentAmount: 5000, paymentCurrency: 'CDF',
    isBusy: false, hasPendingProviderPayment: false, paymentAlreadySucceeded: false,
    requiredPoints: 50, missingPoints: 0, isWalletFetching: false, moneyComplement: 0,
    mobileMoneyPhone: '+243891234567', setPaymentError() {}, setStatusMessage() {}, persistBookingState() {},
    settleWithPoints: async () => { calls.points++; await gate; return true; },
    updatePaymentMode: () => { calls.cash++; return { unwrap: async () => props.arrivalBooking }; },
    initiateBookingPayment: () => { calls.electronic++; return { unwrap: async () => ({ booking: props.arrivalBooking, payment: { status: 'pending', orderNumber: 'existing' } }) }; },
    showCompletionSummary: async () => { calls.summary++; },
    handleCompletedBookingPayment: async () => false,
  };
  const { useArrivalPaymentSubmission } = loader({
    react: hooks.react,
    'expo-linking': { createURL: () => 'zwanga://booking/payment' },
    '@/constants/paymentFeatures': { ELECTRONIC_PAYMENTS_ENABLED: true },
    '@/utils/safeExternalUrl': { openExternalUrlSafely: async () => {} },
  })('hooks/arrival-payment/useArrivalPaymentSubmission.ts');
  const render = () => hooks.render(() => useArrivalPaymentSubmission(props));
  t.after(() => hooks.unmount());
  return { props, render, calls, resolvePoints };
}

test('opening the form never charges tokens; double taps submit once while waiting', async t => {
  const env = app(t);
  const action = env.render();
  assert.equal(env.calls.points, 0);
  const first = action.handlePayment();
  const second = action.handlePayment();
  assert.equal(env.calls.points, 1);
  env.resolvePoints();
  await Promise.all([first, second]);
  assert.equal(env.props.arrivalBooking.status, 'accepted');
  assert.equal(env.props.arrivalBooking.paymentAmount, 5000);
});

test('cash cannot be confirmed early, but the original cash confirmation works after arrival', async t => {
  const env = app(t, 'cash');
  await env.render().handlePayment();
  assert.equal(env.calls.cash, 0);
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', droppedOff: true };
  await env.render().handlePayment();
  assert.equal(env.calls.cash, 1);
  assert.equal(env.calls.summary, 1);
});

test('electronic payment requires a tap and never restarts an in-progress provider transaction', async t => {
  const env = app(t, 'electronic');
  const action = env.render();
  assert.equal(env.calls.electronic, 0);
  await Promise.all([action.handlePayment(), action.handlePayment()]);
  assert.equal(env.calls.electronic, 1);
  env.props.hasPendingProviderPayment = true;
  await env.render().handlePayment();
  assert.equal(env.calls.electronic, 1);
});

test('an already settled booking shows its summary without another debit', async t => {
  const env = app(t);
  env.props.paymentAlreadySucceeded = true;
  await env.render().handlePayment();
  assert.equal(env.calls.points, 0);
  assert.equal(env.calls.summary, 1);
});
