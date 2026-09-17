const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getRouteLocationLabels, getRouteStopLabel } = loader()('utils/routeLocationLabels.ts');

const departure = Object.freeze({
  name: 'J83F+5G4, Av. Bakole 1, Kinshasa', address: 'J83F+5G4, Av. Bakole 1, Kinshasa',
  lat: -4.38, lng: 15.32, reference: 'Portail bleu',
});
const arrival = Object.freeze({
  name: 'Q/Mazamba Domicile, 3b Av Matadi, Kinshasa', address: 'Q/Mazamba Domicile, 3b Av Matadi, Kinshasa',
  lat: -4.45, lng: 15.26, reference: 'Devant la pharmacie',
});
const trip = Object.freeze({ id: 'trip', departure, arrival, price: 1500, availableSeats: 3, status: 'upcoming' });
const labels = getRouteLocationLabels(trip);

function nodes(tree, expand = false) {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!React.isValidElement(node)) return;
    result.push(node);
    if (expand && typeof node.type === 'function') visit(node.type(node.props));
    else if (expand && node.type?.$$typeof === Symbol.for('react.memo')) visit(node.type.type(node.props));
    else visit(node.props.children);
  };
  visit(tree);
  return result;
}

function environment(extra = {}) {
  const hooks = hookHarness();
  const animation = { delay: () => animation, duration: () => animation };
  const load = loader({
    react: { ...React, ...hooks.react },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/googleMapsApi': { useGetRouteLocationAddressQuery: () => ({}) },
    'react-native': {
      StyleSheet: { create: x => x, hairlineWidth: 1 }, View: 'View', Text: 'Text',
      Image: 'Image', TouchableOpacity: 'Button', Pressable: 'Button', ActivityIndicator: 'Spinner', Modal: 'Modal',
    },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker', Callout: 'Callout', Polyline: 'Polyline' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: animation, LinearTransition: animation },
    '@/utils/dateHelpers': { formatDateTime: value => value, formatDateWithRelativeLabel: value => value },
    '../screen-styles/app/trip/detail/index': { styles: {} },
    '../screen-styles/app/request/detail/index': { styles: {} },
    './tripDetailModel': { USE_CUSTOM_MAP_MARKERS: false, USE_ANDROID_MAP_MARKER_IMAGES: false },
    './requestDetailModel': { TRIP_REQUEST_VEHICLE_LABELS: {}, TRIP_REQUEST_VEHICLE_ICONS: {}, formatCdfPrice: String },
    './CollapsibleRouteMap': { CollapsibleRouteMap: 'RouteMap' },
    '@/components/trip/RouteLocationDetails': { RouteLocationDetails: 'RouteDetails' },
    ...extra,
  });
  return { hooks, load };
}

test('stored duplicated names/addresses become readable without mutating trip fields', () => {
  const before = JSON.stringify(trip);
  assert.equal(labels.departure.title, 'Av. Bakole 1');
  assert.equal(labels.departure.address, 'Av. Bakole 1, Kinshasa');
  assert.equal(labels.departure.context, 'Kinshasa');
  assert.equal(labels.departure.reference, 'Portail bleu');
  assert.equal(labels.arrival.title, '3b Av Matadi');
  assert.equal(labels.arrival.address, '3b Av Matadi, Q/Mazamba Domicile, Kinshasa');
  assert.equal(labels.arrival.context, 'Q/Mazamba Domicile, Kinshasa');
  assert.equal(JSON.stringify(trip), before);
});

test('legacy code-only and absent locations have honest display fallbacks', () => {
  const legacy = getRouteLocationLabels({ departure: { name: 'HF6ZT7E', address: 'HF6ZT7E' } });
  assert.equal(legacy.departure.title, 'Point de départ');
  assert.equal(legacy.departure.address, 'Adresse non disponible');
  assert.equal(legacy.arrival.title, 'Destination');
  assert.equal(legacy.arrival.address, 'Adresse non disponible');
  assert.equal(getRouteStopLabel({ name: 'Maison', address: 'J83F+5G4, Av. Bakole 1, Kinshasa' }).title, 'Maison');
  assert.equal(getRouteStopLabel({ name: 'UPN', address: 'UPN', reference: 'UPN' }).reference, '');
  assert.equal(getRouteStopLabel({ ...departure, reference: 'HF6ZT7E' }).reference, 'HF6ZT7E', 'never reinterpret a user-entered gate code as a geocoder code');
});

test('label memoization ignores price, status and coordinate updates; text changes invalidate it', () => {
  const env = environment();
  const { useRouteLocationLabels } = env.load('hooks/useRouteLocationLabels.ts');
  const render = value => env.hooks.render(() => useRouteLocationLabels(value));
  const initial = render(trip);
  assert.strictEqual(render({ ...trip, price: 3000, status: 'ongoing', departure: { ...departure, lat: -4.39 } }), initial);
  const updated = render({ ...trip, arrival: { ...arrival, reference: 'Portail vert' } });
  assert.notStrictEqual(updated, initial);
  assert.equal(updated.arrival.reference, 'Portail vert');
});

test('trip presentation supplies readable header names and route labels without changing prices', () => {
  const env = environment();
  const { useTripDetailPresentation } = env.load('hooks/trip-detail/useTripDetailPresentation.ts');
  const result = env.hooks.render(() => useTripDetailPresentation({
    trip, calculatedArrivalTime: null, availableSeats: 3, routeInfo: null, insets: { top: 0 },
  }));
  assert.equal(result.tripDepartureName, 'Av. Bakole 1');
  assert.equal(result.tripArrivalName, '3b Av Matadi');
  assert.equal(result.tripPriceLabel, '1500 FC');
  assert.deepEqual(result.routeLabels, labels);
});

test('the common route block wraps names/context and exposes complete accessible labels', () => {
  const env = environment();
  const { RouteLocationDetails } = env.load('components/trip/RouteLocationDetails.tsx');
  assert.equal(RouteLocationDetails.$$typeof, Symbol.for('react.memo'));
  const tree = RouteLocationDetails.type({ labels });
  const all = nodes(tree, true);
  const textNodes = all.filter(node => node.type === 'Text');
  assert.ok(textNodes.some(node => node.props.children === '3b Av Matadi'));
  assert.ok(textNodes.some(node => node.props.children === 'Q/Mazamba Domicile, Kinshasa'));
  for (const node of textNodes) assert.equal(node.props.numberOfLines, undefined);
  const accessibleRows = all.filter(node => node.props.accessible);
  assert.equal(accessibleRows.length, 2);
  assert.match(accessibleRows[0].props.accessibilityLabel, /Départ.*Av\. Bakole 1.*Portail bleu/);
  assert.match(accessibleRows[1].props.accessibilityLabel, /Destination.*3b Av Matadi.*Devant la pharmacie/);
});

const flattenStyle = style => Array.isArray(style)
  ? Object.assign({}, ...style.map(flattenStyle)) : style || {};
function contrastRatio(foreground, background) {
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

test('dark request route cards keep every text readable, including references and unavailable-address fallbacks', () => {
  const env = environment();
  const { RouteLocationDetails } = env.load('components/trip/RouteLocationDetails.tsx');
  const { styles } = env.load('features/screen-styles/app/request/detail/driverHeroStatusDot.styles.ts');
  for (const value of [labels, getRouteLocationLabels({})]) {
    const tree = RouteLocationDetails.type({ labels: value, tone: 'dark', trailingInset: 44 });
    const all = nodes(tree, true);
    const textNodes = all.filter(node => node.type === 'Text');
    assert.ok(textNodes.length >= 4);
    for (const node of textNodes) {
      const color = flattenStyle(node.props.style).color;
      assert.ok(contrastRatio(color, styles.driverRouteCard.backgroundColor) >= 4.5,
        `Unreadable text on the request card: ${node.props.children}`);
      assert.equal(node.props.numberOfLines, undefined, 'long addresses must wrap');
    }
    const title = textNodes.find(node => node.props.children === value.departure.title);
    assert.equal(flattenStyle(title.props.style).color, '#FFFFFF');
    assert.equal(flattenStyle(tree.props.style).paddingRight, 44);
  }
});

test('light route blocks retain their dark titles and full available width', () => {
  const env = environment();
  const { RouteLocationDetails } = env.load('components/trip/RouteLocationDetails.tsx');
  const tree = RouteLocationDetails.type({ labels });
  const title = nodes(tree, true).find(node => node.type === 'Text' && node.props.children === labels.departure.title);
  assert.equal(flattenStyle(title.props.style).color, '#212529');
  assert.equal(flattenStyle(tree.props.style).paddingRight, 0);
});

test('trip summary renders the shared readable route block', () => {
  const env = environment();
  const { TripSummary } = env.load('features/trip-detail/TripSummary.tsx');
  const tree = TripSummary({ trip, routeLabels: labels, config: {}, tripDepartureName: labels.departure.title,
    tripArrivalName: labels.arrival.title, driverReviewAverage: 4 });
  const block = nodes(tree).find(node => node.type === 'RouteDetails');
  assert.strictEqual(block.props.labels, labels);
});

test('the trip header and route rows update together after recovering a missing address', () => {
  let result = { isFetching: true };
  const env = environment({ '@/store/api/googleMapsApi': { useGetRouteLocationAddressQuery: () => result } });
  const { useRouteLocationLabels } = env.load('hooks/useRouteLocationLabels.ts');
  const { TripSummary } = env.load('features/trip-detail/TripSummary.tsx');
  const { RouteLocationDetails } = env.load('components/trip/RouteLocationDetails.tsx');
  const saved = { ...trip, departure: { name: 'Botango' }, arrival: { ...arrival, name: 'H8XW+6XG', address: 'H8XW+6XG' } };
  const render = () => {
    const routeLabels = env.hooks.render(() => useRouteLocationLabels(saved));
    const summary = TripSummary({ trip: saved, routeLabels, config: {}, driverReviewAverage: 4 });
    return { routeLabels, texts: nodes(summary).filter(node => node.type === 'Text').map(node => node.props.children) };
  };
  let view = render();
  assert.ok(view.texts.includes('Départ : Botango'));
  const rows = nodes(RouteLocationDetails.type({ labels: view.routeLabels }), true);
  assert.ok(rows.some(node => node.type === 'Text' && node.props.children === 'Recherche de l’adresse…'));
  assert.ok(!view.texts.includes('Botango vers Destination'));
  result = { currentData: { formattedAddress: 'Av. Bakole 1, Kinshasa' }, isFetching: false };
  view = render();
  assert.ok(view.texts.includes('Botango vers Av. Bakole 1'));
  assert.equal(view.routeLabels.arrival.title, 'Av. Bakole 1');
});

for (const role of ['Driver', 'Passenger']) {
  test(`${role} request details display the same labels on rows/maps and retain their trip action`, () => {
    const env = environment();
    const Summary = env.load(`features/request-detail/Request${role}Summary.tsx`)[`Request${role}Summary`];
    const opened = [];
    const tree = env.hooks.render(() => Summary({
      tripRequest: { ...trip, tripId: 'linked-trip' }, driverHero: {}, ownerHero: {}, statusConfig: {},
      requestedVehicleType: 'car', heroSteps: [], heroStepIndex: 0, compatibleActiveVehicles: [],
      canOpenAssignedTrip: true, handleViewTrip: id => opened.push(id),
    }));
    const all = nodes(tree);
    const routeDetails = all.find(node => node.type === 'RouteDetails');
    assert.deepEqual(routeDetails.props.labels, labels);
    assert.equal(routeDetails.props.tone, 'dark');
    assert.equal(routeDetails.props.trailingInset, 44, 'reserve room for the overlaid map button');
    const map = all.find(node => node.type === 'RouteMap');
    assert.equal(map.props.departureName, labels.departure.address);
    assert.equal(map.props.arrivalName, labels.arrival.address);
    all.find(node => node.type === 'Button').props.onPress();
    assert.deepEqual(opened, ['linked-trip']);
  });
}

test('map preview/fullscreen use readable marker text without changing coordinates or marker tracking', () => {
  const env = environment();
  const departureCoordinate = { latitude: departure.lat, longitude: departure.lng };
  const arrivalCoordinate = { latitude: arrival.lat, longitude: arrival.lng };
  const mapPresentation = { routeMapCoordinates: [], passengerDestinationMarkers: [] };
  const Preview = env.load('features/trip-detail/TripDetailMapPreview.tsx').TripDetailMapPreview;
  const Fullscreen = env.load('features/trip-detail/TripMapModal.tsx').TripMapModal;
  const trees = [Preview({ model: { presentation: { routeLabels: labels }, data: { viewportHeight: 700 },
    route: { departureCoordinate, arrivalCoordinate }, mapPresentation } }),
  Fullscreen({ routeLabels: labels, mapModalVisible: true, insets: { top: 0, bottom: 0 },
    departureCoordinate, arrivalCoordinate, ...mapPresentation })];
  for (const tree of trees) {
    const markers = nodes(tree).filter(node => node.type === 'Marker');
    assert.equal(markers.length, 2);
    assert.equal(markers[0].props.title, 'Départ · Av. Bakole 1');
    assert.equal(markers[1].props.description, '3b Av Matadi, Q/Mazamba Domicile, Kinshasa');
    assert.strictEqual(markers[0].props.coordinate, departureCoordinate);
    assert.strictEqual(markers[1].props.coordinate, arrivalCoordinate);
    assert.equal(markers[0].props.tracksViewChanges, false);
    assert.equal(markers[1].props.tracksViewChanges, false);
  }
});

test('booking recap cleans display strings without changing passenger inputs or total price', () => {
  const env = environment({
    '@/components/PassengerSeatNotice': { PassengerSeatNotice: 'SeatNotice' },
    './tripDetailModel': { getTripPaymentModeLabel: () => 'Paiement cash', TRIP_PAYMENT_MODE_OPTIONS: [] },
  });
  const { TripBookingSteps } = env.load('features/trip-detail/TripBookingSteps.tsx');
  const props = Object.freeze({ trip, bookingStep: 3, bookingSeats: '2', estimatedTotal: 3000, bookingPaymentMode: 'cash',
    passengerOriginDisplay: departure.address, passengerDestinationDisplay: arrival.address });
  const before = JSON.stringify(props);
  const all = nodes(TripBookingSteps(props));
  assert.ok(all.some(node => node.type === 'Text' && node.props.children === labels.departure.address));
  assert.ok(all.some(node => node.type === 'Text' && node.props.children === labels.arrival.address));
  assert.ok(all.some(node => node.type === 'Text' && node.props.children === '3000 FC'));
  assert.equal(JSON.stringify(props), before);
});

test('sharing from trip details uses readable titles and keeps the existing link request', async () => {
  const shared = [], calls = [];
  const env = environment({
    '../../features/trip-detail/tripDetailModel': {},
    '@/utils/shareHelpers': { shareTrip: async (...args) => shared.push(args) },
    '@/services/analytics': {},
  });
  const { useTripDetailContactActions } = env.load('hooks/trip-detail/useTripDetailContactActions.ts');
  const actions = env.hooks.render(() => useTripDetailContactActions({ trip, activeBooking: { id: 'booking' },
    createTripShareLink: body => { calls.push(body); return { unwrap: async () => ({ publicUrl: 'https://example.invalid/trip' }) }; },
    showDialog: value => assert.fail(JSON.stringify(value)),
  }));
  assert.equal(calls.length, 0, 'rendering details does not create or share a link');
  await actions.handleShareTrip();
  assert.deepEqual(calls, [{ tripId: 'trip', bookingId: 'booking', message: 'Voici le lien pour suivre mon trajet Zwanga en temps réel.' }]);
  assert.deepEqual(shared, [['https://example.invalid/trip', 'Av. Bakole 1', '3b Av Matadi']]);
});
