const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } });
const { CompactTripCard } = load('components/trip/CompactTripCard.tsx');
const { SearchResultCard } = load('components/search/SearchResultCard.tsx');
const { SearchRequestResultCard } = load('components/search/SearchRequestResultCard.tsx');
const { accentStyles, priorityAccents, prioritySurfaces } = load('components/trip/CompactTripCard.variants.ts');
const trip = { id: 'trip', departureTime: '2026-09-23T09:00:00Z', price: 2000, availableSeats: 4,
  departure: { name: 'Une avenue au nom très long '.repeat(4) }, arrival: { name: 'Un repère connu' },
  driverName: 'Alex', driverRating: 4.8, driverAvatar: 'https://example.test/driver.jpg', vehicleType: 'car' };
const request = { id: 'request', departure: trip.departure, arrival: trip.arrival,
  departureDateMin: trip.departureTime, departureDateMax: '2026-09-24T11:30:00Z',
  numberOfSeats: 2, maxPricePerSeat: 2500, passengerName: 'Marie', vehicleType: 'car', offers: [{}, {}] };

function resolve(node) {
  if (Array.isArray(node)) return node.flatMap(item => resolve(item)).filter(Boolean);
  if (!React.isValidElement(node)) return node;
  const fn = typeof node.type === 'function' ? node.type : node.type?.type;
  if (typeof fn === 'function') return resolve(fn(node.props));
  if (node.type === React.Fragment) return resolve(node.props.children);
  return { type: node.type, props: node.props, children: resolve(node.props.children) };
}
function flattenStyle(style) { return Object.assign({}, ...[style].flat(Infinity).filter(Boolean)); }
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node?.type) return textOf(node.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node?.type ? [node, ...nodes(node.children)] : [];
}
function geometry(node) {
  if (Array.isArray(node)) return node.map(geometry);
  if (!node?.type) return node;
  const style = Object.fromEntries(Object.entries(flattenStyle(node.props.style))
    .filter(([key]) => !['color', 'backgroundColor', 'borderColor'].includes(key)));
  return { type: node.type, style, numberOfLines: node.props.numberOfLines,
    size: node.props.size, name: node.props.name,
    children: node.type === 'Text' ? textOf(node) : geometry(node.children) };
}

test('search accents retain the existing native layout tree, typography and content for trips and requests', () => {
  const cases = [
    [SearchResultCard, { trip }],
    [SearchResultCard, { trip: { ...trip, price: 0, availableSeats: 1 } }],
    [SearchResultCard, { trip: { ...trip, price: 125000, driverAvatar: null } }],
    [SearchRequestResultCard, { request }],
    [SearchRequestResultCard, { request: { ...request, maxPricePerSeat: null, offers: [] } }],
    [SearchRequestResultCard, { request: { ...request, maxPricePerSeat: 125000 } }],
  ];
  for (const [Component, props] of cases) {
    const element = Component.type({ ...props, onPress() {} });
    const styled = resolve(element);
    // Equivalent pre-change card: same text as one metadata string, no new accents.
    const plain = resolve(React.createElement(CompactTripCard, { ...element.props,
      searchAppearance: undefined, metadataPrefix: undefined,
      metadata: `${element.props.metadataPrefix} · ${element.props.metadata}` }));
    assert.deepEqual(geometry(styled), geometry(plain));
    assert.equal(styled.props.accessibilityHint, plain.props.accessibilityHint);
    const inlineStatus = nodes(styled).find(node => node.type === 'Text'
      && node.props.children === element.props.metadataPrefix);
    assert.deepEqual(Object.keys(inlineStatus.props.style).sort(), ['backgroundColor', 'color']);
  }
});

test('search accents distinguish availability, requested seats and offers without inventing lifecycle statuses', () => {
  const available = resolve(SearchResultCard.type({ trip, onPress() {} }));
  assert.ok(nodes(available).some(node => node.props.style === accentStyles.available));
  for (const availableSeats of [0, -1, NaN]) {
    const unavailable = resolve(SearchResultCard.type({ trip: { ...trip, availableSeats }, onPress() {} }));
    assert.ok(nodes(unavailable).some(node => node.props.style === accentStyles.unavailable));
    assert.equal(nodes(unavailable).some(node => node.props.style === accentStyles.available), false);
  }
  const result = resolve(SearchRequestResultCard.type({ request, onPress() {} }));
  assert.ok(nodes(result).some(node => node.props.style === accentStyles.requested));
  const offers = nodes(result).find(node => node.type === 'Text' && node.props.children === '2 offres');
  assert.equal(flattenStyle(offers.props.style).backgroundColor, accentStyles.offers.backgroundColor);
  assert.equal(textOf(result).includes('Acceptée'), false);
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => {
    const c = parseInt(value, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce((total, c, i) => total + c * [0.2126, 0.7152, 0.0722][i], 0);
}
test('small priority labels and search highlights have at least 4.5:1 text contrast', () => {
  const pairs = Object.entries(priorityAccents).map(([key, value]) => [value.color, prioritySurfaces[key].backgroundColor]);
  pairs.push(...['available', 'requested', 'unavailable', 'offers'].map(key =>
    [accentStyles[key].color, accentStyles[key].backgroundColor]));
  for (const [text, background] of pairs) {
    assert.ok((luminance(background) + 0.05) / (luminance(text) + 0.05) >= 4.5, `${text} on ${background}`);
  }
});

test('normal home/list cards stay neutral and no extra action or animation is introduced', () => {
  const props = { label: 'Trajet', departure: 'Départ', arrival: 'Arrivée', metadata: '2 places', onPress() {} };
  const neutral = resolve(React.createElement(CompactTripCard, props));
  for (const priorityAppearance of Object.keys(priorityAccents)) {
    const card = resolve(React.createElement(CompactTripCard, { ...props, priorityAppearance }));
    assert.notEqual(flattenStyle(card.props.style).backgroundColor, flattenStyle(neutral.props.style).backgroundColor);
    assert.equal(nodes(card).filter(node => node.type === 'Button').length, 1);
    assert.ok(nodes(card).some(node => node.type === 'Icon' && node.props.name === priorityAccents[priorityAppearance].icon));
    assert.equal(nodes(card).some(node => String(node.type).includes('Animated')), false);
    assert.equal(card.props.accessibilityHint, neutral.props.accessibilityHint);
  }
});
