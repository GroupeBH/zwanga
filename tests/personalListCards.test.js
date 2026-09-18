const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
  ActivityIndicator: 'Loading', StyleSheet: { create: value => value } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/hooks/useTripArrivalTime': { useTripArrivalTime: () => { throw Error('No route estimation in list cards'); } } });
const { BookingListCard } = load('features/bookings/BookingListCard.tsx');
const { RequestListCard } = load('features/requests/RequestListCard.tsx');
const trip = Object.freeze({ id: 'trip', departure: { name: 'Avenue Matadi' }, arrival: { name: 'Gombe' },
  departureTime: '2099-09-18T11:00:00Z', status: 'upcoming', price: 2500,
  driverName: 'Alex', driverAvatar: 'https://example.test/driver.jpg', driver: { phone: '000' } });
const booking = Object.freeze({ id: 'booking', tripId: trip.id, trip, status: 'accepted', numberOfSeats: 2 });
const request = Object.freeze({ id: 'request', departure: trip.departure, arrival: trip.arrival,
  departureDateMin: trip.departureTime, departureDateMax: '2099-09-18T11:30:00Z',
  status: 'offers_received', numberOfSeats: 2, maxPricePerSeat: 2500, vehicleType: 'car',
  passengerName: 'Marie', passengerAvatar: 'https://example.test/passenger.jpg',
  offers: [{ status: 'pending' }, { status: 'rejected' }],
});
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : '';
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
  const buttons = nodes.filter(node => node.type === 'Button');
  return { nodes, buttons, text: nodes.filter(node => node.type === 'Text').map(text).join('\n'),
    button: label => buttons.find(button => text(button) === label) };
}
function reservation(overrides = {}, options = {}) {
  const calls = [];
  const result = render(BookingListCard, { booking: { ...booking, ...overrides }, activeTab: 'active',
    router: { push: path => calls.push(['route', path]) }, handleCancel: id => calls.push(['cancel', id]),
    setSelectedDriverPhone: phone => calls.push(['phone', phone]),
    setSelectedDriverName: name => calls.push(['name', name]),
    setContactModalVisible: value => calls.push(['modal', value]), ...options });
  return { ...result, calls };
}

test('personal requests preserve their status, departure window, per-seat budget and pending offers', () => {
  const calls = [];
  const result = render(RequestListCard, { request, own: true, featured: true, onOpen: id => calls.push(id) });
  for (const value of ['Offres reçues', 'Avenue Matadi', 'Gombe', '2.500 FC', 'max / place', '2 places', '1 offre']) {
    assert.ok(result.text.includes(value), value);
  }
  assert.equal(result.buttons.length, 1);
  result.buttons[0].props.onPress(); assert.deepEqual(calls, ['request']);
  assert.ok(result.buttons[0].props.accessibilityHint.includes('Voiture'));
  assert.ok(result.buttons[0].props.accessibilityHint.includes('–'));
});

test('selected drivers keep their photo and linked requests keep the existing request entry point', () => {
  const calls = [];
  const item = { ...request, status: 'driver_selected', tripId: 'linked-trip',
    selectedDriverId: 'driver', selectedDriverName: 'Alex', selectedDriverAvatar: trip.driverAvatar };
  const result = render(RequestListCard, { request: item, own: true, onOpen: id => calls.push(id) });
  assert.equal(result.nodes.find(node => node.type === 'Image').props.source.uri, trip.driverAvatar);
  assert.ok(result.text.includes('Course créée'));
  assert.equal(result.buttons[0].props.accessibilityLabel, 'Suivre la course');
  result.buttons[0].props.onPress(); assert.deepEqual(calls, [request.id]);
});

test('available requests retain passenger photo, offers and a separate driver-only accept entry', () => {
  for (const canAccept of [true, false]) {
    const calls = [];
    const result = render(RequestListCard, { request, canAccept, onOpen: id => calls.push(id) });
    assert.equal(result.nodes.find(node => node.type === 'Image').props.source.uri, request.passengerAvatar);
    assert.ok(result.text.includes('2 offres'));
    assert.equal(result.buttons.length, canAccept ? 2 : 1);
    result.buttons.forEach(button => button.props.onPress());
    assert.deepEqual(calls, canAccept ? [request.id, request.id] : [request.id]);
  }
});

test('unknown request budgets are never confused with free trips and expired requests remain readable', () => {
  for (const budget of [undefined, null, 0, NaN]) {
    const result = render(RequestListCard, { request: { ...request, maxPricePerSeat: budget, status: 'expired' }, own: true, onOpen() {} });
    assert.equal(result.text.includes('Gratuit'), false);
    assert.equal(result.text.includes('max / place'), false);
    assert.ok(result.text.includes('Expirée'));
  }
});

test('reservations retain the original detail route, total estimate, personal destination and driver photo', () => {
  const result = reservation({ passengerDestination: 'Université de Kinshasa' });
  for (const value of ['Confirmée', 'Avenue Matadi', 'Université de Kinshasa', '2 places', '5.000 FC', 'total estimé', 'Alex']) {
    assert.ok(result.text.includes(value), value);
  }
  assert.equal(result.nodes.find(node => node.type === 'Image').props.source.uri, trip.driverAvatar);
  result.buttons[0].props.onPress();
  result.button('WhatsApp').props.onPress(); result.button('Annuler').props.onPress();
  assert.deepEqual(result.calls, [['route', '/trip/trip'], ['phone', '000'], ['name', 'Alex'], ['modal', true], ['cancel', booking.id]]);
  assert.equal(result.button('Suivre le trajet'), undefined);
});

test('ongoing reservations still open passenger navigation even after the departure time', () => {
  const result = reservation({ trip: { ...trip, departureTime: '2000-01-01T00:00:00Z', status: 'ongoing' } });
  assert.ok(result.text.includes('Confirmée'));
  result.button('Suivre le trajet').props.onPress();
  assert.deepEqual(result.calls, [['route', '/booking/navigate/booking']]);
});

test('expiry, history and synchronization retain their contact/cancel guards', () => {
  for (const flags of [{ pickedUp: true }, { droppedOffConfirmedByPassenger: true }]) {
    const result = reservation(flags);
    assert.equal(result.button('WhatsApp'), undefined);
    assert.equal(result.button('Annuler'), undefined);
    assert.match(result.text, /Synchronisation|Finalisation/);
  }
  const expired = reservation({ trip: { ...trip, departureTime: '2000-01-01T00:00:00Z' } });
  assert.ok(expired.text.includes('Expirée')); assert.equal(expired.buttons.length, 1);
  assert.equal(reservation({}, { activeTab: 'history' }).buttons.length, 1);
  const loading = reservation({}, { isCancelling: true });
  const cancel = loading.buttons.find(button => button.props.accessibilityLabel === 'Annuler la réservation');
  assert.equal(cancel.props.disabled, true); assert.equal(cancel.props.onPress, undefined);
  assert.equal(loading.nodes.filter(node => node.type === 'Loading').length, 1);
});

test('completed bookings preserve rating, and missing trips do not invent a fare', () => {
  const result = reservation({ status: 'completed', droppedOffConfirmedByPassenger: true }, { activeTab: 'history' });
  result.button('Noter le conducteur').props.onPress();
  assert.deepEqual(result.calls, [['route', '/rate/trip']]);
  assert.equal(reservation({ status: 'completed' }).button('Noter le conducteur'), undefined);
  assert.ok(reservation({ trip: { ...trip, price: 0 } }).text.includes('Gratuit'));
  const missing = reservation({ trip: null }, { activeTab: 'history' });
  assert.ok(missing.text.includes('Prix à préciser'));
  assert.equal(missing.text.includes('2 FC'), false);
  missing.buttons[0].props.onPress(); assert.deepEqual(missing.calls, [['route', '/trip/trip']]);
});

test('compact personal cards are memoized, wrap their actions and keep accessible touch targets', () => {
  const styles = load('components/trip/CompactListCard.styles.ts').styles;
  assert.equal(BookingListCard.$$typeof, Symbol.for('react.memo'));
  assert.equal(RequestListCard.$$typeof, Symbol.for('react.memo'));
  assert.equal(styles.actions.flexWrap, 'wrap');
  assert.ok(styles.action.minHeight >= 44);
  assert.equal(styles.card.height, undefined); assert.equal(styles.card.shadowRadius, undefined);
});
