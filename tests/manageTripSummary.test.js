const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView',
  RefreshControl: 'RefreshControl', StyleSheet: { create: value => value } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  './ManageTripBookings': { ManageTripBookings: 'Bookings' },
  './ManageTripInterruptionNotice': { ManageTripInterruptionNotice: 'InterruptionNotice' },
});
const { ManageTripSummary } = load('features/manage-trip/ManageTripSummary.tsx');
const { ManageTripContent } = load('features/manage-trip/ManageTripContent.tsx');
const trip = Object.freeze({ departure: Object.freeze({ address: 'Kintambo Magasin, Kinshasa' }),
  arrival: Object.freeze({ address: 'Avenue De La Victoire, Kinshasa' }),
  departureTime: '2026-09-18T15:00:00Z', availableSeats: 4, totalSeats: 4, price: 0, status: 'ongoing' });

function content(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(content).join('');
  return React.isValidElement(node) ? content(node.props.children) : '';
}
function render(Component, props) {
  const nodes = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    const fn = typeof node.type === 'function' ? node.type : node.type?.type;
    if (typeof fn === 'function') return visit(fn(node.props));
    nodes.push(node); visit(node.props.children);
  };
  visit(React.createElement(Component, props));
  return { nodes, buttons: nodes.filter(node => node.type === 'Button'),
    text: nodes.filter(node => node.type === 'Text').map(content).join('\n') };
}

test('compact management summary keeps the route, departure time, seats and free fare', () => {
  const result = render(ManageTripSummary, { trip });
  for (const label of ['Kintambo Magasin', 'Avenue De La Victoire', '18/09/2026', '4/4', 'places libres', 'Gratuit']) {
    assert.ok(result.text.includes(label), label);
  }
  assert.equal(result.text.includes('/ place'), false);
  assert.equal(result.text.includes('EN COURS'), false); // Status already in the screen header.
  assert.equal(result.buttons.length, 0);
  assert.ok(result.nodes.some(node => node.props.accessibilityLabel === 'Départ : Kintambo Magasin, Kinshasa'));
  assert.ok(result.nodes.some(node => node.props.accessibilityLabel === 'Arrivée : Avenue De La Victoire, Kinshasa'));
});

test('paid fares remain per seat, not multiplied by seat capacity; full trips keep zero availability', () => {
  const result = render(ManageTripSummary, { trip: { ...trip, price: 5000, availableSeats: 0 } });
  assert.ok(result.text.includes('5.000 FC / place'));
  assert.equal(result.text.includes('20.000'), false);
  assert.ok(result.text.includes('0/4 places libres'));
});

test('missing data never invents a free fare, an address or a date', () => {
  for (const price of [undefined, null, NaN, -1]) {
    const result = render(ManageTripSummary, { trip: { ...trip, price, departure: null, arrival: null, departureTime: 'invalid' } });
    for (const label of ['Prix à préciser', 'Départ à préciser', 'Arrivée à préciser', 'Horaire à préciser']) {
      assert.ok(result.text.includes(label), label);
    }
    assert.equal(result.text.includes('Gratuit'), false);
    assert.equal(result.text.includes('/ place'), false);
  }
});

test('address editing is still available only before departure with the original callback', () => {
  let calls = 0;
  const onEditRoute = () => calls++;
  for (const status of ['upcoming', 'ongoing', 'completed', 'cancelled']) {
    const result = render(ManageTripSummary, { trip: { ...trip, status }, onEditRoute });
    assert.equal(result.buttons.length, status === 'upcoming' ? 1 : 0);
    if (status === 'upcoming') {
      assert.equal(result.buttons[0].props.onPress, onEditRoute);
      assert.equal(result.buttons[0].props.accessibilityLabel, 'Modifier les adresses');
      result.buttons[0].props.onPress();
    }
  }
  assert.equal(calls, 1);
});

test('the summary has no layout feedback and accommodates wrapping and accessible text sizes', () => {
  const styles = load('features/manage-trip/ManageTripSummary.styles.ts').styles;
  const result = render(ManageTripSummary, { trip });
  assert.equal(ManageTripSummary.$$typeof, Symbol.for('react.memo'));
  assert.equal(styles.card.height, undefined);
  assert.equal(styles.card.shadowRadius, undefined);
  assert.equal(styles.stats.flexWrap, 'wrap');
  assert.ok(styles.editButton.minHeight >= 44);
  assert.equal(result.nodes.some(node => node.props.onLayout || node.props.allowFontScaling === false), false);
});

test('management retains refresh, passenger actions, interruption notice and safety entry points', () => {
  const calls = [];
  const refreshAll = async () => calls.push('refresh');
  const state = { trip, refreshing: false, router: { push: path => calls.push(path) } };
  const tracking = {}, actions = {}, bookingsActions = {};
  const result = render(ManageTripContent, { state, tracking, actions, bookingsActions, refreshAll,
    routeEditor: {}, openTripSecurityModal: () => calls.push('safety') });
  const bookings = result.nodes.find(node => node.type === 'Bookings');
  assert.equal(bookings.props.state, state);
  assert.equal(bookings.props.actions, actions);
  assert.equal(bookings.props.bookingsActions, bookingsActions);
  assert.equal(result.nodes.find(node => node.type === 'InterruptionNotice').props.trip, trip);
  assert.equal(result.nodes.find(node => node.type === 'ScrollView').props.refreshControl.props.onRefresh, refreshAll);
  result.buttons.forEach(button => button.props.onPress());
  assert.deepEqual(calls, ['safety', '/security']);
});
