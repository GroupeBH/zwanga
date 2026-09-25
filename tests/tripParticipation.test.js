const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { readFileSync } = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { ownsTrip, selectOngoingParticipation } = loader()('features/activity/tripParticipation.ts');
const trip = { id: 'trip', driverId: 'owner', driver: { id: 'owner' }, status: 'ongoing' };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'rider', status: 'accepted', trip, numberOfSeats: 3 };

test('trip ownership requires a nonempty matching ID, never an account role', () => {
  assert.equal(ownsTrip(trip, 'owner'), true);
  for (const userId of ['rider', '', null, undefined]) assert.equal(ownsTrip(trip, userId), false);
  assert.equal(ownsTrip({ driverId: undefined }, undefined), false);
  assert.equal(ownsTrip({ ...trip, driver: { id: 'someone-else' } }, 'owner'), false);
});

test('three reserved seats stay one passenger participation, without changing the account', () => {
  assert.equal(selectOngoingParticipation('rider', [trip], [booking]).bookingId, 'booking');
  assert.equal(selectOngoingParticipation('rider', [trip], [booking]).role, 'passenger');
  assert.equal(selectOngoingParticipation('owner', [trip], [booking]).role, 'driver');
  assert.equal(selectOngoingParticipation(undefined, [trip], [booking]), null);
});

function guard(overrides = {}) {
  const state = { userId: 'rider', tripId: 'trip', currentData: trip, bookings: [booking], ...overrides };
  const hooks = hookHarness();
  const calls = [], routes = [];
  const child = React.createElement('DriverController');
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { ActivityIndicator: 'Spinner', Text: 'Text', TouchableOpacity: 'Button', View: 'View', StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'expo-router': { Redirect: 'Redirect', useLocalSearchParams: () => ({ id: state.tripId }), useRouter: () => ({ replace: x => routes.push(x) }) },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: state.userId ? { id: state.userId, role: 'driver', isDriver: true } : null } }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({ currentData: state.currentData, data: trip,
      error: state.error, isLoading: state.isLoading, isFetching: state.isFetching, refetch() {} }) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: (_, options) => {
      calls.push(options); return { data: state.bookings };
    } },
    '@/hooks/navigation/useOfflineRideData': { useOfflineRideData: (_, live, error) => ({
      data: [401, 403, 404].includes(error?.status) ? undefined : live ?? state.offlineTrip,
    }) },
  });
  const { DriverTripAccessGuard } = load('components/trip/DriverTripAccessGuard.tsx');
  return { state, child, calls, routes, hooks, render: () => hooks.render(() => DriverTripAccessGuard({ children: child })) };
}

test('driver-capable passenger entering a driver URL is redirected to their own reservation', () => {
  const h = guard();
  const view = h.render();
  assert.equal(view.type, 'Redirect');
  assert.equal(view.props.href, '/booking/navigate/booking');
  assert.equal(view.props.children, undefined);
  h.hooks.unmount();
});

test('only the owner mounts the driver controller; switching accounts immediately removes it', () => {
  const h = guard({ userId: 'owner' });
  assert.equal(h.render().props.children, h.child);
  assert.equal(h.calls.at(-1).skip, true);
  h.state.userId = 'rider';
  assert.equal(h.render().type, 'Redirect');
  h.hooks.unmount();
});

test('loading, stale route data, denied responses and missing login cannot mount driver controllers', () => {
  for (const patch of [
    { currentData: undefined, isLoading: true },
    { currentData: undefined, isFetching: true, tripId: 'new-trip' },
    { tripId: 'new-trip' }, { userId: undefined },
    { error: { status: 403 } }, { error: { status: 404 } },
  ]) {
    const h = guard({ userId: 'owner', ...patch });
    assert.notEqual(h.render().type, React.Fragment);
    h.hooks.unmount();
  }
});

test('offline owner snapshot remains usable, but never a passenger or wrong-trip snapshot', () => {
  for (const [offlineTrip, userId, allowed] of [[trip, 'owner', true], [trip, 'rider', false], [{ ...trip, id: 'old-trip' }, 'owner', false]]) {
    const h = guard({ currentData: undefined, error: { status: 'FETCH_ERROR' }, offlineTrip, userId });
    assert.equal(h.render().type === React.Fragment, allowed);
    h.hooks.unmount();
  }
});

test('both driver routes are guarded outside their controller hooks', () => {
  for (const file of ['app/trip/navigate/[id].tsx', 'app/trip/manage/[id].tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /return <DriverTripAccessGuard><\w+ \/><\/DriverTripAccessGuard>/);
  }
});

test('home never starts driver polling for a passenger reservation, including stale tracked driver role', () => {
  const hooks = hookHarness(), queries = [];
  const data = { trips: [{ ...trip, id: 'old-owned', driverId: 'rider', driver: { id: 'rider' } }], bookings: [booking] };
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { StyleSheet: { create: x => x } },
    '@/store/api/bookingApi': {
      useGetMyActivityBookingsQuery: () => ({ data: data.bookings }),
      useGetTripBookingsQuery: (id, options) => { queries.push({ id, ...options }); return {}; },
    },
    '@/store/api/tripApi': {
      useGetMyActivityTripsQuery: () => ({ data: data.trips }), useGetTripByIdQuery: () => ({}),
    },
  });
  const { useHomeDriverActivity } = load('hooks/home/useHomeDriverActivity.ts');
  const props = { currentUser: { id: 'rider' }, isDriver: true, isFocused: true, trackedTripInfo: { tripId: 'trip', role: 'driver' } };
  assert.equal(hooks.render(() => useHomeDriverActivity(props)).ongoingDriverTrip, null);
  assert.ok(queries.every(query => query.skip));
  data.bookings = [];
  assert.equal(hooks.render(() => useHomeDriverActivity(props)).ongoingDriverTrip.id, 'old-owned');
  hooks.unmount();
});
