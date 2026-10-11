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
    'react-redux': { useStore: () => store },
    'expo-router': { usePathname: () => env.path, useSegments: () => env.segments,
      useRootNavigationState: () => env.navigation, useRouter: () => router },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector(env.state) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/store/api/tripApi': { tripApi: api('trips', 'getMyActivityTrips', 'getTripById') },
    '@/store/api/bookingApi': { bookingApi: api('bookings', 'getMyActivityBookings', 'getBookingById') },
    '@/store/api/accountActivityApi': { accountActivityApi: { endpoints: { getAccountActivity: {
      useQueryState: id => { observed.push(['activity', id]); return env.activity; },
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
  return { env, reads, routes, observed, render: () => hooks.render(Component) };
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
