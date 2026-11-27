const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { driverPaymentReminder, requestCashToCollect } = loader()('features/driver-navigation/driverPaymentReminder.ts');
const now = Date.now();
const booking = { id: 'b', tripId: 't', passengerId: 'p', status: 'accepted', pickedUp: true,
  paymentMode: 'electronic', paymentStatus: 'pending', paymentAmount: 3000 };
const stop = { id: 's', type: 'dropoff', location: { lat: -4.32, lng: 15.3 }, booking };
const fix = distance => ({ timestamp: now, coords: { latitude: -4.32 + distance / 6371000 * 180 / Math.PI, longitude: 15.3, accuracy: 10 } });
const trip = { id: 't', driverId: 'd', status: 'ongoing' };
test('500m driver reminder covers requested and published trips and both digital modes', () => {
  for (const tripRequestId of [undefined, 'r']) for (const paymentMode of ['electronic', 'points']) {
    const row = { ...booking, paymentMode };
    assert.equal(driverPaymentReminder({ ...trip, tripRequestId }, 'd', [row], stop, fix(500), now), row);
    assert.equal(driverPaymentReminder(trip, 'd', [row], stop, fix(501), now), null);
  }
});
test('uses live booking data, refuses cash, paid, unboarded, wrong owner and old/inaccurate GPS', () => {
  for (const patch of [{ paymentMode: 'cash' }, { paymentStatus: 'succeeded' }, { pickedUp: false },
    { droppedOff: true }, { paymentAmount: 0 }, { interruptionFareLocked: true }])
    assert.equal(driverPaymentReminder(trip, 'd', [{ ...booking, ...patch }], stop, fix(100), now), null);
  assert.equal(driverPaymentReminder(trip, 'other', [booking], stop, fix(100), now), null);
  assert.equal(driverPaymentReminder(trip, 'd', [booking], stop, fix(100), now + 100000), null);
  assert.equal(driverPaymentReminder(trip, 'd', [booking], stop, { ...fix(100), coords: { ...fix(100).coords, accuracy: 150 } }, now), null);
});
test('payment request notification opens the specific passenger ride without charging', () => {
  const { notificationEffects } = loader()('features/notifications/notificationEffects.ts');
  const result = notificationEffects({ type: 'booking_payment_requested', bookingId: 'b' });
  assert.ok(result.tags.includes('Booking'));
  assert.deepEqual(result.href, { pathname: '/booking/navigate/[id]', params: { id: 'b' } });
});

test('arrival retains digital collection and exposes cash receipt before a request can close', () => {
  const arrived = { ...booking, status: 'completed', droppedOff: true };
  assert.equal(driverPaymentReminder(trip, 'd', [arrived], undefined, null, now), arrived);
  const cash = { ...arrived, paymentMode: 'cash' };
  assert.equal(requestCashToCollect({ ...trip, tripRequestId: 'r' }, 'd', [cash]), cash);
  assert.equal(requestCashToCollect(trip, 'd', [cash]), null);
  assert.equal(requestCashToCollect({ ...trip, tripRequestId: 'r' }, 'd', [{ ...cash, cashReceivedAt: 'date' }]), null);
});

test('driver invitation button is single-flight and cannot debit or apply success to another session', async () => {
  const React = require('react');
  const { hookHarness } = require('./helpers/hookHarness.cjs');
  const hooks = hookHarness(); const calls = []; let resolve, version = 1;
  const task = new Promise(done => { resolve = done; });
  const { DriverNearArrivalPaymentNotice: Notice } = loader({
    react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: s => s } },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/store/api/bookingApi': { useGetBookingPaymentRequestQuery: () => ({}), useRequestBookingPaymentMutation: () => [id => {
      calls.push(id); return { unwrap: () => task };
    }] },
  })('features/driver-navigation/DriverNearArrivalPaymentNotice.tsx');
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  const render = () => hooks.render(() => Notice({ booking, active: true }));
  const button = all(render()).find(n => n.type === 'Button');
  button.props.onPress(); button.props.onPress();
  assert.deepEqual(calls, ['b'], 'only booking ID is sent, never an amount or payment credentials');
  assert.equal(all(render()).find(n => n.type === 'Button').props.disabled, true);
  version++; render(); resolve({ bookingId: 'b', requestedAt: new Date().toISOString() });
  await new Promise(done => setImmediate(done));
  assert.ok(all(render()).find(n => n.type === 'Button'), 'old response does not mark the new session as notified');
  hooks.unmount();
});
