const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function environment() {
  const hooks = hookHarness(), queries = [], refreshes = [];
  const env = { hooks, queries, refreshes, user: { id: 'passenger' },
    trip: { id: 'trip', driverId: 'owner', status: 'ongoing', passengers: [{ id: 'passenger', name: 'Passager' }] },
    ownBookings: [{ id: 'mine', tripId: 'trip', passengerId: 'passenger', status: 'completed' },
      { id: 'other-trip-booking', tripId: 'other-trip', passengerId: 'passenger', status: 'completed' }],
    driverBookings: [{ id: 'all-bookings', tripId: 'trip', passengerId: 'someone-else', status: 'completed' }],
    listedTrips: [] };
  const query = (name, data, options) => {
    queries.push({ name, options });
    return { data, isLoading: false, refetch: () => {
      assert.equal(Boolean(options.skip), false, 'must not refetch an uninitialised/unauthorised query');
      refreshes.push(name); return { data };
    } };
  };
  const mocks = {
    react: hooks.react,
    '../../features/trip-detail/tripDetailModel': { pointToLatLng: () => null },
    'react-native': { StyleSheet: { create: value => value }, useWindowDimensions: () => ({ height: 800 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@react-navigation/native': { useIsFocused: () => true },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({ id: 'trip' }) },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({}) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/store/hooks': { useAppSelector: selector => selector({}) },
    '@/store/selectors': { selectUser: () => env.user, selectConversations: () => [], selectTripById: () => () => undefined },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({ data: env.trip }),
      useGetMyActivityTripsQuery: () => ({ data: env.listedTrips }) },
    '@/store/api/bookingApi': {
      useGetTripBookingsQuery: (_id, options) => query('driver', env.driverBookings, options),
      useGetMyBookingsQuery: (_id, options) => query('passenger', env.ownBookings, options),
    },
    '@/store/api/reviewApi': { useCreateReviewMutation: () => [() => {}, {}] },
  };
  return Object.assign(env, { load: loader(mocks), lastQuery: name => queries.filter(item => item.name === name).at(-1) });
}

test('passenger trip detail uses only own bookings and never refetches the driver-only endpoint', () => {
  const env = environment();
  const { useTripDetailData } = env.load('hooks/trip-detail/useTripDetailData.ts');
  let view = env.hooks.render(useTripDetailData);
  assert.equal(env.lastQuery('driver').options.skip, true);
  assert.deepEqual(view.tripBookings.map(booking => booking.id), ['mine']);
  view.refetchTripBookings(); assert.deepEqual(env.refreshes, []);
  view.refetchMyBookings(); assert.deepEqual(env.refreshes, ['passenger']);
  env.user = { id: 'owner' }; view = env.hooks.render(useTripDetailData);
  assert.equal(env.lastQuery('driver').options.skip, false);
  assert.deepEqual(view.tripBookings, env.driverBookings);
  view.refetchTripBookings(); assert.equal(env.refreshes.at(-1), 'driver');
  env.hooks.unmount();
});

test('unresolved trip ownership does not fetch driver bookings on detail or rating screens', () => {
  for (const file of ['trip-detail/useTripDetailData', 'rating/useRatingData']) {
    const env = environment(); env.trip = undefined;
    const module = env.load('hooks/' + file + '.ts');
    const hook = module[file.split('/')[1]];
    const view = env.hooks.render(hook);
    assert.equal(env.lastQuery('driver').options.skip, true);
    if (view.refetchTripBookings) view.refetchTripBookings(); else view.refetchBookings();
    assert.deepEqual(env.refreshes, []); env.hooks.unmount();
  }
});

test('rating retains passenger identity and driver/passenger targets without the forbidden bookings list', () => {
  const env = environment(); const { useRatingData } = env.load('hooks/rating/useRatingData.ts');
  let view = env.hooks.render(useRatingData);
  assert.equal(view.isTripPassenger, true); assert.equal(view.isTripDriver, false);
  assert.equal(env.lastQuery('driver').options.skip, true);
  assert.equal(env.lastQuery('passenger').options.skip, false);
  assert.equal(view.passengers.some(passenger => passenger.id === env.user.id), false);
  view.refetchBookings(); assert.deepEqual(env.refreshes, ['passenger']);
  env.user = { id: 'owner' }; view = env.hooks.render(useRatingData);
  assert.equal(env.lastQuery('driver').options.skip, false);
  assert.equal(env.lastQuery('passenger').options.skip, true);
  view.refetchBookings(); assert.equal(env.refreshes.at(-1), 'driver'); env.hooks.unmount();
});

test('home rejects stale tracked driver roles and foreign cached trips even on a driver account', () => {
  const env = environment(); const { useHomeDriverActivity } = env.load('hooks/home/useHomeDriverActivity.ts');
  const props = { isDriver: true, isFocused: true, currentUser: env.user,
    trackedTripInfo: { role: 'driver', tripId: 'trip' } };
  let view = env.hooks.render(() => useHomeDriverActivity(props));
  assert.equal(view.ongoingDriverTrip, null);
  assert.ok(env.queries.every(query => query.options.skip === true));
  env.trip = { ...env.trip, driverId: env.user.id }; env.queries.length = 0;
  view = env.hooks.render(() => useHomeDriverActivity(props));
  assert.equal(view.ongoingDriverTrip.id, 'trip');
  assert.equal(env.queries[0].options.skip, false);
  props.currentUser = null; env.queries.length = 0;
  view = env.hooks.render(() => useHomeDriverActivity(props));
  assert.equal(view.ongoingDriverTrip, null);
  assert.ok(env.queries.every(query => query.options.skip === true)); env.hooks.unmount();
});
