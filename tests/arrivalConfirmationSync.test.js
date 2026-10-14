const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted', paymentAmount: 580 };
const declaration = { actorUserId: 'passenger', bookingId: 'booking', tripId: 'trip', stage: 'dropoff', decision: 'confirm', state: 'queued' };

function fixture(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), reads = [], retries = [], synced = [];
  const options = { booking, userId: 'passenger', waiting: true, active: true, online: true, entries: [declaration], ...overrides };
  const env = { data: undefined, refetches: 0 };
  const { useArrivalConfirmationSync } = loader({ react: hooks.react,
    '@/services/rideOutbox': { rideOutbox: { retry: id => { retries.push(id); return Promise.resolve(); } } },
    '@/store/api/bookingApi': { useGetBookingByIdQuery: (id, query) => {
      reads.push({ id, query }); return { currentData: env.data, refetch: () => { env.refetches++; return Promise.resolve(); } };
    } },
    './useSyncArrivedPaymentBooking': { useSyncArrivedPaymentBooking: (data, enabled) => { if (enabled && data) synced.push(data); } },
  })('hooks/arrival-payment/useArrivalConfirmationSync.ts');
  t.after(() => hooks.unmount());
  return { env, options, reads, retries, synced, hooks, render: () => hooks.render(() => useArrivalConfirmationSync({ ...options })) };
}

test('a visible saved arrival retries the same outbox and reads only its booking for at most 30 seconds', async t => {
  const f = fixture(t);
  let state = f.render(); assert.equal(state.progress.phase, 'syncing');
  assert.deepEqual(f.retries, ['booking']);
  assert.equal(f.reads.at(-1).query.pollingInterval, 3000);
  assert.equal(f.reads.at(-1).query.refetchOnMountOrArgChange, true);
  for (let i = 0; i < 100; i++) { f.options.entries = [{ ...declaration }]; f.render(); }
  assert.equal(f.retries.length, 1, 'cache renders do not replay mutations');
  t.mock.timers.tick(30_000); state = f.render();
  assert.equal(state.progress.phase, 'paused'); assert.equal(state.progress.refreshing, false);
  assert.equal(f.reads.at(-1).query.pollingInterval, 0);
  assert.match(state.progress.message, /Aucun paiement n’a été lancé/);
  const retry = state.retry; retry(); retry(); f.render(); await flush();
  assert.equal(f.retries.length, 2); assert.equal(f.env.refetches, 1);
  retry(); f.render(); assert.equal(f.retries.length, 2, 'an old callback cannot repeat a still-active retry');
});

test('missing boarding is explained rather than described as an endless fare calculation', t => {
  const f = fixture(t, { entries: [{ ...declaration, message: 'En attente de la confirmation de l’embarquement.' }] });
  const state = f.render(); assert.equal(state.progress.phase, 'pickup_required');
  assert.match(state.progress.message, /conducteur.*valider.*détection automatique/);
  assert.doesNotMatch(state.progress.title, /Calcul/);
  t.mock.timers.tick(30_000); assert.equal(f.render().progress.refreshing, false);
});

test('confirmed receipts immediately re-read booking details even after the bounded window stopped', async t => {
  const f = fixture(t); f.render(); t.mock.timers.tick(30_000); f.render();
  f.options.entries = [{ ...declaration, state: 'confirmed' }];
  f.render(); await flush(); assert.equal(f.env.refetches, 1);
  assert.equal(f.reads.at(-1).query.pollingInterval, 0, 'a receipt does not start another polling loop');
  f.env.data = { ...booking, status: 'completed', droppedOff: true, paymentAmount: 580, updatedAt: '2026-10-13T21:00:00Z' };
  f.render(); assert.equal(f.synced.at(-1).paymentAmount, 580, 'the server fare is forwarded without recomputation');
  for (let i = 0; i < 100; i++) f.render();
  await flush(); assert.equal(f.env.refetches, 1);
  f.options.waiting = false; f.render();
  assert.equal(f.reads.at(-1).query.skip, true);
});

test('offline, background, dismissed or foreign bookings do not poll or restart the outbox', t => {
  const f = fixture(t, { online: false });
  let state = f.render(); assert.equal(state.progress.phase, 'offline'); state.retry();
  assert.deepEqual(f.retries, []); assert.equal(f.reads.at(-1).query.skip, true);
  f.options.online = true; f.options.active = false; state = f.render(); state.retry();
  assert.deepEqual(f.retries, []); assert.equal(f.reads.at(-1).query.pollingInterval, 0);
  f.options.active = true; const oldRetry = f.render().retry;
  assert.deepEqual(f.retries, ['booking']);
  f.options.userId = 'other'; f.render(); oldRetry();
  assert.deepEqual(f.retries, ['booking']); assert.equal(f.reads.at(-1).query.skip, true);
  f.options.userId = 'passenger'; f.options.active = false; f.render();
  t.mock.timers.tick(30_000); assert.equal(f.render().progress.phase, 'syncing');
});

test('another booking or trip cannot inject its detail into payment', t => {
  const f = fixture(t);
  for (const patch of [{ id: 'other' }, { tripId: 'other' }]) {
    f.env.data = { ...booking, status: 'completed', ...patch }; f.render(); assert.deepEqual(f.synced, []);
  }
});

test('a queued explicit refresh is cancelled on background or booking change before its microtask runs', async t => {
  const f = fixture(t); f.render(); t.mock.timers.tick(30_000);
  f.render().retry(); f.render();
  f.options.active = false; f.render(); await flush(); assert.equal(f.env.refetches, 0);
  f.options.active = true; f.options.booking = { ...booking, id: 'next' }; f.render();
  f.options.entries = [{ ...declaration, bookingId: 'next', state: 'confirmed' }]; f.render();
  f.options.booking = { ...booking, id: 'another' }; f.render();
  await flush(); assert.equal(f.env.refetches, 0, 'late callbacks never read an unrelated booking');
});

test('real payment state unlocks on fresh server details without another driver declaration or activity-list refresh', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  let fresh, activity = [{ ...booking, pickedUp: true, paymentMode: 'points', paymentStatus: 'pending', trip: { status: 'ongoing' } }];
  const store = { auth: { user: { id: 'passenger' } }, trips: { interruptionChoice: null },
    zwangaApi: { config: { online: true } }, rideRecovery: { userId: 'passenger', entries: [{ ...declaration, occurredAt: new Date().toISOString() }] } };
  const walletReads = [], sent = [];
  const mutation = () => [() => assert.fail('arrival synchronization must not start a payment'), { isLoading: false }];
  const { useArrivalPaymentState } = loader({ react: hooks.react, 'expo-linking': {},
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    './useArrivalPaymentRefresh': { useArrivalPaymentRefresh: () => true },
    './useNearArrivalPayment': { useNearArrivalPayment: () => null },
    './usePaymentPersistence': { usePaymentPersistence: () => ({ storedState: {}, isStoredStateLoaded: true,
      persistBookingState() {}, isSessionCurrent: () => true }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, 'expo-router': { useRouter: () => ({}) },
    '@/services/rideOutbox': { rideOutbox: { retry: async id => sent.push(id) } },
    '@/store/hooks': { useAppDispatch: () => recipe => recipe(activity), useAppSelector: fn => fn(store) },
    '@/store/selectors': { selectIsAuthenticated: () => true, selectUser: state => state.auth.user },
    '@/features/trip/interruptionChoice': { getPassengerInterruptionChoice: () => null },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: activity, refetch() { assert.fail('no full-list polling'); } }),
      useGetBookingByIdQuery: () => ({ currentData: fresh, refetch() {} }),
      bookingApi: { util: { updateQueryData: (_endpoint, _args, recipe) => data => { recipe(data); activity = [...data]; } } },
      useInitiateBookingPaymentMutation: mutation, useUpdateBookingPaymentModeMutation: mutation, useLazyCheckBookingPaymentStatusQuery: mutation },
    '@/store/api/paymentApi': { useGetBookingPaymentHistoryQuery: () => ({ data: [], refetch() {} }) },
    '@/store/api/walletApi': { useGetMyWalletQuery: (_arg, options) => { walletReads.push(options); return { data: { account: { balance: 31 } }, refetch() {} }; },
      useInitiateWalletTopUpMutation: mutation, useLazyCheckWalletTopUpStatusQuery: mutation },
  })('hooks/arrival-payment/useArrivalPaymentState.ts');
  const render = () => hooks.render(useArrivalPaymentState);
  let state = render(); assert.equal(state.waitingForArrivalConfirmation, true); assert.equal(state.paymentAmount, null);
  assert.equal(walletReads.at(-1).skip, true); assert.deepEqual(sent, ['booking']);
  fresh = { ...activity[0], droppedOffConfirmedByPassenger: true, paymentAmount: 580, updatedAt: new Date().toISOString() };
  render(); state = render();
  assert.equal(state.waitingForArrivalConfirmation, false); assert.equal(state.paymentAmount, 580);
  assert.equal(state.requiredPoints, 5.8); assert.equal(walletReads.at(-1).skip, false);
  assert.equal(store.rideRecovery.entries.length, 1, 'no driver receipt is fabricated'); assert.equal(sent.length, 1);
});
