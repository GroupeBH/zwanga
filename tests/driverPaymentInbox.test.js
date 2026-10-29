const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { paymentInbox, boundedSeenPaymentNotices } = load('features/driver-payments/paymentInbox.ts');
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const row = { notificationId: id(1), driverId: 'driver-1', role: 'driver', tripId: id(2), bookingId: id(3),
  type: 'driver_booking_payment_confirmed', amount: 800, currency: 'CDF', paymentMode: 'points' };
const snapshot = (notices = [row], userId = 'driver-1') => ({ userId, notices });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('REST receipts validate ownership, amounts and modes; partial tokens do not imply cash received', () => {
  const receipt = paymentInbox(snapshot(), 'driver-1')[0];
  assert.equal(receipt.amount, 800);
  assert.equal(receipt.key, `booking-payment:${id(3)}`);
  assert.throws(() => paymentInbox(snapshot(), 'other-driver'));
  assert.throws(() => paymentInbox(snapshot(Array(21).fill(row)), 'driver-1'));
  for (const invalid of [{ driverId: 'other-driver' }, { amount: NaN }, { amount: 0 }, { amount: '800' },
    { currency: null }, { currency: 'invalid' }, { role: 'passenger' }, { tripId: '../bad' },
    { type: 'booking_response' }, { paymentMode: 'cash' }, { partial: true, cashRemainder: -1 }]) {
    assert.deepEqual(paymentInbox(snapshot([{ ...row, ...invalid }]), 'driver-1'), []);
  }
  const partial = paymentInbox(snapshot([{ ...row, partial: true, amount: 580, cashRemainder: 3920 }]), 'driver-1')[0];
  assert.equal(partial.key, `booking-payment:${id(3)}:tokens`);
  assert.equal(partial.cashReceived, false);
  const voice = load('features/arrival-payment/paymentAnnouncement.ts').driverPaymentAnnouncement(partial);
  assert.match(voice.text, /580 francs congolais/);
  assert.match(voice.text, /3\s920 francs congolais/);
  const cash = paymentInbox(snapshot([{ ...row, type: 'cash_payment_confirmed', paymentMode: 'cash' }]), 'driver-1')[0];
  assert.equal(cash.cashReceived, true);
  assert.equal(cash.key, `booking-payment:${id(3)}:cash`);
});

test('seen receipts stay bounded and malformed storage cannot suppress valid receipts', () => {
  assert.deepEqual(boundedSeenPaymentNotices(['wrong']), {});
  assert.deepEqual(boundedSeenPaymentNotices({ garbage: '2026-10-29', 'booking-payment:bad': 'no-date' }), {});
  const entries = Object.fromEntries(Array.from({ length: 505 }, (_, index) => [`booking-payment:${index}`, new Date(index * 1000).toISOString()]));
  const bounded = boundedSeenPaymentNotices(entries);
  assert.equal(Object.keys(bounded).length, 500);
  assert.ok(bounded['booking-payment:504']);
  assert.equal(bounded['booking-payment:0'], undefined);
});

test('socket and push invalidate the same REST receipt feed without generating an incoming ride', () => {
  const { parseRideRealtimeEvent } = load('features/notifications/rideRealtime.ts');
  const { rideRealtimeTags } = load('features/notifications/rideRealtimeRefresh.ts');
  const event = parseRideRealtimeEvent({ kind: 'payment', recipientId: id(4), eventId: id(1), bookingId: id(3), amount: 999999 });
  assert.equal(event.kind, 'payment');
  assert.equal(event.amount, undefined, 'socket is a hint, never a financial receipt');
  assert.ok(rideRealtimeTags(event).some(tag => tag.type === 'Notification' && tag.id === 'DRIVER_PAYMENTS'));
  assert.ok(rideRealtimeTags({ kind: 'reconnected' }).some(tag => tag.id === 'DRIVER_PAYMENTS'));
  const push = load('features/notifications/notificationEffects.ts').notificationEffects(row);
  assert.ok(push.tags.includes('Notification'));
  assert.equal(push.href.params.id, row.tripId);
});

test('real RTK receipt cache refetches on socket hints and rejects responses for another account', async () => {
  const { createApi } = require('@reduxjs/toolkit/query');
  const { configureStore } = require('@reduxjs/toolkit');
  let response = snapshot([]), calls = 0;
  const baseApi = createApi({ reducerPath: 'receiptTest', tagTypes: ['Notification', 'AccountActivity', 'DriverSettlement'],
    baseQuery: async url => { calls++; assert.equal(url, '/notifications/driver-payments'); return { data: response }; }, endpoints: () => ({}) });
  const { driverPaymentApi } = loader({ './baseApi': { baseApi } })('store/api/driverPaymentApi.ts');
  const store = configureStore({ reducer: { receiptTest: baseApi.reducer }, middleware: defaults => defaults().concat(baseApi.middleware) });
  const handle = store.dispatch(driverPaymentApi.endpoints.getDriverPaymentNotices.initiate('driver-1'));
  try {
    assert.deepEqual(await handle.unwrap(), []);
    response = snapshot();
    store.dispatch(baseApi.util.invalidateTags(load('features/notifications/rideRealtimeRefresh.ts').rideRealtimeTags({ kind: 'payment' })));
    await tick(); await tick();
    assert.equal(calls, 2);
    assert.equal(driverPaymentApi.endpoints.getDriverPaymentNotices.select('driver-1')(store.getState()).data[0].amount, 800);
    const other = store.dispatch(driverPaymentApi.endpoints.getDriverPaymentNotices.initiate('driver-2'));
    await assert.rejects(other.unwrap(), error => error.status === 'CUSTOM_ERROR'); other.unsubscribe();
    assert.equal(driverPaymentApi.endpoints.getDriverPaymentNotices.select('driver-2')(store.getState()).data, undefined);
  } finally { handle.unsubscribe(); store.dispatch(baseApi.util.resetApiState()); }
});

test('REST polling is foreground-only, speeds up without socket and acknowledges only dismissed notices', async t => {
  let now = 100_000;
  t.mock.method(Date, 'now', () => now);
  const hooks = hookHarness(); let active = true, online = true, connected = true, options, ackCount = 0;
  let read = { currentData: paymentInbox(snapshot(), 'driver-1'), fulfilledTimeStamp: 1 };
  let shouldFail = false;
  const ack = () => { ackCount++; return { unwrap: () => shouldFail ? Promise.reject(Error('offline')) : Promise.resolve({ updated: 1 }) }; };
  const { useDriverPaymentInbox } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => active },
    '@/store/hooks': { useAppSelector: () => online }, './useRideSocketConnected': { useRideSocketConnected: () => connected },
    '@/store/api/driverPaymentApi': { useGetDriverPaymentNoticesQuery: (_id, opts) => { options = opts; return read; } },
    '@/store/api/notificationApi': { useMarkNotificationsAsReadMutation: () => [ack] },
  })('hooks/notifications/useDriverPaymentInbox.ts');
  const empty = {}, seen = { [`booking-payment:${id(3)}`]: '2026-10-29' };
  const render = (dismissed = empty) => hooks.render(() => useDriverPaymentInbox('driver-1', true, dismissed));
  render(); assert.equal(options.pollingInterval, 60000); assert.equal(ackCount, 0);
  connected = false; render(); assert.equal(options.pollingInterval, 15000);
  active = false; render(seen); assert.equal(options.skip, true); assert.equal(options.pollingInterval, 0); assert.equal(ackCount, 0);
  active = true; online = false; render(seen); assert.equal(options.skip, true); assert.equal(ackCount, 0);
  online = true; shouldFail = true; render(seen); await tick(); assert.equal(ackCount, 1);
  shouldFail = false; read = { ...read, fulfilledTimeStamp: 2 }; render(seen); await tick(); assert.equal(ackCount, 1);
  now += 15_000; read = { ...read, fulfilledTimeStamp: 3 }; render(seen); await tick(); assert.equal(ackCount, 2);
  read = { data: read.currentData }; assert.deepEqual(render().notices, [], 'old account data is not currentData');
  read = { error: { status: 500 } }; render(); assert.equal(render().legacy, false);
  read = { error: { status: 404 } }; render(); assert.equal(render().legacy, true);
  hooks.unmount();
});

test('receipt modal works without recent trips, queues payments, dismisses once and hides on account/background change', async () => {
  const React = require('react'), hooks = hookHarness();
  let active = true, user = { id: 'driver-1', role: 'driver' }, seen, spoken, tripQuerySkipped;
  const notices = paymentInbox(snapshot([row, { ...row, bookingId: id(5), notificationId: id(6), amount: 1000 }]), 'driver-1');
  const Component = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', StyleSheet: { create: x => x, hairlineWidth: 1 } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({ push() {} }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => { throw Error('storage unavailable'); } },
    '@/features/navigation/RideModal': { RideModal: 'Modal' }, '@/hooks/useAppIsActive': { useAppIsActive: () => active },
    '@/store/selectors': { selectUser: () => user, selectIsAuthenticated: () => true },
    '@/store/hooks': { useAppSelector: fn => fn() },
    '@/store/api/tripApi': { useGetMyActivityTripsQuery: (_arg, options) => { tripQuerySkipped = options.skip; return { data: [] }; } },
    '@/hooks/notifications/usePaymentAnnouncement': { usePaymentAnnouncement: (message, visible) => { spoken = { message, visible }; } },
    '@/hooks/notifications/useDriverPaymentInbox': { useDriverPaymentInbox: (_user, _enabled, dismissed) => { seen = dismissed; return { notices: user.id === 'driver-1' ? notices : [], legacy: false }; } },
  })('components/DriverPaymentNoticeCoordinator.tsx').DriverPaymentNoticeCoordinator;
  const render = () => hooks.render(Component);
  render(); await tick(); render(); let tree = render();
  assert.equal(tripQuerySkipped, true); assert.equal(tree.props.visible, true);
  assert.match(spoken.message.text, /800 francs congolais/); assert.equal(seen[notices[0].key], undefined);
  tree.props.onRequestClose(); render(); tree = render(); await tick();
  assert.ok(seen[notices[0].key]); assert.match(spoken.message.text, /1\s000 francs congolais/);
  assert.equal(tree.props.visible, true, 'next unread receipt is queued even if storage fails');
  active = false; assert.equal(render().props.visible, false);
  active = true; assert.equal(render().props.visible, true);
  user = { id: 'driver-2', role: 'driver' }; assert.equal(render().props.visible, false);
  await tick(); render(); assert.equal(render().props.visible, false);
  hooks.unmount();
});
