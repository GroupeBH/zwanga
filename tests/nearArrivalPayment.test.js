const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const now = Date.parse('2026-09-16T10:00:00Z');
const point = meters => ({ latitude: -4.32 + meters / 6_371_000 * 180 / Math.PI, longitude: 15.3 });
function booking(patch = {}) {
  return { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted', pickedUp: true,
    paymentMode: 'electronic', paymentStatus: 'pending', paymentAmount: 5000,
    passengerDestinationCoordinates: point(0), updatedAt: new Date(now).toISOString(),
    trip: { id: 'trip', status: 'ongoing', arrival: { lat: -4.4, lng: 15.4, hasCoordinates: true } }, ...patch };
}
const policy = loader()('features/arrival-payment/nearArrivalPolicy.ts');

test('the 150-metre threshold uses the passenger destination, not the final stop of the vehicle', () => {
  const value = booking(), date = new Date(now).toISOString();
  assert.equal(policy.isNearPaymentDestination(value, point(150), date, now), true);
  assert.equal(policy.isNearPaymentDestination(value, point(151), date, now), false);
  assert.equal(policy.isNearPaymentDestination(value, point(0), date, now), true);
  assert.equal(policy.isNearPaymentDestination({ ...value, passengerDestinationCoordinates: null }, point(0), date, now), false);
});

test('boarding, ownership and digital payment are required; stale GPS cannot prompt payment', () => {
  const value = booking();
  assert.equal(policy.isOnboardDigitalBooking(value, 'passenger'), true);
  for (const patch of [{ paymentMode: 'cash' }, { pickedUp: false, pickedUpConfirmedByPassenger: true },
    { status: 'cancelled' }, { droppedOff: true }, { interruptionFareLocked: true }, { passengerId: 'other' }]) {
    assert.equal(policy.isOnboardDigitalBooking({ ...value, ...patch }, 'passenger'), false);
  }
  assert.equal(policy.isNearPaymentDestination(value, point(0), new Date(now - 30_001).toISOString(), now), false);
  assert.equal(policy.isNearPaymentDestination(value, point(0), new Date(now + 10_000).toISOString(), now), false);
  assert.equal(policy.isNearPaymentDestination(value, point(NaN), new Date(now).toISOString(), now), false);
});

function app(t, patch = {}) {
  t.mock.method(Date, 'now', () => now);
  const hooks = hookHarness(), listeners = new Set(), progress = new Set();
  const props = { bookings: [booking()], user: 'passenger', enabled: true, stored: {}, snapshot: undefined, live: undefined, ...patch };
  let joins = 0, leaves = 0, reads = 0;
  const refetch = () => { reads++; };
  const { useNearArrivalPayment } = loader({
    react: hooks.react,
    '@/features/arrival-payment/paymentModel': { normalizeAmount: value => value == null ? null : Number(value) },
    '@/store/api/bookingApi': { useGetBookingByIdQuery: () => ({ currentData: props.live, refetch }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({}) },
    '@/hooks/passenger-navigation/useDriverLocationFallback': { useDriverLocationFallback: () => props.snapshot },
    '@/services/trackingSocket': { trackingSocket: {
      subscribeToDriverLocation: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      subscribeToBookingAutoProgress: fn => { progress.add(fn); return () => progress.delete(fn); },
      joinTrip: async () => { joins++; }, leaveTrip: () => { leaves++; },
    } },
  })('hooks/arrival-payment/useNearArrivalPayment.ts');
  const render = () => {
    const useSubject = () => useNearArrivalPayment(props.bookings, props.user, props.enabled, props.stored);
    hooks.render(useSubject);
    return hooks.render(useSubject);
  };
  const emit = (distance, extra = {}) => {
    const coordinate = point(distance);
    listeners.forEach(fn => fn({ tripId: 'trip', coordinates: [coordinate.longitude, coordinate.latitude], updatedAt: new Date(now).toISOString(), ...extra }));
  };
  t.after(() => hooks.unmount());
  return { props, render, emit, hooks, listeners, progress, joins: () => joins, leaves: () => leaves, reads: () => reads };
}

test('crossing 150 metres opens once and GPS jitter does not close the payment sheet', t => {
  const env = app(t);
  assert.equal(env.render(), null);
  env.emit(151); assert.equal(env.render(), null);
  env.emit(150); assert.equal(env.render().id, 'booking');
  for (let i = 0; i < 100; i++) { env.emit(100); env.render(); }
  env.emit(170); assert.equal(env.render().id, 'booking');
  assert.equal(env.joins(), 1, 'GPS updates do not reconnect or create new watchers');
  assert.equal(env.props.bookings[0].status, 'accepted');
  assert.equal(env.props.bookings[0].paymentAmount, 5000);
});

test('HTTP rescue positions and stored passenger positions can trigger the same modal', t => {
  const env = app(t);
  env.render();
  const coordinate = point(149);
  env.props.snapshot = { coordinates: [coordinate.longitude, coordinate.latitude], updatedAt: new Date(now).toISOString() };
  assert.equal(env.render().id, 'booking');
  const stored = app(t, { bookings: [booking({ paymentMode: 'points', passengerLocationCoordinates: point(140), passengerLocationUpdatedAt: new Date(now).toISOString() })] });
  assert.equal(stored.render().id, 'booking');
});

test('deferring suppresses early prompts but not payment at the actual arrival; paid acknowledgements stay suppressed', t => {
  const env = app(t);
  env.render(); env.emit(100); env.render();
  env.props.stored = { booking: { preArrivalDismissedAt: new Date(now).toISOString() } };
  assert.equal(env.render(), null);
  const { selectArrivedPaymentBooking } = loader({ 'expo-linking': {} })('features/arrival-payment/paymentModel.ts');
  assert.equal(selectArrivedPaymentBooking([booking()], env.props.stored, now), null);
  const arrived = booking({ status: 'completed', droppedOff: true });
  assert.equal(selectArrivedPaymentBooking([arrived], env.props.stored, now).id, 'booking');
  env.props.stored.booking.acknowledgedAt = new Date(now).toISOString();
  assert.equal(selectArrivedPaymentBooking([{ ...arrived, paymentStatus: 'succeeded' }], env.props.stored, now), null);
  assert.equal(selectArrivedPaymentBooking([{ ...arrived, paymentMode: 'cash' }], {}, now).id, 'booking');
});

test('unboarded, cash, paid, free and other-account bookings never open an early payment', t => {
  for (const patch of [{ pickedUp: false }, { paymentMode: 'cash' }, { paymentStatus: 'succeeded' },
    { paymentAmount: 0 }, { passengerId: 'other' }]) {
    const env = app(t, { bookings: [booking(patch)] });
    env.render(); env.emit(100);
    assert.equal(env.render(), null);
  }
});

test('backgrounding/account changes release listeners; resuming an in-progress sheet preserves the stored transaction', t => {
  const env = app(t);
  env.render(); env.emit(100); env.render();
  env.props.enabled = false;
  assert.equal(env.render(), null);
  assert.equal(env.listeners.size, 0);
  env.props.enabled = true;
  env.props.stored = { booking: { requiredActionAt: new Date(now).toISOString(), bookingPaymentOrderNumber: 'existing-order' } };
  assert.equal(env.render().id, 'booking');
  assert.equal(env.props.stored.booking.bookingPaymentOrderNumber, 'existing-order');
  env.props.user = 'other';
  assert.equal(env.render(), null);
  assert.equal(env.listeners.size, 0);
  env.hooks.unmount();
});

test('pickup progress refreshes cached boarding state without triggering a payment mutation', t => {
  const env = app(t, { bookings: [booking({ pickedUp: false })] });
  env.render(); env.emit(100); assert.equal(env.render(), null);
  env.progress.forEach(fn => fn({ tripId: 'trip', events: [{ bookingId: 'booking', type: 'pickup_confirmed' }] }));
  assert.equal(env.reads(), 1);
  env.props.live = booking();
  env.render(); env.emit(100);
  assert.equal(env.render().id, 'booking');
});
