const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree)
  ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const press = (tree, label) => nodes(tree).find(node => node.type === 'Pressable' && words(node) === label);
const request = { id: 'request', passengerId: 'owner', status: 'offers_received', numberOfSeats: 2, maxPricePerSeat: 1000,
  offers: [{ id: 'offer', driverId: 'driver', driverName: 'Conducteur de test', status: 'pending', pricePerSeat: 1500 }] };
function fixture(t) {
  const hooks = hookHarness(), calls = [], acknowledged = [], routes = [];
  let resolve, reject, version = 0, refreshes = 0;
  const mutation = kind => args => { calls.push({ kind, args }); return { unwrap: () => new Promise((yes, no) => { resolve = yes; reject = no; }) }; };
  const load = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', KeyboardAvoidingView: 'Keyboard',
      Pressable: 'Pressable', ActivityIndicator: 'Spinner', Platform: { OS: 'ios' }, StyleSheet: { create: s => s } },
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/store/api/counterOfferApi': { useProposeCounterOfferMutation: () => [mutation('propose'), {}], useDeclineCounterOfferMutation: () => [mutation('decline'), {}] },
    '@/store/api/tripRequestApi': { useAcceptDriverOfferMutation: () => [mutation('accept'), {}] },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/services/rideAlertSession': { acknowledgeRideAlerts: filter => acknowledged.push(filter), dismissRideResponseNotice() {}, pendingRideResponseNotices: () => [] },
    '@/utils/errorHelpers': { getApiErrorMessage: (_cause, fallback) => fallback },
    './requestDetailModel': { formatCdfPrice: price => `${price} FC` },
  });
  t.after(() => hooks.unmount());
  return { hooks, load, calls, acknowledged, routes, resolve: value => resolve(value), reject: () => reject(Error('offline')),
    changeSession: () => { version++; }, refresh: () => { refreshes++; }, refreshes: () => refreshes };
}

test('driver sends the selected vehicle and price once; server success stops only its own request ring', async t => {
  const f = fixture(t), { RequestCounterOffer } = f.load('features/request-detail/RequestCounterOffer.tsx');
  const model = { tripRequest: request, userId: 'driver', isScreenActive: true, isIdentityVerified: true,
    canAcceptDirectly: true, directAcceptVehicle: { id: 'vehicle' }, refetch: f.refresh };
  const render = () => f.hooks.render(() => RequestCounterOffer({ model, disabled: false }));
  press(render(), 'Proposer un autre prix').props.onPress();
  nodes(render()).find(node => node.type === 'TextInput').props.onChangeText('3000');
  const tree = render(); assert.match(words(tree).replace(/\s+/g, ' '), /Total du trajet : 3000 FC pour 2 passager\(s\)/);
  const send = press(tree, 'Envoyer mon prix au passager'); send.props.onPress(); send.props.onPress();
  assert.deepEqual(f.calls, [{ kind: 'propose', args: { requestId: 'request', vehicleId: 'vehicle', pricePerSeat: 1500 } }]);
  f.resolve({ id: 'offer' }); await flush();
  assert.equal(f.acknowledged.length, 1); assert.equal(f.refreshes(), 1);
  assert.equal(nodes(render()).find(node => node.type === 'Modal').props.visible, false);
  const match = f.acknowledged[0]; assert.equal(match({ recipientId: 'driver', kind: 'nearby', id: 'request' }), true);
  assert.equal(match({ recipientId: 'other-driver', kind: 'nearby', id: 'request' }), false);
});

for (const accept of [true, false]) test(`passenger ${accept ? 'acceptance' : 'refusal'} is explicit and serializes double taps`, async t => {
  const f = fixture(t), { PassengerPriceOffers } = f.load('features/request-detail/PassengerPriceOffers.tsx');
  const tree = f.hooks.render(() => PassengerPriceOffers({ request, enabled: true, refresh: f.refresh }));
  assert.match(words(tree).replace(/\s+/g, ' '), /Conducteur de test propose un prix.*3 000 FC pour le trajet.*Pour 2 passager\(s\)/);
  const action = press(tree, accept ? 'Accepter ce prix' : 'Refuser et chercher un autre'); action.props.onPress(); action.props.onPress();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].kind, accept ? 'accept' : 'decline');
  f.resolve(request); await flush();
  assert.equal(f.refreshes(), 1); assert.equal(f.acknowledged.length, 1);
  press(tree, 'Voir le conducteur').props.onPress();
  assert.equal(f.routes[0].params.viewOnly, 'true', 'consultation must not start a duplicate request');
});

test('network failure retains a readable error and a new session cannot acknowledge an old price decision', async t => {
  const f = fixture(t), { PassengerPriceOffers } = f.load('features/request-detail/PassengerPriceOffers.tsx');
  const render = () => f.hooks.render(() => PassengerPriceOffers({ request, enabled: true, refresh: f.refresh }));
  press(render(), 'Accepter ce prix').props.onPress(); f.reject(); await flush();
  assert.match(words(render()), /Réponse non confirmée/); assert.equal(f.acknowledged.length, 0);
  press(render(), 'Accepter ce prix').props.onPress(); f.changeSession(); f.resolve(request); await flush();
  assert.equal(f.acknowledged.length, 0); assert.equal(f.refreshes(), 1);
});

test('driver total input keeps the server integer-unit constraint without rounding up', t => {
  const f = fixture(t), { RequestCounterOffer } = f.load('features/request-detail/RequestCounterOffer.tsx');
  const model = { tripRequest: { ...request, numberOfSeats: 3 }, userId: 'driver', isScreenActive: true,
    isIdentityVerified: true, canAcceptDirectly: true, directAcceptVehicle: { id: 'vehicle' }, refetch: f.refresh };
  const render = () => f.hooks.render(() => RequestCounterOffer({ model, disabled: false }));
  press(render(), 'Proposer un autre prix').props.onPress();
  assert.equal(nodes(render()).find(node => node.type === 'TextInput').props.value, '3000');
  nodes(render()).find(node => node.type === 'TextInput').props.onChangeText('5000');
  const button = press(render(), 'Envoyer mon prix au passager');
  assert.equal(button.props.disabled, true); button.props.onPress();
  assert.deepEqual(f.calls, []);
  assert.match(words(render()).replace(/[\u202f\u00a0]/g, ' '), /4 998 FC ou 5 001 FC/);
  nodes(render()).find(node => node.type === 'TextInput').props.onChangeText('5001');
  press(render(), 'Envoyer mon prix au passager').props.onPress();
  assert.equal(f.calls[0].args.pricePerSeat, 1667);
});
