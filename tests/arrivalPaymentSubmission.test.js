const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function app(t, mode = 'points') {
  const hooks = hookHarness();
  const calls = { points: 0, electronic: 0, cash: 0, summary: 0, failures: [], patches: [], urls: 0 };
  let resolvePoints;
  const gate = new Promise(resolve => { resolvePoints = resolve; });
  const props = {
    isSessionCurrent: () => true,
    arrivalBooking: { id: 'booking', status: 'accepted', pickedUp: true, paymentMode: mode, paymentAmount: 5000 },
    selectedMode: mode, selectedChannel: 'mpesa', paymentAmount: 5000, paymentCurrency: 'CDF',
    isBusy: false, hasPendingProviderPayment: false, paymentAlreadySucceeded: false,
    requiredPoints: 50, missingPoints: 0, isWalletFetching: false, moneyComplement: 0,
    mobileMoneyPhone: '+243891234567', setPaymentError() {}, setStatusMessage() {},
    persistBookingState: (id, patch) => calls.patches.push({ id, patch }),
    reportPaymentFailure: id => calls.failures.push(id),
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
    '@/utils/safeExternalUrl': { openExternalUrlSafely: async () => { calls.urls++; } },
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

test('cash mode selection is unavailable before arrival and shows instructions after arrival', async t => {
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

for (const mode of ['electronic', 'points']) test(`confirmed emergency dropoff stays payable with ${mode} at the reduced server fare`, async t => {
  const env = app(t, mode);
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', droppedOff: true,
    interruptionFareLocked: true, paymentAmount: 1500, plannedDistanceMeters: 25000, travelledDistanceMeters: 5000 };
  env.props.paymentAmount = 1500;
  env.props.requiredPoints = 15;
  const action = env.render();
  assert.equal(env.calls.points + env.calls.electronic, 0);
  const paying = action.handlePayment();
  env.resolvePoints();
  await paying;
  assert.equal(env.calls[mode], 1);
  assert.equal(env.calls.cash, 0, 'the payment mode does not silently become cash');
  assert.equal(env.props.arrivalBooking.paymentAmount, 1500, 'no full-fare recalculation in the app');
});

for (const status of ['failed', 'cancelled']) test(`${status} top-up immediately allows mode recovery without storing an order or opening its URL`, async t => {
  const env = app(t);
  env.props.missingPoints = 20;
  env.props.initiateWalletTopUp = () => ({ unwrap: async () => ({ payment: {
    status, orderNumber: 'failed-order', paymentUrl: 'https://example.com/payment',
  } }) });
  await env.render().handlePayment();
  assert.deepEqual(env.calls.failures, ['booking']);
  assert.deepEqual(env.calls.patches, []);
  assert.equal(env.calls.points + env.calls.urls, 0);
});

for (const status of ['failed', 'cancelled']) test(`${status} electronic initiation goes directly to completion failure handling`, async t => {
  const env = app(t, 'electronic'); let received;
  const response = { booking: env.props.arrivalBooking, payment: {
    status, orderNumber: 'failed-order', paymentUrl: 'https://example.com/payment',
  } };
  env.props.initiateBookingPayment = () => ({ unwrap: async () => response });
  env.props.handleCompletedBookingPayment = async value => { received = value; return true; };
  await env.render().handlePayment();
  assert.equal(received, response);
  assert.deepEqual(env.calls.patches, []);
  assert.equal(env.calls.urls, 0);
});

test('a submission transport error is not reported as confirmed payment failure', async t => {
  const env = app(t);
  env.props.missingPoints = 20;
  env.props.initiateWalletTopUp = () => ({ unwrap: async () => { throw { status: 502 }; } });
  await env.render().handlePayment();
  assert.deepEqual(env.calls.failures, []);
});
