const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const native = { Text: 'Text', View: 'View', TouchableOpacity: 'Button', Image: 'Image',
  Platform: { OS: 'ios', select: value => value.ios }, StyleSheet: { create: value => value } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/hooks/useTripArrivalTime': { useTripArrivalTime: () => { throw Error('Home cards should not calculate arrival estimates'); } },
});
const { CompactTripCard } = load('components/trip/CompactTripCard.tsx');
const { TripPreviewCard } = load('components/home/TripPreviewCard.tsx');
const { TripRequestPreviewCard } = load('components/home/TripRequestPreviewCard.tsx');
const { HomeRequestHighlightCard } = load('components/home/HomeRequestHighlightCard.tsx');
const presentation = load('features/home/homeCardPresentation.ts');
const departureTime = new Date(2026, 8, 18, 11, 0).toISOString();
const maxTime = new Date(2026, 8, 18, 11, 30).toISOString();
const trip = { id: 't', departure: { name: 'Rond-point Ngaba' }, arrival: { name: 'Grand Marché de Kinshasa' },
  departureTime, price: 2000, availableSeats: 4, driverName: 'Alex', driverRating: 4.8, vehicleType: 'car',
  driverAvatar: 'https://example.test/driver.jpg' };
const request = { id: 'r', departure: trip.departure, arrival: trip.arrival, departureDateMin: departureTime,
  departureDateMax: maxTime, numberOfSeats: 2, maxPricePerSeat: 2500, passengerName: 'Marie',
  status: 'pending', offers: [], vehicleType: 'motorcycle_2_wheels' };

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  const component = typeof element.type === 'function' ? element.type : element.type?.type;
  if (typeof component === 'function') return nodes(component(element.props));
  return [element, ...nodes(element.props.children)];
}
function textOf(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(textOf).join('');
  return React.isValidElement(element) ? textOf(element.props.children) : '';
}
function render(component, props) {
  const elements = nodes(React.createElement(component, props));
  return { elements, buttons: elements.filter(node => node.type === 'Button'),
    text: elements.filter(node => node.type === 'Text').map(textOf).join('\n') };
}

test('published cards keep routes, departure, per-seat price, seats, vehicle, driver and reservation', () => {
  const routes = [];
  const result = render(TripPreviewCard, { trip: Object.freeze(trip), cardWidth: 280,
    isBooked: true, isSelected: true, onOpen: id => routes.push(id) });
  for (const value of ['Rond-point Ngaba', 'Grand Marché de Kinshasa', '11:00', '2.000 FC', '/ place',
    '4 places libres', 'Voiture', 'Alex', '4.8', 'Réservé']) assert.ok(result.text.includes(value), value);
  assert.equal(result.elements.find(node => node.type === 'Image').props.source.uri, trip.driverAvatar);
  assert.equal(result.buttons.length, 1);
  result.buttons[0].props.onPress(); assert.deepEqual(routes, ['t']);
  const routeNames = result.elements.filter(node => node.type === 'Text' &&
    [trip.departure.name, trip.arrival.name].includes(node.props.children));
  routeNames.forEach(node => assert.equal(node.props.style.fontWeight, '700'));
});

test('free trips are distinct from unknown prices and no number of seats multiplies the fare', () => {
  assert.equal(presentation.homePriceLabel(0), 'Gratuit');
  for (const price of [null, undefined, NaN, Infinity, -2]) assert.equal(presentation.homePriceLabel(price), 'Prix à préciser');
  const free = render(TripPreviewCard, { trip: { ...trip, price: 0 }, cardWidth: 280, onOpen() {} });
  assert.ok(free.text.includes('Gratuit'));
  assert.equal(free.text.includes('/ place'), false);
  const paid = render(TripPreviewCard, { trip, cardWidth: 280, onOpen() {} });
  assert.equal(paid.text.includes('8.000'), false);
  assert.equal(presentation.homeSeatsLabel(0, true), 'Complet');
  assert.equal(presentation.homeSeatsLabel(NaN), 'Places à préciser');
});

test('driver photos use existing data and keep a stable initials layer without changing card actions', () => {
  const { SearchResultCard } = load('components/search/SearchResultCard.tsx');
  const { CompactCardAvatar } = load('components/trip/CompactCardAvatar.tsx');
  for (const Card of [TripPreviewCard, SearchResultCard]) {
    const props = { cardWidth: 280, onOpen() {}, onPress() {} };
    const withPhoto = render(Card, { ...props, trip: { ...trip, driverName: 'Alex Test' } });
    const photo = withPhoto.elements.find(node => node.type === 'Image');
    assert.equal(photo.props.source.uri, trip.driverAvatar);
    assert.equal(photo.props.style.width, 32);
    assert.equal(photo.props.style.height, 32);
    assert.equal(photo.props.resizeMethod, 'resize');
    assert.equal(photo.props.fadeDuration, 0);
    assert.ok(withPhoto.text.includes('AT'));
    assert.equal(withPhoto.buttons.length, 1);

    const fallback = render(Card, { ...props, trip: { ...trip, driverAvatar: '  ',
      driver: { profilePicture: 'https://example.test/profile.jpg' } } });
    assert.equal(fallback.elements.find(node => node.type === 'Image').props.source.uri, 'https://example.test/profile.jpg');

    const noPhoto = render(Card, { ...props, trip: { ...trip, driverAvatar: null, driverName: 'Alex Test' } });
    assert.equal(noPhoto.elements.some(node => node.type === 'Image'), false);
    assert.ok(noPhoto.text.includes('AT'));
  }
  const missing = render(CompactCardAvatar, { name: '', uri: ' ' });
  assert.ok(missing.text.includes('ZW'));
  const before = render(CompactCardAvatar, { name: 'Alex', uri: trip.driverAvatar });
  const after = render(CompactCardAvatar, { name: 'Marie', uri: 'https://example.test/new.jpg' });
  assert.notEqual(before.elements.find(node => node.type === 'Image').key, after.elements.find(node => node.type === 'Image').key);
  assert.equal(CompactCardAvatar.$$typeof, Symbol.for('react.memo'));
});

test('request cards show a departure window, requested vehicle and budget per seat, never an arrival deadline', () => {
  const routes = [];
  const result = render(TripRequestPreviewCard, { request, cardWidth: 280, onOpen: id => routes.push(id) });
  for (const value of ['11:00–11:30', '2.500 FC', 'max / place', '2 places', 'Moto à 2 roues', 'Marie']) {
    assert.ok(result.text.includes(value), value);
  }
  assert.equal(result.text.includes('ARRIVÉE'), false);
  assert.equal(result.text.includes('5.000'), false);
  assert.equal(result.buttons.length, 1);
  result.buttons[0].props.onPress(); assert.deepEqual(routes, ['r']);
});

test('Home request previews and highlights display the requester photo in the existing compact avatar', () => {
  for (const Card of [TripRequestPreviewCard, HomeRequestHighlightCard]) {
    const routes = [];
    const props = { cardWidth: 280, distanceMeters: 1250, onOpen: id => routes.push(id),
      request: { ...request, passengerName: 'Marie Test', passengerAvatar: '  https://example.test/passenger.jpg  ' } };
    const result = render(Card, props);
    const photo = result.elements.find(node => node.type === 'Image');
    assert.equal(photo.props.source.uri, 'https://example.test/passenger.jpg');
    assert.equal(photo.props.style.width, 32);
    assert.equal(photo.props.style.height, 32);
    assert.equal(photo.props.resizeMethod, 'resize');
    assert.equal(photo.props.fadeDuration, 0);
    assert.ok(result.text.includes('Marie Test'));
    assert.ok(result.text.includes('MT'), 'initials remain underneath a loading/failed photo');
    assert.equal(result.buttons.length, 1);
    assert.ok(result.buttons[0].props.accessibilityHint.includes('Marie Test'));
    result.buttons[0].props.onPress();
    assert.deepEqual(routes, ['r']);

    for (const passengerAvatar of [undefined, null, '', '  ']) {
      const fallback = render(Card, { ...props, request: { ...props.request, passengerAvatar } });
      assert.equal(fallback.elements.some(node => node.type === 'Image'), false);
      assert.ok(fallback.text.includes('MT'));
    }
    const anonymous = render(Card, { ...props, request: { ...request, passengerName: '  ' } });
    assert.ok(anonymous.text.includes('Passager Zwanga'));
    assert.ok(anonymous.text.includes('PZ'));
    const changed = render(Card, { ...props, request: { ...props.request, passengerAvatar: 'https://example.test/next.jpg' } });
    assert.notEqual(changed.elements.find(node => node.type === 'Image').key, photo.key);
  }
});

test('an absent request budget is not presented as free, and received offers remain visible', () => {
  const result = render(TripRequestPreviewCard, { request: { ...request, maxPricePerSeat: null,
    offers: [{ status: 'pending' }, { status: 'pending' }, { status: 'rejected' }] }, cardWidth: 280, onOpen() {} });
  assert.ok(result.text.includes('2 offres'));
  assert.equal(result.text.includes('Gratuit'), false);
  assert.equal(result.text.includes('max / place'), false);
});

test('nearby priorities keep distance, date, seats, budget and their screen-reader dismiss action', () => {
  let dismissals = 0;
  const result = render(HomeRequestHighlightCard, { request, distanceMeters: 1250, onOpen() {},
    accessibilityActions: [{ name: 'dismiss', label: 'Masquer' }], onAccessibilityAction: () => dismissals++ });
  for (const value of ['1,3 km', '11:00–11:30', '2 places', '2.500 FC', 'Moto à 2 roues']) assert.ok(result.text.includes(value));
  result.buttons[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'dismiss' } });
  assert.equal(dismissals, 1);
  assert.ok(result.buttons[0].props.accessibilityHint.includes(request.arrival.name));
  assert.equal(presentation.homeDistanceLabel(15), '< 100 m');
  assert.equal(presentation.homeDistanceLabel(NaN), null);
});

test('long location names retain their full accessible text and large-price captions move below the amount', () => {
  const departure = 'Une avenue avec un nom très long '.repeat(4);
  const arrival = 'Un lieu de destination très long '.repeat(4);
  const result = render(CompactTripCard, { label: 'Demande', departure, arrival, metadata: '4 places',
    width: 264, priceText: '125.000 FC', priceHint: 'max / place', inlineRoute: true, onPress() {} });
  assert.ok(result.buttons[0].props.accessibilityHint.includes(departure));
  assert.ok(result.buttons[0].props.accessibilityHint.includes(arrival));
  assert.ok(result.elements.some(node => node.type === 'Text' && node.props.children === 'max / place'));
  const place = result.elements.find(node => node.type === 'Text' && node.props.children === departure);
  assert.equal(place.props.numberOfLines, 1);
  assert.equal(place.props.style.minWidth, 0);
  const styles = load('components/trip/CompactTripCard.styles.ts').styles;
  assert.ok(styles.card.minHeight < 100);
  assert.equal(styles.card.height, undefined);
  assert.equal(styles.card.shadowRadius, undefined);
});

test('invalid dates have readable fallbacks and cross-day departure windows preserve both dates', () => {
  assert.equal(presentation.homeDepartureLabel('invalid'), 'Horaire à préciser');
  assert.equal(presentation.homeRequestDepartureLabel('invalid', maxTime), 'Horaire à préciser');
  assert.equal(presentation.homeRequestDepartureLabel(departureTime, departureTime), presentation.homeDepartureLabel(departureTime));
  const nextDay = new Date(2026, 8, 19, 8, 0).toISOString();
  const window = presentation.homeRequestDepartureLabel(departureTime, nextDay);
  assert.ok(window.includes(presentation.homeDepartureLabel(nextDay)));
  assert.ok(window.includes('→'));
});

test('sheets take less space without changing locked or safe-area behavior', () => {
  for (const isDriver of [false, true]) {
    const hooks = hookHarness();
    const { useHomeSheet } = loader({ 'react-native': native, react: hooks.react })('hooks/home/useHomeSheet.ts');
    const props = { isDriver, currentUser: {}, width: 390, height: 844, insets: { bottom: 34 },
      latestTrips: [], availableDriverRequests: [], visibleDriverPassengerMarkers: [], router: { push() {} } };
    const draw = () => hooks.render(() => useHomeSheet(props));
    assert.equal(draw().sheetHeight, 68);
    draw().toggleTripsSheet();
    const expanded = draw();
    assert.equal(expanded.sheetHeight, isDriver ? 298 : 250);
    assert.equal(expanded.sheetBottomOffset, 96);
    props.width = 320; props.height = 568;
    assert.equal(draw().sheetHeight, isDriver ? 294 : 246);
    props.isHomeSheetLockedRetracted = true;
    assert.equal(draw().sheetHeight, 68);
    hooks.unmount();
  }
});
