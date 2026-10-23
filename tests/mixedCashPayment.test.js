const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('mixed cash API contract keeps explicit amounts, server mapping, deadline and finance invalidations', () => {
  const load = loader();
  const { buildCreateBookingEndpoints } = load('store/api/booking/createBooking.endpoints.ts');
  const endpoint = buildCreateBookingEndpoints({ query: x => x, mutation: x => x }).payTokensCash;
  const body = { expectedAmount: 4500, expectedTokenAmount: 580, tokenQuantity: 58, currency: 'CDF' };
  const request = endpoint.query({ bookingId: 'booking', ...body });
  assert.deepEqual(request, { url: '/bookings/booking/pay-tokens-cash', method: 'POST', body,
    timeout: load('constants/network.ts').CRITICAL_MUTATION_TIMEOUT_MS });
  const mapped = endpoint.transformResponse({ id: 'booking', paymentMode: 'cash', paymentAmount: 3920,
    mixedTokenQuantity: 58, mixedTokenAmount: 580, mixedPaymentAt: '2026-10-22T12:00:00Z' });
  assert.equal(mapped.paymentAmount, 3920); assert.equal(mapped.mixedTokenQuantity, 58);
  const tags = endpoint.invalidatesTags(mapped, undefined, { bookingId: 'booking' });
  assert.ok(tags.some(t => t.type === 'Booking' && t.id === 'booking'));
  for (const type of ['Wallet', 'PaymentHistory', 'DriverSettlement']) assert.ok(tags.some(t => t.type === type), type);
});

function fixture(t) {
  const hooks = hookHarness(), calls = [], summaries = [], errors = [];
  let resolve, reject;
  const state = {
    arrivalBooking: { id: 'booking', status: 'completed', droppedOff: true }, activeStoredState: {},
    isSessionCurrent: () => true, paymentAmount: 4500, paymentCurrency: 'CDF', pointsUsed: 58,
    amountCoveredByPoints: 580, missingPoints: 392, isBeforeArrival: false,
    hasPendingProviderPayment: false, isBusy: false, isWalletFetching: false,
    setPaymentError: e => errors.push(e), refetchWallet() {}, refetchBookings() {},
    persistBookingState(id, patch) { assert.equal(id, 'booking'); state.activeStoredState = { ...state.activeStoredState, ...patch }; },
  };
  let supported = true;
  const { useMixedCashPayment } = loader({ react: hooks.react,
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => ({ currentData: { mixedCashSupported: supported } }) },
    '@/store/api/bookingApi': { usePayTokensCashMutation: () => [input => {
      calls.push(input); return { unwrap: () => new Promise((yes, no) => { resolve = yes; reject = no; }) };
    }, { isLoading: false }] },
    'expo-linking': { createURL: () => '' },
  })('hooks/arrival-payment/useMixedCashPayment.ts');
  const render = () => hooks.render(() => useMixedCashPayment(state, { showCompletionSummary: async b => summaries.push(b) }));
  const success = () => resolve({ id: 'booking', paymentMode: 'cash', paymentAmount: 3920,
    mixedTokenAmount: 580, mixedTokenQuantity: 58, mixedPaymentAt: '2026-10-22T10:00:00Z' });
  t.after(() => hooks.unmount());
  return { render, state, calls, summaries, errors, success, fail: e => reject(e), unsupported: () => { supported = false; } };
}

test('58 tokens + 3920 cash: explicit consent, one debit on double tap, no phone or provider', async t => {
  const f = fixture(t);
  assert.equal(f.render().cashRemainder, 3920); assert.equal(f.calls.length, 0);
  f.render().selectCash(true);
  const action = f.render().submit, first = action(); await action();
  assert.deepEqual(f.calls, [{ bookingId: 'booking', expectedAmount: 4500, expectedTokenAmount: 580, tokenQuantity: 58, currency: 'CDF' }]);
  assert.ok(f.state.activeStoredState.mixedCashIntent);
  f.success(); await first;
  assert.equal(f.state.activeStoredState.mixedCashIntent, null);
  assert.equal(f.summaries[0].paymentAmount, 3920); assert.equal(f.summaries[0].cashReceivedAt, undefined);
});

test('lost response pins the exact intent across changed wallet data, retry does not buy tokens', async t => {
  const f = fixture(t); f.render().selectCash(true);
  const first = f.render().submit(); f.fail({ status: 'FETCH_ERROR' }); await first;
  assert.equal(f.render().pending, true);
  f.state.pointsUsed = 300; f.state.paymentAmount = 9999;
  assert.equal(f.render().cashRemainder, 3920); assert.equal(f.render().displayedPoints, 58);
  const retry = f.render().submit(); assert.deepEqual(f.calls[1], f.calls[0]);
  f.success(); await retry; assert.equal(f.summaries.length, 1);
});

test('a business rejection clears the intent without presenting cash as received', async t => {
  const f = fixture(t); f.render().selectCash(true);
  const pending = f.render().submit(); f.fail({ status: 409 }); await pending;
  assert.equal(f.render().pending, false); assert.equal(f.summaries.length, 0);
  assert.ok(f.errors.at(-1));
});

test('before arrival, zero tokens, old backend and pending Mobile Money never start mixed payment', async t => {
  for (const patch of [{ isBeforeArrival: true }, { pointsUsed: 0 }, { hasPendingProviderPayment: true }, { isBusy: true }]) {
    const f = fixture(t); Object.assign(f.state, patch); f.render().selectCash(true);
    await f.render().submit(); assert.equal(f.calls.length, 0);
  }
  const f = fixture(t); f.unsupported(); f.render().selectCash(true); await f.render().submit(); assert.equal(f.calls.length, 0);
});

test('server-confirmed mixed payment on reopen shows original total, paid tokens and only remaining cash', () => {
  const { buildPaymentCompletionSummary } = loader({ 'expo-linking': { createURL: () => '' } })('features/arrival-payment/buildPaymentCompletionSummary.ts');
  const booking = { id: 'booking', status: 'completed', paymentMode: 'cash', paymentStatus: 'not_required',
    paymentAmount: 3920, mixedTokenAmount: 580, mixedTokenQuantity: 58, mixedPaymentAt: 'date', paymentCurrency: 'CDF' };
  const receipt = buildPaymentCompletionSummary(booking, undefined, [], {});
  assert.equal(receipt.amount, 4500); assert.equal(receipt.cashRemainder, 3920); assert.equal(receipt.cashInstructions, true);
  assert.equal(buildPaymentCompletionSummary({ ...booking, cashReceivedAt: 'date' }, undefined, [], {}).cashInstructions, false);
});

test('a confirmed split survives a stale server list without changing another booking or a received cash receipt', () => {
  const { restoreMixedCashReceipt, serializeMixedCashReceipt } = loader()('features/arrival-payment/mixedCashReceipt.ts');
  const booking = { id: 'booking', paymentAmount: 3920, paymentCurrency: 'CDF', mixedTokenAmount: 580, mixedTokenQuantity: 58,
    mixedPaymentAt: '2026-10-22T10:00:00Z' };
  const saved = { mixedCashReceipt: serializeMixedCashReceipt(booking) };
  const stale = { id: 'booking', paymentAmount: 4500, paymentCurrency: 'CDF' };
  assert.equal(restoreMixedCashReceipt(stale, saved).paymentAmount, 3920);
  assert.equal(restoreMixedCashReceipt({ ...stale, id: 'other' }, saved).paymentAmount, 4500);
  assert.equal(restoreMixedCashReceipt({ ...stale, cashReceivedAt: 'date' }, saved).cashReceivedAt, 'date');
  assert.equal(restoreMixedCashReceipt(stale, { mixedCashReceipt: '{' }), stale);
});
