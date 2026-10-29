const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { isTokenCashFallback, tokenCashFallbackReceipt, restoreTokenCashFallback } = loader()('features/arrival-payment/tokenCashFallback.ts');
const receipt = { id: 'b', paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: 4500, paymentCurrency: 'CDF',
  tokenCashFallbackAt: '2026-10-23T17:00:00Z', status: 'completed', droppedOff: true };
test('cash fallback API sends only the booking command, maps the durable fence and invalidates finance caches', () => {
  const load = loader();
  const endpoint = load('store/api/booking/createBooking.endpoints.ts').buildCreateBookingEndpoints({ query: x => x, mutation: x => x }).switchTokenPaymentToCash;
  assert.deepEqual(endpoint.query('b'), { url: '/bookings/b/token-cash-fallback', method: 'POST',
    timeout: load('constants/network.ts').CRITICAL_MUTATION_TIMEOUT_MS });
  assert.equal(endpoint.transformResponse(receipt).tokenCashFallbackAt, receipt.tokenCashFallbackAt);
  const tags = endpoint.invalidatesTags(receipt, undefined, 'b');
  assert.ok(tags.some(tag => tag.type === 'Booking' && tag.id === 'b'));
  for (const type of ['Wallet', 'PaymentHistory', 'DriverSettlement']) assert.ok(tags.some(tag => tag.type === type));
});
function setup(t) {
  const h = hookHarness(), calls = { api: [], patches: [], summaries: [], refreshed: 0 };
  const state = { arrivalBooking: { id: 'b', paymentMode: 'points' }, activeStoredState: { walletTopUpIntent: 'original' },
    isBeforeArrival: false, isSessionCurrent: () => true,
    persistBookingState: async (id, patch) => { calls.patches.push({ id, patch }); return true; },
    refetchBookings: () => { calls.refreshed++; } };
  let response = async () => receipt;
  const { useTokenCashFallback } = loader({ react: h.react, '@/store/api/bookingApi': {
    useSwitchTokenPaymentToCashMutation: () => [id => { calls.api.push(id); return { unwrap: () => response() }; }],
  } })('hooks/arrival-payment/useTokenCashFallback.ts');
  const completion = { showCompletionSummary: async (...args) => calls.summaries.push(args) };
  t.after(() => h.unmount());
  return { state, calls, render: () => h.render(() => useTokenCashFallback(state, completion)), set response(fn) { response = fn; } };
}
test('pending top-up cash switch is single flight, preserves references and waits for server confirmation', async t => {
  const f = setup(t); let finish;
  f.response = () => new Promise(resolve => { finish = resolve; });
  const task = f.render().run(); await f.render().run();
  assert.deepEqual(f.calls.api, ['b']); assert.equal(f.render().isWorking, true);
  assert.deepEqual(f.calls.patches, []); assert.deepEqual(f.calls.summaries, []);
  finish(receipt); await task;
  assert.equal(f.calls.patches[0].patch.tokenCashFallbackReceipt, tokenCashFallbackReceipt(receipt));
  assert.equal(f.state.activeStoredState.walletTopUpIntent, 'original');
  assert.equal(f.calls.summaries[0][0].paymentMode, 'cash'); assert.equal(f.render().isWorking, false);
});
test('lost reply, conflict, older backend or malformed receipt never announce cash success', async t => {
  const f = setup(t);
  for (const failure of [{ status: 'FETCH_ERROR' }, { status: 409 }, { status: 404 }]) {
    f.response = async () => { throw failure; }; await f.render().run();
    assert.ok(f.render().message); assert.equal(f.calls.patches.length, 0); assert.equal(f.calls.summaries.length, 0);
  }
  f.response = async () => ({ ...receipt, id: 'other' }); await f.render().run();
  assert.equal(f.calls.patches.length, 0); assert.equal(f.calls.summaries.length, 0);
});
test('another account/booking cannot receive the success UI but the original receipt is retained', async t => {
  const f = setup(t); let finish;
  f.response = () => new Promise(resolve => { finish = resolve; });
  const task = f.render().run(); f.state.arrivalBooking = { id: 'other' }; f.state.isSessionCurrent = () => false; f.render();
  finish(receipt); await task;
  assert.equal(f.calls.patches[0].id, 'b'); assert.deepEqual(f.calls.summaries, []);
});
test('switch is unavailable for direct collections, mixed tokens already committed, early payments or storage failure', async t => {
  const f = setup(t);
  for (const patch of [{ bookingPaymentOrderNumber: 'direct' }, { mixedCashIntent: 'mixed' }]) {
    f.state.activeStoredState = { walletTopUpIntent: 'original', ...patch }; await f.render().run();
  }
  f.state.activeStoredState = { walletTopUpOrderNumber: 'order' };
  f.state.isBeforeArrival = true; await f.render().run(); f.state.isBeforeArrival = false;
  f.state.storageError = 'disk'; await f.render().run(); f.state.storageError = '';
  f.state.isMutatingPayment = true; await f.render().run();
  assert.deepEqual(f.calls.api, []);
});
test('a pending status READ does not prevent choosing cash; a financial mutation does', async t => {
  const f = setup(t); f.state.isBusy = true; f.state.isMutatingPayment = false;
  await f.render().run(); assert.equal(f.calls.api.length, 1);
});
test('top-up correlation permits cash even when the previous server mode is not yet points', async t => {
  const f = setup(t); f.state.arrivalBooking.paymentMode = 'cash';
  assert.equal(f.render().canSwitch, true); await f.render().run(); assert.equal(f.calls.api.length, 1);
});
test('reopening after a confirmed switch restores cash over a stale list, never another booking or an actual payment', () => {
  const old = { id: 'b', paymentMode: 'points', paymentStatus: 'pending' };
  const stored = { tokenCashFallbackReceipt: tokenCashFallbackReceipt(receipt), walletTopUpOrderNumber: 'order' };
  assert.equal(restoreTokenCashFallback(old, stored).paymentMode, 'cash');
  assert.equal(restoreTokenCashFallback({ ...old, id: 'other' }, stored).paymentMode, 'points');
  assert.equal(restoreTokenCashFallback({ ...old, paymentStatus: 'succeeded' }, stored).paymentStatus, 'succeeded');
  assert.equal(restoreTokenCashFallback(old, { tokenCashFallbackReceipt: '{}' }), old);
  assert.equal(isTokenCashFallback({ ...receipt, tokenCashFallbackAt: 'invalid' }), false);
  assert.equal(isTokenCashFallback({ ...receipt, paymentAmount: NaN }), false);
});
test('pending token complement prioritizes verification and preserves an explicit secondary cash choice', () => {
  const walk = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(walk)] : [];
  const words = node => typeof node === 'string' || typeof node === 'number' ? String(node)
    : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
  let cash = 0, verify = 0, skip;
  const { ArrivalPaymentRecovery } = loader({
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linking': { createURL: () => 'zwanga://payment' },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: (_id, opts) => { skip = opts.skip; return { currentData: {
      acceptedPaymentModes: ['cash'], availablePaymentModes: ['cash'],
    } }; } },
  })('features/arrival-payment/ArrivalPaymentRecovery.tsx');
  const tree = ArrivalPaymentRecovery({ bookingId: 'b', pending: true, pendingCashAllowed: true, amount: 4500,
    currency: 'CDF', onCash: async () => cash++, onVerify: () => verify++ });
  assert.ok(!skip); assert.match(words(tree), /Si vous avez validé Mobile Money, vérifiez/);
  assert.match(words(tree), /recharge reçue resteront/); assert.doesNotMatch(words(tree), /Payez le montant total/);
  walk(tree).find(node => node.type === 'Button' && /Choisir les espèces.*4.*500/.test(words(node))).props.onPress();
  assert.equal(cash, 1); assert.equal(verify, 0);
  walk(tree).find(node => node.type === 'Button' && words(node) === 'Vérifier mon paiement').props.onPress();
  assert.equal(verify, 1);
});
