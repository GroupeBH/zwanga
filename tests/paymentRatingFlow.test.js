const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader({ 'expo-linking': {} });
const { selectPaymentBooking } = load('features/arrival-payment/selectPaymentBooking.ts');
const { buildPaymentCompletionSummary } = load('features/arrival-payment/buildPaymentCompletionSummary.ts');
const { getPassengersToRate } = load('features/rating/ratingEligibility.ts');
const old = { id: 'first', tripId: 'trip-first', passengerId: 'passenger', status: 'completed',
  droppedOffAt: '2026-10-11T10:00:00Z', paymentMode: 'points', paymentStatus: 'pending',
  paymentAmount: 580, grossPaymentAmount: 1450, firstTripSubsidyApplied: true, zwangaSubsidyAmount: 870 };
const next = { ...old, id: 'next', tripId: 'trip-next', droppedOffAt: '2026-10-12T10:00:00Z',
  paymentAmount: 1450, firstTripSubsidyApplied: false, zwangaSubsidyAmount: 0 };
const selection = patch => selectPaymentBooking({ bookings: [old, next], arrived: old, declared: null,
  early: null, pinnedId: old.id, deferredId: null, stored: {}, busy: false, ...patch });

test('a later arrival replaces an idle historical reminder with its own full fare, not the first-trip discount', () => {
  assert.equal(selection({}).id, next.id);
  const summary = buildPaymentCompletionSummary(selection({}), undefined, [], {});
  assert.equal(summary.amount, 1450); assert.equal(summary.fareBreakdown, null);
  assert.equal(selection({ declared: next }).id, next.id);
  assert.equal(selection({ declared: next, bookings: [old, { ...next, status: 'accepted' }] }).id, next.id);
  assert.equal(old.paymentAmount, 580, 'selection never rewrites a previous fare');
});

test('an active debit or provider payment stays on its own reservation across a later arrival', () => {
  assert.equal(selection({ declared: next, busy: true }).id, old.id);
  for (const reference of ['bookingPaymentOrderNumber', 'walletTopUpOrderNumber']) {
    assert.equal(selection({ declared: next, stored: { first: { [reference]: 'pending-reference' } } }).id, old.id);
  }
});

test('updatedAt alone, acknowledged receipts and deferred reminders cannot reopen a payment', () => {
  assert.equal(selection({ bookings: [old, { ...next, droppedOffAt: undefined, updatedAt: '2026-10-12T11:00:00Z' }] }).id, old.id);
  assert.equal(selection({ stored: { next: { acknowledgedAt: 'done' } } }).id, old.id);
  assert.equal(selection({ deferredId: next.id }).id, old.id);
  assert.equal(selection({ bookings: [next], arrived: next, pinnedId: null }).id, next.id);
});

test('rating on the receipt requires a completed booking and server-confirmed settlement (or a free ride)', () => {
  const receipt = patch => buildPaymentCompletionSummary({ ...next, ...patch }, undefined, [], {});
  assert.equal(receipt({ paymentStatus: 'succeeded' }).canRateDriver, true);
  assert.equal(receipt({ paymentStatus: 'succeeded' }).tripId, 'trip-next');
  assert.equal(receipt({ paymentMode: 'cash', cashReceivedAt: '2026-10-12T10:01:00Z' }).canRateDriver, true);
  assert.equal(receipt({ paymentAmount: 0 }).canRateDriver, true);
  assert.equal(receipt({}).canRateDriver, false);
  assert.equal(receipt({ paymentMode: 'cash', paymentStatus: 'not_required' }).canRateDriver, false);
  assert.equal(receipt({ status: 'accepted', paymentStatus: 'succeeded' }).canRateDriver, false);
});

function navigationFixture() {
  const hooks = hookHarness(), events = [];
  let currentSession = true;
  const props = { completionSummary: buildPaymentCompletionSummary({ ...next, paymentStatus: 'succeeded' }, undefined, [], {}),
    acknowledgeBooking: id => events.push(['ack', id]), setCompletionSummary: value => events.push(['summary', value]),
    router: { push: route => events.push(['push', route]) }, pendingInvoicePaymentIdRef: { current: undefined },
    setIsClosingForInvoice: value => events.push(['closing', value]), isAppActive: true,
    isSessionCurrent: () => currentSession, isBusy: false };
  const { useArrivalPaymentNavigation } = loader({ react: hooks.react, 'expo-linking': {} })('hooks/arrival-payment/useArrivalPaymentNavigation.ts');
  return { hooks, props, events, expireSession: () => { currentSession = false; },
    render: () => hooks.render(() => useArrivalPaymentNavigation(props)) };
}

test('rating closes the payment sheet first, then navigates only once even after rapid rating/invoice taps', () => {
  const env = navigationFixture();
  env.render().handleRateDriver(); env.render().handleRateDriver(); env.render().handleOpenInvoice();
  assert.deepEqual(env.events, [['closing', true], ['ack', 'next'], ['summary', null]]);
  env.render().handleModalDismiss(); env.render().handleModalDismiss();
  assert.deepEqual(env.events.slice(3), [['push', { pathname: '/rate/[id]', params: { id: 'trip-next' } }], ['closing', false]]);
  env.hooks.unmount();
});

test('late sheet dismissal after logout or backgrounding cannot open rating', () => {
  for (const inactive of ['session', 'app']) {
    const env = navigationFixture(); env.render().handleRateDriver();
    if (inactive === 'session') env.expireSession(); else env.props.isAppActive = false;
    env.render().handleModalDismiss();
    assert.equal(env.events.some(event => event[0] === 'push'), false);
    assert.deepEqual(env.events.at(-1), ['closing', false]); env.hooks.unmount();
  }
});

test('pending payments cannot offer a rating route and invoice navigation remains available', () => {
  const env = navigationFixture(); env.props.completionSummary.canRateDriver = false;
  env.render().handleRateDriver(); assert.deepEqual(env.events, []);
  env.render().handleOpenInvoice(); env.render().handleOpenInvoice(); env.render().handleModalDismiss();
  assert.deepEqual(env.events.filter(event => event[0] === 'push'), [['push', '/payment-history']]);
  env.hooks.unmount();
});

test('drivers can rate only distinct passengers with a completed booking on this trip', () => {
  const completed = { tripId: 'trip', status: 'completed', passengerId: 'one', passengerName: 'Passager', numberOfSeats: 1 };
  assert.deepEqual(getPassengersToRate([completed, { ...completed, id: 'duplicate' },
    { ...completed, passengerId: 'waiting', status: 'accepted' }, { ...completed, passengerId: 'cancelled', status: 'cancelled' },
    { ...completed, passengerId: 'foreign', tripId: 'other' }, { ...completed, passengerId: '' }], 'trip'),
  [{ id: 'one', name: 'Passager', seats: 1 }]);
  assert.deepEqual(getPassengersToRate(undefined, 'trip'), []);
});
