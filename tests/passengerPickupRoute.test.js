const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const origin = { latitude: -4.33, longitude: 15.30 };
const pickup = { latitude: -4.33, longitude: 15.32 };
const road = [origin, pickup];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

function setup() {
  const hooks = hookHarness(), requests = [], routes = [], infos = [];
  const load = loader({ react: hooks.react, 'react-native': { Platform: { OS: 'android' } },
    'react-native-maps': { PROVIDER_GOOGLE: 'google' },
    '@/store/api/googleMapsApi': { TravelMode: { DRIVING: 'driving' } },
    '../../features/passenger-navigation/navigationModel': {
      decodePolyline: () => road, formatDistanceMeters: m => `${m} m`, formatDurationSeconds: s => `${s} s`,
    },
  });
  const { usePassengerNavigationRoute } = load('hooks/passenger-navigation/usePassengerNavigationRoute.ts');
  const { useNavigationRequestGuard } = load('hooks/navigation/useNavigationRequestGuard.ts');
  const props = { isOnline: true, isScreenActive: true, routeOriginCoordinate: origin, activePassengerDestination: pickup,
    isMountedRef: { current: true }, isTripOngoing: true, driverLocation: origin, hasPassengerPickedUp: false,
    setRouteCoordinates: value => routes.push(value), setRouteInfo: value => infos.push(value),
    routeFetchedRef: { current: false }, lastRouteFetchRef: { current: 0 },
    passengerRouteSignature: 'booking:trip:ongoing:pickup', setIsLoadingRoute() {}, routeCoordinates: [],
    getDirections: input => {
      const reply = deferred(); const request = { input, reply, aborted: false };
      requests.push(request); return { unwrap: () => reply.promise, abort: () => { request.aborted = true; } };
    } };
  const render = () => hooks.render(() => {
    const guard = useNavigationRequestGuard(props.isScreenActive, 'booking');
    return usePassengerNavigationRoute({ ...props, beginRouteRequest: guard.begin });
  });
  const success = () => ({ routes: [{ overviewPolyline: 'test-polyline', legs: [{ distance: 2200, duration: 600 }] }] });
  return { hooks, props, render, requests, routes, infos, success };
}

test('directions target the agreed pickup from the driver, carry their scope and share the single-flight/30s limit', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const f = setup(); const route = f.render();
  const first = route.fetchRoute(); const duplicate = route.fetchRoute();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].input, { origin: { lat: origin.latitude, lng: origin.longitude },
    destination: { lat: pickup.latitude, lng: pickup.longitude }, mode: 'driving' });
  f.requests[0].reply.resolve(f.success()); await Promise.all([first, duplicate]);
  assert.equal(f.infos[0].routeSignature, f.props.passengerRouteSignature);
  assert.equal(f.infos[0].fetchedAt, Date.now()); assert.equal(f.infos[0].durationSeconds, 600);
  await route.fetchRoute(); assert.equal(f.requests.length, 1);
  t.mock.timers.tick(30_000); const second = route.fetchRoute(); assert.equal(f.requests.length, 2);
  f.requests[1].reply.resolve(f.success()); await second; f.hooks.unmount();
});

test('no directions before departure, offline, without a driver fix or on a hidden screen', async () => {
  for (const patch of [{ isTripOngoing: false }, { isOnline: false }, { isScreenActive: false },
    { driverLocation: null }, { activePassengerDestination: null }]) {
    const f = setup(); Object.assign(f.props, patch); await f.render().fetchRoute();
    assert.equal(f.requests.length, 0); assert.deepEqual(f.infos, []); f.hooks.unmount();
  }
});

test('late route responses cannot repopulate an offline, hidden, unmounted or changed pickup screen', async () => {
  for (const kind of ['offline', 'hidden', 'unmounted', 'signature']) {
    const f = setup(); const pending = f.render().fetchRoute();
    if (kind === 'offline') f.props.isOnline = false;
    if (kind === 'hidden') f.props.isScreenActive = false;
    if (kind === 'signature') f.props.passengerRouteSignature = 'booking:trip:ongoing:picked';
    if (kind === 'unmounted') f.hooks.unmount(); else f.render();
    f.requests[0].reply.resolve(f.success()); await pending;
    assert.deepEqual(f.infos, [], kind); assert.deepEqual(f.routes, [], kind); f.hooks.unmount();
  }
});

test('a late callback cannot start directions for an old screen, route or offline context', async () => {
  for (const patch of [{ isOnline: false }, { isScreenActive: false }, { passengerRouteSignature: 'new-booking' }]) {
    const f = setup(); const oldFetch = f.render().fetchRoute;
    Object.assign(f.props, patch); f.render(); await oldFetch();
    assert.equal(f.requests.length, 0); f.hooks.unmount();
  }
});

test('empty or invalid durations become a no-ETA fallback rather than retaining an old estimate', async () => {
  for (const legs of [[], [{ distance: 2200, duration: NaN }], [{ distance: 2200, duration: 0 }], [{ distance: 0, duration: 10 }]]) {
    const f = setup(); const pending = f.render().fetchRoute();
    f.requests[0].reply.resolve({ routes: [{ overviewPolyline: 'test-polyline', legs }] }); await pending;
    assert.equal(f.infos.at(-1).durationSeconds, 0); assert.equal(f.infos.at(-1).duration, '-');
    f.hooks.unmount();
  }
});

test('trip start and boarding change route identity, but every driver GPS update does not', () => {
  const hooks = hookHarness();
  const { usePassengerRouteContext } = loader({ react: hooks.react })('hooks/passenger-navigation/usePassengerRouteContext.ts');
  const booking = { id: 'booking', tripId: 'trip', status: 'accepted' };
  const props = { booking, trip: { id: 'trip', status: 'upcoming' }, bookingId: 'booking', tripId: 'trip',
    pickupCoordinate: pickup, dropoffCoordinate: { latitude: -4.33, longitude: 15.36 },
    driverLocation: null, passengerLocation: pickup, isTripOngoing: false };
  const render = () => hooks.render(() => usePassengerRouteContext(props));
  const scheduled = render().passengerRouteSignature;
  props.trip = { ...props.trip, status: 'ongoing' }; props.isTripOngoing = true; props.driverLocation = origin;
  const moving = render(); assert.notEqual(moving.passengerRouteSignature, scheduled);
  assert.equal(moving.activePassengerDestination, pickup); assert.equal(moving.routeOriginCoordinate, origin);
  props.driverLocation = { latitude: -4.33, longitude: 15.301 };
  assert.equal(render().passengerRouteSignature, moving.passengerRouteSignature);
  props.booking = { ...booking, pickedUp: true };
  assert.notEqual(render().passengerRouteSignature, moving.passengerRouteSignature);
  assert.equal(render().activePassengerDestination, props.dropoffCoordinate); hooks.unmount();
});
