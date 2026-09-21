const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const linking = { createURL: () => 'zwanga://booking/payment' };
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('missing mode never means cash; late server data and pending transactions retain electronic payment', () => {
  const hooks = hookHarness();
  const { useBookingPaymentMode } = loader({ react: hooks.react })('hooks/arrival-payment/useBookingPaymentMode.ts');
  let booking = { id: 'a' }, stored;
  const render = () => hooks.render(() => useBookingPaymentMode(booking, stored));
  assert.equal(render().selectedMode, null);
  booking = { ...booking, paymentMode: 'electronic' };
  assert.equal(render().selectedMode, 'electronic');
  render().setSelectedMode('cash');
  assert.equal(render().selectedMode, 'cash', 'cash is only an explicit choice');
  stored = { bookingPaymentOrderNumber: 'already-started' };
  render().setSelectedMode('cash');
  assert.equal(render().selectedMode, 'electronic');
  booking = { id: 'b', paymentMode: 'points' }; stored = undefined;
  assert.equal(render().selectedMode, 'points');
  hooks.unmount();
});

test('payment status polling survives cache rerenders, cancels reads in background and unlocks on resume', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hooks = hookHarness(), pending = [], busy = [], completions = [];
  let checks = 0, aborted = 0;
  const state = { isAuthenticated: true, isAppActive: true, isResumeReady: true, arrivalBooking: { id: 'a' },
    activeStoredState: { bookingPaymentOrderNumber: 'order', requiredActionAt: 'date' },
    activeBookingIdRef: { current: null }, user: {},
    setSelectedChannel() {}, setPaymentPhone() {}, setStatusMessage() {}, setPaymentError() {},
    persistBookingState() {}, setIsCheckingPayment: value => busy.push(value),
    checkBookingPaymentStatus: () => { checks++; const task = gate(); pending.push(task);
      return { unwrap: () => task.promise, abort: () => { aborted++; } }; },
  };
  let completion = { handleCompletedBookingPayment: async response => { completions.push(response); return true; } };
  const { useArrivalPaymentMonitoring } = loader({ react: hooks.react, 'expo-linking': linking })('hooks/arrival-payment/useArrivalPaymentMonitoring.ts');
  const render = () => hooks.render(() => useArrivalPaymentMonitoring({ state, completion, provider: {} }));
  render();
  for (let i = 0; i < 200; i++) {
    completion = { ...completion }; state.arrivalBooking = { id: 'a', updatedAt: i }; render();
  }
  assert.equal(checks, 1);
  t.mock.timers.tick(60_000);
  assert.equal(checks, 1, 'a slow request is single-flight');
  state.isAppActive = false; render();
  assert.equal(aborted, 1); assert.equal(busy.at(-1), false);
  state.isAppActive = true; render();
  assert.equal(checks, 2); assert.equal(busy.at(-1), true);
  pending[0].resolve({ payment: { status: 'succeeded' }, booking: { id: 'a' } }); await flush();
  assert.equal(completions.length, 0); assert.equal(busy.at(-1), true, 'old response cannot unlock a new check');
  pending[1].resolve({ payment: { status: 'succeeded' }, booking: { id: 'a' } }); await flush();
  assert.equal(completions.length, 1); assert.equal(busy.at(-1), false);
  hooks.unmount(); const count = checks; t.mock.timers.tick(120_000); assert.equal(checks, count);
});

test('confirmation is immediate on a slow network and a stale cash list never replaces electronic success', async () => {
  const hooks = hookHarness(), refresh = gate(); let summary = null;
  const source = { id: 'a', status: 'completed', paymentMode: 'electronic', paymentStatus: 'succeeded', paymentAmount: 2000 };
  const { useArrivalPaymentCompletion } = loader({ react: hooks.react, 'expo-linking': linking })('hooks/arrival-payment/useArrivalPaymentCompletion.ts');
  const api = hooks.render(() => useArrivalPaymentCompletion({
    isSessionCurrent: () => true, bookings: [{ ...source, paymentMode: 'cash' }], paymentHistory: [],
    refetchBookings: () => refresh.promise, refetchWallet: () => refresh.promise, refetchPaymentHistory: () => refresh.promise,
    persistBookingState() {}, setPaymentError() {},
    setCompletionSummary: next => { summary = typeof next === 'function' ? next(summary) : next; },
  }));
  await api.showCompletionSummary(source);
  assert.equal(summary.mode, 'electronic'); assert.equal(summary.amount, 2000);
  summary = null; // User closed it while non-critical reads were still in flight.
  refresh.resolve({ data: undefined }); await flush();
  assert.equal(summary, null, 'late enrichment must not reopen a dismissed panel'); hooks.unmount();
});

test('cash mode update is described as instructions, not as a confirmed collection', () => {
  const { buildPaymentCompletionSummary } = loader({ 'expo-linking': linking })('features/arrival-payment/buildPaymentCompletionSummary.ts');
  const result = buildPaymentCompletionSummary({ id: 'a', status: 'completed', paymentMode: 'cash', paymentAmount: 2000,
    paymentStatus: 'not_required' }, undefined, [], {});
  assert.equal(result.cashInstructions, true);
  assert.doesNotMatch(result.driverNotice, /confirmé le paiement/);
});

test('local payment references are merged and written in order, including late responses for the original account', async () => {
  const hooks = hookHarness(), write = gate(), saves = [];
  const { usePaymentPersistence } = loader({ react: hooks.react, 'expo-linking': linking,
    '@react-native-async-storage/async-storage': {
      getItem: async () => null,
      setItem: (key, json) => { saves.push({ key, value: JSON.parse(json) }); return saves.length === 1 ? write.promise : Promise.resolve(); },
    },
  })('hooks/arrival-payment/usePaymentPersistence.ts');
  const render = () => hooks.render(() => usePaymentPersistence('original-user', true));
  render(); await flush(); const api = render();
  api.persistBookingState('a', { bookingPaymentOrderNumber: 'order-a' });
  api.persistBookingState('b', { walletTopUpOrderNumber: 'order-b' }); await flush();
  assert.equal(saves.length, 1);
  hooks.unmount(); assert.equal(api.isSessionCurrent(), false);
  write.resolve(); await flush();
  assert.equal(saves[1].value.a.bookingPaymentOrderNumber, 'order-a');
  assert.equal(saves[1].value.b.walletTopUpOrderNumber, 'order-b');
  api.persistBookingState('a', { bookingPaymentUrl: 'https://example.com/payment' }); await flush();
  assert.match(saves[2].key, /original-user/);
});

test('one foreground reconciliation runs before showing cached arrival data; rerenders do not refetch', async () => {
  const hooks = hookHarness(); let active = true, calls = 0; const tasks = [];
  const { useArrivalPaymentRefresh } = loader({ react: hooks.react })('hooks/arrival-payment/useArrivalPaymentRefresh.ts');
  const render = () => hooks.render(() => useArrivalPaymentRefresh(active, () => { calls++; const task = gate(); tasks.push(task); return task.promise; }));
  assert.equal(render(), false); await flush();
  for (let i = 0; i < 100; i++) render();
  assert.equal(calls, 1);
  active = false; render(); active = true; assert.equal(render(), false); await flush();
  tasks[0].resolve(); await flush(); assert.equal(render(), false);
  tasks[1].resolve(); await flush(); assert.equal(render(), true); hooks.unmount();
});

test('an unpaid electronic booking takes priority over a more recently updated cash booking', () => {
  const { selectArrivedPaymentBooking } = loader({ 'expo-linking': linking })('features/arrival-payment/paymentModel.ts');
  const now = Date.now();
  const bookings = [
    { id: 'cash', status: 'completed', paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: 2000, updatedAt: new Date(now).toISOString() },
    { id: 'electronic', status: 'completed', paymentMode: 'electronic', paymentStatus: 'pending', paymentAmount: 2000, updatedAt: new Date(now - 1000).toISOString() },
  ];
  assert.equal(selectArrivedPaymentBooking(bookings, {}, now).id, 'electronic');
});

test('a paid booking remains pinned until closed, then older cash reminders stay collapsed', () => {
  const hooks = hookHarness(); const now = new Date().toISOString();
  let storedState = {}, bookings = [
    { id: 'electronic', status: 'completed', paymentMode: 'electronic', paymentStatus: 'pending', paymentAmount: 2000, updatedAt: now },
    { id: 'cash', status: 'completed', paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: 2000, updatedAt: now },
  ];
  const mutation = () => [() => {}, { isLoading: false }];
  const persistBookingState = (id, patch) => { storedState = { ...storedState, [id]: { ...storedState[id], ...patch } }; };
  const { useArrivalPaymentState } = loader({ react: hooks.react, 'expo-linking': linking,
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    './useArrivalPaymentRefresh': { useArrivalPaymentRefresh: () => true },
    './useNearArrivalPayment': { useNearArrivalPayment: () => null },
    './usePaymentPersistence': { usePaymentPersistence: () => ({ storedState, isStoredStateLoaded: true, persistBookingState, isSessionCurrent: () => true }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-router': { useRouter: () => ({}) },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: fn => fn({ trips: { interruptionChoice: null } }) },
    '@/store/selectors': { selectIsAuthenticated: () => true, selectUser: () => ({ id: 'user' }) },
    '@/features/trip/interruptionChoice': { getPassengerInterruptionChoice: () => null },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: bookings, refetch() {} }),
      useInitiateBookingPaymentMutation: mutation, useUpdateBookingPaymentModeMutation: mutation,
      useLazyCheckBookingPaymentStatusQuery: mutation },
    '@/store/api/paymentApi': { useGetPaymentHistoryQuery: () => ({ data: [], refetch() {} }) },
    '@/store/api/walletApi': { useGetMyWalletQuery: () => ({ refetch() {} }), useInitiateWalletTopUpMutation: mutation,
      useLazyCheckWalletTopUpStatusQuery: mutation },
  })('hooks/arrival-payment/useArrivalPaymentState.ts');
  const render = () => hooks.render(() => useArrivalPaymentState());
  const first = render(); assert.equal(first.arrivalBooking.id, 'electronic');
  first.activeBookingIdRef.current = 'electronic';
  bookings = [bookings[1], { ...bookings[0], paymentStatus: 'succeeded' }];
  assert.equal(render().arrivalBooking.id, 'electronic');
  render().acknowledgeBooking('electronic');
  assert.equal(render().arrivalBooking.id, 'cash'); assert.equal(render().isPaymentDeferred, true);
  render().resumePayment(); assert.equal(render().isPaymentDeferred, false);
  hooks.unmount();
});

test('points settlement stays single-flight across a foreground/background transition', async () => {
  const hooks = hookHarness(), pending = gate(); let calls = 0, alive = true, summaries = 0;
  const { useArrivalPaymentProvider } = loader({ react: hooks.react, 'expo-linking': linking,
    'expo-web-browser': {},
  })('hooks/arrival-payment/useArrivalPaymentProvider.ts');
  const render = () => hooks.render(() => useArrivalPaymentProvider({ isSessionCurrent: () => alive,
    updatePaymentMode: () => { calls++; return { unwrap: () => pending.promise }; },
    showCompletionSummary: async () => { summaries++; }, setStatusMessage() {}, setPaymentError() {},
  }));
  const first = render().settleWithPoints('a'); const second = render().settleWithPoints('a');
  assert.equal(calls, 1); assert.equal(first, second);
  alive = false;
  pending.resolve({ id: 'a', paymentStatus: 'succeeded' }); await first;
  assert.equal(summaries, 0);
  await render().settleWithPoints('a'); assert.equal(calls, 1, 'no new debit after session end'); hooks.unmount();
});

test('resuming a server-confirmed points payment clears old references without charging again', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hooks = hookHarness(); let summaries = 0, patches = 0;
  const state = { isAuthenticated: true, isAppActive: true, isResumeReady: true,
    arrivalBooking: { id: 'a', paymentStatus: 'succeeded', paymentMode: 'points' },
    activeBookingIdRef: { current: 'a' }, activeStoredState: { requiredActionAt: 'date', walletTopUpOrderNumber: 'old' },
    persistBookingState: (_id, patch) => { patches++; assert.equal(patch.walletTopUpOrderNumber, null); },
    setIsCheckingPayment() {}, setStatusMessage() {},
    checkWalletTopUpStatus: () => assert.fail('no extra provider status read needed'),
  };
  const { useArrivalPaymentMonitoring } = loader({ react: hooks.react, 'expo-linking': linking })('hooks/arrival-payment/useArrivalPaymentMonitoring.ts');
  hooks.render(() => useArrivalPaymentMonitoring({ state, provider: { settleWithPoints: () => assert.fail('already paid') },
    completion: { showCompletionSummary: async () => { summaries++; } } }));
  await flush(); assert.equal(summaries, 1); assert.equal(patches, 1); hooks.unmount();
});
