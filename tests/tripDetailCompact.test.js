const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader({
  'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
    ActivityIndicator: 'Spinner', StyleSheet: { create: x => x, hairlineWidth: 1 } },
  '@expo/vector-icons': { Ionicons: 'Icon' },
});
const { TripSummary } = load('features/trip-detail/TripSummary.tsx');
const { getRouteLocationLabels } = load('utils/routeLocationLabels.ts');
const trip = Object.freeze({ id: 'trip', driverId: 'driver', driverName: 'Marie Conductrice',
  driverAvatar: 'https://example.test/avatar.jpg', price: 4000, status: 'upcoming', requiresPassengerKyc: true,
  departure: { name: 'Université Pédagogique Nationale (UPN)', address: 'Route de Matadi, Kinshasa', reference: 'Portail principal' },
  arrival: { name: 'Kintambo Magasin', address: 'Kintambo, Kinshasa' },
});
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : '';
}
function render(extra = {}) {
  const calls = [];
  const props = { trip, routeLabels: getRouteLocationLabels(trip), config: { label: 'À venir', color: '#F7B801' },
    tripPriceLabel: '4000 FC', tripDepartureTimeLabel: '18/09/2026 18:30', tripArrivalTimeLabel: '18/09/2026 18:59',
    tripSeatsLabel: '2 places', tripRouteDistanceLabel: '9.5 km', progress: 20, estimatedArrivalTime: null,
    driverReviewAverage: 4.5, tripVehicleLabel: 'Yamaha', tripVehicleMetaLabel: 'Noir · 1234AB01',
    tripVehicleIconName: 'bicycle', driverPhone: '000', router: { push: route => calls.push(route) },
    setVehicleDetailModalVisible: value => calls.push(['vehicle', value]),
    handleContactDriver: () => calls.push('message'), setContactModalVisible: value => calls.push(['contact', value]),
    ...extra };
  const nodes = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    const fn = typeof node.type === 'function' ? node.type : node.type?.type;
    if (typeof fn === 'function') return visit(fn(node.props));
    nodes.push(node); visit(node.props.children);
  };
  visit(TripSummary(props));
  return { props, calls, nodes, texts: nodes.filter(node => node.type === 'Text').map(text),
    buttons: nodes.filter(node => node.type === 'Button') };
}

test('trip detail shows each place once, with both full timestamps, address context and pickup reference', () => {
  const { texts, nodes } = render();
  assert.equal(texts.filter(value => value === trip.departure.name).length, 1);
  assert.equal(texts.filter(value => value === trip.arrival.name).length, 1);
  assert.equal(texts.some(value => value.includes(' vers ')), false);
  for (const value of ['18/09/2026 18:30', '18/09/2026 18:59', 'Route de Matadi, Kinshasa',
    'Repère : Portail principal', '2 places', '9.5 km', '4000 FC / place', 'Identité vérifiée requise pour réserver']) {
    assert.ok(texts.includes(value), value);
  }
  assert.ok(nodes.some(node => node.props.accessibilityLabel?.includes('Arrivée estimée : 18/09/2026 18:59')));
  assert.equal(nodes.some(node => node.props.entering || node.props.onLayout), false);
});

test('driver photo, profile, vehicle details and contact keep their actions and identifiers', () => {
  const result = render();
  assert.equal(result.nodes.find(node => node.type === 'Image').props.source.uri, trip.driverAvatar);
  result.buttons.forEach(button => button.props.onPress());
  assert.deepEqual(result.calls, [{ pathname: '/driver/[id]', params: { id: 'driver' } },
    ['vehicle', true], 'message', ['contact', true]]);
});

test('busy messaging and missing phone stay disabled; free fares do not gain a per-seat hint', () => {
  const result = render({ isOpeningConversation: true, driverPhone: null,
    trip: { ...trip, price: 0, requiresPassengerKyc: false }, tripPriceLabel: 'Gratuit' });
  assert.equal(result.buttons.find(button => button.props.accessibilityLabel === 'Envoyer un message au conducteur').props.disabled, true);
  assert.equal(result.buttons.find(button => button.props.accessibilityLabel === 'Contacter le conducteur sur WhatsApp').props.disabled, true);
  assert.equal(result.nodes.filter(node => node.type === 'Spinner').length, 1);
  assert.ok(result.texts.includes('Gratuit'));
  assert.equal(result.texts.some(value => value.includes('/ place') || value.includes('Identité vérifiée')), false);
});

test('ongoing details retain progress and ETA, with wrapping text and usable touch targets', () => {
  const result = render({ trip: { ...trip, status: 'ongoing' } });
  assert.ok(result.texts.includes('Progression'));
  assert.ok(result.texts.includes('20%'));
  assert.ok(result.texts.includes('Arrivée estimée : 18/09/2026 18:59'));
  const styles = load('features/screen-styles/app/trip/detail/index.ts').styles;
  assert.equal(styles.tripQuickFacts.flexWrap, 'wrap');
  assert.equal(styles.tripHeroTopRow.flexWrap, 'wrap');
  assert.equal(styles.tripHeroSummary.height, undefined);
  assert.ok(styles.tripInlineActionButton.minHeight >= 44);
  for (const name of [trip.departure.name, trip.arrival.name]) {
    const node = result.nodes.find(node => node.type === 'Text' && text(node) === name);
    assert.equal(node.props.numberOfLines, undefined);
    assert.notEqual(node.props.allowFontScaling, false);
  }
});
