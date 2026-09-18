const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const native = { Text: 'Text', View: 'View', TouchableOpacity: 'Button', Image: 'Image',
  Platform: { OS: 'ios', select: value => value.ios }, StyleSheet: { create: value => value } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/hooks/useTripArrivalTime': { useTripArrivalTime: () => { throw Error('No arrival estimate on compact previews'); } },
});
const { SearchResultCard } = load('components/search/SearchResultCard.tsx');
const { SearchRequestResultCard } = load('components/search/SearchRequestResultCard.tsx');
const departureTime = new Date(2026, 8, 18, 11, 0).toISOString();
const trip = Object.freeze({ id: 'trip', departureTime, price: 2000, availableSeats: 4,
  departure: { name: 'Avenue de la Démocratie' }, arrival: { name: 'Université de Kinshasa' },
  vehicle: { brand: 'Toyota', model: 'Yaris' }, driverName: 'Alex', driverRating: 4.8,
  driverAvatar: 'https://example.test/driver.jpg' });
const request = Object.freeze({ id: 'request', departure: trip.departure, arrival: trip.arrival,
  departureDateMin: departureTime, departureDateMax: new Date(2026, 8, 18, 11, 30).toISOString(),
  numberOfSeats: 2, maxPricePerSeat: 2500, vehicleType: 'motorcycle_2_wheels', passengerName: 'Marie', offers: [{}, {}] });

function render(component, props) {
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    const fn = typeof node.type === 'function' ? node.type : node.type?.type;
    if (typeof fn === 'function') return visit(fn(node.props));
    nodes.push(node); visit(node.props.children);
  }
  function textOf(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    return React.isValidElement(node) ? textOf(node.props.children) : '';
  }
  visit(React.createElement(component, props));
  return { nodes, button: nodes.find(node => node.type === 'Button'),
    text: nodes.filter(node => node.type === 'Text').map(textOf).join('\n') };
}

test('compact search trips keep essential data and forward the original trip on one whole-card action', () => {
  const opened = [];
  const result = render(SearchResultCard, { trip, onPress: item => opened.push(item) });
  for (const value of ['Avenue de la Démocratie', 'Université de Kinshasa', '11:00', '2.000 FC', '/ place',
    '4 places libres', 'Toyota Yaris', 'Alex', '4.8']) assert.ok(result.text.includes(value), value);
  assert.equal(result.nodes.filter(node => node.type === 'Button').length, 1);
  assert.equal(result.nodes.find(node => node.type === 'Image').props.source.uri, trip.driverAvatar);
  result.button.props.onPress(); assert.equal(opened[0], trip);
  assert.equal(SearchResultCard.$$typeof, Symbol.for('react.memo'));
});

test('compact search requests preserve both departure bounds, per-seat budget and offers', () => {
  const opened = [];
  const result = render(SearchRequestResultCard, { request, onPress: item => opened.push(item) });
  for (const value of ['11:00–11:30', '2.500 FC', 'max / place', '2 places', 'Moto', 'Marie', '2 offres']) {
    assert.ok(result.text.includes(value), value);
  }
  assert.equal(result.text.includes('5.000'), false);
  result.button.props.onPress(); assert.equal(opened[0], request);
  assert.equal(SearchRequestResultCard.$$typeof, Symbol.for('react.memo'));
});

test('disabled search cards cannot navigate, and re-enabling restores the existing action', () => {
  for (const [Component, props] of [[SearchResultCard, { trip }], [SearchRequestResultCard, { request }]]) {
    let calls = 0;
    const onPress = () => calls++;
    const disabled = render(Component, { ...props, disabled: true, onPress });
    assert.equal(disabled.button.props.disabled, true);
    assert.equal(disabled.button.props.accessibilityState.disabled, true);
    assert.equal(disabled.button.props.onPress, undefined);
    assert.equal(disabled.button.props.accessibilityRole, 'button');
    render(Component, { ...props, disabled: false, onPress }).button.props.onPress();
    assert.equal(calls, 1);
  }
});

test('unknown request budgets are never free; free trips remain free, and route names stay accessible', () => {
  for (const maxPricePerSeat of [undefined, null, 0, NaN, -1]) {
    const result = render(SearchRequestResultCard, { request: { ...request, maxPricePerSeat }, onPress() {} });
    assert.ok(result.text.includes('À proposer'));
    assert.equal(result.text.includes('Gratuit'), false);
  }
  const result = render(SearchResultCard, { trip: { ...trip, price: 0 }, onPress() {} });
  assert.ok(result.text.includes('Gratuit'));
  assert.equal(result.text.includes('/ place'), false);
  assert.ok(result.button.props.accessibilityHint.includes(trip.arrival.name));
  for (const name of [trip.departure.name, trip.arrival.name]) {
    const node = result.nodes.find(node => node.type === 'Text' && node.props.children === name);
    assert.equal(node.props.style.fontWeight, '700');
  }
});

test('compact spacing does not shrink primary touch targets or introduce fixed list-header heights', () => {
  const search = load('features/screen-styles/app/search/container.styles.ts').styles;
  const toolbar = load('features/search/SearchResultsToolbar.styles.ts').styles;
  const header = load('features/home/HomeHeader.styles.ts').styles;
  const sheet = load('features/home/HomeTripsSheet.styles.ts').styles;
  assert.ok(search.resultSeparator.height <= 8);
  assert.ok(search.scrollContent.paddingHorizontal <= 16);
  for (const style of [header.actionButton, header.actionSearchButton, search.searchModeButton,
    sheet.sheetModeOption, toolbar.sortButton]) assert.ok(style.minHeight >= 44);
  for (const style of [search.passengerStepButton, header.notificationButton, sheet.sheetToggle]) {
    assert.ok(style.height >= 44); assert.ok(style.width >= 44);
  }
  assert.equal(header.topOverlay.paddingTop, undefined);
  assert.equal(toolbar.container.height, undefined);
  assert.equal(toolbar.sortOptions.flexWrap, 'wrap');
  assert.equal(sheet.tripsHorizontalContent.alignItems, 'flex-start');
});
