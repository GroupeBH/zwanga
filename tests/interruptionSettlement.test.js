const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const { getDriverInterruptionSettlementMessage: message, getInterruptionDistanceLabel: distance } =
  loader()('features/arrival-payment/interruptionSettlement.ts');
const settled = (patch = {}) => ({ id: 'booking', tripId: 'trip', passengerId: 'passenger',
  status: 'completed', droppedOff: true, interruptionFareLocked: true,
  paymentAmount: 1500, paymentCurrency: 'CDF', paymentMode: 'cash', paymentStatus: 'not_required',
  plannedDistanceMeters: 25000, travelledDistanceMeters: 5000,
  updatedAt: '2026-09-21T12:00:00Z', ...patch });

test('driver sees the net server fare, distance, and cash owed, never fictitious payment confirmation', () => {
  const value = settled({ grossPaymentAmount: 9000, numberOfSeats: 3 });
  assert.equal(distance(value), '5 km parcourus sur 25 km prévus');
  const text = message(value).replace(/\s/g, ' ');
  assert.match(text, /À recevoir du passager en cash : 1 500 CDF/);
  assert.match(text, /ne confirme pas la remise/);
  assert.doesNotMatch(text, /9 000|4 500|Gain ajouté|déjà réglé/);
});

test('pending electronic/token payments are not presented as cash or earnings already received', () => {
  for (const paymentMode of ['electronic', 'points']) {
    assert.match(message(settled({ paymentMode, paymentStatus: 'pending' })), /en attente dans son application/);
    assert.doesNotMatch(message(settled({ paymentMode, paymentStatus: 'pending' })), /À recevoir.*cash|Gain ajouté|déjà réglé/);
    assert.match(message(settled({ paymentMode, paymentStatus: 'succeeded' })), /Ne demandez pas ce montant une seconde fois/);
  }
});

test('free, missing and malformed amounts are not substituted with the full trip price', () => {
  assert.match(message(settled({ paymentAmount: 0 })), /Aucun montant à demander/);
  for (const paymentAmount of [undefined, null, '', 'invalid', -1, Infinity]) {
    assert.match(message(settled({ paymentAmount, trip: { price: 99999 } })), /pas encore disponible/);
  }
  assert.equal(distance(settled({ travelledDistanceMeters: null })), null);
  assert.equal(distance(settled({ travelledDistanceMeters: 0 })), '0 km parcourus sur 25 km prévus');
});

test('booking mapping preserves server distance and final fare without repricing', () => {
  const { mapServerBookingToClient } = loader({
    '../trip/tripMapper': { mapServerTripToClient: value => value },
  })('store/api/booking/bookingMapper.ts');
  const booking = mapServerBookingToClient(settled({ paymentAmount: '1500' }));
  assert.equal(booking.paymentAmount, '1500');
  assert.equal(booking.plannedDistanceMeters, 25000);
  assert.equal(booking.travelledDistanceMeters, 5000);
  assert.equal(booking.interruptionFareLocked, true);
});

function driver(t, refresh = () => Promise.resolve()) {
  const hooks = hookHarness(), dialogs = [], processing = [];
  let finish, calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const { useDriverBookingActions } = loader({
    react: hooks.react,
    '../../features/driver-navigation/navigationPresentation': { getBookingActionErrorMessage: () => 'Erreur' },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Erreur' },
  })('hooks/driver-navigation/useDriverBookingActions.ts');
  const actions = hooks.render(() => useDriverBookingActions({
    beginBookingAction: booking => {
      processing.push(booking.id);
      return { booking, isCurrent: () => true, finish: () => { if (processing.at(-1) === booking.id) processing.push(null); } };
    },
    setProcessingBookingId: id => processing.push(id),
    confirmPassengerTripInterruption: () => { calls++; return { unwrap: () => pending }; },
    commitPassengerInterruptionResponse() {},
    routeFetchedRef: { current: true }, routeSignatureRef: { current: 'route' },
    showDialog: dialog => dialogs.push(dialog), refetchBookings: refresh, refetchTrip: refresh,
  }));
  actions.handleConfirmPassengerInterruption({ id: 'booking', tripId: 'trip', passengerId: 'passenger',
    passengerName: 'Passager', status: 'accepted', interruptionRequest: { id: 'request', status: 'pending' } });
  t.after(() => hooks.unmount());
  return { hooks, dialogs, processing, finish, calls: () => calls, confirm: dialogs[0].actions[1].onPress };
}

test('dropoff summary uses the mutation result immediately despite failed refreshes; double tap submits once', async t => {
  const env = driver(t, () => Promise.reject(new Error('Offline')));
  const first = env.confirm(), duplicate = env.confirm();
  assert.equal(env.calls(), 1);
  env.finish(settled());
  await Promise.all([first, duplicate]);
  assert.equal(env.dialogs.length, 2);
  assert.equal(env.dialogs[1].title, 'Descente confirmée');
  assert.equal(env.dialogs[1].message, `Passager\n\n${message(settled())}`);
  assert.deepEqual(env.processing, ['booking', null]);
});

test('leaving driver navigation before the response cannot open a late modal', async t => {
  const env = driver(t);
  const pending = env.confirm();
  env.hooks.unmount();
  env.finish(settled());
  await pending;
  assert.equal(env.dialogs.length, 1);
  assert.deepEqual(env.processing, ['booking', null], 'the action guard owns lock cleanup even after unmount');
});

test('fresh dropoff detail updates the payment list once, retaining the selected mode without another request', () => {
  const hooks = hookHarness();
  const { selectArrivedPaymentBooking } = loader({ 'expo-linking': {} })('features/arrival-payment/paymentModel.ts');
  const bookings = [settled({ status: 'accepted', droppedOff: false, interruptionFareLocked: false,
    paymentMode: 'electronic', paymentStatus: 'pending', paymentAmount: 5000, updatedAt: '2026-09-21T11:00:00Z' })];
  let writes = 0, userId = 'passenger';
  const dispatch = recipe => { writes++; recipe(bookings); };
  const { useSyncArrivedPaymentBooking } = loader({
    react: hooks.react,
    '@/store/selectors': { selectUser() {} },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: () => ({ id: userId }) },
    '@/store/api/bookingApi': { bookingApi: { util: {
      updateQueryData: (endpoint, args, recipe) => {
        assert.equal(endpoint, 'getMyActivityBookings'); assert.equal(args, undefined); return recipe;
      },
    } } },
  })('hooks/arrival-payment/useSyncArrivedPaymentBooking.ts');
  const fresh = settled({ paymentMode: 'electronic', paymentStatus: 'pending' });
  const render = (value = fresh, enabled = true) => hooks.render(() => useSyncArrivedPaymentBooking(value, enabled));
  for (let i = 0; i < 100; i++) render();
  assert.equal(writes, 1, 'stable data causes no cache/render loop');
  const payable = selectArrivedPaymentBooking(bookings, { booking: { preArrivalDismissedAt: '2026-09-21T11:50:00Z' } });
  assert.equal(payable.id, 'booking');
  assert.equal(payable.paymentMode, 'electronic');
  assert.equal(payable.paymentAmount, 1500);
  render(settled({ paymentAmount: 5000, updatedAt: '2026-09-21T10:00:00Z' }));
  assert.equal(bookings[0].paymentAmount, 1500, 'late old response cannot restore the original fare');
  const beforeBackground = writes;
  render(fresh, false);
  assert.equal(writes, beforeBackground);
  userId = 'another-account'; render();
  assert.equal(writes, beforeBackground);
  hooks.unmount();
});
