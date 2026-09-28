const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('trip detail reads active passenger bookings, history only when needed, and pauses covered queries', async () => {
  const hooks = hookHarness();
  const calls = { trip: [], activity: [], history: [], driver: [], refresh: [] };
  let focused = true;
  let trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
  let user = { id: 'passenger' };
  const data = { activity: [{ id: 'active' }], history: [{ id: 'historical' }], driver: [{ id: 'driver-booking' }] };
  const query = key => (_, options) => {
    calls[key].push(options);
    return {
      data: options.skip ? undefined : data[key],
      refetch: () => { calls.refresh.push(key); return Promise.resolve(); },
    };
  };
  const { useTripDetailData } = loader({
    react: hooks.react,
    '../../features/trip-detail/tripDetailModel': { pointToLatLng: () => null },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true, checkIdentity() {} }) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({ lastKnownLocation: null, requestPermission() {}, stopWatching() {} }) },
    '@/store/api/bookingApi': {
      useGetMyActivityBookingsQuery: query('activity'),
      useGetMyBookingsQuery: query('history'),
      useGetTripBookingsQuery: query('driver'),
    },
    '@/store/api/tripApi': { useGetTripByIdQuery: (_, options) => {
      calls.trip.push(options);
      return { data: trip, refetch: () => Promise.resolve() };
    } },
    '@/store/hooks': { useAppSelector: selector => selector({ trip, user }) },
    '@/store/selectors': {
      selectTripById: () => state => state.trip,
      selectConversations: () => [],
      selectUser: state => state.user,
    },
    '@react-navigation/native': { useIsFocused: () => focused },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    'expo-router': { useLocalSearchParams: () => ({ id: 'trip' }), useRouter: () => ({ replace() {} }) },
    'react-native': { useWindowDimensions: () => ({ height: 800 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  })('hooks/trip-detail/useTripDetailData.ts');
  const render = () => hooks.render(() => useTripDetailData());

  let result = render();
  assert.deepEqual(result.myBookings, data.activity);
  assert.equal(calls.activity.at(-1).skip, false);
  assert.equal(calls.activity.at(-1).pollingInterval, 0);
  assert.equal(calls.history.at(-1).skip, true);
  await result.refetchMyBookings();
  assert.deepEqual(calls.refresh, ['activity']);

  focused = false;
  result = render();
  assert.equal(calls.trip.at(-1).skip, true);
  assert.equal(calls.activity.at(-1).skip, true);
  assert.equal(calls.history.at(-1).skip, true);
  assert.equal(calls.driver.at(-1).skip, true);
  await result.refetchMyBookings();
  assert.deepEqual(calls.refresh, ['activity']);

  focused = true;
  trip = { ...trip, status: 'completed' };
  result = render();
  assert.deepEqual(result.myBookings, data.history);
  assert.equal(calls.history.at(-1).skip, false);
  await result.refetchMyBookings();
  assert.deepEqual(calls.refresh, ['activity', 'history']);

  user = { id: 'driver' };
  render();
  assert.equal(calls.activity.at(-1).skip, true);
  assert.equal(calls.history.at(-1).skip, true);
  assert.equal(calls.driver.at(-1).skip, false);
  hooks.unmount();
});

test('covered trip detail suspends identity and driver-review subscriptions', () => {
  const hooks = hookHarness();
  const calls = { identity: [], reviews: [], average: [] };
  let active = false;
  const mutation = () => [() => Promise.resolve(), { isLoading: false }];
  const { useTripDetailBookingState } = loader({
    react: hooks.react,
    '@/contexts/TutorialContext': { useTutorialGuide: () => ({ shouldShow: false, complete() {} }) },
    '@/store/api/bookingApi': {
      useCancelBookingMutation: mutation,
      useCreateBookingMutation: mutation,
      useInitiateBookingPaymentMutation: mutation,
    },
    '@/store/api/messageApi': {
      useCreateConversationMutation: mutation,
      useLazyListConversationsQuery: mutation,
    },
    '@/store/api/reviewApi': {
      useGetReviewsQuery: (_, options) => { calls.reviews.push(options); return {}; },
      useGetAverageRatingQuery: (_, options) => { calls.average.push(options); return {}; },
    },
    '@/store/api/trackingApi': { useCreateTripShareLinkMutation: mutation },
    '@/store/api/userApi': { useGetKycStatusQuery: (_, options) => {
      calls.identity.push(options); return { refetch() {} };
    } },
    'react-native': {
      InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) },
      Platform: { OS: 'android' },
    },
  })('hooks/trip-detail/useTripDetailBookingState.ts');
  const render = () => hooks.render(() => useTripDetailBookingState({
    trip: { id: 'trip', driverId: 'driver' }, tripId: 'trip',
    isFocused: active, isScreenActive: active,
  }));

  render();
  assert.equal(calls.identity.at(-1).skip, true);
  assert.equal(calls.reviews.at(-1).skip, true);
  assert.equal(calls.average.at(-1).skip, true);
  active = true;
  render();
  assert.equal(calls.identity.at(-1).skip, false);
  assert.equal(calls.reviews.at(-1).skip, false);
  assert.equal(calls.average.at(-1).skip, false);
  hooks.unmount();
});
