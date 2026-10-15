const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const departure = { name: 'Départ', lat: -4.325, lng: 15.3222, coordinates: { latitude: -4.325, longitude: 15.3222 } };
const arrival = { name: 'Arrivée', lat: -4.35, lng: 15.35, coordinates: { latitude: -4.35, longitude: 15.35 } };
const trip = (id, extra = {}) => ({ id, driverId: 'driver', status: 'upcoming', departureTime: new Date(Date.now() + 3600000).toISOString(), departure, arrival, availableSeats: 3, price: 2000, ...extra });
const request = (id, extra = {}) => ({ id, passengerId: 'passenger', status: 'pending', departureDateMin: new Date(Date.now() + 1000).toISOString(), departureDateMax: new Date(Date.now() + 3600000).toISOString(), departure, arrival, offers: [], createdAt: new Date().toISOString(), ...extra });
function environment(mocks = {}, platform = 'ios') {
  const hooks = hookHarness();
  const load = loader({
    react: { ...require('react'), ...hooks.react },
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: true } } }) },
    '@/features/navigation/PickupVehicleDetails': { PickupVehicleDetails: 'VehicleDetails' },
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: value => value } },
    'react-native-maps': { PROVIDER_GOOGLE: 'google' },
    ...mocks,
  });
  return { hooks, load };
}

test('request expiry still allows accepted drivers but hides expired, cancelled and invalid requests', () => {
  const { isTripRequestWithinAcceptanceWindow: accepts } = environment().load('features/home/homeModel.ts');
  const now = Date.now();
  assert.equal(accepts(request('a', { departureDateMax: new Date(now - 3 * 3600000 + 1).toISOString() }), now), true);
  assert.equal(accepts(request('a', { departureDateMax: new Date(now - 3 * 3600000).toISOString() }), now), false);
  assert.equal(accepts(request('a', { status: 'driver_selected', departureDateMax: new Date(now - 2 * 3600000 + 1).toISOString() }), now), true);
  assert.equal(accepts(request('a', { status: 'driver_selected', departureDateMax: new Date(now - 2 * 3600000).toISOString() }), now), false);
  assert.equal(accepts(request('a', { departureDateMax: 'invalid' }), now), false);
  assert.equal(accepts(request('a', { status: 'cancelled' }), now), false);
  assert.equal(accepts(request('a', { status: 'driver_selected', departureDateMax: 'invalid' }), now), true);
  assert.equal(accepts(request('a', { offers: [{ status: 'accepted' }], departureDateMax: 'invalid' }), now), true);
});

test('map coordinates preserve Kinshasa bounds and fall back to departure for an invalid live position', () => {
  const model = environment().load('features/home/homeModel.ts');
  const ongoing = trip('a', { status: 'ongoing' });
  assert.equal(model.isKinshasaHomeTrip(ongoing), true);
  assert.deepEqual(model.getTripMapCoordinate(ongoing, { latitude: -11.66, longitude: 27.48 }), departure.coordinates);
  assert.deepEqual(model.getTripMapCoordinate(ongoing, arrival.coordinates), arrival.coordinates);
  assert.equal(model.getTripMapCoordinate(trip('invalid', { departure: undefined })), null);
});

for (const [platform, delay] of [['ios', 260], ['android', 40]]) {
  test(`${platform}: map releases before navigation, rejects double taps, and recovers`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = environment({}, platform), routes = [];
    const { useHomeMapNavigation } = app.load('hooks/home/useHomeMapNavigation.ts');
    const props = { isFocused: true, router: { replace: route => routes.push(route), push: route => routes.push(route) } };
    const render = () => app.hooks.render(() => useHomeMapNavigation(props));
    render().openTripDetail('a');
    render().openTripDetail('b');
    assert.equal(render().shouldRenderHomeMap, false);
    t.mock.timers.tick(delay - 1);
    assert.deepEqual(routes, []);
    t.mock.timers.tick(1);
    assert.deepEqual(routes, ['/trip/a']);
    t.mock.timers.tick(1500);
    assert.equal(render().shouldRenderHomeMap, true);
    render().openTripRequestDetail('request');
    t.mock.timers.tick(delay);
    assert.equal(routes.length, 2);
    assert.ok(JSON.stringify(routes[1]).includes('request'));
    app.hooks.unmount();
  });
}

test('leaving Home or unmounting cancels a pending detail navigation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const unmount of [false, true]) {
    const app = environment(), routes = [];
    const { useHomeMapNavigation } = app.load('hooks/home/useHomeMapNavigation.ts');
    const props = { isFocused: true, router: { replace: route => routes.push(route) } };
    const render = () => app.hooks.render(() => useHomeMapNavigation(props));
    render().openTripDetail('a');
    if (unmount) app.hooks.unmount();
    else { props.isFocused = false; render(); }
    t.mock.timers.tick(3000);
    assert.deepEqual(routes, []);
    if (!unmount) {
      props.isFocused = true;
      assert.equal(render().shouldRenderHomeMap, true);
      app.hooks.unmount();
    }
  }
});

test('trip feed keeps nearby precedence without a parallel general request, polling guards and Redux fallback', async () => {
  const calls = [], dispatches = [], refreshes = [];
  const nearby = trip('shared', { price: 1000 }), general = trip('shared', { price: 2000 });
  const query = (name, data) => (args, options) => {
    calls.push({ name, args, options });
    return { data, currentData: data, isFetching: false, isLoading: false, isError: false, refetch: async () => { refreshes.push(name); return { data }; } };
  };
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsQuery: query('general', [general, trip('other')]),
    useGetTripsByCoordinatesQuery: query('nearby', [nearby]),
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const props = { isFocused: true, lastKnownLocation: { coords: { latitude: -4.32512345, longitude: 15.32212345 } }, locationRadiusKm: 5, storedTrips: [], dispatch: action => dispatches.push(action) };
  const render = () => app.hooks.render(() => useHomeTripFeed(props));
  let feed = render();
  assert.deepEqual(feed.remoteTrips.map(trip => trip.id), ['shared']);
  assert.equal(feed.remoteTrips[0], nearby);
  assert.deepEqual(calls[0].args, { departureCoordinates: [15.32212, -4.32512], departureRadiusKm: 5, minSeats: 1, limit: 50, discovery: true });
  assert.equal(calls[0].options.pollingInterval, 120000);
  assert.equal(calls[1].options.skip, true);
  assert.equal(dispatches[0].type, 'trips/setTrips');
  await feed.refetchTrips();
  assert.deepEqual(refreshes, ['nearby']);
  props.isFocused = false;
  render();
  assert.equal(calls.at(-1).options.pollingInterval, 0);
  assert.equal(calls.at(-1).options.skipPollingIfUnfocused, true);
  props.lastKnownLocation = null;
  feed = render();
  assert.equal(calls.at(-1).options.skip, true);
  assert.equal(feed.remoteTrips[0], general, 'without GPS only the general snapshot is used');
  app.hooks.unmount();
});

test('a cached feed remains visible when both network queries fail', () => {
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsQuery: () => ({ isFetching: false, isLoading: false, isError: true }),
    useGetTripsByCoordinatesQuery: () => ({ isFetching: false, isLoading: false, isError: true }),
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const result = app.hooks.render(() => useHomeTripFeed({ isFocused: true, lastKnownLocation: { coords: { latitude: -4.325, longitude: 15.3222 } }, storedTrips: [trip('cached')], dispatch() {} }));
  assert.equal(result.tripsError, false);
  assert.equal(result.showInitialHomeLoader, false);
  app.hooks.unmount();
});

test('driver Clients skips public reads but selecting Trips enables discovery and suspends it again on return', async () => {
  const calls = [], dispatches = [], refreshes = [];
  const queryState = { currentData: [trip('public')], isFetching: true, isError: true, isUninitialized: false };
  const query = name => (args, options) => {
    calls.push({ name, options });
    return { ...queryState, refetch: async () => { refreshes.push(name); return { data: queryState.currentData }; } };
  };
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsQuery: query('general'), useGetTripsByCoordinatesQuery: query('nearby'),
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const storedTrips = [trip('cached')];
  const props = { isFocused: true, isDriver: true, storedTrips,
    lastKnownLocation: { coords: departure.coordinates }, dispatch: action => dispatches.push(action) };
  const draw = () => app.hooks.render(() => useHomeTripFeed(props));
  for (const location of [props.lastKnownLocation, null]) {
    props.lastKnownLocation = location;
    const feed = draw();
    assert.equal(feed.remoteTrips, undefined);
    assert.equal(feed.tripsLoading, false);
    assert.equal(feed.tripsError, false);
    assert.equal(feed.showInitialHomeLoader, false);
    for (const call of calls.slice(-2)) {
      assert.equal(call.options.skip, true);
      assert.equal(call.options.pollingInterval, 0);
    }
    await feed.refetchTrips();
  }
  assert.deepEqual(refreshes, []);
  assert.deepEqual(dispatches, [], 'skipped discovery must not overwrite shared Redux trips');
  assert.equal(storedTrips.length, 1);
  props.storedTrips = [];
  queryState.currentData = undefined;
  assert.equal(draw().showInitialHomeLoader, false, 'no first-entry loader for a driver without cached trips');
  queryState.currentData = [trip('public')];
  props.isRequestsSheetMode = false;
  const driverTrips = draw();
  assert.equal(calls.at(-1).options.skip, false);
  assert.equal(driverTrips.remoteTrips[0].id, 'public');
  await driverTrips.refetchTrips();
  assert.deepEqual(refreshes, ['general']);
  props.isRequestsSheetMode = true;
  assert.equal(draw().remoteTrips, undefined);
  assert.equal(calls.at(-1).options.pollingInterval, 0);
  await driverTrips.refetchTrips();
  assert.deepEqual(refreshes, ['general'], 'a late Trips callback cannot refresh from Clients');
  refreshes.length = 0;
  props.isDriver = false;
  const passenger = draw();
  assert.equal(calls.at(-1).options.skip, false);
  assert.equal(passenger.remoteTrips[0].id, 'public');
  const dispatchCount = dispatches.length;
  props.isDriver = true;
  assert.equal(draw().remoteTrips, undefined, 'cached data disappears in the same render as the role change');
  await passenger.refetchTrips();
  assert.deepEqual(refreshes, [], 'a stale passenger callback cannot restart a skipped query');
  assert.equal(dispatches.length, dispatchCount);
  app.hooks.unmount();
});

test('empty nearby results load a bounded general feed without geographic or date restrictions', async () => {
  const calls = [], refreshes = [];
  const nearby = { currentData: [], isError: false, isFetching: false, isUninitialized: false,
    refetch: async () => { refreshes.push('nearby'); return { data: [] }; } };
  const general = { currentData: [], isFetching: false, isUninitialized: false,
    refetch: async () => { refreshes.push('general'); return { data: [] }; } };
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsByCoordinatesQuery: (args, options) => { calls.push({ name: 'nearby', args, options }); return nearby; },
    useGetTripsQuery: (args, options) => { calls.push({ name: 'general', args, options }); return general; },
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const props = { isFocused: true, storedTrips: [], dispatch() {}, locationRadiusKm: 50,
    lastKnownLocation: { coords: { latitude: -4.325, longitude: 15.3222 } } };
  const draw = () => app.hooks.render(() => useHomeTripFeed(props));
  draw();
  assert.equal(calls[0].args.departureRadiusKm, 5, 'a broad search preference must not broaden Home');
  assert.equal(calls.at(-1).options.skip, false);
  await draw().refetchTrips();
  assert.deepEqual(refreshes, ['nearby', 'general']);
  nearby.isError = true; draw();
  assert.equal(calls.at(-1).options.skip, false);
  assert.deepEqual(calls.at(-1).args, { minSeats: 1, limit: 50, sort: 'date', discovery: true });
  props.isFocused = false; draw();
  assert.equal(calls.at(-1).options.skip, true);
  props.isFocused = true; props.lastKnownLocation = null; draw();
  assert.equal(calls.at(-1).options.skip, false, 'GPS is not required to browse published departures');
  assert.equal(calls.at(-2).options.skip, true);
  assert.equal(draw().tripsLoading, false);
  props.lastKnownLocation = { coords: { latitude: 0, longitude: 0 } }; draw();
  assert.equal(calls.at(-2).options.skip, true);
  assert.equal(calls.at(-1).options.skip, false);
  refreshes.length = 0;
  await draw().refetchTrips();
  assert.deepEqual(refreshes, ['general']);
  app.hooks.unmount();
});

const selectionProps = () => ({ remoteTrips: [], storedTrips: [], activeBookings: [], currentUser: { id: 'me' }, completedBookingTripIds: new Set(), bookedTripIds: new Set(), refreshedPassengerTrip: undefined, trackedTripInfo: null, ongoingDriverTrip: null, isDriver: false, driverReservationHighlightTrip: null, driverReservationHighlightBookings: [], myDriverTrips: [], liveUserCoordinate: departure.coordinates });

test('wider Home reads wait for nearby completion, ignore unavailable suggestions and stop when a close ride appears', () => {
  const calls = [], dispatches = [];
  const nearby = { currentData: undefined, isFetching: true, isError: false, fulfilledTimeStamp: 1 };
  const wide = { currentData: [trip('wider', { departure: { lat: -4.4, lng: 15.3222 } })], isFetching: false };
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsByCoordinatesQuery: (args, options) => { calls.push({ name: 'nearby', args, options }); return nearby; },
    useGetTripsQuery: (args, options) => { calls.push({ name: 'wide', args, options }); return wide; },
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const props = { isFocused: true, currentUser: { id: 'me' }, storedTrips: [],
    bookedTripIds: new Set(['reserved']), completedBookingTripIds: new Set(['done']),
    lastKnownLocation: { coords: departure.coordinates }, dispatch: action => dispatches.push(action) };
  const draw = () => app.hooks.render(() => useHomeTripFeed(props));
  assert.equal(draw().remoteTrips, undefined);
  assert.equal(calls.at(-1).options.skip, true, 'cached wide data cannot trigger parallel discovery on entry');
  nearby.isFetching = false;
  nearby.currentData = [trip('mine', { driverId: 'me' }), trip('reserved'), trip('done'), trip('full', { availableSeats: 0 }),
    trip('late', { departureTime: new Date(Date.now() + 3 * 86400000).toISOString() })];
  assert.equal(draw().remoteTrips[0].id, 'wider');
  assert.equal(calls.at(-1).options.skip, false);
  const count = dispatches.length;
  for (let i = 0; i < 100; i++) draw();
  assert.equal(dispatches.length, count, 'stable feeds do not dispatch on every render');
  nearby.currentData = [trip('new-nearby')];
  assert.deepEqual(draw().remoteTrips.map(item => item.id), ['new-nearby']);
  assert.equal(calls.at(-1).options.skip, true);
  assert.equal(calls.at(-1).options.pollingInterval, 0);
  nearby.currentData = [];
  wide.currentData = undefined;
  wide.isError = true;
  props.storedTrips = [trip('cached')];
  const beforeFailure = dispatches.length;
  assert.equal(draw().remoteTrips, undefined, 'an unavailable wider feed does not erase the stored snapshot');
  assert.equal(dispatches.length, beforeFailure);
  props.storedTrips = [];
  assert.equal(draw().tripsError, true);
  nearby.currentData = [trip('mine', { driverId: 'me' })];
  assert.equal(draw().tripsError, true, 'irrelevant server records must not disguise a failed wider search as an empty result');
  wide.isFetching = true; wide.isError = false;
  assert.equal(draw().tripsLoading, true, 'show loading while wider discovery is pending, not a false empty list');
  nearby.currentData = [trip('shared')]; nearby.isError = true;
  wide.currentData = [trip('shared', { status: 'cancelled' })]; wide.isFetching = false; wide.fulfilledTimeStamp = 2;
  assert.equal(draw().remoteTrips[0].status, 'cancelled', 'a stale narrow response cannot resurrect a cancelled departure');
  nearby.fulfilledTimeStamp = 3; nearby.isError = false;
  assert.equal(draw().remoteTrips[0].status, 'upcoming', 'a successful newer nearby response becomes authoritative again');
  app.hooks.unmount();
});
test('trip selection prioritizes reservations, removes own/completed/expired trips, and caps the list', () => {
  const app = environment(), { useHomeTripSelection } = app.load('hooks/home/useHomeTripSelection.ts');
  const booked = trip('booked', { departureTime: new Date(Date.now() + 2 * 86400000).toISOString() });
  const props = { ...selectionProps(), remoteTrips: [trip('mine', { driverId: 'me' }), trip('done'), trip('old', { departureTime: '2020-01-01' }), ...Array.from({ length: 20 }, (_, index) => trip('t' + index))], activeBookings: [{ tripId: 'booked', trip: booked }], bookedTripIds: new Set(['booked']), completedBookingTripIds: new Set(['done']) };
  const selected = app.hooks.render(() => useHomeTripSelection(props));
  assert.equal(selected.latestTrips.length, 10);
  assert.equal(selected.latestTrips[0], booked);
  assert.equal(selected.latestTrips.some(trip => ['mine', 'done', 'old'].includes(trip.id)), false);
  app.hooks.unmount();
});

test('a stale tracking hint cannot lock Home or hide the feed without an active participation', () => {
  const app = environment(), { useHomeTripSelection } = app.load('hooks/home/useHomeTripSelection.ts');
  const props = { ...selectionProps(), remoteTrips: [trip('other')], trackedTripInfo: { tripId: 'active', role: 'passenger' } };
  const render = () => app.hooks.render(() => useHomeTripSelection(props));
  assert.equal(render().isHomeSheetLockedRetracted, false);
  assert.deepEqual(render().homeMapTrips.map(trip => trip.id), ['other']);
  props.refreshedPassengerTrip = trip('active', { status: 'ongoing' });
  assert.deepEqual(render().homeMapTrips.map(trip => trip.id), ['other'], 'tracking alone is not proof of participation');
  props.activeBookings = [{ id: 'mine', tripId: 'active', passengerId: 'me', status: 'accepted' }];
  assert.deepEqual(render().homeMapTrips.map(trip => trip.id), ['active']);
  app.hooks.unmount();
});

test('map and camera ignore discovery and role changes, with or without GPS', () => {
  const app = environment();
  const { useHomeMap } = app.load('hooks/home/useHomeMap.ts');
  const props = { isFocused: false, liveUserCoordinate: null, openingMapDetailKey: null };
  const draw = () => app.hooks.render(() => useHomeMap(props));
  const initial = draw().mapRegion;
  props.homeMapTrips = [trip('public')]; props.availableDriverRequests = [request('client')];
  props.isDriver = true; props.isRequestsSheetMode = true;
  assert.equal(draw().mapRegion, initial);
  assert.equal(draw().userCoordinate, null, 'no fictional location marker before GPS');
  props.liveUserCoordinate = arrival.coordinates;
  assert.deepEqual(draw().userCoordinate, arrival.coordinates);
  const centered = draw().mapRegion;
  props.isRequestsSheetMode = false; props.isDriver = false;
  assert.equal(draw().mapRegion, centered);
  assert.equal(draw().tripsWithMapCoordinates, undefined);
  assert.equal(draw().tripRequestsWithMapCoordinates, undefined);
  assert.equal(draw().passengerMarkerRefs, undefined);
  app.hooks.unmount();
});

test('driver discovery filtering preserves personal active rides independently of the own-position map', () => {
  const app = environment();
  const { useHomeTripSelection } = app.load('hooks/home/useHomeTripSelection.ts');
  const own = trip('own', { driverId: 'me', status: 'ongoing' });
  const ride = trip('reserved', { status: 'ongoing' });
  const props = { ...selectionProps(), isDriver: true, remoteTrips: [trip('public')], ongoingDriverTrip: own };
  const draw = () => app.hooks.render(() => useHomeTripSelection(props));
  assert.equal(draw().activeHomeTrip, own);
  props.isRequestsSheetMode = false;
  assert.equal(draw().activeHomeTrip, own);
  props.isRequestsSheetMode = true;
  props.ongoingDriverTrip = null;
  props.activeBookings = [{ id: 'booking', passengerId: 'me', status: 'accepted', tripId: ride.id, trip: ride }];
  assert.equal(draw().ongoingBookedTrip, ride);
  props.activeBookings = [{ ...props.activeBookings[0], trip: undefined }];
  props.remoteTrips = undefined; props.storedTrips = [ride, trip('public')];
  assert.equal(draw().activeHomeTrip, ride);
  props.refreshedPassengerTrip = { ...ride, status: 'completed' };
  assert.equal(draw().activeHomeTrip, null, 'server completion wins');
  app.hooks.unmount();
});

test('passenger activity excludes own, linked and expired requests and preserves role-based query skipping', () => {
  const calls = [];
  const requests = [request('available'), request('own', { passengerId: 'me' }), request('linked', { tripId: 'trip' }), request('expired', { departureDateMax: '2020-01-01' })];
  const app = environment({
    '@/store/api/notificationApi': { useGetNotificationsQuery: () => ({ data: { unreadCount: 2 } }) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: [], refetch() {} }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({}) },
    '@/store/api/tripRequestApi': {
      useGetMyTripRequestsQuery: () => ({ data: [request('foreign-cache'), request('own', { passengerId: 'me' })] }),
      useGetAvailableTripRequestsQuery: (_args, options) => { calls.push(options); return { data: requests }; },
    },
  });
  const { useHomePassengerActivity } = app.load('hooks/home/useHomePassengerActivity.ts');
  const props = { isFocused: true, currentUser: { id: 'me' }, isDriver: true, trackedTripInfo: null };
  const render = () => app.hooks.render(() => useHomePassengerActivity(props));
  assert.deepEqual(render().availableDriverRequests.map(request => request.id), ['available']);
  assert.equal(render().activeTripRequest.id, 'own');
  props.isDriver = false;
  assert.deepEqual(render().availableDriverRequests, []);
  assert.equal(render().activeTripRequest.id, 'own');
  assert.equal(calls.at(-1).skip, true);
  props.isFocused = false;
  render();
  assert.equal(calls.at(-1).pollingInterval, 0);
  app.hooks.unmount();
});

function trackingEnvironment(extra = {}) {
  const events = {}, calls = [], dialogs = [];
  const socket = {
    joinTrip: async id => { calls.push(['join', id]); },
    leaveTrip: async id => { calls.push(['leave', id]); },
    requestPassengerLocations: async id => { calls.push(['passengers', id]); },
    requestDriverLocation: async id => { calls.push(['driver', id]); },
    updateDriverLocation: async (...args) => { calls.push(['location', ...args]); },
    subscribeToPassengerLocation: callback => { events.location = callback; return () => calls.push(['unsubscribe-location']); },
    subscribeToBookingAutoProgress: callback => { events.progress = callback; return () => calls.push(['unsubscribe-progress']); },
    ...extra,
  };
  const app = environment({ '@/services/trackingSocket': { trackingSocket: socket } });
  const { useHomeTracking } = app.load('hooks/home/useHomeTracking.ts');
  const activeTrip = trip('active', { status: 'ongoing' });
  const props = { showDialog: dialog => dialogs.push(dialog), activeBookings: [], activePassengerBooking: null, ongoingDriverBookings: [{ id: 'booking', passengerName: 'Alice' }], refetchMyBookings: () => calls.push(['refresh-passenger']), refetchOngoingDriverBookings: () => calls.push(['refresh-driver']), activeHomeTrip: activeTrip, ongoingDriverTrip: activeTrip, isFocused: true, liveUserCoordinate: departure.coordinates };
  return { ...app, events, calls, dialogs, props, render: () => app.hooks.render(() => useHomeTracking(props)) };
}

test('Home skips other-user positions but retains deduplicated progress and fresh bookings', async () => {
  const app = trackingEnvironment();
  app.render(); await tick();
  assert.equal(app.events.location, undefined, 'no passenger position listener');
  assert.equal(app.calls.some(call => ['passengers', 'driver'].includes(call[0])), false);
  app.props.ongoingDriverBookings = [{ id: 'booking', passengerName: 'Béatrice' }];
  app.render();
  const progress = type => app.events.progress({ tripId: 'active', events: [{ type, tripId: 'active', bookingId: 'booking' }] });
  progress('pickup_confirmed'); progress('pickup_confirmed'); progress('driver_arrived_pickup');
  assert.equal(app.dialogs.length, 1);
  assert.ok(app.dialogs[0].message.includes('Béatrice'));
  assert.equal(app.calls.filter(call => call[0] === 'join').length, 1);
  app.props.isFocused = false; app.render(); progress('dropoff_confirmed');
  assert.equal(app.dialogs.length, 1);
  assert.ok(app.calls.some(call => call[0] === 'unsubscribe-progress'));
  assert.ok(app.calls.some(call => call[0] === 'leave'));
  app.hooks.unmount();
});

test('Home passenger pickup uses the refreshed trip vehicle without reconnecting the socket', async () => {
  const app = trackingEnvironment();
  app.props.ongoingDriverTrip = null;
  app.props.activePassengerBooking = { id: 'mine', tripId: 'active', status: 'accepted',
    numberOfSeats: 3, trip: trip('active', { vehicleId: 'vehicle', vehicle: undefined }) };
  app.render(); await tick();
  const vehicle = { id: 'vehicle', brand: 'Toyota', model: 'Yaris', color: 'rouge', licensePlate: '1234AB01' };
  app.props.activeHomeTrip = trip('active', { status: 'ongoing', vehicleId: vehicle.id, vehicle });
  app.render();
  const payload = { tripId: 'active', events: [
    { type: 'parties_nearby', tripId: 'active', bookingId: 'mine', distanceMeters: 5 },
  ] };
  app.events.progress(payload); app.events.progress(payload);
  assert.equal(app.dialogs.length, 1, 'one alert for the booking holder despite three seats');
  assert.equal(app.dialogs[0].content.props.trip, app.props.activeHomeTrip);
  assert.equal(app.dialogs[0].content.props.trip.vehicle, vehicle);
  assert.equal(app.calls.filter(call => call[0] === 'join').length, 1);
  app.props.isFocused = false; app.render();
  app.events.progress({ tripId: 'active', events: [
    { type: 'driver_arrived_pickup', tripId: 'active', bookingId: 'mine' },
  ] });
  assert.equal(app.dialogs.length, 1, 'no new alert after leaving Home');
  app.hooks.unmount();
});

test('Home driver receives one approach per booking after readiness but never after arrival or boarding', async () => {
  const app = trackingEnvironment();
  app.render(); await tick();
  const emit = (type, bookingId = 'booking') => app.events.progress({ tripId: 'active', events: [
    { type, bookingId, tripId: 'active', distanceMeters: 300 },
  ] });
  emit('passenger_ready_pickup'); emit('driver_near_pickup'); emit('driver_near_pickup');
  assert.equal(app.dialogs.length, 2); assert.match(app.dialogs[1].message, /Vous approchez.*300 m/);
  emit('driver_arrived_pickup', 'second'); emit('driver_near_pickup', 'second');
  assert.equal(app.dialogs.length, 3);
  emit('pickup_confirmed', 'third'); emit('driver_near_pickup', 'third');
  assert.equal(app.dialogs.length, 4);
  app.hooks.unmount();
});

test('a late socket join does not request locations after Home unmounts', async () => {
  let finishJoin;
  const app = trackingEnvironment({ joinTrip: () => new Promise(resolve => { finishJoin = resolve; }) });
  app.render(); app.hooks.unmount(); finishJoin(); await tick();
  assert.equal(app.calls.some(call => call[0] === 'passengers'), false);
});

test('driver GPS emissions keep their four-second throttle and stop out of focus', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const app = trackingEnvironment();
  app.render();
  app.props.liveUserCoordinate = { latitude: -4.326, longitude: 15.323 };
  t.mock.timers.tick(1000); app.render();
  assert.equal(app.calls.filter(call => call[0] === 'location').length, 1);
  t.mock.timers.tick(3000);
  app.props.liveUserCoordinate = { latitude: -4.327, longitude: 15.324 }; app.render();
  assert.equal(app.calls.filter(call => call[0] === 'location').length, 2);
  app.props.isFocused = false;
  t.mock.timers.tick(5000); app.render();
  assert.equal(app.calls.filter(call => call[0] === 'location').length, 2);
  app.hooks.unmount();
});

// Passenger marker preparation was removed from Home; navigation tracking is unchanged.

test('a delayed user location cannot move a closed map and duplicate taps make one location request', async () => {
  let resolveLocation, requests = 0, geocodes = 0;
  const app = environment({ '@/utils/currentLocationSelection': { buildCurrentLocationSelection: async () => { geocodes++; return {}; } } });
  const { useHomeUserLocation } = app.load('hooks/home/useHomeUserLocation.ts');
  const movements = [];
  const props = { isFocused: true, openingMapDetailKey: null, liveUserCoordinate: null, ongoingDriverTrip: null, lastKnownLocation: null, getCurrentLocation: () => { requests++; return new Promise(resolve => { resolveLocation = resolve; }); }, showDialog() {}, setMapFocusedOnUser() {}, animateHomeMapToRegion: (...args) => movements.push(args) };
  const render = () => app.hooks.render(() => useHomeUserLocation(props));
  const action = render().handleReturnToUserLocation();
  await render().handleReturnToUserLocation();
  assert.equal(requests, 1);
  props.openingMapDetailKey = 'trip:a'; render();
  resolveLocation({ coords: departure.coordinates }); await action;
  assert.deepEqual(movements, []);
  assert.equal(geocodes, 0);
  props.openingMapDetailKey = null; render();
  assert.equal(render().isCenteringOnUser, false);
  app.hooks.unmount();
});

test('successful recentering needs no geocoding, custom marker state or callout timer', async () => {
  let geocodes = 0;
  const app = environment({ '@/utils/currentLocationSelection': { buildCurrentLocationSelection: async () => { geocodes++; } } });
  const { useHomeUserLocation } = app.load('hooks/home/useHomeUserLocation.ts');
  const movements = [], errors = [];
  const props = { isFocused: true, openingMapDetailKey: null, lastKnownLocation: null,
    getCurrentLocation: async () => ({ coords: departure.coordinates }), showDialog: error => errors.push(error),
    animateHomeMapToRegion: (...args) => movements.push(args) };
  const draw = () => app.hooks.render(() => useHomeUserLocation(props));
  await draw().handleReturnToUserLocation();
  assert.equal(movements.length, 1);
  assert.equal(movements[0][0].latitude, departure.lat);
  assert.equal(geocodes, 0); assert.deepEqual(errors, []);
  assert.equal(draw().userLocationMarkerRef, undefined);
  assert.equal(draw().isCenteringOnUser, false);
  app.hooks.unmount();
});

// Static image markers no longer require redraw jobs; verified in homeOwnLocation.test.js.

test('map camera animation is cancelled on blur, and invalid coordinates use the Kinshasa region', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = environment(), movements = [];
  const { useHomeMap } = app.load('hooks/home/useHomeMap.ts');
  const props = { isFocused: true, homeMapTrips: [], ongoingDriverTrip: null, liveUserCoordinate: null, isHomeSheetLockedRetracted: false, availableDriverRequests: [], visibleDriverPassengerMarkers: [], openingMapDetailKey: null };
  const render = () => app.hooks.render(() => useHomeMap(props));
  assert.equal(render().mapRegion.latitude, -4.325);
  const camera = render();
  camera.attachHomeMap({ animateToRegion: region => movements.push(region) });
  camera.onHomeMapReady();
  camera.onHomeMapLayout({ nativeEvent: { layout: { width: 400, height: 600 } } });
  props.liveUserCoordinate = departure.coordinates; render();
  assert.equal(movements.length, 1);
  movements.length = 0;
  props.liveUserCoordinate = arrival.coordinates; render();
  props.isFocused = false; render();
  t.mock.timers.tick(1500);
  assert.deepEqual(movements, []);
  props.isFocused = true; render();
  assert.equal(movements.length, 1);
  assert.equal(movements[0].longitude, arrival.lng);
  app.hooks.unmount();
});

test('passenger tracking only presents progress for the active passenger booking', async () => {
  const app = trackingEnvironment();
  app.props.ongoingDriverTrip = null;
  app.props.activePassengerBooking = { id: 'mine', tripId: 'active' };
  app.props.activeBookings = [{ id: 'mine', tripId: 'active', status: 'accepted' }];
  app.render(); await tick();
  app.events.progress({ tripId: 'active', events: [
    { type: 'pickup_confirmed', tripId: 'active', bookingId: 'other' },
    { type: 'passenger_ready_pickup', tripId: 'active', bookingId: 'mine' },
    { type: 'driver_arrived_pickup', tripId: 'active', bookingId: 'mine' },
  ] });
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.calls.some(call => call[0] === 'driver'), false, 'no unused map position snapshot');
  assert.ok(app.calls.some(call => call[0] === 'refresh-passenger'));
  assert.equal(app.calls.some(call => call[0] === 'location'), false);
  app.hooks.unmount();
});

test('sheet data follows the role immediately and retains refresh/navigation during an active trip', () => {
  const app = environment();
  const { useHomeSheet } = app.load('hooks/home/useHomeSheet.ts');
  const routes = [], refreshes = [];
  const props = { isDriver: true, isHomeSheetLockedRetracted: false, currentUser: { firstName: 'Alice' }, notificationsData: { unreadCount: 1 }, width: 390, height: 844, insets: { bottom: 34 }, latestTrips: [trip('a')], availableDriverRequests: [request('r')], ongoingDriverTrip: null, trackedTripInfo: null, visibleDriverPassengerMarkers: [], availableTripRequestsLoading: false, tripsLoading: false, availableTripRequestsError: false, tripsError: false, refetchAvailableTripRequests: () => refreshes.push('requests'), refetchTrips: () => refreshes.push('trips'), router: { push: route => routes.push(route) } };
  const render = () => app.hooks.render(() => useHomeSheet(props));
  const refresh = render().refetchSheetContent;
  assert.equal(render().refetchSheetContent, refresh);
  assert.equal(render().isRequestsSheetMode, true);
  render().openSheetIndex(); render().refetchSheetContent();
  assert.deepEqual(routes, ['/requests']);
  assert.deepEqual(refreshes, ['requests']);
  props.isRequestsSheetMode = false;
  render().openSheetIndex(); render().refetchSheetContent();
  assert.deepEqual(routes, ['/requests', '/search']);
  assert.deepEqual(refreshes, ['requests', 'trips']);
  props.isRequestsSheetMode = true;
  props.isHomeSheetLockedRetracted = true; render();
  assert.equal(render().toggleTripsSheet, undefined, 'the dashboard no longer auto-collapses');
  assert.equal(render().isRequestsSheetMode, true);
  props.isHomeSheetLockedRetracted = false; props.isDriver = false; render();
  assert.equal(render().isRequestsSheetMode, false);
  render().openSheetIndex(); render().refetchSheetContent();
  assert.deepEqual(routes, ['/requests', '/search', '/search']);
  assert.deepEqual(refreshes, ['requests', 'trips', 'trips']);
  app.hooks.unmount();
});

test('offline Home never presents an empty marketplace or hides cached clients behind an error', () => {
  for (const isDriver of [false, true]) {
    const app = environment();
    const { useHomeSheet } = app.load('hooks/home/useHomeSheet.ts');
    const props = { isDriver, isOnline: false, width: 390, height: 844, insets: { bottom: 34 },
      latestTrips: [], availableDriverRequests: [], tripsLoading: false, tripsError: false,
      availableTripRequestsLoading: false, availableTripRequestsError: false, router: {} };
    const render = () => app.hooks.render(() => useHomeSheet(props));
    assert.equal(render().sheetOffline, true);
    assert.equal(render().sheetLoading, false);
    assert.equal(render().sheetError, false);
    props.availableDriverRequests = [request('r')]; props.latestTrips = [trip('t')];
    props.tripsError = true; props.availableTripRequestsError = true;
    assert.equal(render().sheetEmpty, false);
    assert.equal(render().sheetError, false);
    props.isOnline = true;
    assert.equal(render().sheetOffline, false);
    assert.equal(render().sheetError, false, 'cached entries survive a failed refresh');
    app.hooks.unmount();
  }
});
