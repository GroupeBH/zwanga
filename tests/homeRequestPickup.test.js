const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { selectHomeRequestPickup: select, homeRequestPickupPresentation: present, homePickupRegion } = loader()('features/home/homeRequestPickup.ts');
const now = Date.parse('2026-11-25T12:00:00Z');
const request = { id: 'request', passengerId: 'passenger', status: 'driver_selected', selectedDriverId: 'driver',
  selectedDriverName: 'Conducteur Test', departureDateMin: '2026-11-25T10:00:00Z', departureDateMax: '2026-11-25T11:00:00Z',
  departure: { name: 'Gare' }, tripId: 'trip' };
const trip = { id: 'trip', driverId: 'driver', status: 'upcoming', tripRequestId: request.id };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted', trip };
const position = { latitude: -4.31, longitude: 15.31, updatedAt: new Date(now).toISOString() };
const summary = { requestId: request.id, tripId: 'trip', viewerRole: 'passenger', status: 'estimated',
  driver: { id: 'driver', name: 'Conducteur Test', position }, passenger: { id: 'passenger', name: 'Passager Test' },
  pickup: { location: 'Gare', reference: 'Entrée', coordinates: { latitude: -4.3, longitude: 15.3 } },
  estimate: { distanceMeters: 2400, durationSeconds: 301 },
  generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString() };

test('accepted personal request is priority before creation and before trip start, independent of departure/discovery', () => {
  assert.equal(select([{ ...request, tripId: null }], [], 'passenger').id, request.id);
  assert.equal(select([request], [booking], 'passenger').id, request.id);
  assert.equal(select([{ ...request, selectedAt: new Date(now).toISOString() }], [], 'passenger', undefined, undefined, now).id, request.id, 'booking hydration may lag creation');
  assert.equal(select([request], [booking], 'passenger', { ...trip, status: 'ongoing' }, { ...trip, status: 'ongoing' }).id, request.id);
});
test('no assignment, foreign account, cancellation, another ongoing ride or driver ownership never gains priority', () => {
  for (const patch of [{ passengerId: 'stranger' }, { status: 'pending' }, { status: 'offers_received' },
    { status: 'cancelled' }, { status: 'expired' }, { selectedDriverId: null }, { selectedDriverId: 'passenger' }]) {
    assert.equal(select([{ ...request, ...patch }], [booking], 'passenger'), null);
  }
  assert.equal(select([request], [booking]), null);
  assert.equal(select([request], [booking], 'passenger', undefined, { id: 'other', driverId: 'someone' }), null);
  assert.equal(select([request], [booking], 'passenger', undefined, { id: 'other', driverId: 'passenger' }), null);
});
test('all boarding/dropoff flags and final booking/trip states restore the existing ride/payment flow', () => {
  for (const patch of [{ pickedUp: true }, { pickedUpAt: 'date' }, { pickedUpConfirmedByPassenger: true }, { pickedUpConfirmedAt: 'date' },
    { droppedOff: true }, { droppedOffAt: 'date' }, { droppedOffConfirmedByPassenger: true }, { droppedOffConfirmedAt: 'date' },
    ...['completed', 'cancelled', 'rejected', 'pending', 'no_show'].map(status => ({ status }))]) {
    assert.equal(select([request], [{ ...booking, ...patch }], 'passenger'), null);
  }
  for (const status of ['completed', 'cancelled', 'expired']) {
    assert.equal(select([request], [booking], 'passenger', { ...trip, status }), null);
  }
  assert.equal(select([request], [booking], 'passenger', { ...trip, driverId: 'replacement' }), null);
});
test('earliest personal pickup is deterministic, and a started pickup outranks future assignments', () => {
  const later = { ...request, id: 'later', tripId: 'later-trip', departureDateMin: '2026-11-26T12:00:00Z' };
  assert.equal(select([later, request], [booking], 'passenger').id, request.id);
  assert.equal(select([request, later], [booking, { ...booking, tripId: later.tripId, trip: { ...trip, id: later.tripId } }], 'passenger', undefined, { ...trip, id: later.tripId }).id, later.id);
});
test('an old selected request without active booking cannot hide a newer pickup or resurrect completed history', () => {
  const old = { ...request, id: 'old', tripId: 'completed-trip', departureDateMin: '2026-01-01', selectedAt: '2026-01-01' };
  assert.equal(select([old, request], [booking], 'passenger').id, request.id);
  assert.equal(select([old], [], 'passenger'), null);
  assert.equal(select([request], undefined, 'passenger').id, request.id, 'initial booking read is not a final negative');
});
test('private preview provides identity, route distance, ETA and two real map positions', () => {
  const model = present(summary, request, 'passenger', now);
  assert.equal(model.person.name, 'Conducteur Test'); assert.equal(model.time, '6 min'); assert.equal(model.distance, '2,4 km');
  assert.deepEqual(model.driverPosition, position); assert.deepEqual(model.pickupPosition, summary.pickup.coordinates);
  const region = homePickupRegion([model.driverPosition, model.pickupPosition]);
  assert.ok(region.latitudeDelta >= 0.016 - 1e-12);
  assert.equal(homePickupRegion([null, { latitude: NaN, longitude: 15 }]), undefined);
});
test('stale responses, wrong account/role, old assignment and changed trip never leak old GPS', () => {
  for (const patch of [{ requestId: 'other' }, { tripId: 'old-trip' }, { viewerRole: 'driver' },
    { driver: { ...summary.driver, id: 'previous-driver' } }, { expiresAt: new Date(now).toISOString() }]) {
    assert.equal(present({ ...summary, ...patch }, request, 'passenger', now), null);
  }
  assert.equal(present(summary, request, 'other-user', now), null);
  assert.equal(present(summary, request, 'passenger', now + 30000), null);
  for (const stale of [null, { ...position, updatedAt: new Date(now - 120000).toISOString() },
    { ...position, updatedAt: new Date(now + 31000).toISOString() }, { ...position, latitude: 100 }]) {
    const model = present({ ...summary, driver: { ...summary.driver, position: stale } }, request, 'passenger', now);
    assert.equal(model.driverPosition, null); assert.equal(model.time, null); assert.match(model.message, /en attente/);
  }
  assert.equal(present({ ...summary, status: 'paused', estimate: null }, request, 'passenger', now).message, 'Trajet en pause');
});
test('Home pickup poll pauses offline/hidden, tolerates temporary failures and releases on final denial', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const io = { online: true, active: true, reads: [], read: { currentData: summary, originalArgs: request.id, fulfilledTimeStamp: now } };
  const { useHomeRequestPickup } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: io.online } } }) },
    '@/store/api/requestPickupApi': { useGetRequestPickupSummaryQuery: (id, options) => { io.reads.push({ id, ...options }); return io.read; } },
  })('hooks/home/useHomeRequestPickup.ts');
  const props = { requests: [request], bookings: [booking], userId: 'passenger' };
  const render = () => hooks.render(() => useHomeRequestPickup({ ...props, active: io.active }));
  assert.equal(render().pickupModel.time, '6 min'); assert.equal(io.reads.at(-1).pollingInterval, 30000);
  io.online = false; assert.equal(render().pickupModel, null); assert.equal(io.reads.at(-1).skip, true);
  assert.equal(render().homeRequestPickup.id, request.id, 'offline does not erase participation');
  io.online = true; io.active = false; assert.equal(render().pickupModel, null); assert.equal(io.reads.at(-1).pollingInterval, 0);
  io.active = true; io.read = { ...io.read, isError: true, error: { status: 503 } };
  assert.equal(render().pickupModel, null); assert.equal(render().homeRequestPickup.id, request.id);
  for (const status of [401, 403, 404, 410]) { io.read.error.status = status; assert.equal(render().homeRequestPickup, null); }
  io.read.isError = false; assert.equal(render().pickupModel.time, '6 min');
  props.requests = [{ ...request, selectedDriverId: 'replacement' }]; assert.equal(render().pickupModel, null);
  props.requests = [request]; t.mock.timers.tick(30001); assert.equal(render().pickupModel, null);
  props.userId = 'stranger'; assert.equal(render().homeRequestPickup, null); assert.equal(io.reads.at(-1).skip, true);
});

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  ActivityIndicator: 'Spinner',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join(' ') : React.isValidElement(tree) ? text(tree.props.children) : '';
test('persistent sheet identifies driver and estimate before starting, with one explicit detail action and no dismiss', () => {
  const { HomeRequestPickupSheet } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('components/home/HomeRequestPickupSheet.tsx');
  const calls = [], props = { homeRequestPickup: request, pickupModel: present(summary, request, 'passenger', now),
    pickupOnline: true, openTripRequestDetail: id => calls.push(id), width: 390, sheetHeight: 390, sheetBottomOffset: 0 };
  const tree = HomeRequestPickupSheet.type(props);
  assert.match(text(tree), /Conducteur confirmé.*Conducteur Test.*6 min.*2,4 km.*Gare.*Entrée/);
  assert.match(text(tree), /Temps de route estimé/);
  assert.doesNotMatch(text(tree), /avant embarquement|Point de récupération|peut ne pas avoir encore démarré|Prise en charge estimée dans/);
  const buttons = nodes(tree).filter(n => n.type === 'Button'); assert.equal(buttons.length, 1); buttons[0].props.onPress();
  assert.equal(calls.length, 1); assert.match(JSON.stringify(calls[0]), /request/);
  const offline = HomeRequestPickupSheet.type({ ...props, pickupOnline: false, pickupModel: null });
  assert.match(text(offline), /Conducteur Test.*Hors connexion/); assert.doesNotMatch(text(offline), /6 min|2,4 km/);
  const landscape = HomeRequestPickupSheet.type({ ...props, width: 680, sheetHeight: 140 });
  assert.equal(Object.assign({}, ...landscape.props.style).flexDirection, 'row');
  assert.equal(nodes(landscape).filter(n => n.type === 'Button').length, 1);
  assert.equal(nodes(nodes(landscape).find(n => n.type === 'Scroll')).some(n => n.type === 'Button'), false);
});

test('compact pickup shows one truthful status with driver, vehicle, plate and rendezvous', () => {
  const { HomeRequestPickupSheet } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('components/home/HomeRequestPickupSheet.tsx');
  const vehicle = { brand: 'Marque test', model: 'Modèle test', color: 'Gris', licensePlate: 'TEST-001' };
  const base = { homeRequestPickup: { ...request, selectedVehicle: vehicle }, pickupOnline: true, width: 390, sheetHeight: 350 };
  const draw = patch => HomeRequestPickupSheet.type({ ...base, ...patch });
  const fresh = present({ ...summary, vehicle }, request, 'passenger', now);
  for (const [patch, expected] of [
    [{ pickupModel: present({ ...summary, status: 'waiting_location', estimate: null }, request, 'passenger', now) }, 'Position en attente'],
    [{ pickupModel: present({ ...summary, status: 'paused', estimate: null }, request, 'passenger', now) }, 'Trajet en pause'],
    [{ pickupModel: fresh, pickupOnline: false }, 'Hors connexion'],
    [{ pickupModel: null, pickupLoading: true }, 'Actualisation…'],
    [{ pickupModel: null }, 'Position indisponible'],
    [{ pickupModel: present({ ...summary, status: 'unavailable', estimate: null }, request, 'passenger', now) }, 'Estimation indisponible'],
  ]) {
    const tree = draw(patch), content = text(tree);
    assert.match(content, /Marque test.*Modèle test.*Gris.*TEST-001/);
    assert.equal((content.match(/TEST-001/g) || []).length, 1);
    assert.equal(nodes(tree).filter(n => n.props.accessibilityLiveRegion === 'polite').length, 1);
    assert.ok(content.includes(expected), content);
    assert.doesNotMatch(content, /6 min|2,4 km|en route|arrive dans/);
    assert.match(content, /Rendez-vous.*Gare.*Voir ma commande/);
  }
  assert.deepEqual(fresh.vehicleDetails, vehicle);
  assert.doesNotMatch(text(draw({ pickupModel: fresh, pickupLoading: true })), /Actualisation/,
    'a background refetch does not replace a still-valid ETA with a spinner');
  assert.equal(draw({ homeRequestPickup: null }), null);
});
test('pickup has a scrollable panel at normal/large font, independent of a collapsed discovery sheet', () => {
  for (const fontScale of [1, 2]) {
    const hooks = hookHarness();
    const { useHomeSheet } = loader({ react: hooks.react,
      'react-native': { ...native, useWindowDimensions: () => ({ fontScale }) },
      '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true },
    })('hooks/home/useHomeSheet.ts');
    const props = { hasRequestPickup: false, width: 320, height: 568, insets: { bottom: 20 }, latestTrips: [], availableDriverRequests: [] };
    const render = () => hooks.render(() => useHomeSheet(props));
    render().toggleTripsSheet(); assert.equal(render().effectiveTripsSheetOpen, false);
    props.hasRequestPickup = true;
    assert.ok(render().sheetHeight > 200); assert.ok(render().sheetHeight < 360);
    props.height = 844; props.width = 390;
    assert.equal(render().sheetHeight, fontScale > 1.3 ? 420 : 350);
    assert.equal(render().effectiveTripsSheetOpen, false); hooks.unmount();
  }
});
test('Home header keeps notifications/profile but does not advertise discovery or driving status during personal pickup', () => {
  const { HomeHeader } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    './HomeDriverStatus': { HomeDriverStatus: 'DriverStatus' },
  })('components/home/HomeHeader.tsx');
  for (const isDriver of [true, false]) {
    const tree = HomeHeader.type({ insets: { top: 20 }, isDriver, hasRequestPickup: true, router: {}, profileInitial: 'T', unreadNotifications: 1 });
    assert.equal(nodes(tree).filter(n => n.type === 'Button').length, 2);
    assert.equal(nodes(tree).some(n => n.type === 'DriverStatus'), false);
    assert.doesNotMatch(text(tree), /départs|Autour de vous/);
  }
});

test('Home composition puts private pickup ahead of suggestions and driver alerts, then restores ongoing ride UI', () => {
  const hooks = hookHarness(), received = {};
  const selected = { activeHomeTrip: null, featuredPassengerTrip: trip, latestTrips: [trip] };
  const pickup = { homeRequestPickup: request, pickupModel: present(summary, request, 'passenger', now) };
  const names = ['useHomeDriverActivity', 'useHomeTripFeed', 'useHomeLocation', 'useHomeTracking', 'useHomeUserLocation',
    'useHomeMap', 'useHomeSheet', 'useHomeMapNavigation', 'useHomeRequestHighlight', 'useHomePriorityDismissals',
    'useHomeMapMarkers', 'useHomeSupportingData'];
  const mocks = Object.fromEntries(names.map(name => [`./${name}`, { [name]: props => { received[name] = props; return {}; } }]));
  mocks['./useHomeAcceptedDriverCourse'] = { useHomeAcceptedDriverCourse: () => ({}) };
  mocks['./useHomeDriverActivity'] = { useHomeDriverActivity: () => ({ driverDataPrepared: true }) };
  mocks['./useHomeTripFeed'] = { useHomeTripFeed: () => ({ tripsLoading: true }) };
  mocks['./useHomeSupportingData'] = { useHomeSupportingData: () => false };
  const { useHomeController } = loader({ ...mocks, react: hooks.react,
    './useHomePassengerActivity': { useHomePassengerActivity: () => ({ myTripRequests: [request], myBookings: [booking],
      passengerDataPrepared: true, availableTripRequestsLoading: true }) },
    './useHomeTripSelection': { useHomeTripSelection: () => selected },
    './useHomeRequestPickup': { useHomeRequestPickup: () => pickup },
    '@/hooks/notifications/useRideEntryAnnouncement': { useRideEntryAnnouncement() {} },
  })('hooks/home/useHomeController.ts');
  const result = hooks.render(() => useHomeController({ currentUser: { id: 'passenger' }, isDriver: true, isScreenActive: true }));
  assert.equal(result.hasMapPriorities, false);
  assert.equal(result.homeDataPrepared, true, 'pickup readiness never waits for slow discovery or favorites');
  assert.equal(received.useHomeMapMarkers.enabled, false); assert.equal(received.useHomeRequestHighlight.enabled, false);
  assert.equal(received.useHomeSheet.hasRequestPickup, true); hooks.unmount();

  const dashboardHooks = hookHarness(), home = { ...result, homeDataPrepared: true, onHomeLayout() {} };
  const parts = ['HomeHeader', 'HomeLocationButton', 'HomeMap', 'HomeTripsSheet', 'HomeActivityCards', 'HomeOngoingTripSheet', 'HomeRequestPickupSheet', 'HomeAcceptedDriverCourseSheet', 'HomeRequestModal'];
  const { HomeDashboard } = loader({ react: dashboardHooks.react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    ...Object.fromEntries(parts.map(name => [`@/components/home/${name}`, { [name]: name }])),
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/components/AppUpdatePrompt': { AppUpdatePrompt: 'UpdatePrompt' },
    '@/features/home/HomeScreen.styles': { styles: {} },
    '@/features/navigation/homePreparationContext': { useReportHomePrepared: () => null },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/store/hooks': { useAppSelector: () => 0 },
  })('components/home/HomeDashboard.tsx');
  const render = () => nodes(dashboardHooks.render(() => HomeDashboard({ context: {} })));
  assert.ok(render().some(n => n.type === 'HomeRequestPickupSheet'));
  assert.equal(render().some(n => n.type === 'HomeTripsSheet'), false);
  assert.equal(render().find(n => n.type === 'HomeRequestModal').props.enabled, false);
  home.homeRequestPickup = null; home.activeHomeTrip = { ...trip, status: 'ongoing' };
  assert.ok(render().some(n => n.type === 'HomeOngoingTripSheet'));
  assert.equal(render().some(n => n.type === 'HomeRequestPickupSheet'), false);
  home.activeHomeTrip = null; assert.ok(render().some(n => n.type === 'HomeTripsSheet'));
  dashboardHooks.unmount();
});

test('the native map shows only the authorized pickup/driver pins and removes them with the stale model', () => {
  const { HomeMap } = loader({ 'react-native': native,
    'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', PROVIDER_GOOGLE: 'google' },
    '@/components/maps/RoutePointMarker': { RoutePointMarker: 'Marker' },
    '@/assets/images/map-markers/home-position-dot.png': 'position-image',
  })('components/home/HomeMap.tsx');
  const props = { shouldRenderHomeMap: true, mapRef: { current: null }, mapBottomOffset: 390,
    pickupModel: present(summary, request, 'passenger', now), userLocationMarkerRef: { current: null } };
  const markers = nodes(HomeMap.type(props)).filter(n => n.type === 'Marker');
  assert.equal(markers.length, 2);
  assert.deepEqual(markers.find(n => n.props.identifier === 'home-request-driver').props.coordinate, position);
  assert.equal(markers.find(n => n.props.identifier === 'home-request-driver').props.title, 'Conducteur Test');
  assert.equal(markers.find(n => n.props.identifier === 'home-request-pickup-point').props.kind, 'departure');
  assert.equal(markers.find(n => n.props.identifier === 'home-request-driver').props.tracksViewChanges, false);
  assert.equal(nodes(HomeMap.type({ ...props, pickupModel: null })).some(n => n.type === 'Marker'), false);
});
