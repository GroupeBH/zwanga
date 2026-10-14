const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { selectDeclaredArrivalBooking: select } = loader()('features/arrival-payment/declaredArrivalPayment.ts');
const now = Date.now();
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted', pickedUp: true,
  paymentMode: 'cash', paymentAmount: 3000, paymentStatus: 'not_required', trip: { status: 'ongoing' } };
const entry = { eventId: 'event', actorUserId: 'passenger', bookingId: 'booking', tripId: 'trip',
  stage: 'dropoff', decision: 'confirm', state: 'queued', occurredAt: new Date(now).toISOString() };

test('a saved passenger arrival selects the payment sheet without fabricating completion or a charge', () => {
  for (const state of ['queued', 'sending', 'received', 'confirmed']) {
    for (const paymentMode of ['cash', 'electronic', 'points']) {
      const source = { ...booking, paymentMode };
      assert.equal(select([source], [{ ...entry, state }], 'passenger', {}, now), source);
      assert.equal(source.droppedOff, undefined); assert.equal(source.status, 'accepted');
    }
  }
  assert.equal(select([booking], [entry], 'passenger', { booking: { preArrivalDismissedAt: 'date' } }, now), booking);
  assert.equal(select([booking], [entry], 'passenger', { booking: { acknowledgedAt: 'date' } }, now), null);
});

test('other users, stages, trips, rejected declarations and inactive reservations cannot open payment', () => {
  for (const patch of [{ actorUserId: 'driver' }, { stage: 'pickup' }, { bookingId: 'other' }, { tripId: 'other' },
    { decision: 'reject' }, { state: 'blocked' }, { state: 'disputed' }, { occurredAt: 'invalid' },
    { occurredAt: new Date(now + 1000).toISOString() }, { occurredAt: new Date(now - 73 * 3600000).toISOString() }]) {
    assert.equal(select([booking], [{ ...entry, ...patch }], 'passenger', {}, now), null, JSON.stringify(patch));
  }
  for (const patch of [{ status: 'pending' }, { status: 'cancelled' }, { status: 'rejected' },
    { passengerId: 'other' }, { trip: { status: 'cancelled' } }, { trip: { status: 'upcoming' } }]) {
    assert.equal(select([{ ...booking, ...patch }], [entry], 'passenger', {}, now), null);
  }
  assert.equal(select([booking], [entry, { ...entry, decision: 'reject' }], 'passenger', {}, now), null);
  assert.equal(select([booking], [entry], undefined, {}, now), null);
});

test('payment follows durable declarations, waits for server arrival and remains dismissible', () => {
  const hooks = hookHarness();
  const store = { zwangaApi: { config: { online: true } }, trips: { interruptionChoice: null }, rideRecovery: { userId: 'passenger', entries: [] } };
  let bookings = [booking], storedState = {}, userId = 'passenger';
  const queryOptions = [];
  const mutation = () => [() => assert.fail('rendering must never charge'), { isLoading: false }];
  const { useArrivalPaymentState } = loader({ react: hooks.react, 'expo-linking': {},
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    './useArrivalPaymentRefresh': { useArrivalPaymentRefresh: () => true },
    './useArrivalConfirmationSync': { useArrivalConfirmationSync: () => ({ progress: { phase: 'idle' }, retry() {} }) },
    './useNearArrivalPayment': { useNearArrivalPayment: () => null },
    './usePaymentPersistence': { usePaymentPersistence: () => ({ storedState, isStoredStateLoaded: true,
      persistBookingState: (id, patch) => { storedState = { ...storedState, [id]: { ...storedState[id], ...patch } }; }, isSessionCurrent: () => true }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, 'expo-router': { useRouter: () => ({}) },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: fn => fn(store) },
    '@/store/selectors': { selectIsAuthenticated: () => true, selectUser: () => ({ id: userId }) },
    '@/features/trip/interruptionChoice': { getPassengerInterruptionChoice: () => null },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: bookings, refetch() {} }),
      useInitiateBookingPaymentMutation: mutation, useUpdateBookingPaymentModeMutation: mutation, useLazyCheckBookingPaymentStatusQuery: mutation },
    '@/store/api/paymentApi': { useGetBookingPaymentHistoryQuery: () => ({ data: [], refetch() {} }) },
    '@/store/api/walletApi': { useGetMyWalletQuery: (_arg, options) => { queryOptions.push(options); return { refetch() {} }; },
      useInitiateWalletTopUpMutation: mutation, useLazyCheckWalletTopUpStatusQuery: mutation },
  })('hooks/arrival-payment/useArrivalPaymentState.ts');
  const draw = () => hooks.render(useArrivalPaymentState);
  assert.equal(draw().arrivalBooking, null);
  store.rideRecovery.entries = [entry];
  let state = draw();
  assert.equal(state.arrivalBooking.id, booking.id); assert.equal(state.waitingForArrivalConfirmation, true);
  assert.equal(state.isBeforeArrival, false); assert.equal(state.paymentAmount, null); assert.equal(state.paymentAlreadySucceeded, false);
  assert.equal(queryOptions.at(-1).skip, true, 'wallet read waits for server validation');
  state.deferPayment(); assert.equal(draw().isPaymentDeferred, true);
  draw().resumePayment(); assert.equal(draw().isPaymentDeferred, false);
  store.rideRecovery.entries = [{ ...entry, state: 'blocked' }]; assert.equal(draw().arrivalBooking, null);
  store.rideRecovery.entries = [entry]; userId = 'other'; assert.equal(draw().arrivalBooking, null);
  userId = 'passenger';
  for (const paymentMode of ['cash', 'electronic', 'points']) {
    bookings = [{ ...booking, status: 'completed', droppedOff: true, droppedOffConfirmedByPassenger: true,
      dropoffDetectionMethod: 'manual_passenger_confirmation', paymentMode, paymentAmount: 3500,
      paymentStatus: paymentMode === 'cash' ? 'not_required' : 'pending', updatedAt: new Date(now).toISOString() }];
    state = draw(); assert.equal(state.waitingForArrivalConfirmation, false); assert.equal(state.paymentAmount, 3500);
    assert.equal(state.paymentAlreadySucceeded, false, 'arrival is not proof of payment');
    assert.equal(queryOptions.at(-1).skip, false);
    assert.equal(store.rideRecovery.entries.length, 1, 'only the passenger receipt is required');
  }
  bookings = [{ ...bookings[0], paymentMode: 'points', paymentStatus: 'succeeded' }];
  state = draw(); assert.equal(state.paymentAlreadySucceeded, true);
  state.acknowledgeBooking(booking.id); assert.equal(draw().arrivalBooking, null);
  hooks.unmount();
});

test('a server-confirmed passenger arrival refreshes booking/payment data without a driver receipt', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: config => {
    endpoints = config.endpoints({ query: value => value, mutation: value => value }); return {};
  } } } })('store/api/rideRecoveryApi.ts');
  const snapshot = { bookingId: 'booking', tripId: 'trip', actor: 'passenger', pickup: { status: 'confirmed' },
    dropoff: { status: 'confirmed', passenger: 'confirm' } };
  assert.deepEqual(endpoints.declareRideStage.invalidatesTags(snapshot), [
    { type: 'Booking', id: 'booking' }, { type: 'Trip', id: 'trip' }, 'Booking',
  ]);
  assert.deepEqual(endpoints.declareRideStage.invalidatesTags(undefined), []);
});
