const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
  ActivityIndicator: 'Loading', StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: 'CashReceipt' },
  '@/hooks/useTripArrivalTime': { useTripArrivalTime: () => { throw Error('No arrival estimates in compact lists'); } },
});
const { PublishedTripCard, BookingTripCard, canManagePublishedTrip, getTripStatusBadge, getBookingStatusBadge } = load('features/trips/TripListCards.tsx');
const { ManageTripBookings } = load('features/manage-trip/ManageTripBookings.tsx');
const trip = Object.freeze({ id: 'trip', departure: { name: 'Rond-point Ngaba' }, arrival: { name: 'Gombe' },
  driverName: 'Alex Test', driverAvatar: 'https://example.test/driver.jpg', driverRating: 4.5,
  departureTime: '2099-09-18T11:00:00Z', status: 'upcoming', availableSeats: 3, price: 2500,
  vehicle: { brand: 'Toyota', model: 'Yaris' } });
const booking = Object.freeze({ id: 'booking', tripId: trip.id, trip, passengerId: 'passenger',
  passengerName: 'Marie Test', passengerAvatar: 'https://example.test/passenger.jpg', passengerPhone: '000',
  numberOfSeats: 2, passengerDestination: 'Université de Kinshasa', status: 'pending' });
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
  return { nodes, buttons: nodes.filter(node => node.type === 'Button'),
    text: nodes.filter(node => node.type === 'Text').map(text).join('\n') };
}

test('published cards retain key data, photos and separate details/edit/delete actions', () => {
  const calls = [];
  const result = render(PublishedTripCard, { trip, canManage: true, status: getTripStatusBadge(trip),
    onDetails: id => calls.push(['detail', id]), onEdit: item => calls.push(['edit', item]), onDelete: item => calls.push(['delete', item]) });
  for (const value of ['Rond-point Ngaba', 'Gombe', 'À venir', '3 places libres', '2.500 FC', '/ place', 'Alex Test', '4.5', 'Toyota Yaris']) {
    assert.ok(result.text.includes(value), value);
  }
  assert.equal(result.nodes.find(node => node.type === 'Image').props.source.uri, trip.driverAvatar);
  assert.equal(result.buttons.length, 3);
  result.buttons.forEach(button => button.props.onPress());
  assert.deepEqual(calls, [['detail', trip.id], ['edit', trip], ['delete', trip]]);
  for (const button of result.buttons) assert.equal(button.props.accessibilityRole, 'button');
});

test('non-editable or request-linked trips do not expose forbidden actions, but details stay accessible', () => {
  for (const canManage of [true, false]) {
    for (const linked of [true, false]) {
      const result = render(PublishedTripCard, { trip: { ...trip, tripRequestId: linked ? 'request' : null },
        canManage, status: getTripStatusBadge(trip), onDetails() {}, onEdit() {}, onDelete() {} });
      assert.equal(result.buttons.some(button => text(button) === 'Modifier'), canManage);
      assert.equal(result.buttons.some(button => text(button) === 'Supprimer'), !linked);
      assert.equal(result.buttons[0].props.accessibilityLabel, 'Gérer ce trajet');
    }
  }
  const past = { ...trip, departureTime: '2000-01-01T00:00:00Z' };
  assert.equal(canManagePublishedTrip(past), false);
  assert.equal(getTripStatusBadge(past).label, 'Expiré');
  assert.equal(canManagePublishedTrip({ ...past, status: 'ongoing' }), true);
  assert.equal(canManagePublishedTrip({ ...trip, status: 'completed' }), false);
});

test('reservation previews preserve passenger destination, seats, estimated total and original detail route', () => {
  const calls = [];
  const result = render(BookingTripCard, { booking, status: getBookingStatusBadge(booking), onDetails: id => calls.push(id) });
  for (const value of ['Rond-point Ngaba', booking.passengerDestination, '2 places', '5.000 FC', 'total', 'En attente']) {
    assert.ok(result.text.includes(value), value);
  }
  result.buttons[0].props.onPress(); assert.deepEqual(calls, [trip.id]);
  const free = render(BookingTripCard, { booking: { ...booking, trip: { ...trip, price: 0 } }, status: getBookingStatusBadge(booking), onDetails() {} });
  assert.ok(free.text.includes('Gratuit'));
  assert.equal(render(BookingTripCard, { booking: { ...booking, trip: null } }).nodes.length, 0);
});

function received(overrides = {}, tripOverrides = {}, busy = {}) {
  const calls = [];
  const item = { ...booking, ...overrides };
  const state = { trip: { ...trip, ...tripOverrides }, ...busy,
    router: { push: path => calls.push(['route', path]) },
    setSelectedPassengerPhone: phone => calls.push(['phone', phone]),
    setSelectedPassengerName: name => calls.push(['name', name]),
    setContactModalVisible: visible => calls.push(['contact', visible]),
  };
  const result = render(ManageTripBookings, { tracking: { visibleBookings: [item] }, state,
    actions: { handleOpenNavigation: () => calls.push(['navigation']) }, bookingsActions: {
      openRejectModal: item => calls.push(['reject', item.id]), handleAcceptBooking: id => calls.push(['accept', id]),
      handleCancelBookingBeforePickup: item => calls.push(['cancel', item.id]),
    } });
  return { ...result, calls, button: label => result.buttons.find(button => text(button) === label) };
}

test('received pending reservations keep accept/reject, one profile entry and mutation loading guards', () => {
  const result = received();
  assert.equal(result.buttons.filter(button => button.props.accessibilityLabel?.startsWith('Voir le profil')).length, 1);
  assert.equal(result.button('Profil'), undefined);
  result.buttons.find(button => button.props.accessibilityLabel?.startsWith('Voir le profil')).props.onPress();
  result.button('Accepter').props.onPress(); result.button('Refuser').props.onPress();
  assert.deepEqual(result.calls, [['route', '/passenger/passenger'], ['accept', booking.id], ['reject', booking.id]]);
  for (const busy of [{ isAccepting: true }, { isRejecting: true }]) {
    const disabled = received({}, {}, busy);
    assert.equal(disabled.button('Refuser').props.disabled, true);
    assert.equal(disabled.button('Accepter').props.disabled, true);
  }
  const loading = received({}, {}, { isAccepting: true, processingBookingId: booking.id });
  assert.equal(loading.nodes.filter(node => node.type === 'Loading').length, 1);
});

test('received accepted reservations preserve contact and cancellation guards before boarding', () => {
  const result = received({ status: 'accepted' }, { status: 'ongoing' });
  result.button('Contacter').props.onPress(); result.button('Annuler').props.onPress();
  assert.deepEqual(result.calls, [['phone', '000'], ['name', booking.passengerName], ['contact', true], ['cancel', booking.id]]);
  assert.ok(result.text.includes('À prendre en charge'));
  for (const flags of [{ pickedUp: true }, { pickedUpConfirmedByPassenger: true }]) {
    assert.equal(received({ status: 'accepted', ...flags }).button('Annuler'), undefined);
  }
  assert.equal(received({ status: 'accepted' }, { tripRequestId: 'request' }).button('Annuler'), undefined);
  assert.equal(received({ status: 'accepted' }, { status: 'completed' }).button('Annuler'), undefined);
  const busy = received({ status: 'accepted' }, {}, { isCancellingBooking: true });
  assert.equal(busy.button('Annuler').props.disabled, true);
});

test('received reservation rating and progress messages retain their existing conditions and destinations', () => {
  const rated = received({ status: 'accepted', droppedOff: true, droppedOffConfirmedByPassenger: true });
  rated.button('Noter').props.onPress();
  assert.deepEqual(rated.calls, [['route', '/rate/trip?passengerId=passenger']]);
  assert.equal(received({ status: 'accepted' }).button('Noter'), undefined);
  const onboard = { status: 'accepted', pickedUp: true, pickedUpConfirmedByPassenger: true };
  assert.ok(received(onboard, { status: 'ongoing' }).text.includes('Trajet en cours'));
  assert.ok(received({ ...onboard, droppedOffConfirmedByPassenger: true }, { status: 'ongoing' }).text.includes('Arrivée en cours'));
});

test('compact list actions keep 44-point targets, wrapping status text and no row shadows', () => {
  const list = load('features/trips/TripListCards.styles.ts').styles;
  const received = load('features/manage-trip/ManageTripBookings.styles.ts').bookingStyles;
  assert.equal(PublishedTripCard.$$typeof, Symbol.for('react.memo'));
  assert.equal(BookingTripCard.$$typeof, Symbol.for('react.memo'));
  assert.ok(list.action.minHeight >= 44);
  assert.ok(received.actionButton.minHeight >= 44);
  assert.ok(received.passengerProfile.minHeight >= 44);
  assert.equal(list.card.shadowRadius, undefined);
  assert.equal(received.bookingCard.shadowRadius, undefined);
  assert.equal(received.bookingFooter.flexWrap, 'wrap');
  assert.equal(received.bookingStatusBadge.flexBasis, '100%');
});
