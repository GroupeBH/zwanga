const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner',
  StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 320, height: 640 }) };
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '../screen-styles/app/trip/navigate/detail/index': { styles: { floatingButtons: { bottom: 180, gap: 8 } } },
  './navigationPresentation': { formatSeatCount: count => `${count} places`, formatPendingBookingPayment: () => 'Cash' },
  './DriverInterruptionPrompt': { DriverInterruptionPrompt: 'Interruption' },
  './DriverPendingBookingPrompt': { DriverPendingBookingPrompt: 'Pending' },
};
const booking = { id: 'booking-a', tripId: 'trip', passengerId: 'passenger-a', passengerName: 'Titulaire', numberOfSeats: 3, paymentMode: 'cash', status: 'pending' };
function model() {
  return { session: { foundation: {
    data: { insets: { top: 24, bottom: 24, left: 0, right: 0 }, isTripOngoing: true, tripId: 'trip', isScreenActive: true, bookings: [booking] },
    passengers: { activePendingBooking: booking, pendingBookingQueueCount: 2, activePendingBookingPickupLabel: 'Départ lisible',
      activePendingBookingDropoffLabel: 'Destination lisible', passengerMapLocations: [] },
    mapState: { waypoints: [{ id: 'other-passenger' }], isSocketConnected: true },
  } }, presentation: { canToggleRouteSections: true }, passengerPresentation: {}, bookingActions: {} };
}

test('pending booking takes priority over scrolling details without removing confirmation or SOS', () => {
  const { DriverNavigationTopPanel } = loader({ ...mocks,
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' },
    './DriverDropoffReceipts': { DriverDropoffReceipts: 'Receipts' },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'Assistance' },
  })('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const value = model();
  const assistance = { openContact() {} };
  const tree = DriverNavigationTopPanel({ model: value, assistance });
  assert.equal(all(tree).filter(n => n.type === 'Scroll').length, 0);
  assert.equal(all(tree).filter(n => n.type === 'Passengers').length, 1);
  assert.equal(all(tree).find(n => n.type === 'Passengers').props.onContact, assistance.openContact);
  assert.equal(all(tree).filter(n => n.type === 'Recovery').length, 1);
  assert.equal(all(tree).filter(n => n.type === 'Assistance').length, 1);
  const frame = flat(tree.props.style);
  assert.ok(frame.top + frame.maxHeight + 12 <= 640 - 180 - 48, 'reserve a separate row for map commands');
});

test('pending card targets a single booking and yields to urgent dropoff', () => {
  const { DriverNavigationPassengersBar } = loader(mocks)('features/driver-navigation/DriverNavigationPassengersBar.tsx');
  const value = model(); const foundation = value.session.foundation;
  const accept = () => {}, reject = () => {};
  const props = { foundation, passengerPresentation: {}, onContact() {}, bookingActions: { handleAcceptPendingBooking: accept, handleRejectPendingBooking: reject } };
  let tree = DriverNavigationPassengersBar(props);
  assert.equal(tree.type, 'Pending');
  assert.equal(tree.props.booking, booking);
  assert.equal(tree.props.queuedCount, 2);
  assert.equal(tree.props.onAccept, accept); assert.equal(tree.props.onReject, reject);
  assert.equal(tree.props.onContact, props.onContact);
  foundation.data.isAcceptingBooking = true; foundation.passengers.isProcessingPendingBooking = true;
  tree = DriverNavigationPassengersBar(props);
  assert.equal(tree.props.busy, true); assert.equal(tree.props.accepting, true);
  foundation.passengers.activePassengerInterruptionBooking = { id: 'emergency' };
  assert.equal(DriverNavigationPassengersBar(props).type, 'Interruption');
});

test('pending booking buttons stay outside scrollable copy with flexible labels and 44pt targets', () => {
  const { DriverPendingBookingPrompt } = loader(mocks)('features/driver-navigation/DriverPendingBookingPrompt.tsx');
  const calls = [];
  const props = { booking, queuedCount: 2, pickupLabel: 'Départ lisible', dropoffLabel: 'Destination lisible',
    busy: false, accepting: false, rejecting: false, onAccept: b => calls.push(['accept', b.id]), onReject: b => calls.push(['reject', b.id]),
    onContact: id => calls.push(['contact', id]) };
  const tree = DriverPendingBookingPrompt(props);
  assert.match(words(tree), /Nouvelle réservation.*\+2.*Titulaire.*3 places.*Cash.*Départ lisible.*Destination lisible/);
  const scroll = all(tree).find(n => n.type === 'Scroll');
  assert.ok(scroll, 'only long details may scroll on short screens');
  assert.equal(all(scroll).filter(n => n.type === 'Button').length, 0);
  const buttons = all(tree).filter(n => n.type === 'Button');
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    assert.ok(flat(button.props.style).minHeight >= 44);
    assert.equal(flat(button.props.style).height, undefined);
    button.props.onPress();
  }
  assert.deepEqual(calls, [['contact', booking.passengerId], ['reject', booking.id], ['accept', booking.id]]);
  const footer = all(tree).find(n => n.props?.children?.includes?.(buttons[1]));
  assert.equal(flat(footer.props.style).flexShrink, 0);
  assert.equal(flat(footer.props.style).flexWrap, 'wrap');
  const busyTree = DriverPendingBookingPrompt({ ...props, busy: true, accepting: true });
  assert.ok(all(busyTree).filter(n => n.type === 'Button').every(n => n.props.disabled));
  assert.equal(all(busyTree).filter(n => n.type === 'Spinner').length, 1);
});

test('map controls use one row for pending booking and preserve their actions and popup touch bounds', () => {
  const hooks = hookHarness(); const calls = [];
  const { DriverNavigationControls } = loader({ ...mocks, react: { ...React, ...hooks.react },
    './navigationBooking': { normalizeDriverLocationObject: x => x },
    './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: 'ReceiptsSheet' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
  })('features/driver-navigation/DriverNavigationControls.tsx');
  const foundation = model().session.foundation;
  const props = { foundation, tripActions: { handlePauseTripFromNavigation: () => calls.push('pause') },
    voice: { toggleVoiceGuidance: () => calls.push('voice') }, passengerPresentation: {}, forceRecalculateRoute: () => calls.push('reroute') };
  const render = () => hooks.render(() => DriverNavigationControls(props));
  let tree = render();
  assert.equal(flat(tree.props.style).flexDirection, 'row');
  const buttons = all(tree).filter(n => n.type === 'Button');
  assert.equal(buttons.length, 4);
  buttons[0].props.onPress(); buttons[1].props.onPress(); buttons[3].props.onPress();
  assert.deepEqual(calls, ['pause', 'voice', 'reroute']);
  buttons[2].props.onPress(); tree = render();
  const popup = tree.props.children[0]; const popupStyle = flat(popup.props.style); const frame = flat(tree.props.style);
  assert.ok(popupStyle.bottom >= 48);
  assert.ok(frame.minHeight >= popupStyle.maxHeight + popupStyle.bottom);
  assert.ok(frame.width >= popupStyle.width + popupStyle.right);
  foundation.passengers.activePendingBooking = null;
  assert.notEqual(flat(render().props.style).flexDirection, 'row', 'restore standard controls after processing the queue');
  hooks.unmount();
});
