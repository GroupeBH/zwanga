const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('cash receipt mutation uses RTK, checks the shown fare and invalidates related caches only on success', () => {
  const { buildCashReceiptEndpoints } = loader()('store/api/booking/cashReceipt.endpoints.ts');
  const endpoint = buildCashReceiptEndpoints({ mutation: value => value }).confirmCashReceipt;
  const query = endpoint.query({ bookingId: 'booking', amount: 2000, currency: 'CDF' });
  assert.equal(query.method, 'PUT'); assert.equal(query.url, '/bookings/booking/cash-receipt');
  assert.deepEqual(query.body, { amount: 2000, currency: 'CDF' });
  assert.deepEqual(endpoint.invalidatesTags(undefined), []);
  assert.ok(endpoint.invalidatesTags({ id: 'booking', tripId: 'trip' }).includes('AccountActivity'));
  const mapped = endpoint.transformResponse({ id: 'booking', cashReceivedAt: '2026-09-22T12:00:00Z',
    cashReceivedByDriverId: 'driver', cashReceivedAmount: '2000' });
  assert.equal(mapped.cashReceivedByDriverId, 'driver'); assert.equal(mapped.cashReceivedAmount, '2000');
});

test('driver activity mapping derives eligibility from every booking, without another HTTP call', () => {
  const { mapActivityTrip } = loader()('store/api/trip/activityTripMapper.ts');
  const booking = { id: 'booking', status: 'completed', numberOfSeats: 2, pickedUp: true, droppedOff: true,
    droppedOffAt: '2026-09-22T12:00:00Z', paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: '2000',
    cashReceivedAt: '2026-09-22T12:01:00Z', cashReceivedByDriverId: 'driver', cashReceivedAmount: '2000' };
  const trip = { id: 'trip', driverId: 'driver', status: 'completed', completedAt: '2026-09-22T12:00:00Z',
    pricePerSeat: 5000, availableSeats: 0, bookings: [booking] };
  assert.equal(mapActivityTrip(trip).reviewCompletion.role, 'driver');
  assert.equal(mapActivityTrip({ ...trip, bookings: [booking, { ...booking, id: 'second', cashReceivedAt: null }] }).reviewCompletion, null);
  assert.equal(mapActivityTrip(trip).paymentNotices.length, 0, 'cash receipt never becomes an electronic-payment notice');
});

const buttons = element => {
  if (!React.isValidElement(element)) return [];
  return [...(element.type === 'Button' ? [element] : []), ...React.Children.toArray(element.props.children).flatMap(buttons)];
};
test('cash UI requires explicit confirmation, blocks rapid taps and does not update after unmount', async () => {
  const hooks = hookHarness(); let calls = 0, resolve;
  const pending = new Promise(ok => { resolve = ok; });
  const native = { StyleSheet: { create: value => value }, Text: 'Text', View: 'View', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner' };
  const { ConfirmCashReceipt } = loader({ react: hooks.react, 'react-native': native,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/hooks': { useAppSelector: () => 'driver' },
    '@/store/api/bookingApi': { useConfirmCashReceiptMutation: () => [() => { calls++; return { unwrap: () => pending }; }, { isLoading: false }] },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Réessayez.' },
  })('features/driver-payments/ConfirmCashReceipt.tsx');
  const wrapper = ConfirmCashReceipt({ booking: { id: 'booking', status: 'completed', droppedOff: true, paymentMode: 'cash', paymentAmount: 2000, paymentCurrency: 'CDF' } });
  const render = () => hooks.render(() => wrapper.type(wrapper.props));
  buttons(render()).at(-1).props.onPress(); assert.equal(calls, 0);
  const confirm = buttons(render()).at(-1); confirm.props.onPress(); confirm.props.onPress(); assert.equal(calls, 1);
  hooks.unmount(); resolve({ cashReceivedAt: 'now' }); await pending;
});
