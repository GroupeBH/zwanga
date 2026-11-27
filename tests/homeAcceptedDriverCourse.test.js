const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { resolveHomeAcceptedDriverCourse: resolve, acceptedCoursePoints } = loader()('features/home/homeAcceptedDriverCourse.ts');
const trip = { id: 'trip', tripRequestId: 'request', driverId: 'driver', status: 'upcoming', departureTime: '2026-11-25T12:00:00Z',
  departure: { name: 'Gare', lat: -4.3, lng: 15.3, reference: 'Entrée principale' },
  arrival: { name: 'Marché', lat: -4.4, lng: 15.4 } };
const request = { id: 'request', tripId: 'trip', selectedDriverId: 'driver', passengerId: 'passenger', passengerName: 'Alex M.',
  status: 'driver_selected', departure: trip.departure, arrival: trip.arrival };

test('assigned upcoming course has priority even if departure is delayed or another publication was hidden', () => {
  assert.equal(resolve(trip, 'driver', request).trip, trip);
  assert.equal(resolve(trip, 'driver').request, null, 'activity already proves participation while detail hydrates');
  assert.ok(resolve({ ...trip, departureTime: '2020-01-01' }, 'driver', request));
  assert.deepEqual(acceptedCoursePoints(resolve(trip, 'driver', request)), {
    departure: { latitude: -4.3, longitude: 15.3 }, arrival: { latitude: -4.4, longitude: 15.4 },
  });
});

test('a publication, foreign course, started or closed trip never becomes an unstarted accepted course', () => {
  for (const patch of [{ tripRequestId: null }, { driverId: 'other' }, { startedAt: 'date' }, { completedAt: 'date' },
    { isExpired: true }, ...['ongoing', 'completed', 'cancelled', 'expired'].map(status => ({ status }))]) {
    assert.equal(resolve({ ...trip, ...patch }, 'driver', request), null);
    assert.equal(resolve(trip, 'driver', request, { ...trip, ...patch }), null);
  }
  assert.equal(resolve(trip, undefined, request), null);
  assert.equal(resolve(trip, 'other', request), null);
  assert.equal(resolve(trip, 'driver', request, { ...trip, id: 'previous' }), null);
});

test('authoritative reassignment, withdrawal, cancellation and mismatched request release priority', () => {
  for (const patch of [{ id: 'other' }, { tripId: 'other' }, { selectedDriverId: 'replacement' },
    { passengerId: 'driver' }, ...['pending', 'offers_received', 'expired', 'cancelled'].map(status => ({ status }))]) {
    assert.equal(resolve(trip, 'driver', { ...request, ...patch }), null);
  }
  assert.equal(acceptedCoursePoints({ trip: { ...trip, departure: { lat: 100, lng: 15 } } }).departure, null);
  assert.equal(acceptedCoursePoints({ trip: { ...trip, departure: { ...trip.departure, hasCoordinates: false } } }).departure, null);
});

function fixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const io = { online: true, session: 1, tripRead: { currentData: trip, originalArgs: trip.id },
    requestRead: { currentData: request, originalArgs: request.id }, reads: [] };
  const { useHomeAcceptedDriverCourse } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => io.session },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: io.online } } }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: (id, opts) => { io.reads.push({ kind: 'trip', id, ...opts }); return io.tripRead; } },
    '@/store/api/tripRequestApi': { useGetTripRequestByIdQuery: (id, opts) => { io.reads.push({ kind: 'request', id, ...opts }); return io.requestRead; } },
  })('hooks/home/useHomeAcceptedDriverCourse.ts');
  const props = { trips: [trip], userId: 'driver', isDriver: true, occupied: false, active: true };
  return { io, props, render: () => hooks.render(() => useHomeAcceptedDriverCourse(props)) };
}

test('actual ongoing driver/passenger ride and personal pickup always outrank an accepted course', t => {
  const f = fixture(t);
  assert.ok(f.render().acceptedDriverCourse);
  f.props.occupied = true;
  assert.equal(f.render().acceptedDriverCourse, null); assert.ok(f.io.reads.slice(-2).every(q => q.skip && !q.pollingInterval));
  f.props.occupied = false; assert.ok(f.render().acceptedDriverCourse);
  f.props.isDriver = false; assert.equal(f.render().acceptedDriverCourse, null);
  f.props.isDriver = true; f.props.userId = 'another-driver'; assert.equal(f.render().acceptedDriverCourse, null);
});

test('reads stop on blur/offline, retain scoped course and never start or navigate automatically', t => {
  const f = fixture(t);
  assert.ok(f.render().acceptedDriverCourse); assert.ok(f.io.reads.slice(-2).every(q => q.pollingInterval === 30000));
  f.io.online = false; f.io.requestRead = {}; f.io.tripRead = {};
  assert.equal(f.render().acceptedDriverCourse.request.passengerName, 'Alex M.');
  assert.ok(f.io.reads.slice(-2).every(q => q.skip && !q.pollingInterval));
  f.io.online = true; f.props.active = false; assert.ok(f.render().acceptedDriverCourse);
  assert.ok(f.io.reads.slice(-2).every(q => q.skip));
  f.io.session++; assert.equal(f.render().acceptedDriverCourse.request, null, 'previous session detail cannot leak');
});

test('temporary read failures preserve participation but a final denial removes it', t => {
  const f = fixture(t); assert.ok(f.render().acceptedDriverCourse);
  f.io.requestRead = { ...f.io.requestRead, isError: true, error: { status: 503 } };
  assert.ok(f.render().acceptedDriverCourse);
  f.io.requestRead.error.status = 403; assert.equal(f.render().acceptedDriverCourse, null);
  assert.equal(f.render().acceptedDriverCourse, null);
  f.io.requestRead = { currentData: request, originalArgs: request.id }; f.io.session++;
  assert.ok(f.render().acceptedDriverCourse, 'new login can verify the assignment again');
});

test('each terminal response releases the course and does not accept a response for a previous query', t => {
  for (const code of [401, 403, 404, 410]) {
    const f = fixture(t); f.io.tripRead = { originalArgs: trip.id, isError: true, error: { status: code } };
    assert.equal(f.render().acceptedDriverCourse, null);
  }
  const f = fixture(t); f.io.requestRead = { data: { ...request, id: 'old' }, originalArgs: 'old', isError: true, error: { status: 404 } };
  assert.equal(f.render().acceptedDriverCourse.request, null);
});

test('a stale first assignment cannot hide the next one, and settled checks do not create a render loop', t => {
  const f = fixture(t), next = { ...trip, id: 'next', tripRequestId: 'next-request', departureTime: '2026-11-26' };
  f.props.trips = [trip, next]; f.io.requestRead.currentData = { ...request, selectedDriverId: 'replacement' };
  assert.equal(f.render().acceptedDriverCourse, null);
  f.io.tripRead = { currentData: next, originalArgs: next.id };
  f.io.requestRead = { currentData: { ...request, id: next.tripRequestId, tripId: next.id }, originalArgs: next.tripRequestId };
  for (let i = 0; i < 25; i++) assert.equal(f.render().acceptedDriverCourse.trip.id, next.id);
  f.props.trips = []; assert.equal(f.render().acceptedDriverCourse, null);
});

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join(' ') : React.isValidElement(tree) ? text(tree.props.children) : '';

test('compact non-dismissible sheet names passenger, departure/reference and arrival with one existing detail action', () => {
  const { HomeAcceptedDriverCourseSheet } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('components/home/HomeAcceptedDriverCourseSheet.tsx');
  const calls = [];
  const draw = (width, sheetHeight) => HomeAcceptedDriverCourseSheet.type({ acceptedDriverCourse: { trip, request }, width,
    sheetHeight, sheetBottomOffset: 0, openTripRequestDetail: id => calls.push(id) });
  for (const tree of [draw(390, 350), draw(844, 180)]) {
    assert.match(text(tree), /Course acceptée.*Alex M.*À prendre en charge.*Départ du passager.*Gare.*Entrée principale.*Arrivée.*Marché/);
    assert.doesNotMatch(text(tree), /Trajet en cours|Vous conduisez|Publier|Ignorer/);
    const buttons = nodes(tree).filter(n => n.type === 'Button'); assert.equal(buttons.length, 1);
    assert.equal(nodes(nodes(tree).find(n => n.type === 'Scroll')).some(n => n.type === 'Button'), false);
    buttons[0].props.onPress(); assert.equal(calls.at(-1), request.id);
  }
});

test('dashboard keeps course ahead of discovery/nearby modal/update, with ongoing ride first and no forced redirect', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const home = { acceptedDriverCourse: { trip, request }, isScreenActive: true, isDriver: true,
    homeDataPrepared: true, passengerAnnouncementReady: true, driverAnnouncementReady: true,
    driverRequestsAnnouncementReady: true, onHomeLayout() {} };
  const parts = ['HomeHeader', 'HomeLocationButton', 'HomeMap', 'HomeTripsSheet', 'HomeActivityCards',
    'HomeOngoingTripSheet', 'HomeRequestPickupSheet', 'HomeAcceptedDriverCourseSheet', 'HomeRequestModal'];
  const { HomeDashboard } = loader({ react: hooks.react, 'react-native': native,
    ...Object.fromEntries(parts.map(name => [`@/components/home/${name}`, { [name]: name }])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/components/AppUpdatePrompt': { AppUpdatePrompt: 'UpdatePrompt' },
    '@/features/home/HomeScreen.styles': { styles: {} },
    '@/features/navigation/homePreparationContext': { useReportHomePrepared: () => null },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/store/hooks': { useAppSelector: () => 0 },
  })('components/home/HomeDashboard.tsx');
  const render = () => nodes(hooks.render(() => HomeDashboard({ context: { isHomeRoleReady: true } })));
  assert.ok(render().some(n => n.type === 'HomeAcceptedDriverCourseSheet'));
  assert.equal(render().some(n => n.type === 'HomeTripsSheet'), false);
  assert.equal(render().find(n => n.type === 'HomeRequestModal').props.enabled, false);
  assert.equal(render().find(n => n.type === 'UpdatePrompt').props.enabled, false);
  assert.equal(render().find(n => n.type === 'HomeHeader').props.hasRequestPickup, true);
  home.activeHomeTrip = { ...trip, status: 'ongoing' };
  assert.ok(render().some(n => n.type === 'HomeOngoingTripSheet'));
  assert.equal(render().some(n => n.type === 'HomeAcceptedDriverCourseSheet'), false);
  home.activeHomeTrip = null; home.acceptedDriverCourse = null;
  assert.ok(render().some(n => n.type === 'HomeTripsSheet'));
  assert.equal(render().find(n => n.type === 'HomeRequestModal').props.enabled, true);
});

test('map uses accepted passenger endpoints, never an invented GPS position', () => {
  const { HomeMap } = loader({ 'react-native': native,
    'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
    '@/components/maps/RoutePointMarker': { RoutePointMarker: 'Marker' },
    '@/assets/images/map-markers/home-position-dot.png': 'image',
  })('components/home/HomeMap.tsx');
  const props = { shouldRenderHomeMap: true, mapRef: { current: null }, acceptedDriverCourse: { trip, request } };
  const pins = nodes(HomeMap.type(props)).filter(n => n.type === 'Marker');
  assert.equal(pins.length, 2); assert.deepEqual(pins.map(p => p.props.kind), ['departure', 'arrival']);
  assert.equal(nodes(HomeMap.type({ ...props, acceptedDriverCourse: null })).filter(n => n.type === 'Marker').length, 0);
});

test('controller suppresses discovery overlays and suggestions without treating an upcoming course as active navigation', t => {
  const hooks = hookHarness(), received = {}; t.after(() => hooks.unmount());
  const state = { activeHomeTrip: null, personalPickup: null };
  const names = ['useHomeTripFeed', 'useHomeLocation', 'useHomeTracking', 'useHomeUserLocation', 'useHomeMap',
    'useHomeSheet', 'useHomeMapNavigation', 'useHomeRequestHighlight', 'useHomePriorityDismissals', 'useHomeMapMarkers'];
  const mocks = Object.fromEntries(names.map(name => [`./${name}`, { [name]: props => { received[name] = props; return {}; } }]));
  mocks['./useHomeDriverActivity'] = { useHomeDriverActivity: () => ({ myDriverTrips: [trip], driverDataPrepared: true }) };
  mocks['./useHomeSupportingData'] = { useHomeSupportingData: () => false };
  mocks['./useHomePassengerActivity'] = { useHomePassengerActivity: () => ({ passengerDataPrepared: true, availableTripRequestsLoading: true }) };
  mocks['./useHomeTripSelection'] = { useHomeTripSelection: () => ({ activeHomeTrip: state.activeHomeTrip,
    isHomeSheetLockedRetracted: !!state.activeHomeTrip, featuredDriverUpcomingTrip: trip }) };
  mocks['./useHomeRequestPickup'] = { useHomeRequestPickup: () => ({ homeRequestPickup: state.personalPickup }) };
  mocks['./useHomeAcceptedDriverCourse'] = { useHomeAcceptedDriverCourse: props => { received.accepted = props;
    return { acceptedDriverCourse: props.occupied ? null : { trip, request } }; } };
  const { useHomeController } = loader({ ...mocks, react: hooks.react,
    '@/hooks/notifications/useRideEntryAnnouncement': { useRideEntryAnnouncement() {} },
  })('hooks/home/useHomeController.ts');
  const context = { currentUser: { id: 'driver' }, isDriver: true, isScreenActive: true, isDataActive: true };
  const render = () => hooks.render(() => useHomeController(context));
  let view = render(); assert.ok(view.acceptedDriverCourse); assert.equal(view.hasMapPriorities, false);
  assert.equal(view.homeDataPrepared, true, 'unrelated slow discovery/favorites do not postpone an accepted course');
  assert.deepEqual(received.accepted.trips, [trip]); assert.equal(received.accepted.userId, 'driver');
  assert.equal(received.useHomeRequestHighlight.enabled, false); assert.equal(received.useHomeMapMarkers.enabled, false);
  assert.equal(received.useHomeSheet.hasRequestPickup, true); assert.equal(received.useHomeTracking.activeHomeTrip, null);
  assert.equal(received.useHomeMap.priorityKey, 'driver-course:trip');
  state.activeHomeTrip = { ...trip, status: 'ongoing' }; view = render();
  assert.equal(received.accepted.occupied, true); assert.equal(view.acceptedDriverCourse, null);
  assert.equal(received.useHomeTracking.activeHomeTrip, state.activeHomeTrip);
  state.activeHomeTrip = null; state.personalPickup = { id: 'personal', selectedDriverId: 'someone' }; view = render();
  assert.equal(received.accepted.occupied, true); assert.equal(view.acceptedDriverCourse, null);
  assert.equal(received.useHomeMap.priorityKey, 'personal:someone');
  context.isDataActive = false; render(); assert.equal(received.accepted.active, false);
});
