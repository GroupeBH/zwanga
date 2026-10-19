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
    requests: { data: [], isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    profile: { data: { id: userId, role: passenger ? 'passenger' : 'driver' }, isSuccess: true },
    activity: { data: { userId, hasLiveActivity: true, passengerTrackingBookingId: passenger ? booking.id : null },
      isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    request: undefined, pending: undefined, version: 0, dispatchStatus: {}, offer: undefined };
  const router = { replace: path => routes.push(path) };
  const store = { getState: () => env.state };
  const dispatch = action => {
    if (action.running) return env.pending;
    reads.push(action);
    return { unwrap: async () => action.name === 'getTripById' ? trip : action.name === 'getTripRequestById' ? env.request
      : action.name === 'getDispatchOffer' ? env.offer : booking };
  };
  // No query subscription functions: the coordinator must only observe existing
  // activity caches and verify one authenticated detail, never add discovery polls.
  const api = (category, listName, detailName) => ({
    endpoints: {
      [listName]: { useQueryState: arg => { observed.push([category, arg]); return env[category]; } },
      [detailName]: { select: () => () => env.detailCache?.[detailName] ?? {}, initiate: (id, options) => ({ name: detailName, id, options }) },
    },
    util: { getRunningQueryThunk: () => ({ running: true }) },
  });
  const load = loader({
    react: { ...hooks.react, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'react-native': { View: 'View', StyleSheet: { create: value => value, absoluteFillObject: { position: 'absolute' } } },
    '@/components/home/HomeRoleLoader': { HomeRoleLoader: 'EntryLoader' },
    '@/components/home/EntrySyncBanner': { EntrySyncBanner: 'SyncBanner' },
    '@/features/navigation/homeEntryStatusContext': { HomeEntryStatusContext: { Provider: 'StatusProvider' } },
    '@/features/navigation/appEntryContext': { AppEntryContext: { Provider: 'EntryProvider' } },
    'react-redux': { useStore: () => store },
    'expo-router': { usePathname: () => env.path, useSegments: () => env.segments,
      useRootNavigationState: () => env.navigation, useRouter: () => router },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector(env.state) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/store/api/tripApi': { tripApi: api('trips', 'getMyActivityTrips', 'getTripById') },
    '@/store/api/bookingApi': { bookingApi: api('bookings', 'getMyActivityBookings', 'getBookingById') },
    '@/store/api/tripRequestApi': { tripRequestApi: api('requests', 'getMyTripRequests', 'getTripRequestById') },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: { driverDispatchStatus: { useQueryState: () => env.dispatchStatus }, getDispatchOffer: {
      initiate: (id, options) => ({ name: 'getDispatchOffer', id, options }),
    } } } },
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
  return { env, trip, reads, routes, observed, wrapper, speechEntry: load('services/rideEntryAnnouncement.ts'), render: () => wrapper().props.children[1] || null };
}

test('a status-only offer is verified by entry, but cannot replace ongoing guidance', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  for (const ongoing of [true, false]) {
    const f = fixture(t); f.env.segments = ['(tabs)'];
    f.env.dispatchStatus = { isSuccess: true, data: { enabled: true, pendingOfferId: 'offer' } };
    f.env.offer = { id: 'offer', driverId: 'driver', actionable: true, serverNow: new Date(Date.now()).toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString() };
    if (!ongoing) { f.env.trips.data = []; f.env.activity.data.hasLiveActivity = false; }
    f.render(); await flush(); f.render(); await flush();
    assert.deepEqual(f.routes, ongoing ? ['/trip/navigate/trip'] : [{ pathname: '/incoming-driver', params: { id: 'offer', kind: 'dispatch', driverId: 'driver' } }]);
    assert.deepEqual(f.reads.map(read => read.name), [ongoing ? 'getTripById' : 'getDispatchOffer']);
  }
});

test('driver entry discovers accepted requests from activity trips, despite an empty passenger request list', async t => {
  const now = Date.parse('2026-10-19T08:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const f = fixture(t); f.env.segments = ['(tabs)'];
  Object.assign(f.trip, { status: 'upcoming', tripRequestId: 'order', departureTime: '2026-10-19T10:00:00Z' });
  f.env.request = { id: 'order', passengerId: 'other', selectedDriverId: 'driver', tripId: 'trip', status: 'driver_selected',
    departureDateMin: f.trip.departureTime, departureDateMax: '2026-10-19T11:00:00Z' };
  Object.assign(f.env.activity.data, { trips: { count: 1 }, bookings: { count: 0 }, requests: { count: 0 } });
  f.env.trips.fulfilledTimeStamp = now + 1001;
  assert.equal(f.wrapper().props.value, true); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
  assert.deepEqual(f.reads, [
    { name: 'getTripById', id: 'trip', options: { subscribe: false, forceRefetch: true } },
    { name: 'getTripRequestById', id: 'order', options: { subscribe: false, forceRefetch: true } },
  ], 'only existing authenticated detail reads, no subscriptions, polls or start mutation');
  assert.ok(f.render(), 'entry loader remains until the request screen mounts');
  f.env.path = '/request-details/order'; assert.equal(f.render(), null);
  f.env.path = '/'; assert.equal(f.render(), null, 'returning to Home explicitly remains possible');
});

test('earlier published departure keeps Home instead of forcing accepted-request detail', async t => {
  const now = Date.parse('2026-10-19T08:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const f = fixture(t); f.env.segments = ['(tabs)'];
  Object.assign(f.trip, { status: 'upcoming', tripRequestId: 'order', departureTime: '2026-10-19T10:00:00Z' });
  f.env.request = { id: 'order', passengerId: 'other', selectedDriverId: 'driver', tripId: 'trip', status: 'driver_selected',
    departureDateMin: f.trip.departureTime, departureDateMax: '2026-10-19T11:00:00Z' };
  f.env.trips.data.push({ id: 'published', driverId: 'driver', status: 'upcoming', departureTime: '2026-10-19T09:00:00Z' });
  f.env.trips.fulfilledTimeStamp = now + 1001;
  Object.assign(f.env.activity.data, { trips: { count: 2 }, bookings: { count: 0 }, requests: { count: 0 } });
  f.render(); f.render(); await flush(); f.render();
  assert.equal(f.render(), null); assert.deepEqual(f.routes, []);
});

test('entry speech stays blocked on startup/auth, unmounted navigation and overlays even with ready screen data', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(t);
  for (const route of ['index', 'splash', 'onboarding', 'background-location-disclosure', 'auth-entry', 'auth']) {
    f.env.segments = [route]; f.env.path = route === 'index' ? '/' : `/${route}`;
    f.render(); t.mock.timers.tick(501);
    assert.equal(f.speechEntry.readRideSpeechEntry('driver').status, 'waiting', route);
  }
  f.env.segments = ['trip']; f.env.path = '/trip/navigate/trip'; f.env.busy = true;
  f.speechEntry.publishRideEntrySource({}, { userId: 'driver', path: f.env.path, ready: true,
    message: { key: 'ongoing', text: 'Allez chercher le passager.' } });
  f.render(); t.mock.timers.tick(501); assert.equal(f.speechEntry.readRideSpeechEntry('driver').status, 'waiting');
  f.env.busy = false; f.render(); t.mock.timers.tick(501);
  assert.equal(f.speechEntry.readRideSpeechEntry('driver').message?.key, 'ongoing');
});

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

test('offline recovery leaves Home usable and shows no full-screen failure or competing payment overlay', t => {
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.state.zwangaApi.config.online = false;
  assert.equal(f.render(), null); assert.equal(f.wrapper().props.value, false);
  assert.equal(f.wrapper().props.children[0].props.value.offline, true);
  f.env.busy = true; assert.equal(f.render(), null); assert.equal(Boolean(f.wrapper().props.children[0].props.value), false);
  assert.deepEqual(f.routes, []);
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
    (first === 'profile' ? activityReady : profileReady)(); f.render(); f.render();
    const finished = f.wrapper(); assert.equal(finished.props.value, false);
    assert.equal(finished.props.children[0].props.children, 'navigator', 'never unmount the routing tree');
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

test('a failed or foreign profile releases the cover for neutral Home, never a cached-role bypass', async t => {
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.trips = { isSuccess: false }; f.env.bookings = { isSuccess: false };
  f.env.profile = { data: { id: 'another', role: 'driver' }, isSuccess: true, isFetching: false };
  f.render(); f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, fulfilledTimeStamp: Date.now() };
  f.render(); assert.equal(f.render(), null); assert.equal(f.wrapper().props.value, false);
  assert.equal(Boolean(f.wrapper().props.children[0].props.value), false, 'no known-role banner on a foreign profile');
  await flush(); assert.deepEqual(f.reads, []);
  f.env.profile = { data: { id: 'driver', role: 'driver' }, isSuccess: true }; f.render(); assert.equal(f.render(), null);
});

test('slow entry releases Home after 2 seconds and proposes the result without navigating late', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t), pending = deferred(); f.env.segments = ['(tabs)']; f.env.pending = pending.promise;
  assert.ok(f.render()); t.mock.timers.tick(2000);
  assert.equal(f.render(), null); assert.equal(f.wrapper().props.value, false);
  assert.ok(f.wrapper().props.children[0].props.value, 'status is provided to the inline Home panel');
  pending.resolve(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, []);
  const banner = f.wrapper().props.children[0].props.value;
  assert.equal(banner.actionLabel, 'Reprendre mon trajet');
  banner.onAction(); assert.deepEqual(f.routes, ['/trip/navigate/trip']);
});

test('recent verified detail avoids an entry GET but still checks ownership and terminal status', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const patch of [{}, { driverId: 'other' }, { status: 'completed' }]) {
    const f = fixture(t); f.env.segments = ['(tabs)'];
    f.env.detailCache = { getTripById: { data: { ...f.trip, ...patch }, isSuccess: true, fulfilledTimeStamp: 99999 } };
    f.render(); await flush();
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.routes, Object.keys(patch).length ? [] : ['/trip/navigate/trip']);
  }
});

test('a proposed ongoing ride retains priority over a dispatch after Home is revealed', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t), pending = deferred(); f.env.segments = ['(tabs)']; f.env.pending = pending.promise;
  f.env.dispatchStatus = { isSuccess: true, data: { enabled: true, pendingOfferId: 'offer' } };
  f.env.offer = { id: 'offer', driverId: 'driver', actionable: true,
    serverNow: new Date(Date.now()).toISOString(), expiresAt: new Date(Date.now() + 30000).toISOString() };
  f.render(); t.mock.timers.tick(2000); f.render(); pending.resolve(); await flush();
  f.render(); await flush(); f.render(); await flush();
  assert.deepEqual(f.reads.map(read => read.name), ['getTripById']);
  assert.equal(f.wrapper().props.children[0].props.value.actionLabel, 'Reprendre mon trajet');
  assert.deepEqual(f.routes, []);
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
