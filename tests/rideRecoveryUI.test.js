const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function all(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(all);
  return [node, ...all(node.props?.children)];
}
function words(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(words).join('');
  return node?.props ? words(node.props.children) : '';
}
function setup() {
  const hooks = hookHarness();
  const state = { auth: { user: { id: 'passenger' } }, zwangaApi: { config: { online: false } }, rideRecovery: { userId: 'passenger', entries: [], error: null } };
  let snapshots = [];
  let active = true;
  const queries = [];
  const sent = [];
  const booking = { id: 'booking', tripId: 'trip', status: 'accepted', numberOfSeats: 1, passengerName: 'Test' };
  const native = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
  const { RideRecoveryControl } = loader({
    react: { ...React, ...hooks.react, memo: component => component },
    'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/components/forms/FormLayout': { FormModal: 'Modal' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: 'BookingRevenue' },
    '@/store/hooks': { useAppSelector: fn => fn(state) },
    '@/store/api/rideRecoveryApi': { useGetRideDeclarationsQuery: (args, options) => { queries.push({ args, options }); return { currentData: snapshots, refetch() {} }; } },
    '@/services/rideOutbox': { rideOutbox: { enqueue: async input => { sent.push(input); } } },
  })('features/ride-recovery/RideRecoveryControl.tsx');
  let props = { tripId: 'trip', booking, actor: 'passenger' };
  let tree;
  const render = () => { tree = hooks.render(() => RideRecoveryControl(props)); return tree; };
  const button = label => all(all(tree).find(node => node.type === 'Modal')).find(node => node.type === 'Button' && words(node) === label);
  const trigger = () => all(tree).find(node => node.type === 'Button');
  render();
  return { state, booking, queries, sent, hooks, render, button, trigger, tree: () => tree, props: value => { props = value; }, snapshots: value => { snapshots = value; }, active: value => { active = value; } };
}

test('offline passenger confirmation requires a review and never changes server pickup flags', async () => {
  const h = setup();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  h.trigger().props.onPress(); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, true);
  assert.equal(h.queries.at(-1).options.skip, true);
  assert.equal(h.button('Je suis arrivé'), undefined);
  h.button('Je suis à bord').props.onPress(); h.render();
  assert.equal(h.sent.length, 0);
  await h.button('Enregistrer ma réponse').props.onPress();
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm' }]);
  assert.equal(h.booking.pickedUp, undefined);
  h.hooks.unmount();
});

test('driver sees per-passenger actions and a disagreement choice only for another party’s declaration', () => {
  const h = setup();
  h.props({ tripId: 'trip', bookings: [h.booking], actor: 'driver', compact: true });
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'awaiting_other', passenger: 'confirm' }, dropoff: { status: 'none' } }]);
  h.render(); assert.ok(h.button('Confirmer l’embarquement')); assert.ok(h.button('Ce n’est pas exact'));
  assert.match(words(h.tree()), /Effectuez cette action uniquement à l’arrêt/);
  h.hooks.unmount();
});

test('a saved pickup allows queuing arrival, but neither is displayed as server-confirmed', () => {
  const h = setup();
  h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', state: 'queued', decision: 'confirm' }];
  h.render(); assert.ok(h.button('Je suis arrivé')); assert.equal(h.button('Je suis à bord'), undefined);
  assert.equal(words(h.trigger()), 'Je suis arrivé');
  assert.match(words(h.tree()), /Enregistré sur ce téléphone/);
  assert.doesNotMatch(words(h.tree()), /Confirmation validée/);
  h.hooks.unmount();
});

test('background screens stop polling and the sheet reserves the safe-area footer', () => {
  const h = setup(); h.state.zwangaApi.config.online = true; h.active(false); h.render();
  assert.equal(h.queries.at(-1).options.skip, true);
  assert.equal(h.queries.at(-1).options.pollingInterval, 0);
  const sheet = all(h.tree()).find(node => node.type === 'SafeAreaView');
  assert.equal(sheet.props.style.height, '85%'); assert.deepEqual(sheet.props.edges, ['bottom']);
  h.hooks.unmount();
});

test('manual driver dropoff shows this passenger revenue only after server confirmation, not a queued declaration', () => {
  const h = setup();
  h.props({ tripId: 'trip', bookings: [{ ...h.booking, pickedUp: true }], actor: 'driver' });
  h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'dropoff', state: 'queued', decision: 'confirm' }];
  h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'BookingRevenue'), undefined);
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'confirmed' }, dropoff: { status: 'awaiting_other', driver: 'confirm' } }]);
  h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'BookingRevenue'), undefined);
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'confirmed' }, dropoff: { status: 'confirmed' } }]);
  h.render();
  let receipt = all(h.tree()).find(node => node.type === 'BookingRevenue');
  assert.equal(receipt.props.bookingId, 'booking');
  assert.equal(receipt.props.active, false, 'a closed sheet does not request earnings');
  h.trigger().props.onPress(); h.render();
  receipt = all(h.tree()).find(node => node.type === 'BookingRevenue');
  assert.equal(receipt.props.active, true);
  h.active(false); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'BookingRevenue').props.active, false);
  h.props({ tripId: 'trip', booking: { ...h.booking, droppedOff: true }, actor: 'passenger' }); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'BookingRevenue'), undefined);
  h.hooks.unmount();
});

test('passenger labels and icons follow the confirmed stage without hiding the review', () => {
  const h = setup();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  assert.equal(all(h.trigger()).find(node => node.type === 'Icon').props.name, 'car-outline');
  h.booking.pickedUp = true;
  h.props({ tripId: 'trip', booking: { ...h.booking }, actor: 'passenger' }); h.render();
  assert.equal(words(h.trigger()), 'Je suis arrivé');
  assert.equal(h.trigger().props.accessibilityLabel, 'Je suis arrivé');
  assert.equal(all(h.trigger()).find(node => node.type === 'Icon').props.name, 'flag-outline');
  h.trigger().props.onPress(); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, true);
  assert.deepEqual(h.sent, []);
  assert.doesNotMatch(words(h.tree()), /[Mm]anuel/);
  h.hooks.unmount();
});

test('server pickup confirmation updates the label even if the booking cache is older', () => {
  const h = setup();
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'confirmed' }, dropoff: { status: 'none' } }]); h.render();
  assert.equal(words(h.trigger()), 'Je suis arrivé');
  h.hooks.unmount();
});

test('driver labels cover pickup, dropoff and passengers at different stages', () => {
  const h = setup();
  const props = { tripId: 'trip', actor: 'driver', compact: true };
  h.props({ ...props, bookings: [h.booking] }); h.render();
  assert.equal(words(h.trigger()), 'Confirmer l’embarquement');
  assert.equal(h.trigger().props.accessibilityLabel, 'Confirmer l’embarquement');
  const onboard = { ...h.booking, id: 'onboard', passengerName: 'À bord', pickedUp: true };
  h.props({ ...props, bookings: [onboard] }); h.render();
  assert.equal(words(h.trigger()), 'Confirmer la dépose');
  h.props({ ...props, bookings: [h.booking, onboard] }); h.render();
  assert.equal(words(h.trigger()), 'Embarquement ou dépose');
  h.trigger().props.onPress(); h.render();
  assert.ok(h.button('Confirmer l’embarquement'));
  assert.ok(h.button('Confirmer la dépose'));
  assert.deepEqual(h.sent, []);
  assert.ok(h.trigger().props.style.flat().some(style => style?.maxWidth === 126));
  h.hooks.unmount();
});

test('submitted or completed stages offer a status view instead of an unavailable action', () => {
  const h = setup();
  h.state.rideRecovery.entries = ['pickup', 'dropoff'].map(stage => ({ bookingId: 'booking', tripId: 'trip', stage, state: 'queued', decision: 'confirm' }));
  h.render(); assert.equal(words(h.trigger()), 'Voir les confirmations');
  assert.match(words(h.tree()), /Enregistré sur ce téléphone/);
  h.state.rideRecovery.entries = [];
  h.props({ tripId: 'trip', booking: { ...h.booking, pickedUp: true, droppedOff: true }, actor: 'passenger' });
  h.render(); assert.equal(words(h.trigger()), 'Voir les confirmations');
  assert.equal(h.button('Je suis à bord'), undefined);
  assert.equal(h.button('Je suis arrivé'), undefined);
  h.hooks.unmount();
});

test('blocked, disputed or other-account pickup entries do not advertise arrival', () => {
  const h = setup();
  for (const state of ['blocked', 'disputed']) {
    h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', state, decision: 'confirm' }];
    h.render(); assert.equal(words(h.trigger()), 'Voir les confirmations');
    assert.equal(h.button('Je suis arrivé'), undefined);
  }
  h.state.rideRecovery.userId = 'someone-else'; h.render();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  h.hooks.unmount();
});
