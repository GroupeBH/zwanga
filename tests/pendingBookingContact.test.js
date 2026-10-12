const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const { getDriverBookingContact, getPassengerBookingContact, getNavigationContacts } = loader()('features/navigation/navigationContacts.ts');
const trip = Object.freeze({ id: 'trip', driverId: 'driver', status: 'ongoing', price: 1000 });
const pending = Object.freeze({ id: 'booking-a', tripId: trip.id, passengerId: 'holder-a', passengerName: 'Titulaire A',
  passengerPhone: '0999000111', status: 'pending', numberOfSeats: 3 });
const other = Object.freeze({ ...pending, id: 'booking-b', passengerId: 'holder-b', passengerName: 'Titulaire B', passengerPhone: '0999000222' });
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };

test('the reservation holder can contact the driver while pending, without fabricating a number', () => {
  const reservedTrip = { ...trip, driver: { id: 'driver', phone: '+243999000111' } };
  const context = { role: 'passenger', trip: reservedTrip, booking: pending, userId: pending.passengerId };
  const [contact] = getNavigationContacts(context);
  assert.equal(contact.phone, reservedTrip.driver.phone);
  assert.equal(contact.bookingId, pending.id);
  assert.match(contact.detail, /en attente/);
  assert.equal(pending.status, 'pending');
  assert.deepEqual(getNavigationContacts({ ...context, userId: 'stranger' }), []);
  for (const status of ['cancelled', 'rejected', 'completed', 'expired', 'no_show']) {
    assert.deepEqual(getNavigationContacts({ ...context, booking: { ...pending, status } }), []);
  }
  for (const status of ['completed', 'cancelled']) {
    assert.deepEqual(getNavigationContacts({ ...context, trip: { ...reservedTrip, status } }), []);
  }
  assert.deepEqual(getNavigationContacts({ ...context, trip: { ...reservedTrip,
    status: 'upcoming', departureTime: '2000-01-01', startedAt: null } }), []);
  const [withoutPhone] = getNavigationContacts({ ...context, trip: { ...trip, driver: null } });
  assert.equal(withoutPhone.phone, null);
});

test('only the matching driver in an own booking can supply a pending phone missing from trip detail', () => {
  const bookedTrip = { ...trip, driver: { id: trip.driverId, phone: '+33123456789' } };
  const booked = { ...pending, trip: bookedTrip };
  assert.equal(getPassengerBookingContact(trip, booked, pending.passengerId).phone, '+33123456789');
  for (const patch of [{ id: 'other-trip' }, { driverId: 'other-driver' }, { driver: { id: 'other-driver', phone: '+33123456789' } }]) {
    assert.equal(getPassengerBookingContact(trip, { ...booked, trip: { ...bookedTrip, ...patch } }, pending.passengerId).phone, null);
  }
});

test('pending reservation cards offer contact without unlocking tracking or accepting the ride', () => {
  const { BookingListCard } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/trip/CompactTripCard': { CompactTripCard: 'TripCard' },
  })('features/bookings/BookingListCard.tsx');
  const calls = [], booked = { ...pending, trip: { ...trip, departureTime: '2099-01-01',
    driver: { id: trip.driverId, phone: '+243999000111' } } };
  const props = { booking: booked, activeTab: 'active', router: { push: route => calls.push(['navigate', route]) },
    onContact: booking => calls.push(['contact', booking.id]), handleCancel: id => calls.push(['cancel', id]), isCancelling: false };
  const buttons = () => all(BookingListCard.type(props)).filter(n => n.type === 'Button');
  assert.deepEqual(buttons().map(words), ['Contacter', 'Annuler']);
  buttons().find(n => words(n) === 'Contacter').props.onPress();
  assert.deepEqual(calls, [['contact', pending.id]]);
  props.booking = { ...booked, status: 'accepted' };
  assert.ok(buttons().some(n => words(n) === 'Suivre le trajet'), 'existing accepted tracking preserved');
  for (const status of ['cancelled', 'rejected', 'completed', 'expired']) {
    props.booking = { ...booked, status };
    assert.equal(buttons().some(n => words(n) === 'Contacter'), false);
  }
  props.booking = booked; props.activeTab = 'history';
  assert.equal(buttons().some(n => words(n) === 'Contacter'), false);
});

test('the owner can contact a pending reservation holder without accepting any of their seats', () => {
  const context = { role: 'driver', userId: 'driver', trip, bookings: [pending, other] };
  const contacts = getNavigationContacts(context);
  assert.deepEqual(contacts.map(person => [person.id, person.phone]), [['holder-a', '0999000111'], ['holder-b', '0999000222']]);
  assert.match(contacts[0].detail, /en attente.*Pas encore acceptée/);
  assert.equal(pending.status, 'pending'); assert.equal(pending.numberOfSeats, 3);
  assert.deepEqual(getNavigationContacts({ ...context, userId: 'another-driver' }), []);
  assert.equal(getDriverBookingContact(trip, { ...pending, tripId: 'other-trip' }, 'driver'), null);
  for (const status of ['rejected', 'cancelled', 'completed', 'no_show']) {
    assert.equal(getDriverBookingContact(trip, { ...pending, status }, 'driver'), null);
  }
  for (const status of ['completed', 'cancelled']) {
    assert.equal(getDriverBookingContact({ ...trip, status }, pending, 'driver'), null);
  }
  assert.equal(getDriverBookingContact(trip, { ...pending, passengerPhone: undefined }, 'driver').phone, null);
});

test('a direct navigation contact targets only that holder, and stale/rejected contacts disappear', () => {
  const hooks = hookHarness();
  const { useNavigationAssistance } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: 'driver' } } }) },
  })('hooks/navigation/useNavigationAssistance.ts');
  const props = { role: 'driver', trip, bookings: [pending, other], isScreenActive: true };
  const render = () => hooks.render(() => useNavigationAssistance(props));
  render().openContact(pending.passengerId);
  let result = render(); assert.equal(result.panel, 'contacts');
  assert.deepEqual(result.contacts.map(person => person.id), [pending.passengerId]);
  props.bookings = [{ ...pending, status: 'rejected' }, other];
  result = render(); assert.deepEqual(result.contacts, [], 'must not switch silently to another passenger');
  result.openContacts(); assert.deepEqual(render().contacts.map(person => person.id), [other.passengerId]);
  render().close(); assert.equal(render().isOpen, false);
  props.isScreenActive = false; render().openContact(other.passengerId);
  assert.equal(render().panel, null); hooks.unmount();
});

test('the management contact action stays separate from accept/reject and targets the chosen booking', () => {
  const calls = [];
  const { ManageTripBookings } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../screen-styles/app/trip/manage/detail/index': { styles: {} },
    '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: 'CashReceipt' },
    '@/components/trip/CompactCardAvatar': { CompactCardAvatar: 'Avatar' },
  })('features/manage-trip/ManageTripBookings.tsx');
  const props = { tracking: { visibleBookings: [pending, other] },
    state: { trip, setContactBookingId: id => calls.push(['contact', id]), router: { push() {} } }, actions: {},
    bookingsActions: { openRejectModal: booking => calls.push(['reject', booking.id]), handleAcceptBooking: id => calls.push(['accept', id]) } };
  const buttons = all(ManageTripBookings(props)).filter(n => n.type === 'Button');
  const contacts = buttons.filter(n => words(n) === 'Contacter');
  assert.equal(contacts.length, 2);
  contacts[1].props.onPress(); assert.deepEqual(calls, [['contact', other.id]]);
  buttons.find(n => words(n) === 'Accepter').props.onPress();
  buttons.find(n => words(n) === 'Refuser').props.onPress();
  assert.deepEqual(calls.slice(1), [['accept', pending.id], ['reject', pending.id]]);
  props.state.isAccepting = true;
  assert.ok(all(ManageTripBookings(props)).filter(n => n.type === 'Button' && words(n) === 'Contacter').every(n => n.props.disabled));
  props.state.isAccepting = false; props.tracking.visibleBookings = [{ ...pending, status: 'accepted' }];
  assert.ok(all(ManageTripBookings(props)).some(n => n.type === 'Button' && words(n) === 'Contacter'), 'accepted booking contact remains available');
});

test('management uses current authorized data, handles missing numbers and unmounts when inactive', () => {
  const { ManageTripContactModal } = loader({
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: 'Contacts' },
  })('features/manage-trip/ManageTripContactModal.tsx');
  const state = { trip, userId: 'driver', isOwner: true, isScreenActive: true,
    contactBookingId: other.id, setContactBookingId: id => { state.contactBookingId = id; } };
  const render = bookings => ManageTripContactModal({ state, bookings });
  let tree = render([pending, other]); assert.equal(tree.type, 'Contacts');
  assert.deepEqual(tree.props.contacts.map(person => person.id), [other.passengerId]);
  assert.equal(render([pending, { ...other, passengerPhone: null }]).props.contacts[0].phone, null);
  assert.deepEqual(render([pending, { ...other, status: 'cancelled' }]).props.contacts, []);
  state.isOwner = false; assert.equal(render([pending, other]), null);
  state.isOwner = true; state.isScreenActive = false; assert.equal(render([pending, other]), null);
  state.isScreenActive = true; tree.props.onClose(); assert.equal(render([pending, other]), null);
});
