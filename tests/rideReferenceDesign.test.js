const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Pressable: 'Button', Image: 'Image',
  ActivityIndicator: 'Spinner', StyleSheet: { create: x => x }, useWindowDimensions: () => ({ height: 568, width: 320, fontScale: 1.6 }) };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } });
const { rideArrivalTime, rideClock, rideDay } = load('features/ride-design/rideDesign.ts');
const { getRouteLocationLabels } = load('utils/routeLocationLabels.ts');
const trip = { id: 'trip', driverId: 'driver', driverName: 'Conducteur exemple', price: 4000, status: 'upcoming',
  departureTime: '2030-01-01T23:30:00', arrivalTime: '2030-01-02T01:30:00',
  departure: { name: 'Avenue de départ', reference: 'Portail bleu' }, arrival: { name: 'Avenue d’arrivée', reference: 'Entrée principale' },
  vehicle: { licensePlate: 'TEST', color: 'gris' } };
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === 'function') return flatten(node.type(node.props));
  return [node, ...flatten(node.props.children)];
}
function words(node) {
  if (Array.isArray(node)) return node.map(words).join('');
  if (React.isValidElement(node)) return words(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function summary(extra = {}) {
  const Component = load('features/trip-detail/PassengerTripSummary.tsx').PassengerTripSummary;
  const nodes = flatten(Component({ trip, config: { label: 'À venir' }, routeLabels: getRouteLocationLabels(trip),
    tripPriceLabel: '4 000 FC', tripSeatsLabel: '2 places', tripRouteDistanceLabel: '12 km', driverReviewAverage: 0,
    tripVehicleLabel: 'Voiture', tripVehicleMetaLabel: 'Gris', tripArrivalTimeLabel: '2 janv. 01:30',
    router: { push() {} }, ...extra }));
  return { nodes, text: nodes.filter(n => n.type === 'Text').map(words).join('|') };
}

test('an arrival on the next day keeps its date; invalid or missing dates never become today', () => {
  assert.equal(rideClock('bad'), '—');
  assert.equal(rideDay(undefined), 'Date à confirmer');
  assert.equal(rideArrivalTime(trip.departureTime, '2030-01-01T23:55:00'), '23:55');
  assert.match(rideArrivalTime(trip.departureTime, trip.arrivalTime), /2 janv.*01:30/);
  assert.equal(rideArrivalTime(trip.departureTime, 'bad'), '—');
});

test('the reservation badge never describes an expired or closed trip as confirmed', () => {
  const { reservationBadgeLabel: label } = load('features/trip-detail/TripReservationBadge.tsx');
  assert.equal(label({ status: 'upcoming' }, true), 'Trajet expiré');
  assert.equal(label({ status: 'cancelled' }), 'Trajet annulé');
  assert.equal(label({ status: 'completed' }), 'Trajet terminé');
  assert.equal(label({ status: 'ongoing' }, true), 'Trajet en cours');
  assert.equal(label({ status: 'upcoming' }), 'Réservation confirmée');
});

test('map SOS remains permission-gated and its press does not also open the expanded map', () => {
  let opened = 0, expanded = 0, stopped = 0;
  const MapPreview = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', Polyline: 'Polyline' },
    '@/components/maps/RoutePointMarker': { RoutePointMarker: 'Marker' },
    './tripDetailModel': { USE_CUSTOM_MAP_MARKERS: false, USE_ANDROID_MAP_MARKER_IMAGES: false },
  })('features/trip-detail/TripDetailMapPreview.tsx').TripDetailMapPreview;
  const model = { data: { isTripDriver: false, viewportHeight: 844 }, access: { showPassengerSecurityAccess: true, isPassengerSecurityLocked: true },
    bookingState: { setMapModalVisible: () => expanded++ }, route: { departureCoordinate: {}, arrivalCoordinate: {} },
    mapPresentation: { routeMapCoordinates: [], passengerDestinationMarkers: [] }, presentation: { routeLabels: getRouteLocationLabels(trip) },
    safety: { openSosModal: () => opened++ } };
  const button = () => flatten(MapPreview({ model })).find(node => node.props.accessibilityLabel === 'SOS, contacter les urgences');
  assert.equal(button(), undefined);
  model.access.isPassengerSecurityLocked = false;
  button().props.onPress({ stopPropagation: () => stopped++ });
  assert.equal(opened, 1); assert.equal(expanded, 0); assert.equal(stopped, 1);
  model.data.isTripDriver = true; assert.equal(button(), undefined);
});

test('accepted reservation displays the actual agreed payment total, never the current public fare', () => {
  const { text } = summary({ booking: { status: 'accepted', numberOfSeats: 2, paymentAmount: 4800, proposedPricePerSeat: 2500 } });
  assert.match(text.replace(/\s/g, ''), /4800FC/);
  assert.doesNotMatch(text.replace(/\s/g, ''), /8000FC|5000FC|\/place/);
  assert.match(text, /Total · 2 places/);
});

test('passenger dropoff hides live estimates while the overall trip is still awaiting payment', () => {
  const ongoing = { ...trip, status: 'ongoing' };
  for (const arrival of [
    { status: 'completed', droppedOff: true, droppedOffAt: '2030-01-02T01:10:00' },
    { status: 'accepted', droppedOff: true },
    { status: 'accepted', droppedOffAt: '2030-01-02T01:10:00' },
    { status: 'completed' },
  ]) {
    const { text, nodes } = summary({ trip: ongoing, progress: 0,
      estimatedArrivalTime: new Date('2030-01-02T02:00:00'),
      booking: { numberOfSeats: 1, paymentAmount: 4000, paymentMode: 'cash', ...arrival },
    });
    assert.match(text, /Arrivée confirmée/);
    assert.doesNotMatch(text, /Progression|Arrivée estimée|02:00|01:30|payé|encaissé/);
    const arrivalNode = nodes.find(node => node.props.accessibilityLabel?.startsWith('Arrivée confirmée'));
    assert.ok(arrivalNode, 'the screen reader also announces the confirmed arrival');
    if (arrival.droppedOffAt) assert.match(text, /01:10/);
  }
});

test('an onboard passenger retains live estimates until their own arrival is confirmed', () => {
  const { text } = summary({ trip: { ...trip, status: 'ongoing' }, progress: 42,
    booking: { status: 'accepted', pickedUp: true, numberOfSeats: 1, paymentAmount: 4000 },
  });
  assert.match(text, /Progression · 42%/);
  assert.match(text, /Arrivée estimée/);
  assert.doesNotMatch(text, /Arrivée confirmée/);
});

test('pending proposal remains explicitly a proposal and does not become an accepted total', () => {
  const { text } = summary({ booking: { status: 'pending', numberOfSeats: 2, proposedPricePerSeat: 2500 } });
  assert.match(text, /Total proposé/); assert.match(text.replace(/\s/g, ''), /5000FC/);
  assert.doesNotMatch(text, /confirmée/);
});

test('references, complete driver/vehicle identity and unknown estimates survive the compact layout', () => {
  const { nodes, text } = summary();
  assert.match(text, /Portail bleu/); assert.match(text, /Entrée principale/);
  assert.match(text, /Nouveau/); assert.match(text, /TEST/);
  assert.doesNotMatch(text, /0,0|0 min/);
  for (const node of nodes.filter(node => node.type === 'Text')) {
    assert.notEqual(node.props.allowFontScaling, false);
    assert.equal(node.props.numberOfLines, undefined);
  }
});

test('course hero uses the actual route and accepted budget; pickup and withdrawal stay on their existing handlers', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const calls = [], request = { ...trip, id: 'request', tripId: trip.id, passengerId: 'passenger', selectedDriverId: 'driver',
    passengerName: 'Passager exemple', numberOfSeats: 1, status: 'driver_selected', departureDateMin: trip.departureTime };
  const model = { tripRequest: request, assignedTrip: trip, userId: 'driver', isScreenActive: true,
    goHome: () => calls.push('home'), handleViewTrip: id => calls.push(id), handleGoPickup: () => calls.push('pickup') };
  const local = loader({ 'react-native': native, react: { ...React, ...hooks.react }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: item => getRouteLocationLabels(item) },
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: 'Contact' },
    './CollapsibleRouteMap': { CollapsibleRouteMap: 'RouteMap' }, './RequestPickupSummaryCard': { RequestPickupSummaryCard: 'Pickup' },
    './WithdrawRequestDriverButton': { WithdrawRequestDriverButton: 'Withdraw' },
  });
  const { RequestDriverCourse, RequestCourseActions } = local('features/request-detail/RequestDriverCourse.tsx');
  const route = { departureCoordinate: {}, arrivalCoordinate: {} };
  const nodes = hooks.render(() => flatten(RequestDriverCourse({ model, presentation: { requestRouteMapData: route, displayedRouteCoordinates: [], ownerDisplayedBudget: 4800 } })));
  const map = nodes.find(node => node.type === 'RouteMap');
  assert.equal(map.props.displayMode, 'overview'); assert.equal(map.props.mapData, route); assert.equal(map.props.showRecenter, true);
  assert.match(nodes.filter(n => n.type === 'Text').map(words).join('').replace(/\s/g, ''), /4800FC/);
  nodes.find(node => node.props.accessibilityLabel === 'Retour à l’accueil').props.onPress();
  nodes.find(node => node.type === 'Button' && /Voir les détails/.test(words(node))).props.onPress();
  hooks.unmount();
  const actions = hooks.render(() => flatten(RequestCourseActions({ model })));
  actions.find(node => node.type === 'Button').props.onPress();
  const withdraw = actions.find(node => node.type === 'Withdraw');
  assert.equal(withdraw.props.request, request); assert.equal(withdraw.props.trip, trip);
  assert.deepEqual(calls, ['home', 'trip', 'pickup']);
});
