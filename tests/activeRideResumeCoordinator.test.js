const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t, passenger = false) {
  const hooks = hookHarness(), reads = [], routes = [], observed = [];
  const userId = passenger ? 'passenger' : 'driver';
  const trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
  const booking = { id: 'booking', tripId: trip.id, passengerId: 'passenger', status: 'accepted', trip };
  const env = { active: true, busy: false, segments: ['index'], path: '/', navigation: { key: 'root' },
    state: { auth: { isAuthenticated: true, user: { id: userId } }, zwangaApi: { config: { online: true } } },
    trips: { data: passenger ? [] : [trip], isSuccess: true, fulfilledTimeStamp: 1 },
    bookings: { data: passenger ? [booking] : [], isSuccess: true, fulfilledTimeStamp: 1 },
    profile: { data: { id: userId, role: passenger ? 'passenger' : 'driver' }, isSuccess: true },
    activity: { data: { userId, hasLiveActivity: true, passengerTrackingBookingId: passenger ? booking.id : null },
      isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    pending: undefined, version: 0 };
  const router = { replace: path => routes.push(path) };
  const store = { getState: () => env.state };
  const dispatch = action => {
    if (action.running) return env.pending;
    reads.push(action);
    return { unwrap: async () => action.name === 'getTripById' ? trip : booking };
  };
  // No query subscription functions: the coordinator must only observe existing
  // activity caches and verify one authenticated detail, never add discovery polls.
  const api = (category, listName, detailName) => ({
    endpoints: {
      [listName]: { useQueryState: arg => { observed.push([category, arg]); return env[category]; } },
      [detailName]: { initiate: (id, options) => ({ name: detailName, id, options }) },
    },
    util: { getRunningQueryThunk: () => ({ running: true }) },
  });
  const load = loader({
    react: { ...hooks.react, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'react-native': { View: 'View', StyleSheet: { create: value => value, absoluteFillObject: { position: 'absolute' } } },
    '@/components/home/HomeRoleLoader': { HomeRoleLoader: 'EntryLoader' },
    '@/features/navigation/appEntryContext': { AppEntryContext: { Provider: 'EntryProvider' } },
    'react-redux': { useStore: () => store },
    'expo-router': { usePathname: () => env.path, useSegments: () => env.segments,
      useRootNavigationState: () => env.navigation, useRouter: () => router },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector(env.state) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/store/api/tripApi': { tripApi: api('trips', 'getMyActivityTrips', 'getTripById') },
    '@/store/api/bookingApi': { bookingApi: api('bookings', 'getMyActivityBookings', 'getBookingById') },
    '@/store/api/accountActivityApi': { accountActivityApi: { endpoints: { getAccountActivity: {
      useQueryState: id => { observed.push(['activity', id]); return env.activity; },
      initiate: (id, options) => ({ name: 'getAccountActivity', id, options }),
    } } } },
    '@/store/api/userApi': { userApi: { endpoints: { getCurrentUser: {
      useQueryState: () => env.profile,
      initiate: (id, options) => ({ name: 'getCurrentUser', id, options }),
    } } } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => env.active },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({ store: {
      subscribe: () => () => {}, isBusy: () => env.busy,
    } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/services/appActivity': { isAppActive: () => env.active },
  });
  const Component = load('components/ActiveRideResumeCoordinator.tsx').ActiveRideResumeCoordinator;
  t.after(() => hooks.unmount());
  const wrapper = () => hooks.render(() => Component({ children: 'navigator' }));
  return { env, reads, routes, observed, wrapper, render: () => wrapper().props.children[1] || null };
}

for (const passenger of [false, true]) test(`${passenger ? 'passenger' : 'driver'} startup waits for Home's mounted stack then opens its verified navigation`, async t => {
  const f = fixture(t, passenger);
  for (const route of ['index', 'splash', 'onboarding', 'background-location-disclosure', 'auth-entry', 'auth']) {
    f.env.segments = [route]; f.env.path = route === 'index' ? '/' : `/${route}`;
    f.render(); await flush(); assert.deepEqual(f.reads, [], route); assert.deepEqual(f.routes, []);
  }
  f.env.path = '/'; f.env.segments = ['(tabs)']; f.render(); await flush();
  assert.deepEqual(f.routes, [passenger ? '/booking/navigate/booking' : '/trip/navigate/trip']);
  assert.deepEqual(f.reads, [{ name: passenger ? 'getBookingById' : 'getTripById', id: passenger ? 'booking' : 'trip',
    options: { subscribe: false, forceRefetch: true } }]);
  assert.equal(f.observed.filter(([category]) => category === 'activity').every(([, id]) => id === f.env.state.auth.user.id), true);
  f.env.path = '/'; f.render(); await flush(); assert.equal(f.routes.length, 1, 'a voluntary Home return remains usable');
  f.env.active = false; f.render(); f.env.active = true; f.render(); await flush();
  assert.equal(f.routes.length, 2, 'a new real foreground entry resumes the trip again');
});

test('a cold passenger launch waits for shared bookings instead of interpreting an empty cache as no ride', async t => {
  const f = fixture(t, true), bookings = f.env.bookings;
  f.env.bookings = { isSuccess: false }; f.env.segments = ['(tabs)'];
  f.render(); await flush(); assert.deepEqual(f.reads, []);
  f.env.bookings = bookings; f.render(); await flush();
  assert.deepEqual(f.routes, ['/booking/navigate/booking']);
});

test('the entry loader covers the mounted navigator until verified guidance is displayed', async t => {
  const f = fixture(t), pending = deferred();
  f.env.segments = ['(tabs)']; f.env.pending = pending.promise;
  const cover = f.render();
  assert.equal(cover.type, 'View'); assert.equal(cover.props.testID, 'active-ride-entry');
  assert.equal(cover.props.accessibilityViewIsModal, true);
  assert.equal(cover.props.children.type, 'EntryLoader');
  assert.equal(cover.props.children.props.loadingLabel, 'Ouverture de Zwanga');
  assert.equal(cover.props.children.props.failed, false);
  pending.resolve(); await flush();
  assert.ok(f.render(), 'keep the cover until the router has actually navigated');
  f.env.path = '/trip/navigate/trip'; assert.equal(f.render(), null);
  f.env.path = '/'; assert.equal(f.render(), null, 'an explicit exit stays usable');
});

test('offline recovery offers Home without hiding an existing payment overlay', t => {
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.state.zwangaApi.config.online = false;
  assert.equal(f.render().props.children.props.failed, true);
  f.env.busy = true; assert.equal(f.render(), null);
  f.env.busy = false; f.render().props.children.props.onContinue();
  assert.deepEqual(f.routes, ['/(tabs)']); assert.equal(f.render(), null);
});

test('one shared loader waits for both the Home role and the no-ride decision in either order', async t => {
  for (const first of ['profile', 'activity']) {
    const f = fixture(t); f.env.segments = ['(tabs)'];
    f.env.profile = { isFetching: true }; f.env.activity = { isSuccess: false };
    f.env.trips = { isSuccess: false }; f.env.bookings = { isSuccess: false };
    assert.equal(f.wrapper().props.value, true);
    const profileReady = () => { f.env.profile = { data: { id: 'driver', role: 'driver' }, isSuccess: true }; };
    const activityReady = () => { f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, fulfilledTimeStamp: Date.now() }; };
    (first === 'profile' ? profileReady : activityReady)();
    assert.equal(f.render().props.children.props.loadingLabel, 'Ouverture de Zwanga'); f.render();
    assert.equal(f.wrapper().props.value, true, 'one result alone must not reveal Home');
    (first === 'profile' ? activityReady : profileReady)(); f.render();
    const finished = f.wrapper(); assert.equal(finished.props.value, false);
    assert.equal(finished.props.children[0], 'navigator', 'never unmount the routing tree');
    assert.equal(f.render(), null); await flush(); assert.deepEqual(f.routes, []);
  }
});

test('ongoing passenger participation routes directly without waiting for the global account role', async t => {
  const f = fixture(t, true); f.env.segments = ['(tabs)']; f.env.profile = { isFetching: true };
  assert.equal(f.wrapper().props.value, true); await flush();
  assert.deepEqual(f.routes, ['/booking/navigate/booking']);
  f.env.path = '/booking/navigate/booking'; assert.equal(f.render(), null);
});

test('the authenticated token identity blocks Home while the profile is still hydrating', async t => {
  const f = fixture(t); f.env.segments = ['(tabs)'];
  f.env.state.auth.tokenPayload = { sub: 'driver' }; f.env.state.auth.user = undefined;
  f.env.profile = { isFetching: true };
  assert.equal(f.wrapper().props.value, true);
  await flush(); assert.deepEqual(f.routes, ['/trip/navigate/trip']);
});

test('a failed or foreign profile cannot reveal Home or offer an invalid-role bypass', async t => {
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.trips = { isSuccess: false }; f.env.bookings = { isSuccess: false };
  f.env.profile = { data: { id: 'another', role: 'driver' }, isSuccess: true, isFetching: false };
  f.render(); f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, fulfilledTimeStamp: Date.now() };
  f.render(); const cover = f.render(); assert.equal(cover.props.children.props.failed, true);
  assert.equal(cover.props.children.props.onContinue, undefined);
  cover.props.children.props.onRetry(); f.render(); await flush();
  assert.deepEqual(f.reads.map(read => read.name), ['getCurrentUser'], 'retry only the missing profile, with no discovery poll');
  f.env.profile = { data: { id: 'driver', role: 'driver' }, isSuccess: true }; assert.equal(f.render(), null);
});

test('a signed-out or not-yet-mounted navigator cannot start ride verification', async t => {
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.state.auth.isAuthenticated = false;
  f.render(); await flush(); assert.deepEqual(f.reads, []);
  f.env.state.auth.isAuthenticated = true; f.env.navigation = undefined;
  f.render(); await flush(); assert.deepEqual(f.reads, []);
  f.env.navigation = { key: 'root' }; f.render(); await flush(); assert.deepEqual(f.routes, ['/trip/navigate/trip']);
});

test('queued verification after an existing read never leaks into a different session or the background', async t => {
  for (const change of ['background', 'account', 'logout']) {
    const f = fixture(t), pending = deferred(); f.env.segments = ['(tabs)']; f.env.pending = pending.promise;
    f.render(); await flush(); assert.deepEqual(f.reads, []);
    if (change === 'background') f.env.active = false;
    if (change === 'account') f.env.state.auth.user = { id: 'another' };
    if (change === 'logout') { f.env.state.auth.isAuthenticated = false; f.env.version++; }
    f.render(); pending.resolve(); await flush();
    assert.deepEqual(f.reads, [], change); assert.deepEqual(f.routes, [], change);
  }
});
