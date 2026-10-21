const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t, passenger = false) {
  const hooks = hookHarness(), reads = [], routes = [], observed = [];
  let foregroundSince = Date.now(), wasActive = true;
  const userId = passenger ? 'passenger' : 'driver';
  const trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
  const booking = { id: 'booking', tripId: trip.id, passengerId: 'passenger', status: 'accepted', trip };
  const env = { active: true, busy: false, segments: ['index'], path: '/', navigation: { key: 'root' },
    state: { auth: { isAuthenticated: true, user: { id: userId } }, zwangaApi: { config: { online: true } } },
    trips: { data: passenger ? [] : [trip], isSuccess: true, startedTimeStamp: 1, fulfilledTimeStamp: 1 },
    bookings: { data: passenger ? [booking] : [], isSuccess: true, startedTimeStamp: 1, fulfilledTimeStamp: 1 },
    requests: { data: [], isSuccess: true, startedTimeStamp: Date.now() + 1000, fulfilledTimeStamp: Date.now() + 1000 },
    profile: { data: { id: userId, role: passenger ? 'passenger' : 'driver' }, isSuccess: true },
    activity: { data: { userId, hasLiveActivity: true, passengerTrackingBookingId: passenger ? booking.id : null },
      isSuccess: true, startedTimeStamp: Date.now() + 1000, fulfilledTimeStamp: Date.now() + 1000 },
    request: undefined, pending: undefined, version: 0, dispatchStatus: {}, offer: undefined };
  const router = { replace: path => routes.push(path) };
  const store = { getState: () => env.state };
  const dispatch = action => {
    if (typeof action === 'function') return action(dispatch, store.getState);
    if (action.seed) { env.seeds = [...(env.seeds ?? []), ...action.seed]; return; }
    if (action.running) return env.pending;
    reads.push(action);
    return { unwrap: async () => action.name === 'getTripById' ? env.tripDetails?.[action.id] ?? trip : action.name === 'getTripRequestById' ? env.request
      : action.name === 'getDispatchOffer' ? env.offer : env.bookingDetails?.[action.id] ?? booking };
  };
  // No query subscription functions: the coordinator must only observe existing
  // activity caches and verify one authenticated detail, never add discovery polls.
  const api = (category, listName, detailName) => ({
    endpoints: {
      [listName]: { useQueryState: arg => { observed.push([category, arg]); return env[category]; } },
      [detailName]: { select: () => () => env.detailCache?.[detailName] ?? {}, initiate: (id, options) => ({ name: detailName, id, options }) },
    },
    util: { getRunningQueryThunk: () => ({ running: true }), upsertQueryEntries: entries => ({ seed: entries }) },
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
    '@/store/api/tripRequestApi': { tripRequestApi: api('requests', 'getMyActivityRequests', 'getTripRequestById') },
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
    '@/services/appActivity': { isAppActive: () => env.active, getAppActiveSince: () => foregroundSince },
  });
  const Component = load('components/ActiveRideResumeCoordinator.tsx').ActiveRideResumeCoordinator;
  t.after(() => hooks.unmount());
  const wrapper = () => {
    if (env.active && !wasActive) foregroundSince = Date.now();
    wasActive = env.active;
    return hooks.render(() => Component({ children: 'navigator' }));
  };
  return { env, trip, booking, reads, routes, observed, wrapper, alerts: load('services/rideAlertSession.ts'),
    speechEntry: load('services/rideEntryAnnouncement.ts'), render: () => wrapper().props.children[1] || null };
}

test('a new reservation opens trip management with the passenger first, without a notification or extra discovery', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.env.segments = ['(tabs)'];
  Object.assign(f.trip, { status: 'upcoming', departureTime: new Date(200000).toISOString(),
    reservationSummary: { pendingBookingIds: ['booking'], acceptedCount: 0 } });
  f.booking.status = 'pending'; f.env.trips.fulfilledTimeStamp = 101000;
  Object.assign(f.env.activity.data, { trips: { count: 1 }, bookings: { count: 0 }, requests: { count: 0 } });
  f.render(); f.render(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, [{ pathname: '/trip/manage/[id]', params: { id: 'trip', bookingId: 'booking', section: 'passengers' } }]);
  assert.deepEqual(f.reads, [{ name: 'getBookingById', id: 'booking', options: { subscribe: false, forceRefetch: true } }]);
  f.env.path = '/trip/manage/trip'; assert.equal(f.render(), null);
  f.env.path = '/'; f.render(); await flush(); assert.equal(f.routes.length, 1, 'can leave management voluntarily');
});

test('an ongoing driver or passenger ride always wins over an incoming booking alert', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const passenger of [false, true]) {
    const f = fixture(t, passenger); f.env.segments = ['(tabs)'];
    f.env.profile.data.role = 'driver';
    f.alerts.rememberRideAlert({ key: 'new-booking', kind: 'booking', id: 'new', recipientId: passenger ? 'passenger' : 'driver',
      data: { type: 'new_booking', passengerId: 'someone-else' } });
    f.render(); await flush(); f.render(); await flush();
    assert.deepEqual(f.routes, [passenger ? '/booking/navigate/booking' : '/trip/navigate/trip']);
    assert.deepEqual(f.reads.map(item => item.id), [passenger ? 'booking' : 'trip']);
  }
});

test('an ongoing ride discovered DURING reservation verification wins for driver and passenger participation', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const passenger of [false, true]) {
    const f = fixture(t); f.env.segments = ['(tabs)'];
    Object.assign(f.trip, { status: 'upcoming', departureTime: new Date(200000).toISOString(),
      reservationSummary: { pendingBookingIds: ['booking'], acceptedCount: 0 } });
    f.booking.status = 'pending'; f.env.trips.fulfilledTimeStamp = 101000;
    Object.assign(f.env.activity.data, { trips: { count: 1 }, bookings: { count: 0 }, requests: { count: 0 } });
    const slow = deferred(); f.env.pending = slow.promise;
    f.render(); f.render(); await flush();
    const live = { id: 'live', driverId: passenger ? 'other-driver' : 'driver', status: 'ongoing' };
    if (passenger) {
      const participation = { id: 'participation', passengerId: 'driver', tripId: live.id, status: 'accepted', trip: live };
      f.env.bookings = { data: [participation], isSuccess: true, fulfilledTimeStamp: 101001 };
      f.env.bookingDetails = { participation }; f.env.activity.data.bookings.count = 1;
      f.env.activity.data.passengerTrackingBookingId = 'participation';
    } else {
      f.env.trips.data = [f.trip, live]; f.env.tripDetails = { live }; f.env.activity.data.trips.count = 2;
    }
    f.render(); slow.resolve(); await flush(); f.render(); await flush();
    assert.deepEqual(f.routes, [passenger ? '/booking/navigate/participation' : '/trip/navigate/live']);
    assert.equal(f.env.seeds, undefined, 'do not seed the lower priority destination');
    f.env.path = passenger ? '/booking/navigate/participation' : '/trip/navigate/live'; f.render();
    f.env.path = '/'; f.render(); await flush();
    assert.equal(f.routes.length, 1, 'a voluntary Home return must remain possible');
  }
});

test('the handoff checks the server and rejects a newly discovered but already completed ride', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.env.segments = ['(tabs)'];
  Object.assign(f.trip, { status: 'upcoming', reservationSummary: { pendingBookingIds: ['booking'] } });
  f.booking.status = 'pending'; f.env.trips.fulfilledTimeStamp = 101000;
  Object.assign(f.env.activity.data, { trips: { count: 1 }, bookings: { count: 0 }, requests: { count: 0 } });
  const slow = deferred(); f.env.pending = slow.promise; f.render(); f.render(); await flush();
  const stale = { id: 'stale', driverId: 'driver', status: 'ongoing' };
  f.env.trips.data = [f.trip, stale]; f.env.tripDetails = { stale: { ...stale, status: 'completed' } };
  f.env.activity.data.trips.count = 2; f.render(); slow.resolve(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, [{ pathname: '/trip/manage/[id]', params: { id: 'trip', bookingId: 'booking', section: 'passengers' } }]);
  assert.equal(f.reads.filter(read => read.id === 'stale').length, 1);
  assert.equal(f.env.seeds[0].value.id, 'trip');
});

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
    const activityReady = () => { f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() }; };
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
  f.render(); f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
  f.render(); assert.equal(f.render(), null); assert.equal(f.wrapper().props.value, false);
  assert.equal(Boolean(f.wrapper().props.children[0].props.value), false, 'no known-role banner on a foreign profile');
  await flush(); assert.deepEqual(f.reads, []);
  f.env.profile = { data: { id: 'driver', role: 'driver' }, isSuccess: true }; f.render(); assert.equal(f.render(), null);
});

test('slow entry releases Home after 2 seconds, then opens the verified ongoing ride automatically', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t), pending = deferred(); f.env.segments = ['(tabs)']; f.env.pending = pending.promise;
  assert.ok(f.render()); t.mock.timers.tick(2000);
  assert.equal(f.render(), null); assert.equal(f.wrapper().props.value, false);
  assert.ok(f.wrapper().props.children[0].props.value, 'status is provided to the inline Home panel');
  pending.resolve(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/trip/navigate/trip']);
  f.env.path = '/trip/navigate/trip'; assert.equal(f.render(), null);
});

test('recent verified detail avoids an entry GET but still checks ownership and terminal status', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const patch of [{}, { driverId: 'other' }, { status: 'completed' }]) {
    const f = fixture(t); f.env.segments = ['(tabs)'];
    f.env.detailCache = { getTripById: { data: { ...f.trip, ...patch }, isSuccess: true, startedTimeStamp: 100000, fulfilledTimeStamp: 100000 } };
    f.render(); await flush();
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.routes, Object.keys(patch).length ? [] : ['/trip/navigate/trip']);
  }
});

test('late ongoing guidance retains priority over a dispatch after Home is revealed', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t), pending = deferred(); f.env.segments = ['(tabs)']; f.env.pending = pending.promise;
  f.env.dispatchStatus = { isSuccess: true, data: { enabled: true, pendingOfferId: 'offer' } };
  f.env.offer = { id: 'offer', driverId: 'driver', actionable: true,
    serverNow: new Date(Date.now()).toISOString(), expiresAt: new Date(Date.now() + 30000).toISOString() };
  f.render(); t.mock.timers.tick(2000); f.render(); pending.resolve(); await flush();
  f.render(); await flush(); f.render(); await flush();
  assert.deepEqual(f.reads.map(read => read.name), ['getTripById']);
  assert.deepEqual(f.routes, ['/trip/navigate/trip']);
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

test('a passenger waiting request replaces Home automatically even when its verification exceeds two seconds', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t, true), pending = deferred(); f.env.segments = ['(tabs)'];
  f.env.bookings.data = []; f.env.pending = pending.promise;
  Object.assign(f.env.activity.data, { passengerTrackingBookingId: null, trips: { count: 0 }, bookings: { count: 0 }, requests: { count: 1 } });
  f.env.request = { id: 'order', passengerId: 'passenger', status: 'pending', departureDateMax: new Date(200000).toISOString() };
  f.env.requests.data = [f.env.request];
  f.render(); f.render(); t.mock.timers.tick(3000); assert.equal(f.render(), null, 'the cover remains bounded');
  pending.resolve(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/order'], 'no intermediate Voir la demande action');
  assert.deepEqual(f.reads.map(read => read.name), ['getTripRequestById']);
  f.env.path = '/request-details/order'; f.render(); f.env.path = '/'; f.render(); await flush();
  assert.equal(f.routes.length, 1, 'the user can still deliberately return Home');
});

test('a ringing nearby request restored after fast Home opens its decision screen without acknowledging the sound', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.trips.data = [];
  f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
  f.render(); t.mock.timers.tick(3000); f.render(); assert.deepEqual(f.routes, []);
  f.env.request = { id: 'nearby', passengerId: 'passenger', status: 'pending', departureDateMax: new Date(200000).toISOString() };
  f.alerts.rememberRideAlert({ key: 'driver-nearby-nearby', id: 'nearby', kind: 'nearby', recipientId: 'driver',
    data: { ringUntil: new Date(130000).toISOString() } }, true);
  f.render(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/nearby']);
  assert.deepEqual(f.reads.map(read => read.name), ['getTripRequestById']);
  f.env.path = '/request-details/nearby'; f.render();
  assert.equal(f.alerts.pendingRideAlerts('driver').length, 1, 'opening is not accepting or refusing');
});

test('a quick return rechecks a cached empty account and opens newly ongoing driver or passenger guidance', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const passenger of [false, true]) {
    const f = fixture(t, passenger); f.env.segments = ['(tabs)'];
    const userId = f.env.state.auth.user.id;
    const currentTrips = f.env.trips.data, currentBookings = f.env.bookings.data;
    f.env.trips.data = []; f.env.bookings.data = [];
    f.env.activity = { data: { userId, hasLiveActivity: false }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
    f.render(); f.render(); await flush(); assert.deepEqual(f.routes, []);
    f.env.active = false; f.render(); t.mock.timers.tick(1000);
    f.env.active = true; f.render(); f.render(); await flush();
    assert.deepEqual(f.routes, [], 'old empty summary must not settle the new entry');
    f.env.activity = { data: { userId, hasLiveActivity: true, trips: { count: passenger ? 0 : 1 },
      bookings: { count: passenger ? 1 : 0 }, requests: { count: 0 },
      passengerTrackingBookingId: passenger ? 'booking' : null }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
    f.env.trips = { data: currentTrips, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
    f.env.bookings = { data: currentBookings, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
    f.render(); await flush(); f.render(); await flush();
    assert.deepEqual(f.routes, [passenger ? '/booking/navigate/booking' : '/trip/navigate/trip']);
  }
});

test('returning after publishing an order opens that order even from a driver account with a recent empty cache', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.env.segments = ['(tabs)']; f.env.trips.data = [];
  f.env.activity = { data: { userId: 'driver', hasLiveActivity: false }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
  f.render(); f.render(); f.env.active = false; f.render(); t.mock.timers.tick(1000);
  f.env.active = true; f.render(); f.render(); await flush();
  f.env.request = { id: 'order', passengerId: 'driver', status: 'pending', departureDateMax: new Date(200000).toISOString() };
  f.env.requests = { data: [f.env.request], isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
  f.env.activity = { data: { userId: 'driver', hasLiveActivity: true, trips: { count: 0 }, bookings: { count: 0 },
    requests: { count: 1 } }, isSuccess: true, startedTimeStamp: Date.now(), fulfilledTimeStamp: Date.now() };
  f.render(); f.render(); await flush(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
});

test('an upcoming detail cached before foreground cannot hide a just-started trip', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.env.segments = ['(tabs)'];
  f.env.detailCache = { getTripById: { data: { ...f.trip, status: 'upcoming' }, isSuccess: true, startedTimeStamp: 99999, fulfilledTimeStamp: 99999 } };
  f.render(); await flush();
  assert.deepEqual(f.routes, ['/trip/navigate/trip']);
  assert.deepEqual(f.reads.map(read => read.name), ['getTripById']);
});
