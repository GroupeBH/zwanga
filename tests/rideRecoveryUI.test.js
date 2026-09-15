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
    '@/store/hooks': { useAppSelector: fn => fn(state) },
    '@/store/api/rideRecoveryApi': { useGetRideDeclarationsQuery: (args, options) => { queries.push({ args, options }); return { currentData: snapshots, refetch() {} }; } },
    '@/services/rideOutbox': { rideOutbox: { enqueue: async input => { sent.push(input); } } },
  })('features/ride-recovery/RideRecoveryControl.tsx');
  let props = { tripId: 'trip', booking, actor: 'passenger' };
  let tree;
  const render = () => { tree = hooks.render(() => RideRecoveryControl(props)); return tree; };
  const button = label => all(tree).find(node => node.type === 'Button' && words(node) === label);
  render();
  return { state, booking, queries, sent, hooks, render, button, tree: () => tree, props: value => { props = value; }, snapshots: value => { snapshots = value; }, active: value => { active = value; } };
}

test('offline passenger confirmation requires a review and never changes server pickup flags', async () => {
  const h = setup();
  h.button('Confirmation manuelle').props.onPress(); h.render();
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
  h.render(); assert.ok(h.button('Passager à bord')); assert.ok(h.button('Ce n’est pas exact'));
  assert.match(words(h.tree()), /Effectuez cette action uniquement à l’arrêt/);
  h.hooks.unmount();
});

test('a saved pickup allows queuing arrival, but neither is displayed as server-confirmed', () => {
  const h = setup();
  h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', state: 'queued', decision: 'confirm' }];
  h.render(); assert.ok(h.button('Je suis arrivé')); assert.equal(h.button('Je suis à bord'), undefined);
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
