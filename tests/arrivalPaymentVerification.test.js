const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };

function environment(kind = 'wallet') {
  const hooks = hookHarness();
  const env = { checks: [], aborted: 0, settlements: 0, summaries: 0, errors: [], patches: [], failures: [],
    response: async () => ({ payment: { status: 'pending' } }) };
  const read = (order) => { env.checks.push(order); return { unwrap: () => env.response(), abort: () => { env.aborted++; } }; };
  const state = env.state = { isAuthenticated: true, isAppActive: true, isResumeReady: true, isPaymentDeferred: false,
    arrivalBooking: { id: 'booking', paymentStatus: 'pending', paymentMode: kind === 'wallet' ? 'points' : 'electronic' },
    activeStoredState: { requiredActionAt: 'known', [kind === 'wallet' ? 'walletTopUpOrderNumber' : 'bookingPaymentOrderNumber']: 'existing-order' },
    activeBookingIdRef: { current: 'booking' }, user: {},
    setSelectedChannel() {}, setPaymentPhone() {}, setStatusMessage() {}, setPaymentError: error => env.errors.push(error),
    reportPaymentFailure: bookingId => env.failures.push(bookingId),
    persistBookingState: (_id, patch) => { env.patches.push(patch); state.activeStoredState = { ...state.activeStoredState, ...patch }; },
    setIsCheckingPayment: value => { env.busy = value; }, checkWalletTopUpStatus: read, checkBookingPaymentStatus: read,
  };
  const provider = { settleWithPoints: async () => { env.settlements++; return true; } };
  const completion = { showCompletionSummary: async () => { env.summaries++; },
    handleCompletedBookingPayment: async response => {
      if (!['succeeded', 'failed', 'cancelled'].includes(response.payment.status)) return false;
      state.persistBookingState('booking', { bookingPaymentOrderNumber: null });
      env.summaries++; return true;
    } };
  const { useArrivalPaymentMonitoring } = loader({ react: hooks.react,
    'expo-linking': { createURL: () => 'zwanga://booking/payment' },
  })('hooks/arrival-payment/useArrivalPaymentMonitoring.ts');
  return Object.assign(env, { hooks, provider, render: () => hooks.render(() => useArrivalPaymentMonitoring({ state, provider, completion })) });
}

test('502 pauses checks, releases busy state and retains payment references despite rerenders and foregrounding', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  for (const kind of ['wallet', 'booking']) {
    const env = environment(kind); env.response = async () => { throw { status: 502, data: { message: 'ECONNRESET' } }; };
    env.render(); await flush();
    assert.equal(env.render().verification.phase, 'paused'); assert.equal(env.busy, false);
    assert.match(env.render().verification.message, /Ne payez pas une seconde fois/);
    assert.doesNotMatch(env.render().verification.message, /ECONNRESET|502/);
    for (let i = 0; i < 100; i++) env.render();
    env.state.isAppActive = false; env.render(); env.state.isAppActive = true; env.render();
    t.mock.timers.tick(600000); await flush();
    assert.deepEqual(env.checks, ['existing-order']); assert.deepEqual(env.patches, []);
    assert.equal(env.settlements, 0); env.hooks.unmount();
  }
});

test('retry checks the SAME reference only once on double tap; confirmed top-up settles once and then stops', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const env = environment(); env.response = async () => { throw Error('unavailable'); };
  env.render(); await flush(); const request = deferred(); env.response = () => request.promise;
  const action = env.render().retryVerification; action(); action();
  assert.deepEqual(env.checks, ['existing-order', 'existing-order']); assert.equal(env.busy, true);
  request.resolve({ payment: { status: 'succeeded' } }); await flush();
  assert.equal(env.settlements, 1); assert.equal(env.busy, false);
  assert.equal(env.state.activeStoredState.walletTopUpOrderNumber, null);
  env.render(); t.mock.timers.tick(600000); await flush();
  assert.equal(env.checks.length, 2); assert.equal(env.settlements, 1); env.hooks.unmount();
});

test('a stalled status read times out after 25 seconds; a late success cannot debit or reopen anything', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const env = environment(), request = deferred(); env.response = () => request.promise;
  env.render(); t.mock.timers.tick(24999); await flush(); assert.equal(env.busy, true);
  t.mock.timers.tick(1); await flush();
  assert.equal(env.busy, false); assert.equal(env.aborted, 1); assert.equal(env.render().verification.phase, 'paused');
  request.resolve({ payment: { status: 'succeeded' } }); await flush();
  assert.equal(env.settlements, 0); assert.deepEqual(env.patches, []); env.hooks.unmount();
});

test('pending reads are spaced from response completion and stop after two minutes, not forever', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const env = environment(); env.render(); await flush();
  assert.equal(env.render().verification.phase, 'waiting'); assert.equal(env.busy, false);
  for (let i = 0; i < 10; i++) { t.mock.timers.tick(12000); await flush(); env.render(); }
  assert.equal(env.render().verification.phase, 'paused'); assert.equal(env.checks.length, 10);
  t.mock.timers.tick(600000); await flush(); assert.equal(env.checks.length, 10);
  assert.deepEqual(env.patches, []); env.hooks.unmount();
});

test('closing cancels status reads, keeps the reference, suppresses late results and supports explicit resume', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const env = environment(), request = deferred(); env.response = () => request.promise;
  env.render(); env.state.isPaymentDeferred = true; env.render(); await flush();
  assert.equal(env.aborted, 1); assert.equal(env.busy, false);
  request.resolve({ payment: { status: 'succeeded' } }); await flush();
  assert.equal(env.settlements, 0); assert.deepEqual(env.patches, []);
  t.mock.timers.tick(600000); await flush(); assert.equal(env.checks.length, 1);
  env.state.isPaymentDeferred = false; env.render(); await flush();
  assert.equal(env.checks.length, 2); assert.equal(env.settlements, 1); env.hooks.unmount();
});

test('a confirmed server payment exits a paused state without another provider check or debit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const env = environment(); env.response = async () => { throw Error('unavailable'); };
  env.render(); await flush(); assert.equal(env.render().verification.phase, 'paused');
  env.state.arrivalBooking = { ...env.state.arrivalBooking, paymentStatus: 'succeeded' }; env.render(); await flush();
  assert.equal(env.summaries, 1); assert.equal(env.settlements, 0); assert.equal(env.checks.length, 1);
  assert.equal(env.state.activeStoredState.walletTopUpOrderNumber, null); env.hooks.unmount();
});

test('only explicit failed/cancelled provider results release the reference, not HTTP 400, 404 or 502', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  for (const status of ['failed', 'cancelled', 400, 404, 502]) {
    const env = environment(); env.response = async () => {
      if (typeof status === 'number') throw { status };
      return { payment: { status } };
    };
    env.render(); await flush(); env.render();
    assert.equal(env.state.activeStoredState.walletTopUpOrderNumber,
      typeof status === 'number' ? 'existing-order' : null);
    assert.deepEqual(env.failures, typeof status === 'number' ? [] : ['booking']);
    assert.equal(env.settlements, 0); env.hooks.unmount();
  }
});

test('failed points settlement pauses instead of automatically repeating the financial mutation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const env = environment(); env.response = async () => ({ payment: { status: 'succeeded' } });
  env.provider.settleWithPoints = async () => { env.settlements++; throw { status: 502 }; };
  env.render(); await flush(); assert.equal(env.render().verification.phase, 'paused');
  t.mock.timers.tick(600000); await flush(); assert.equal(env.settlements, 1);
  assert.equal(env.state.activeStoredState.walletTopUpOrderNumber, 'existing-order'); env.hooks.unmount();
});

test('recovery action checks an existing payment, has no idle spinner and leaves close enabled even during a read', () => {
  let payments = 0, retries = 0, closes = 0;
  const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
    Keyboard: { dismiss() {} }, StyleSheet: { create: value => value } };
  const { ArrivalPaymentActions } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/arrival-payment/ArrivalPaymentActions.tsx');
  const props = { isBusy: false, hasPendingProviderPayment: true, paymentAlreadySucceeded: false,
    selectedMode: 'points', actionLabel: 'Payer', isPayButtonDisabled: true,
    verification: { phase: 'paused', message: 'Vérification indisponible' },
    onPay: async () => { payments++; }, onRetry: () => { retries++; }, onClose: () => { closes++; } };
  let children = React.Children.toArray(ArrivalPaymentActions(props).props.children);
  const buttons = children.filter(child => child.type === 'Button');
  assert.equal(buttons[0].props.disabled, false); buttons[0].props.onPress();
  assert.equal(retries, 1); assert.equal(payments, 0);
  assert.equal(React.Children.toArray(buttons[0].props.children).some(child => child.type === 'Spinner'), false);
  assert.equal(children[0].props.accessibilityLiveRegion, 'polite');
  props.isBusy = true; children = React.Children.toArray(ArrivalPaymentActions(props).props.children);
  const busyButtons = children.filter(child => child.type === 'Button');
  assert.equal(busyButtons[0].props.disabled, true); assert.notEqual(busyButtons[1].props.disabled, true);
  busyButtons[1].props.onPress(); assert.equal(closes, 1);
});
