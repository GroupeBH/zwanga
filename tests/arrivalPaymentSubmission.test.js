const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function app(t, mode = 'points') {
  const hooks = hookHarness();
  const calls = { points: 0, electronic: 0, cash: 0, summary: 0, summaries: [], errors: [], failures: [], patches: [], urls: 0 };
  let resolvePoints;
  const gate = new Promise(resolve => { resolvePoints = resolve; });
  const props = {
    isSessionCurrent: () => true,
    arrivalBooking: { id: 'booking', status: 'accepted', pickedUp: true, paymentMode: mode, paymentAmount: 5000 },
    selectedMode: mode, selectedChannel: 'mpesa', paymentAmount: 5000, paymentCurrency: 'CDF',
    isBusy: false, hasPendingProviderPayment: false, paymentAlreadySucceeded: false,
    requiredPoints: 50, missingPoints: 0, isWalletFetching: false, moneyComplement: 0,
    mobileMoneyPhone: '+243891234567', setPaymentError: value => calls.errors.push(value), setStatusMessage() {},
    persistBookingState: (id, patch) => calls.patches.push({ id, patch }),
    reportPaymentFailure: id => calls.failures.push(id),
    settleWithPoints: async () => { calls.points++; await gate; return true; },
    updatePaymentMode: () => { calls.cash++; return { unwrap: async () => props.arrivalBooking }; },
    initiateBookingPayment: () => { calls.electronic++; return { unwrap: async () => ({ booking: props.arrivalBooking, payment: { status: 'pending', orderNumber: 'existing' } }) }; },
    showCompletionSummary: async value => { calls.summary++; calls.summaries.push(value); },
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

test('insufficient tokens require an explicit tap and keep the same complement order without spending tokens early', async t => {
  const env = app(t), topups = [];
  env.props.requiredPoints = 450; env.props.missingPoints = 392; env.props.moneyComplement = 3920;
  env.props.initiateWalletTopUp = input => {
    topups.push(input);
    return { unwrap: async () => ({ payment: { status: 'initiated', orderNumber: 'complement-order' } }) };
  };
  env.render(); assert.equal(topups.length + env.calls.points, 0);
  const pay = env.render().handlePayment;
  await Promise.all([pay(), pay()]);
  assert.deepEqual(topups, [{ intentScope: 'booking:booking', amount: 392, method: 'mobile_money', phone: env.props.mobileMoneyPhone }]);
  assert.equal(env.calls.points, 0);
  assert.deepEqual(JSON.parse(env.calls.patches[0].patch.walletTopUpIntent), { amount: 392, phone: env.props.mobileMoneyPhone });
  assert.deepEqual(env.calls.patches[1], { id: 'booking', patch: { walletTopUpOrderNumber: 'complement-order', walletTopUpIntent: null } });
  env.props.hasPendingProviderPayment = true;
  env.props.selectedMode = 'cash'; env.props.arrivalBooking.status = 'completed';
  await env.render().handlePayment();
  assert.equal(topups.length, 1); assert.equal(env.calls.cash + env.calls.summary + env.calls.points, 0);
});

test('cash mode selection is unavailable before arrival and shows instructions after arrival', async t => {
  const env = app(t, 'cash');
  await env.render().handlePayment();
  assert.equal(env.calls.cash, 0);
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', droppedOff: true };
  await env.render().handlePayment();
  assert.equal(env.calls.cash, 0, 'an existing cash choice must not require a network mutation');
  assert.equal(env.calls.summary, 1);
});

test('the unified cash sheet finishes in one tap without claiming collection or opening another summary', async t => {
  const env = app(t, 'cash'), acknowledgements = [];
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', droppedOff: true };
  env.props.acknowledgeCash = id => acknowledgements.push(id);
  await env.render().handlePayment();
  assert.deepEqual(acknowledgements, ['booking']); assert.equal(env.calls.summary + env.calls.cash + env.calls.points, 0);
  assert.equal(env.props.arrivalBooking.cashReceivedAt, undefined); assert.deepEqual(env.calls.patches, []);
});

test('cash switching closes only when the acknowledged fare matches what was shown', async t => {
  const env = app(t, 'electronic'), acknowledgements = [];
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed' };
  env.props.selectedMode = 'cash'; env.props.acknowledgeCash = id => acknowledgements.push(id);
  env.props.updatePaymentMode = () => ({ unwrap: async () => ({ ...env.props.arrivalBooking, paymentMode: 'cash' }) });
  await env.render().handlePayment(); assert.deepEqual(acknowledgements, ['booking']); assert.equal(env.calls.summary, 0);
  acknowledgements.length = 0;
  env.props.updatePaymentMode = () => ({ unwrap: async () => ({ ...env.props.arrivalBooking, paymentMode: 'cash', paymentAmount: 2000 }) });
  await env.render().handlePayment(); assert.deepEqual(acknowledgements, []);
  assert.equal(env.calls.summaries.at(-1).paymentAmount, 2000);
});

test('the visible busy state lasts for the whole submission, including the gap after the network mutation', async t => {
  const env = app(t), first = env.render().handlePayment();
  assert.equal(env.render().isSubmitting, true); await env.render().handlePayment();
  assert.equal(env.calls.points, 1);
  env.resolvePoints(); await first; assert.equal(env.render().isSubmitting, false);
});

test('cash already received by the driver opens the summary without a forbidden mode update', async t => {
  const env = app(t, 'cash');
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', droppedOff: true,
    cashReceivedAt: '2026-09-23T10:00:00Z', paymentStatus: 'not_required' };
  env.props.updatePaymentMode = () => { env.calls.cash++; return { unwrap: async () => { throw { status: 400,
    data: { message: 'Impossible de changer un paiement déjà confirmé' } }; } }; };
  await env.render().handlePayment();
  assert.equal(env.calls.cash, 0); assert.equal(env.calls.summary, 1);
  assert.equal(env.calls.summaries[0].cashReceivedAt, env.props.arrivalBooking.cashReceivedAt);
  assert.deepEqual(env.calls.errors, ['']);
});

test('switching to cash waits for the backend, submits once and keeps the server group fare', async t => {
  const env = app(t, 'electronic'); let finish;
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', numberOfSeats: 3 };
  env.props.selectedMode = 'cash';
  const updated = { ...env.props.arrivalBooking, paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: 2000 };
  env.props.updatePaymentMode = input => { env.calls.cash++; assert.deepEqual(input, { bookingId: 'booking', paymentMode: 'cash' });
    return { unwrap: () => new Promise(resolve => { finish = resolve; }) }; };
  const action = env.render(); const first = action.handlePayment(); await action.handlePayment();
  assert.equal(env.calls.cash, 1); assert.equal(env.calls.summary, 0);
  finish(updated); await first;
  assert.equal(env.calls.summary, 1); assert.equal(env.calls.summaries[0], updated);
  assert.equal(env.calls.points + env.calls.electronic, 0); assert.equal(env.calls.patches.length, 0);
});

test('pending provider payment and early arrival never allow cash, including an already cash booking', async t => {
  const env = app(t, 'cash');
  await env.render().handlePayment();
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed' };
  env.props.hasPendingProviderPayment = true;
  await env.render().handlePayment();
  assert.equal(env.calls.cash + env.calls.summary, 0); assert.deepEqual(env.calls.patches, []);
});

test('failed cash mode update stays retryable and never presents a fictitious completion', async t => {
  const env = app(t, 'points');
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed' };
  env.props.selectedMode = 'cash';
  env.props.updatePaymentMode = () => { env.calls.cash++; return { unwrap: async () => { throw { status: 503 }; } }; };
  await env.render().handlePayment(); await env.render().handlePayment();
  assert.equal(env.calls.cash, 2); assert.equal(env.calls.summary, 0);
  assert.ok(env.calls.errors.at(-1)); assert.deepEqual(env.calls.failures, []);
});

test('the recovery cash action registers cash directly from the old mode, but never bypasses a pending transaction', async t => {
  const e = app(t, 'electronic');
  e.props.arrivalBooking = { ...e.props.arrivalBooking, status: 'completed', droppedOff: true };
  e.props.updatePaymentMode = payload => { e.calls.cash++; assert.equal(payload.paymentMode, 'cash');
    return { unwrap: async () => ({ ...e.props.arrivalBooking, paymentMode: 'cash' }) }; };
  e.props.hasPendingProviderPayment = true;
  await e.render().payCash(); assert.equal(e.calls.cash, 0);
  e.props.hasPendingProviderPayment = false;
  await e.render().payCash(); assert.equal(e.calls.cash, 1); assert.equal(e.calls.electronic, 0);
  assert.equal(e.calls.summary, 1);
});

test('cash switching rejects inconsistent replies and ignores a late response after logout', async t => {
  const env = app(t, 'points');
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed' };
  env.props.selectedMode = 'cash';
  for (const patch of [{ id: 'other' }, { paymentMode: 'points' }, { paymentAmount: null }]) {
    env.props.updatePaymentMode = () => ({ unwrap: async () => ({ ...env.props.arrivalBooking, paymentMode: 'cash', ...patch }) });
    await env.render().handlePayment();
    assert.equal(env.calls.summary, 0); assert.match(env.calls.errors.at(-1), /pas été confirmé/);
  }
  let finish;
  env.props.updatePaymentMode = () => ({ unwrap: () => new Promise(resolve => { finish = resolve; }) });
  let current = true; env.props.isSessionCurrent = () => current;
  const pending = env.render().handlePayment(); current = false;
  finish({ ...env.props.arrivalBooking, paymentMode: 'cash' }); await pending;
  assert.equal(env.calls.summary, 0);
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
  assert.ok(env.calls.patches[0].patch.walletTopUpIntent);
  assert.deepEqual(env.calls.patches[1], { id: 'booking', patch: { walletTopUpIntent: null } });
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

for (const fallback of ['cash', 'tokens_cash']) test(`failed Mobile Money complement can switch to ${fallback} without another recharge`, async t => {
  const env = app(t), topups = [], stored = {};
  let mixed = 0;
  env.props.arrivalBooking = { ...env.props.arrivalBooking, status: 'completed', droppedOff: true };
  env.props.missingPoints = 392; env.props.moneyComplement = 3920;
  env.props.persistBookingState = (_id, patch) => { Object.assign(stored, patch); };
  env.props.initiateWalletTopUp = payload => {
    topups.push(payload); return { unwrap: async () => ({ payment: { status: 'failed', orderNumber: 'declined' } }) };
  };
  await env.render().handlePayment();
  assert.equal(stored.walletTopUpIntent, null);
  assert.equal(stored.walletTopUpOrderNumber, undefined);
  assert.deepEqual(env.calls.failures, ['booking']);
  if (fallback === 'cash') {
    env.props.selectedMode = 'cash';
    env.props.updatePaymentMode = payload => {
      env.calls.cash++; assert.deepEqual(payload, { bookingId: 'booking', paymentMode: 'cash' });
      return { unwrap: async () => ({ ...env.props.arrivalBooking, paymentMode: 'cash', paymentStatus: 'not_required' }) };
    };
  } else env.props.payTokensCash = async () => { mixed++; };
  await env.render().handlePayment();
  assert.equal(topups.length, 1);
  assert.equal(env.calls.points + env.calls.electronic, 0);
  assert.equal(env.calls.cash, fallback === 'cash' ? 1 : 0);
  assert.equal(mixed, fallback === 'tokens_cash' ? 1 : 0);
  assert.equal(env.props.arrivalBooking.cashReceivedAt, undefined, 'cash collection still needs the driver confirmation');
});

test('lost complement response blocks other modes and retries the original amount after a wallet change', async t => {
  const e = app(t), sent = [];
  e.props.missingPoints = 392;
  e.props.initiateWalletTopUp = input => { sent.push(input); return { unwrap: async () => { throw { status: 'FETCH_ERROR' }; } }; };
  await e.render().handlePayment();
  e.props.pendingTopUp = e.calls.patches[0].patch.walletTopUpIntent;
  e.props.hasPendingProviderPayment = true;
  e.props.selectedMode = 'cash'; e.props.arrivalBooking.status = 'completed';
  e.props.missingPoints = 10;
  await e.render().handlePayment(); assert.equal(e.calls.cash, 0); assert.equal(sent.length, 1);
  e.render().retryTopUp(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 2); assert.deepEqual(sent[1], sent[0]); assert.equal(sent[1].amount, 392);
});

test('failed durable recording prevents any complement initiation', async t => {
  const e = app(t); let sent = 0;
  e.props.missingPoints = 392;
  e.props.persistBookingState = async () => false;
  e.props.initiateWalletTopUp = () => { sent++; throw Error('must not send'); };
  await e.render().handlePayment(); assert.equal(sent, 0);
});
