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
  assert.equal(accepts(request('a', { departureDateMax: new Date(now - 29999).toISOString() }), now), true);
  assert.equal(accepts(request('a', { departureDateMax: new Date(now - 30000).toISOString() }), now), false);
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

test('trip feed keeps RTK Query reads, nearby precedence, polling guards and the existing Redux fallback', () => {
  const calls = [], dispatches = [], refreshes = [];
  const nearby = trip('shared', { price: 1000 }), general = trip('shared', { price: 2000 });
  const query = (name, data) => (args, options) => {
    calls.push({ name, args, options });
    return { data, isLoading: false, isError: false, refetch: () => refreshes.push(name) };
  };
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsQuery: query('general', [general, trip('other')]),
    useGetTripsByCoordinatesQuery: query('nearby', [nearby]),
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const props = { isFocused: true, lastKnownLocation: { coords: { latitude: -4.32512345, longitude: 15.32212345 } }, locationRadiusKm: 5, storedTrips: [], dispatch: action => dispatches.push(action) };
  const render = () => app.hooks.render(() => useHomeTripFeed(props));
  let feed = render();
  assert.deepEqual(feed.remoteTrips.map(trip => trip.id), ['shared', 'other']);
  assert.equal(feed.remoteTrips[0], nearby);
  assert.deepEqual(calls[1].args, { departureCoordinates: [15.32212, -4.32512], departureRadiusKm: 5, minSeats: 1 });
  assert.equal(calls[1].options.pollingInterval, 120000);
  assert.equal(dispatches[0].type, 'trips/setTrips');
  feed.refetchTrips();
  assert.deepEqual(refreshes, ['nearby', 'general']);
  props.isFocused = false;
  render();
  assert.equal(calls.at(-1).options.pollingInterval, 0);
  assert.equal(calls.at(-1).options.skipPollingIfUnfocused, true);
  props.lastKnownLocation = null;
  feed = render();
  assert.equal(calls.at(-1).options.skip, true);
  assert.equal(feed.remoteTrips[0], general);
  app.hooks.unmount();
});

test('a cached feed remains visible when both network queries fail', () => {
  const app = environment({ '@/store/api/tripApi': {
    useGetTripsQuery: () => ({ isLoading: false, isError: true }),
    useGetTripsByCoordinatesQuery: () => ({ isLoading: false, isError: true }),
  } });
  const { useHomeTripFeed } = app.load('hooks/home/useHomeTripFeed.ts');
  const result = app.hooks.render(() => useHomeTripFeed({ isFocused: true, lastKnownLocation: null, locationRadiusKm: 5, storedTrips: [trip('cached')], dispatch() {} }));
  assert.equal(result.tripsError, false);
  assert.equal(result.showInitialHomeLoader, false);
  app.hooks.unmount();
});

const selectionProps = () => ({ remoteTrips: [], storedTrips: [], activeBookings: [], currentUser: { id: 'me' }, completedBookingTripIds: new Set(), bookedTripIds: new Set(), refreshedPassengerTrip: undefined, trackedTripInfo: null, ongoingDriverTrip: null, isDriver: false, driverReservationHighlightTrip: null, driverReservationHighlightBookings: [], myDriverTrips: [] });
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

test('restoration locks the sheet and waits for the tracked trip without showing unrelated map trips', () => {
  const app = environment(), { useHomeTripSelection } = app.load('hooks/home/useHomeTripSelection.ts');
  const props = { ...selectionProps(), remoteTrips: [trip('other')], trackedTripInfo: { tripId: 'active', role: 'passenger' } };
  const render = () => app.hooks.render(() => useHomeTripSelection(props));
  assert.equal(render().isHomeSheetLockedRetracted, true);
  assert.deepEqual(render().homeMapTrips, []);
  props.refreshedPassengerTrip = trip('active', { status: 'ongoing' });
  assert.deepEqual(render().homeMapTrips, [], 'tracking alone is not proof of participation');
  props.activeBookings = [{ id: 'mine', tripId: 'active', passengerId: 'me', status: 'accepted' }];
  assert.deepEqual(render().homeMapTrips.map(trip => trip.id), ['active']);
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
      useGetMyTripRequestsQuery: () => ({ data: [request('own')] }),
      useGetAvailableTripRequestsQuery: (_args, options) => { calls.push(options); return { data: requests }; },
    },
  });
  const { useHomePassengerActivity } = app.load('hooks/home/useHomePassengerActivity.ts');
  const props = { isFocused: true, currentUser: { id: 'me' }, isDriver: true, trackedTripInfo: null };
  const render = () => app.hooks.render(() => useHomePassengerActivity(props));
  assert.deepEqual(render().availableDriverRequests.map(request => request.id), ['available']);
  props.isDriver = false;
  assert.deepEqual(render().availableDriverRequests, []);
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

test('live tracking ignores unrelated/stale locations, deduplicates progress, and uses fresh bookings without reconnecting', async () => {
  const app = trackingEnvironment();
  app.render(); await tick();
  app.events.location({ tripId: 'other', bookingId: 'booking', coordinates: [15.33, -4.33] });
  app.events.location({ tripId: 'active', bookingId: 'booking', coordinates: [15.33, -4.33], updatedAt: '2020-01-01' });
  assert.deepEqual(app.render().liveDriverPassengerLocations, {});
  app.events.location({ tripId: 'active', bookingId: 'booking', coordinates: [15.33, -4.33], updatedAt: new Date().toISOString() });
  assert.equal(app.render().liveDriverPassengerLocations.booking.coordinate.latitude, -4.33);
  app.props.ongoingDriverBookings = [{ id: 'booking', passengerName: 'Béatrice' }];
  app.render();
  const progress = type => app.events.progress({ tripId: 'active', events: [{ type, tripId: 'active', bookingId: 'booking' }] });
  progress('pickup_confirmed'); progress('pickup_confirmed'); progress('driver_arrived_pickup');
  assert.equal(app.dialogs.length, 1);
  assert.ok(app.dialogs[0].message.includes('Béatrice'));
  assert.equal(app.calls.filter(call => call[0] === 'join').length, 1);
  app.props.isFocused = false; app.render();
  app.events.location({ tripId: 'active', bookingId: 'late', coordinates: [15.33, -4.33] });
  progress('dropoff_confirmed');
  assert.deepEqual(app.render().liveDriverPassengerLocations, {});
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

test('passenger markers keep pickup fallback, hide onboard passengers and cap native markers', () => {
  const app = environment(), { useHomePassengerMarkers } = app.load('hooks/home/useHomePassengerMarkers.ts');
  const bookings = Array.from({ length: 20 }, (_, index) => ({ id: String(index), status: 'accepted', passengerId: String(index), passengerLocationUpdatedAt: '2020-01-01', passengerLocationCoordinates: arrival.coordinates }));
  bookings[0].pickedUp = true;
  const result = app.hooks.render(() => useHomePassengerMarkers({ ongoingDriverTrip: trip('a', { status: 'ongoing' }), ongoingDriverBookings: bookings, liveDriverPassengerLocations: {} }));
  assert.equal(result.visibleDriverPassengerMarkers.length, 10);
  assert.equal(result.visibleDriverPassengerMarkers.some(marker => marker.bookingId === '0'), false);
  assert.deepEqual(result.visibleDriverPassengerMarkers[0].coordinate, departure.coordinates);
  assert.equal(result.visibleDriverPassengerMarkers[0].isLive, false);
  app.hooks.unmount();
});

test('a delayed user location cannot move a closed map and duplicate taps make one location request', async () => {
  let resolveLocation, requests = 0, geocodes = 0;
  const app = environment({ '@/utils/currentLocationSelection': { buildCurrentLocationSelection: async () => { geocodes++; return {}; } } });
  const { useHomeUserLocation } = app.load('hooks/home/useHomeUserLocation.ts');
  const movements = [];
  const props = { isFocused: true, openingMapDetailKey: null, liveUserCoordinate: null, ongoingDriverTrip: null, lastKnownLocation: null, getCurrentLocation: () => { requests++; return new Promise(resolve => { resolveLocation = resolve; }); }, showDialog() {}, setMapFocusedOnUser() {}, mapRef: { current: { animateToRegion: (...args) => movements.push(args) } } };
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

test('successful recentering preserves the address preview and cancels callouts on unmount', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = environment({ '@/utils/currentLocationSelection': { buildCurrentLocationSelection: async () => ({ title: 'Ma position', address: 'Boulevard du 30 Juin' }) } });
  const { useHomeUserLocation } = app.load('hooks/home/useHomeUserLocation.ts');
  let callouts = 0;
  const props = { isFocused: true, openingMapDetailKey: null, liveUserCoordinate: null, ongoingDriverTrip: null, lastKnownLocation: null, getCurrentLocation: async () => ({ coords: departure.coordinates }), showDialog() {}, setMapFocusedOnUser() {}, mapRef: { current: { animateToRegion() {} } } };
  const render = () => app.hooks.render(() => useHomeUserLocation(props));
  render().userLocationMarkerRef.current = { showCallout() { callouts++; } };
  await render().handleReturnToUserLocation();
  assert.equal(render().userLocationMarker.address, 'Boulevard du 30 Juin');
  t.mock.timers.tick(140);
  assert.equal(callouts, 1);
  app.hooks.unmount();
  t.mock.timers.tick(1000);
  assert.equal(callouts, 1);
});

test('Android marker redraws are bounded, deduplicated and cancelled when the map is released', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = environment({}, 'android');
  const { useHomeMarkerReadiness } = app.load('hooks/home/useHomeMarkerReadiness.ts');
  let redraws = 0, loaded = new Set();
  const props = { enabled: true, tripId: 'a', passengerMarkerRefs: { current: { booking: { redraw() { redraws++; } } } }, setLoadedTripMarkerKeys: update => { loaded = update(loaded); } };
  const render = () => app.hooks.render(() => useHomeMarkerReadiness(props));
  render()('marker', 'booking');
  render()('marker', 'booking');
  t.mock.timers.tick(320);
  assert.equal(redraws, 2);
  assert.deepEqual([...loaded], ['marker']);
  render()('next', 'booking');
  props.enabled = false; render();
  t.mock.timers.tick(1000);
  assert.equal(redraws, 2);
  assert.deepEqual([...loaded], ['marker']);
  props.enabled = true; render()('last', 'booking');
  app.hooks.unmount();
  t.mock.timers.tick(1000);
  assert.equal(redraws, 2);
});

test('map camera animation is cancelled on blur, and invalid coordinates use the Kinshasa region', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const app = environment(), movements = [];
  const { useHomeMap } = app.load('hooks/home/useHomeMap.ts');
  const props = { isFocused: true, homeMapTrips: [], ongoingDriverTrip: null, liveUserCoordinate: null, isHomeSheetLockedRetracted: false, availableDriverRequests: [], visibleDriverPassengerMarkers: [], openingMapDetailKey: null };
  const render = () => app.hooks.render(() => useHomeMap(props));
  assert.equal(render().mapRegion.latitude, -4.325);
  render().mapRef.current = { animateToRegion: region => movements.push(region) };
  props.homeMapTrips = [trip('a')]; render();
  assert.equal(movements.length, 1);
  movements.length = 0;
  props.homeMapTrips = [trip('b', { departure: arrival })]; render();
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
  assert.ok(app.calls.some(call => call[0] === 'driver'));
  assert.ok(app.calls.some(call => call[0] === 'refresh-passenger'));
  assert.equal(app.calls.some(call => call[0] === 'location'), false);
  app.hooks.unmount();
});

test('sheet switches between trips/requests, keeps stable actions and retracts during an active trip', () => {
  const app = environment();
  const { useHomeSheet } = app.load('hooks/home/useHomeSheet.ts');
  const routes = [], refreshes = [];
  const props = { isDriver: true, isHomeSheetLockedRetracted: false, currentUser: { firstName: 'Alice' }, notificationsData: { unreadCount: 1 }, width: 390, height: 844, insets: { bottom: 34 }, latestTrips: [trip('a')], availableDriverRequests: [request('r')], ongoingDriverTrip: null, trackedTripInfo: null, visibleDriverPassengerMarkers: [], availableTripRequestsLoading: false, tripsLoading: false, availableTripRequestsError: false, tripsError: false, refetchAvailableTripRequests: () => refreshes.push('requests'), refetchTrips: () => refreshes.push('trips'), router: { push: route => routes.push(route) } };
  const render = () => app.hooks.render(() => useHomeSheet(props));
  const toggle = render().toggleTripsSheet;
  assert.equal(render().toggleTripsSheet, toggle);
  toggle();
  assert.equal(render().effectiveTripsSheetOpen, true);
  render().setHomeSheetMode('requests');
  render().openSheetIndex(); render().refetchSheetContent();
  assert.deepEqual(routes, ['/requests']);
  assert.deepEqual(refreshes, ['requests']);
  props.isHomeSheetLockedRetracted = true; render();
  render().toggleTripsSheet();
  assert.equal(render().effectiveTripsSheetOpen, false);
  assert.equal(render().isRequestsSheetMode, false);
  props.isHomeSheetLockedRetracted = false; props.isDriver = false; render();
  assert.equal(render().isRequestsSheetMode, false);
  app.hooks.unmount();
});
