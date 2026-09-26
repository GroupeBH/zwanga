const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const { getDriverBookingContact, getNavigationContacts } = loader()('features/navigation/navigationContacts.ts');
const trip = Object.freeze({ id: 'trip', driverId: 'driver', status: 'ongoing', price: 1000 });
const pending = Object.freeze({ id: 'booking-a', tripId: trip.id, passengerId: 'holder-a', passengerName: 'Titulaire A',
  passengerPhone: '0999000111', status: 'pending', numberOfSeats: 3 });
const other = Object.freeze({ ...pending, id: 'booking-b', passengerId: 'holder-b', passengerName: 'Titulaire B', passengerPhone: '0999000222' });
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };

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
