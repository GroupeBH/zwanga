const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader({ 'expo-linking': {} });
const { getBookingFareBreakdown } = load('features/arrival-payment/paymentFare.ts');
const { mapServerBookingToClient } = load('store/api/booking/bookingMapper.ts');
const { buildPaymentCompletionSummary } = load('features/arrival-payment/buildPaymentCompletionSummary.ts');
const discounted = { id: 'booking', tripId: 'trip', passengerId: 'passenger', numberOfSeats: 1,
  status: 'completed', paymentMode: 'points', paymentStatus: 'pending', paymentCurrency: 'CDF',
  grossPaymentAmount: '1450.00', paymentAmount: '580.00', firstTripSubsidyApplied: true,
  passengerPaymentRate: '0.40', zwangaSubsidyAmount: '870.00' };

test('booking mapping retains the server subsidy instead of silently dropping its explanation', () => {
  const booking = mapServerBookingToClient(discounted);
  assert.equal(booking.paymentAmount, '580.00');
  assert.equal(booking.grossPaymentAmount, '1450.00');
  assert.equal(booking.passengerPaymentRate, '0.40');
  assert.equal(booking.firstTripSubsidyApplied, true);
  assert.equal(booking.zwangaSubsidyAmount, '870.00');
  assert.deepEqual(getBookingFareBreakdown(booking), { grossAmount: 1450, subsidyAmount: 870, passengerAmount: 580 });
});

test('the receipt uses the server passenger share once and preserves the fare snapshot for all modes', () => {
  for (const paymentMode of ['points', 'cash', 'electronic']) {
    const booking = mapServerBookingToClient({ ...discounted, paymentMode, paymentStatus: 'succeeded' });
    const summary = buildPaymentCompletionSummary(booking, undefined, [], {});
    assert.equal(summary.amount, 580);
    assert.deepEqual(summary.fareBreakdown, { grossAmount: 1450, subsidyAmount: 870, passengerAmount: 580 });
    booking.paymentAmount = 1450; booking.zwangaSubsidyAmount = 0;
    assert.equal(summary.amount, 580); assert.equal(summary.fareBreakdown.subsidyAmount, 870);
  }
});

test('a multi-seat or distance-adjusted total is neither multiplied again nor reduced a second time', () => {
  assert.deepEqual(getBookingFareBreakdown({ ...discounted, numberOfSeats: 2, grossPaymentAmount: 2900,
    paymentAmount: 1160, zwangaSubsidyAmount: 1740 }), { grossAmount: 2900, subsidyAmount: 1740, passengerAmount: 1160 });
  assert.deepEqual(getBookingFareBreakdown({ ...discounted, interruptionFareLocked: true, grossPaymentAmount: 500,
    paymentAmount: 200, zwangaSubsidyAmount: 300 }), { grossAmount: 500, subsidyAmount: 300, passengerAmount: 200 });
  assert.deepEqual(getBookingFareBreakdown({ ...discounted, grossPaymentAmount: 1000.03,
    paymentAmount: 400.01, zwangaSubsidyAmount: 600.02 }), { grossAmount: 1000.03, subsidyAmount: 600.02, passengerAmount: 400.01 });
});

test('no promotion is invented for missing, invalid, stale, free or non-subsidized server data', () => {
  for (const patch of [{ firstTripSubsidyApplied: false }, { firstTripSubsidyApplied: undefined },
    { grossPaymentAmount: null }, { grossPaymentAmount: undefined }, { zwangaSubsidyAmount: '' },
    { zwangaSubsidyAmount: -1 }, { paymentAmount: null }, { paymentAmount: 'NaN' },
    { grossPaymentAmount: Infinity }, { grossPaymentAmount: 1e20 }, { paymentAmount: 1450 },
    { paymentAmount: 0, grossPaymentAmount: 0, zwangaSubsidyAmount: 0 }]) {
    assert.equal(getBookingFareBreakdown({ ...discounted, ...patch }), null, JSON.stringify(patch));
  }
  assert.equal(getBookingFareBreakdown(null), null);
  assert.equal(getBookingFareBreakdown(discounted, null), null, 'arrival synchronization must not display an old promotion');
  assert.equal(getBookingFareBreakdown({ paymentAmount: 580, trip: { pricePerSeat: 1450 } }), null,
    'a smaller fare alone is not evidence of a subsidy');
});

test('the actual payment state converts only the passenger share and distinguishes token coverage from the complement', () => {
  const hooks = hookHarness();
  let booking = mapServerBookingToClient(discounted);
  let otherBookings = [];
  let account = { balance: 20 };
  const store = { trips: { interruptionChoice: null }, rideRecovery: { userId: 'passenger', entries: [] } };
  const mutation = () => [() => assert.fail('rendering or selecting a mode must never charge'), { isLoading: false }];
  const { useArrivalPaymentState } = loader({ react: hooks.react, 'expo-linking': {},
    '@/constants/paymentFeatures': { ZWANGA_POINT_VALUE_CDF: 100 },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    './useArrivalPaymentRefresh': { useArrivalPaymentRefresh: () => true },
    './useNearArrivalPayment': { useNearArrivalPayment: () => null },
    './usePaymentPersistence': { usePaymentPersistence: () => ({ storedState: {}, isStoredStateLoaded: true,
      persistBookingState() {}, isSessionCurrent: () => true }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, 'expo-router': { useRouter: () => ({}) },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: fn => fn(store) },
    '@/store/selectors': { selectIsAuthenticated: () => true, selectUser: () => ({ id: 'passenger' }) },
    '@/features/trip/interruptionChoice': { getPassengerInterruptionChoice: () => null },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: [booking, ...otherBookings], refetch() {} }),
      useInitiateBookingPaymentMutation: mutation, useUpdateBookingPaymentModeMutation: mutation, useLazyCheckBookingPaymentStatusQuery: mutation },
    '@/store/api/paymentApi': { useGetBookingPaymentHistoryQuery: () => ({ data: [], refetch() {} }) },
    '@/store/api/walletApi': { useGetMyWalletQuery: () => ({ data: { account }, refetch() {} }),
      useInitiateWalletTopUpMutation: mutation, useLazyCheckWalletTopUpStatusQuery: mutation },
  })('hooks/arrival-payment/useArrivalPaymentState.ts');
  const render = () => hooks.render(useArrivalPaymentState);
  for (const mode of ['points', 'cash', 'electronic']) {
    render().setSelectedMode(mode);
    const state = render();
    assert.equal(state.paymentAmount, 580); assert.equal(state.requiredPoints, 5.8);
    assert.equal(state.pointsUsed, 5.8); assert.equal(state.amountCoveredByPoints, 580);
    assert.equal(state.moneyComplement, 0);
  }
  account = { balance: 4, reservedCashCommissionBalance: 1 };
  let state = render(); assert.equal(state.pointsUsed, 3); assert.equal(state.amountCoveredByPoints, 300);
  assert.equal(state.missingPoints, 2.8); assert.equal(state.moneyComplement, 280);
  assert.equal(state.amountCoveredByPoints + state.moneyComplement, state.paymentAmount);
  account = { balance: 20 };
  booking = mapServerBookingToClient({ ...discounted, firstTripSubsidyApplied: false, paymentAmount: 1450, zwangaSubsidyAmount: 0 });
  state = render(); assert.equal(state.paymentAmount, 1450); assert.equal(state.requiredPoints, 14.5);
  assert.equal(state.pointsUsed, 14.5); assert.equal(state.amountCoveredByPoints, 1450);
  booking = mapServerBookingToClient({ ...discounted, droppedOffAt: '2026-10-11T10:00:00Z' });
  state.activeBookingIdRef.current = booking.id;
  assert.equal(render().paymentAmount, 580);
  otherBookings = [mapServerBookingToClient({ ...discounted, id: 'next-booking', tripId: 'next-trip',
    droppedOffAt: '2026-10-12T10:00:00Z', firstTripSubsidyApplied: false, paymentAmount: 1450, zwangaSubsidyAmount: 0 })];
  state.submissionBookingIdRef.current = booking.id;
  assert.equal(render().paymentAmount, 580, 'an in-flight payment cannot switch reservations');
  state.submissionBookingIdRef.current = null;
  state = render(); assert.equal(state.arrivalBooking.id, 'next-booking');
  assert.equal(state.paymentAmount, 1450); assert.equal(state.requiredPoints, 14.5);
  hooks.unmount();
});
