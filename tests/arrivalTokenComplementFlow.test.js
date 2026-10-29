const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

function setup(t) {
  const h = hookHarness(); t.after(() => h.unmount());
  const calls = { reads: [], puts: [], checks: [], unsubscribed: 0, summaries: [] };
  const booking = { id: 'booking-test', status: 'completed', droppedOff: true, paymentMode: 'points',
    paymentStatus: 'pending', paymentAmount: 500, paymentCurrency: 'CDF' };
  let live = true, update = async () => ({ ...booking, paymentStatus: 'succeeded' });
  let read = async () => ({ ...booking, paymentStatus: 'succeeded' });
  const state = { isAuthenticated: true, isAppActive: true, isResumeReady: true, isPaymentDeferred: false,
    arrivalBooking: booking, activeBookingIdRef: { current: booking.id }, user: {},
    activeStoredState: { requiredActionAt: 'known', walletTopUpOrderNumber: 'original-topup' },
    setSelectedChannel() {}, setPaymentPhone() {}, setStatusMessage() {}, setPaymentError() {},
    setCompletionSummary(value) { state.completionSummary = typeof value === 'function' ? value(state.completionSummary) : value;
      if (state.completionSummary) calls.summaries.push(state.completionSummary); },
    setIsCheckingPayment(value) { state.isCheckingPayment = value; },
    persistBookingState(_id, patch) { Object.assign(state.activeStoredState, patch); return Promise.resolve(true); },
    checkWalletTopUpStatus(order) { calls.checks.push(order); return { unwrap: async () => ({ payment: { status: 'succeeded', orderNumber: order } }) }; },
    isSessionCurrent: () => live, reportPaymentFailure() { assert.fail('successful top-up is not a failure'); },
    updatePaymentMode(input) { calls.puts.push(input); return { unwrap: () => update() }; },
    refetchBookings: async () => ({}), refetchWallet: async () => ({}), refetchPaymentHistory: async () => ({}),
    paymentHistory: [],
  };
  const getBooking = (id, cache) => { calls.reads.push({ id, cache }); return { unwrap: () => read(), unsubscribe: () => calls.unsubscribed++ }; };
  const load = loader({ react: h.react, 'expo-linking': { createURL: () => 'zwanga://payment' }, 'expo-web-browser': {},
    '@/store/api/bookingApi': { useLazyGetBookingByIdQuery: () => [getBooking] },
    '@/features/wallet/topUpIntent': { acknowledgeWalletTopUpIntent: async () => {} },
  });
  const { useArrivalPaymentProvider } = load('hooks/arrival-payment/useArrivalPaymentProvider.ts');
  const { useArrivalPaymentCompletion } = load('hooks/arrival-payment/useArrivalPaymentCompletion.ts');
  const { useArrivalPaymentMonitoring } = load('hooks/arrival-payment/useArrivalPaymentMonitoring.ts');
  return { calls, state, booking, set live(value) { live = value; }, set update(value) { update = value; }, set read(value) { read = value; },
    render(monitor = true) { return h.render(() => {
      const completion = useArrivalPaymentCompletion(state);
      const provider = useArrivalPaymentProvider({ ...state, ...completion });
      const monitoring = useArrivalPaymentMonitoring({ state: { ...state, isPaymentDeferred: !monitor }, provider, completion });
      return { provider, monitoring };
    }); },
  };
}

test('token complement flow: confirmed original top-up settles the booking and displays its receipt', async t => {
  const f = setup(t); f.render(); await flush();
  assert.deepEqual(f.calls.checks, ['original-topup']);
  assert.deepEqual(f.calls.puts, [{ bookingId: f.booking.id, paymentMode: 'points' }]);
  assert.equal(f.calls.reads.length, 0);
  assert.equal(f.state.completionSummary.amount, 500);
  assert.equal(f.state.completionSummary.mode, 'points');
  assert.equal(f.state.activeStoredState.walletTopUpOrderNumber, null);
  assert.ok(f.state.activeStoredState.settledAt);
});

for (const error of [{ status: 400 }, { status: 409 }, { status: 'TIMEOUT_ERROR' }]) {
  test(`lost settlement reply (${error.status}) reads the confirmed booking instead of charging again`, async t => {
    const f = setup(t); f.update = async () => { throw error; };
    f.render(); await flush();
    assert.equal(f.calls.puts.length, 1);
    assert.deepEqual(f.calls.reads, [{ id: f.booking.id, cache: false }]);
    assert.equal(f.calls.unsubscribed, 1);
    assert.equal(f.state.completionSummary.amount, 500);
    assert.equal(f.state.activeStoredState.walletTopUpOrderNumber, null);
  });
}

test('a credited top-up is not a paid ride: unconfirmed settlement stays visible and can be verified manually', async t => {
  const f = setup(t); f.update = async () => { throw { status: 502 }; }; f.read = async () => f.booking;
  f.render(); await flush();
  assert.equal(f.state.completionSummary, undefined);
  assert.equal(f.render().monitoring.verification.phase, 'paused');
  assert.match(f.render().monitoring.verification.message, /Recharge confirmée/);
  assert.equal(f.state.isCheckingPayment, false);
  assert.ok(f.state.activeStoredState.walletTopUpConfirmedAt);
  assert.equal(f.state.activeStoredState.walletTopUpOrderNumber, 'original-topup');
  f.read = async () => ({ ...f.booking, paymentStatus: 'succeeded' });
  f.render().monitoring.retryVerification(); await flush();
  assert.equal(f.state.completionSummary.mode, 'points');
  assert.equal(f.calls.puts.length, 2, 'only the explicit retry makes the second settlement request');
});

test('another booking, a missing fare or unpaid cash must never become a successful token receipt', async t => {
  const f = setup(t); f.update = async () => { throw { status: 409 }; };
  for (const fresh of [{ ...f.booking, id: 'other', paymentStatus: 'succeeded' },
    { ...f.booking, paymentAmount: null }, { ...f.booking, paymentMode: 'cash', paymentStatus: 'not_required' }]) {
    f.read = async () => fresh;
    await assert.rejects(f.render(false).provider.settleWithPoints(f.booking.id));
    assert.equal(f.state.completionSummary, undefined);
  }
});

test('a slow booking reconciliation is bounded; a late reply cannot announce success after timeout or logout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = setup(t), pending = deferred(); f.update = async () => { throw { status: 'FETCH_ERROR' }; };
  f.read = () => pending.promise;
  const task = f.render(false).provider.settleWithPoints(f.booking.id);
  const rejected = assert.rejects(task, /PAYMENT_RESULT_TIMEOUT/);
  await flush(); t.mock.timers.tick(25000); await rejected;
  pending.resolve({ ...f.booking, paymentStatus: 'succeeded' }); await flush();
  assert.equal(f.state.completionSummary, undefined); assert.equal(f.calls.unsubscribed, 1);
  const next = deferred(); f.read = () => next.promise;
  const afterLogout = f.render(false).provider.settleWithPoints(f.booking.id); await flush(); f.live = false;
  next.resolve({ ...f.booking, paymentStatus: 'succeeded' }); assert.equal(await afterLogout, false);
  assert.equal(f.state.completionSummary, undefined);
});

test('verification activity and confirmed complement are visible, while cash remains an explicit alternative', () => {
  const walk = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(walk)] : [];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children ?? '');
  const { ArrivalPaymentRecovery } = loader({ 'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll',
    TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linking': { createURL: () => 'zwanga://payment' },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => ({ currentData: { acceptedPaymentModes: ['cash'], availablePaymentModes: ['cash'] } }) },
  })('features/arrival-payment/ArrivalPaymentRecovery.tsx');
  let checks = 0, cash = 0;
  const props = { bookingId: 'booking-test', pending: true, pendingCashAllowed: true, busy: false, verifying: true,
    amount: 500, currency: 'CDF', onVerify: () => checks++, onCash: () => cash++ };
  let tree = ArrivalPaymentRecovery(props);
  const checking = walk(tree).find(node => node.type === 'Button' && text(node) === 'Vérification du paiement…');
  assert.ok(checking.props.disabled); checking.props.onPress(); assert.equal(checks, 0);
  assert.equal(walk(tree).filter(node => node.type === 'Spinner').length, 1);
  props.verifying = false; props.topUpConfirmed = true;
  props.message = 'Recharge confirmée. Le règlement du trajet reste à vérifier.';
  tree = ArrivalPaymentRecovery(props);
  assert.match(text(tree), /Complément reçu/); assert.match(text(tree), /règlement du trajet reste à vérifier/);
  assert.doesNotMatch(text(tree), /Paiement non confirmé|Payez le montant total/);
  walk(tree).find(node => node.type === 'Button' && text(node) === 'Finaliser le paiement du trajet').props.onPress();
  assert.equal(checks, 1); assert.equal(cash, 0);
});
