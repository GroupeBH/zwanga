const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const booking = (id = 'a', patch = {}) => ({ id, tripId: 'trip', passengerId: `holder-${id}`,
  passengerName: 'Passager', numberOfSeats: 3, status: 'accepted', pickedUp: true,
  paymentMode: 'cash', paymentAmount: 6000, paymentStatus: 'not_required',
  interruptionRequest: { id: `request-${id}`, bookingId: id, tripId: 'trip', passengerId: `holder-${id}`, status: 'pending' },
  ...patch });
const completed = (patch = {}) => booking('a', { status: 'completed', droppedOff: true,
  droppedOffConfirmedByPassenger: true, interruptionRequest: null, interruptionFareLocked: true,
  paymentAmount: 1500, ...patch });

function fixture(t, overrides = {}) {
  const hooks = hookHarness(), dialogs = [], sent = [], commits = [], processing = [];
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const load = loader({ react: hooks.react, 'expo-location': {},
    'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    '../../features/driver-navigation/navigationPresentation': { getBookingActionErrorMessage: () => 'Erreur' },
    '@/utils/errorHelpers': { getApiErrorMessage: (error, fallback) => error?.message || fallback },
  });
  const { useDriverBookingActionGuard } = load('hooks/driver-navigation/useDriverBookingActionGuard.ts');
  const { useDriverBookingActions } = load('hooks/driver-navigation/useDriverBookingActions.ts');
  const state = { tripId: 'trip', active: true, bookings: [booking(), booking('b')],
    setProcessingBookingId: id => processing.push(id) };
  const props = {
    showDialog: value => dialogs.push(value),
    confirmPassengerTripInterruption: id => { sent.push(['confirm', id]); return { unwrap: () => pending }; },
    rejectPassengerTripInterruption: value => { sent.push(['reject', value.bookingId]); return { unwrap: () => pending }; },
    commitPassengerInterruptionResponse: (value, source) => {
      commits.push([value, source]); state.bookings = state.bookings.map(item => item.id === value.id ? value : item);
    },
    routeFetchedRef: { current: true }, routeSignatureRef: { current: 'route' },
    refetchBookings: async () => ({}), refetchTrip: async () => ({}), ...overrides,
  };
  const render = () => hooks.render(() => useDriverBookingActions({ ...props, beginBookingAction: useDriverBookingActionGuard(state) }));
  const show = (operation = 'confirm', target = state.bookings[0]) => {
    const actions = render();
    actions[operation === 'confirm' ? 'handleConfirmPassengerInterruption' : 'handleRejectPassengerInterruption'](target);
    return dialogs.at(-1).actions[1].onPress;
  };
  t.after(() => hooks.unmount());
  return { hooks, state, props, render, show, dialogs, sent, commits, processing, resolve, reject };
}

test('driver confirmation applies the returned group fare and removes the request without waiting for reads', async t => {
  const h = fixture(t, { refetchBookings: () => new Promise(() => {}), refetchTrip: () => new Promise(() => {}) });
  const other = h.state.bookings[1], confirm = h.show();
  const action = confirm(); await confirm(); assert.equal(h.sent.length, 1);
  const result = completed(); h.resolve(result); await action;
  assert.equal(h.commits.length, 1);
  assert.equal(h.state.bookings[0], result); assert.equal(h.state.bookings[1], other);
  assert.equal(h.state.bookings[0].numberOfSeats, 3); assert.equal(h.state.bookings[0].paymentAmount, 1500);
  assert.equal(h.processing.at(-1), null); assert.match(h.dialogs.at(-1).message, /1\s500 CDF/);
  h.render(); await confirm(); assert.equal(h.sent.length, 1, 'an old modal cannot resubmit a completed reservation');
});

test('an unrelated response cannot acknowledge a passenger dropoff', async t => {
  const h = fixture(t); const action = h.show()(); h.resolve(completed({ id: 'other' })); await action;
  assert.equal(h.commits.length, 0); assert.equal(h.dialogs.at(-1).title, 'Confirmation impossible');
});

test('a pending server booking is not advertised as a completed dropoff', async t => {
  const h = fixture(t); const action = h.show()(); h.resolve(booking()); await action;
  assert.equal(h.commits.length, 0); assert.equal(h.dialogs.at(-1).title, 'Confirmation impossible');
});

test('refusal applies immediately and releases the lock even when a refresh never completes', async t => {
  const h = fixture(t, { refetchBookings: () => new Promise(() => {}) });
  const action = h.show('reject')(); h.resolve(booking('a', { interruptionRequest: null }));
  const outcome = await Promise.race([action.then(() => 'done'), new Promise(resolve => setImmediate(() => resolve('blocked')))]);
  assert.equal(outcome, 'done'); assert.equal(h.commits.length, 1); assert.equal(h.processing.at(-1), null);
  assert.equal(h.state.bookings[0].status, 'accepted'); assert.equal(h.dialogs.at(-1).title, 'Demande refusée');
});

test('a server error stays visible and never changes the booking or payment', async t => {
  const h = fixture(t); const before = h.state.bookings[0]; const action = h.show()();
  h.reject(new Error('Un paiement est déjà en cours. Attendez sa confirmation.')); await action;
  assert.equal(h.commits.length, 0); assert.equal(h.state.bookings[0], before);
  assert.match(h.dialogs.at(-1).message, /paiement est déjà en cours/); assert.equal(h.processing.at(-1), null);
});

test('a response after leaving navigation cannot change its cache or open another dialog', async t => {
  const h = fixture(t); const action = h.show()(); h.state.active = false; h.render();
  h.resolve(completed()); await action; assert.equal(h.commits.length, 0); assert.equal(h.dialogs.length, 1);
});

test('another reservation or a replaced interruption cannot be confirmed through an old dialog', async t => {
  const h = fixture(t); const confirm = h.show();
  h.state.bookings[0] = booking('a', { interruptionRequest: { id: 'new', status: 'pending' } });
  h.render(); await confirm(); assert.equal(h.sent.length, 0);
  const next = h.show('confirm', h.state.bookings[1]); const action = next();
  h.resolve(completed({ ...h.state.bookings[1], status: 'completed', droppedOff: true, interruptionRequest: null }));
  await action; assert.deepEqual(h.sent, [['confirm', 'b']]);
});

test('only actionable interruptions are offered, using the same eligibility as the action guard', () => {
  const { canRespondToPassengerInterruption } = loader()('features/driver-navigation/passengerInterruptionResponse.ts');
  const list = [booking(), booking('b'), completed({ interruptionRequest: booking().interruptionRequest }),
    booking('cancelled', { status: 'cancelled' }), booking('dropped', { droppedOffAt: '2026-09-23T10:00:00Z' }),
    booking('closed', { interruptionRequest: null })];
  assert.deepEqual(list.filter(canRespondToPassengerInterruption).map(value => value.id), ['a', 'b']);
});
