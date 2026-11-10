const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader } = require('./helpers/loadTypeScript.cjs');

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : String(tree ?? '');
function emptyContainer() {
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {}, activeElement: null };
  doc.defaultView = { document: doc, HTMLIFrameElement: class {} };
  return { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc, firstChild: null, addEventListener() {}, removeEventListener() {} };
}

for (const platform of ['ios', 'android']) test(`${platform}: actual reservation panel survives StrictMode and repeated refreshes, no native modal`, async t => {
  const previousWindow = globalThis.window, previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const container = emptyContainer(); globalThis.window = container.ownerDocument.defaultView; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let nativeModals = 0, decisions = 0, confirmed = false;
  const load = loader({ react: React,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner',
      Platform: { OS: platform }, Modal: () => { nativeModals++; return null; }, StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/components/trip/CompactCardAvatar': { CompactCardAvatar: 'Avatar' },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 }, './RideNoticeBanner': { RideNoticeBanner: () => null },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
  });
  const { DriverReservationModal } = load('features/trip-detail/DriverReservationModal.tsx');
  const { RideOverlayContext } = load('features/navigation/rideOverlayContext.ts');
  const store = load('features/navigation/rideOverlayStore.ts').createRideOverlayStore();
  const w = { ready: true, busy: false, feedback: null, dismissFeedback() { w.feedback = null; }, state: {
    userId: 'driver', isOwner: true, isScreenActive: true,
    trip: { id: 'trip', driverId: 'driver', status: 'upcoming', price: 2500, departureTime: '2030-01-01T09:00:00Z', departure: { address: 'Gombe' }, arrival: { address: 'Kintambo' } },
    bookings: [{ id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'pending', passengerName: 'Passager test', numberOfSeats: 2, proposedPricePerSeat: 1800 }],
  }, bookingsActions: { handleAcceptBooking: async () => { decisions++; return confirmed; }, handleRejectBooking: async () => true } };
  const root = createRoot(container);
  t.after(async () => { try { await React.act(async () => root.unmount()); }
    finally { globalThis.window = previousWindow; globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct; } });
  const render = blocked => React.act(async () => root.render(React.createElement(RideOverlayContext.Provider, { value: store },
    React.createElement(React.StrictMode, null, React.createElement(DriverReservationModal, { workspace: w, blocked })))));
  await render(false); assert.equal(store.getEntries().length, 1); assert.equal(nativeModals, 0);
  assert.match(text(store.getActive().children), /Passager test/); assert.match(text(store.getActive().children), /Gombe/);
  assert.match(text(store.getActive().children), /Kintambo/); assert.match(text(store.getActive().children), /Prix proposé par le passager/);
  for (let i = 0; i < 12; i++) { w.state.bookings = w.state.bookings.map(b => ({ ...b })); await render(false); }
  assert.equal(store.getEntries().length, 1);
  const accept = () => nodes(store.getActive().children).find(n => n.props.accessibilityLabel === 'Accepter ce prix et la réservation');
  await React.act(async () => accept().props.onPress()); assert.equal(decisions, 1); assert.equal(store.getEntries().length, 1, 'failure does not dismiss');
  await render(true); assert.equal(store.getEntries().length, 0, 'editing/contact temporarily suspends the reservation');
  await render(false); confirmed = true;
  await React.act(async () => { const button = accept(); button.props.onPress(); button.props.onPress(); });
  assert.equal(decisions, 2); assert.equal(store.getEntries().length, 0); assert.equal(nativeModals, 0);
});
