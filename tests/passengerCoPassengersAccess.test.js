const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const trip = { id: 'trip', driverId: 'driver', status: 'ongoing' };
const booking = { id: 'own', tripId: 'trip', passengerId: 'viewer', status: 'accepted', pickedUp: true };
const person = { id: 'other', userId: 'member', firstName: 'Camille', avatarUrl: null, seats: 2 };
const native = { View: 'View', Text: 'Text', Image: 'Image', TouchableOpacity: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner',
  useWindowDimensions: () => ({ width: 320, height: 568, fontScale: 2 }), StyleSheet: { create: s => s, hairlineWidth: 1, absoluteFill: {} } };
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props.children)];
}
function words(node) {
  if (Array.isArray(node)) return node.map(words).join(' ');
  if (React.isValidElement(node)) return words(typeof node.type === 'function' ? node.type(node.props) : node.props.children);
  return typeof node === 'string' ? node : '';
}
function setup() {
  const harness = hookHarness();
  const state = { auth: { user: { id: 'viewer', role: 'driver' } }, zwangaApi: { config: { online: true } } };
  const calls = [];
  let refreshes = 0;
  const read = { currentData: { tripId: 'trip', participants: [person] }, refetch: async () => { refreshes++; } };
  const load = loader({ react: { ...React, ...harness.react }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'RideModal' },
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/api/tripApi': { useGetTripCoPassengersQuery: (args, options) => { calls.push({ args, options }); return read; } },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/hooks/trip-detail/useCoPassengerActions': { useCoPassengerActions: (_roster, close) => ({ profile: close, message: close, busy: false }) },
  });
  const { PassengerCoPassengersAccess } = load('features/passenger-navigation/PassengerCoPassengersAccess.tsx');
  const render = (props = {}) => harness.render(() => PassengerCoPassengersAccess({ trip, booking, active: true, ...props }));
  const open = () => { nodes(render()).find(n => n.props.accessibilityLabel === 'Autres passagers').props.onPress(); return render(); };
  return { harness, calls, state, read, render, open, refreshes: () => refreshes };
}

test('navigation access loads only on demand and uses the public roster with an informational in-app overlay', async () => {
  const m = setup();
  assert.match(words(m.render()), /Passagers/);
  assert.doesNotMatch(words(m.render()), /Camille/);
  assert.equal(m.calls.at(-1).options.skip, true);
  const tree = m.open();
  assert.equal(m.calls.at(-1).options.skip, false);
  assert.equal(m.calls.at(-1).options.pollingInterval, 0);
  assert.deepEqual(m.calls.at(-1).args, { tripId: 'trip', viewerId: 'viewer', session: 1 });
  const modal = nodes(tree).find(n => n.type === 'RideModal');
  assert.equal(modal.props.inApp, true); assert.equal(modal.props.visible, true);
  const { RIDE_OVERLAY_PRIORITY: priority } = loader()('features/navigation/rideOverlayStore.ts');
  assert.equal(modal.props.priority, priority.information);
  assert.ok(modal.props.priority < priority.panel && modal.props.priority < priority.confirmation && modal.props.priority < priority.sos);
  assert.match(words(tree), /Autres passagers/);
  assert.match(words(tree), /Camille/);
  assert.ok(nodes(tree).some(n => n.props.accessibilityLabel === 'Voir le profil de Camille'));
  assert.ok(nodes(tree).some(n => n.props.accessibilityLabel === 'Écrire à Camille'));
  assert.doesNotMatch(words(tree), /Appeler|WhatsApp/);
  await nodes(tree).find(n => n.type === 'Button' && words(n).trim() === 'Actualiser').props.onPress();
  assert.equal(m.refreshes(), 1);
  modal.props.onRequestClose();
  assert.doesNotMatch(words(m.render()), /Camille/);
  assert.equal(m.calls.at(-1).options.skip, true);
  m.harness.unmount();
});

test('background and urgent notices immediately hide the list and do not reopen it automatically', () => {
  const m = setup();
  for (const props of [{ active: false }, { blocked: true }]) {
    m.open();
    assert.equal(nodes(m.render(props)).find(n => n.type === 'RideModal').props.visible, false);
    assert.doesNotMatch(words(m.render(props)), /Camille/);
    assert.equal(m.calls.at(-1).options.skip, true);
    assert.equal(nodes(m.render()).find(n => n.type === 'RideModal').props.visible, false);
  }
  m.harness.unmount();
});

test('opening a profile or message closes the passenger overlay', () => {
  const m = setup();
  for (const label of ['Voir le profil de Camille', 'Écrire à Camille']) {
    nodes(m.open()).find(n => n.props.accessibilityLabel === label).props.onPress();
    assert.equal(nodes(m.render()).find(n => n.type === 'RideModal').props.visible, false);
  }
  m.harness.unmount();
});

test('private and request-based rides, foreign or unconfirmed bookings do not expose an access button', () => {
  const m = setup();
  for (const props of [
    { trip: { ...trip, isPrivate: true } }, { trip: { ...trip, tripRequestId: 'request' } },
    { trip: { ...trip, driverId: 'viewer' } }, { trip: { ...trip, status: 'cancelled' } },
    { booking: { ...booking, status: 'pending' } }, { booking: { ...booking, status: 'cancelled' } },
    { booking: { ...booking, passengerId: 'someone-else' } }, { booking: null },
  ]) {
    m.open();
    assert.equal(m.render(props), null);
    assert.equal(m.calls.at(-1).options.skip, true);
    assert.equal(nodes(m.render()).find(n => n.type === 'RideModal').props.visible, false);
  }
  m.harness.unmount();
});

test('offline, revalidation, empty list and API errors show explicit states without stale identities', () => {
  const m = setup(); m.open();
  m.state.zwangaApi.config.online = false;
  assert.match(words(m.render()), /Reconnectez-vous/);
  assert.doesNotMatch(words(m.render()), /Camille/);
  m.state.zwangaApi.config.online = true; m.read.isFetching = true;
  assert.match(words(m.render()), /Chargement/);
  assert.doesNotMatch(words(m.render()), /Camille/);
  m.read.isFetching = false; m.read.isError = true; m.read.error = { status: 403 };
  assert.match(words(m.render()), /Liste réservée/);
  assert.doesNotMatch(words(m.render()), /Camille/);
  m.read.error = { status: 500 };
  assert.match(words(m.render()), /Réessayer/);
  m.read.isError = false; m.read.error = undefined; m.read.currentData.participants = [];
  assert.match(words(m.render()), /Aucun autre passager/);
  m.harness.unmount();
});

test('sheet bounds scrolling on a short display and retains scalable names and close controls', () => {
  const m = setup(); const tree = m.open();
  const flat = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
  const sheet = nodes(tree).find(n => n.type === 'SafeArea');
  assert.equal(flat(sheet.props.style).maxHeight, 568 * 0.72);
  assert.deepEqual(sheet.props.edges, ['bottom', 'left', 'right']);
  assert.equal(flat(nodes(tree).find(n => n.type === 'Scroll').props.style).flexShrink, 1);
  assert.equal(nodes(tree).some(n => n.props.allowFontScaling === false || n.props.numberOfLines), false);
  const close = nodes(tree).filter(n => n.props.accessibilityLabel === 'Fermer la liste des passagers').at(-1);
  assert.equal(flat(close.props.style).width, 44);
  close.props.onPress(); assert.equal(nodes(m.render()).find(n => n.type === 'RideModal').props.visible, false);
  m.harness.unmount();
});

test('header exposes passengers on the expanded map, keys identity and disables offline snapshots or pickup notices', () => {
  const { PassengerNavigationHeader } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    './PassengerCoPassengersAccess': { PassengerCoPassengersAccess: 'CoPassengers' },
    './PassengerPickupEstimateBanner': { PassengerPickupEstimateBanner: 'PickupEstimate' },
    '@/features/ride-payment/RidePaymentNotice': { RidePaymentNotice: 'PaymentNotice' },
    '@/components/trip/TripShareAction': { TripShareAction: 'Share' },
    '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'Assistance' },
  })('features/passenger-navigation/PassengerNavigationHeader.tsx');
  const model = { data: { trip, booking, passengerId: 'viewer', tripId: 'trip', bookingId: 'own', isScreenActive: true, insets: {} },
    state: { isMapExpanded: true }, presentation: {}, tripActions: {} };
  const assistance = { isOpen: false };
  const access = () => nodes(PassengerNavigationHeader({ model, assistance })).find(n => n.type === 'CoPassengers');
  assert.equal(access().props.trip, trip); assert.equal(access().props.booking, booking);
  assert.equal(access().props.active, true); assert.equal(access().props.blocked, false);
  assert.equal(access().key, 'viewer:trip:own');
  model.data.passengerId = 'next'; assert.equal(access().key, 'next:trip:own');
  model.data.offlineBooking = true; assert.equal(access().props.active, false);
  model.data.offlineBooking = false; model.data.offlineTrip = true; assert.equal(access().props.active, false);
  model.data.offlineTrip = false; model.state.pickupNotice = {}; assert.equal(access().props.blocked, true);
  model.state.pickupNotice = null; assistance.isOpen = true; assert.equal(access().props.blocked, true);
});
