const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { negotiationActions, alternativesMessage } = load('features/request-detail/priceNegotiation.ts');
const { parseRideAlert } = load('features/notifications/rideAlert.ts');
const { parseRideRealtimeEvent } = load('features/notifications/rideRealtime.ts');
const { passengerOfferAlerts } = load('features/request-detail/passengerOfferAlert.ts');
const { passengerResponseNotice } = load('features/notifications/passengerResponseNotice.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.now(), iso = delta => new Date(now + delta).toISOString();
const offer = { id: id(3), driverId: id(4), status: 'pending', pricePerSeat: 2700, createdAt: iso(-1000), negotiationStage: 'passenger_counter' };
const request = { id: id(1), passengerId: id(2), numberOfSeats: 2, status: 'offers_received', departureDateMax: iso(3600000),
  responseWindow: { phase: 'passenger', serverNow: iso(0), expiresAt: iso(110000) }, offers: [offer] };

test('bargaining exposes exactly the next decisions; legacy offers remain accept/reject only', () => {
  const actions = (stage, actor) => negotiationActions({ ...offer, negotiationStage: stage }, actor);
  assert.deepEqual(actions('driver_initial', 'passenger'), { counter: true, final: false, accept: true });
  assert.deepEqual(actions('passenger_counter', 'passenger'), { counter: false, final: false, accept: false });
  assert.deepEqual(actions('passenger_counter', 'driver'), { counter: false, final: true, accept: true });
  assert.deepEqual(actions('driver_final', 'passenger'), { counter: false, final: false, accept: true });
  assert.deepEqual(actions(null, 'passenger'), { counter: false, final: false, accept: true });
  for (const patch of [{ status: 'accepted' }, { existingTripId: id(5) }])
    assert.deepEqual(negotiationActions({ ...offer, ...patch }, 'driver'), { counter: false, final: false, accept: false });
});

test('passenger counter rings only for its driver; REST, socket and push keep the same revision identity', () => {
  assert.deepEqual(passengerOfferAlerts(request, id(2), now, now), []);
  assert.deepEqual(passengerOfferAlerts(request, id(9), now, now), []);
  const [alert] = passengerOfferAlerts(request, id(4), now, now);
  assert.equal(alert.recipientId, id(4));
  assert.equal(parseRideAlert(alert.data).key, alert.key);
  assert.ok(parseRideRealtimeEvent({ kind: 'incoming', recipientId: id(4), eventId: id(5), data: alert.data }));
  assert.equal(parseRideRealtimeEvent({ kind: 'incoming', recipientId: id(2), eventId: id(5), data: alert.data }), null);
  assert.match(passengerResponseNotice(alert).title, /Le passager propose/);
  assert.match(passengerResponseNotice(alert).message, /5.400 FC.*prix ferme/);
  const final = { ...request, offers: [{ ...offer, id: id(6), negotiationStage: 'driver_final' }] };
  assert.deepEqual(passengerOfferAlerts(final, id(4), now, now), []);
  const [finalAlert] = passengerOfferAlerts(final, id(2), now, now);
  assert.notEqual(finalAlert.key, alert.key);
  assert.match(passengerResponseNotice(finalAlert).title, /prix ferme/);
  assert.match(passengerResponseNotice(finalAlert).message, /Chercher un autre conducteur/);
  assert.equal(parseRideAlert({ ...alert.data, passengerId: id(4) }), null);
});

test('driver acceptance is single-flight and acknowledges only the agreed revision', async t => {
  const hooks = hookHarness(), calls = [], acknowledgements = [], busy = [];
  t.after(() => hooks.unmount());
  let resolve, refreshes = 0;
  const { NegotiationPriceInput } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@/store/api/priceNegotiationApi': {
      useNegotiateRequestPriceMutation: () => [() => { throw Error('unexpected counter'); }, {}],
      useAcceptPassengerPriceMutation: () => [args => { calls.push(args); return { unwrap: () => new Promise(done => { resolve = done; }) }; }, {}],
    },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/rideAlertSession': { acknowledgeRideAlerts: match => acknowledgements.push(match), pendingRideResponseNotices: () => [], dismissRideResponseNotice() {} },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Error' },
  })('features/request-detail/NegotiationPriceInput.tsx');
  const tree = hooks.render(() => NegotiationPriceInput({ request, offer, actor: 'driver', disabled: false,
    refresh() { refreshes++; }, onBusyChange: value => busy.push(value) }));
  const button = press(tree, 'Accepter le prix du passager');
  button.props.onPress(); button.props.onPress();
  assert.deepEqual(calls, [{ requestId: id(1), offerId: id(3) }]);
  resolve(request); await new Promise(done => setImmediate(done));
  assert.equal(refreshes, 1);
  assert.deepEqual(busy, [true, false]);
  assert.equal(acknowledgements[0]({ recipientId: id(4), data: { offerId: id(3) } }), true);
  assert.equal(acknowledgements[0]({ recipientId: id(4), data: { offerId: id(8) } }), false);
});

for (const interrupted of ['network', 'account', 'unmount']) test(`price response ${interrupted} never acknowledges an unconfirmed or foreign decision`, async t => {
  const hooks = hookHarness(), acknowledgements = [];
  t.after(() => hooks.unmount());
  let reject, version = 1, refreshes = 0;
  const { NegotiationPriceInput } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@/store/api/priceNegotiationApi': {
      useNegotiateRequestPriceMutation: () => [() => ({ unwrap: () => new Promise((resolve, fail) => { reject = fail; }) }), {}],
      useAcceptPassengerPriceMutation: () => [() => { throw Error('unexpected agreement'); }, {}],
    },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/services/rideAlertSession': { acknowledgeRideAlerts: match => acknowledgements.push(match), pendingRideResponseNotices: () => [], dismissRideResponseNotice() {} },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Réponse non confirmée' },
  })('features/request-detail/NegotiationPriceInput.tsx');
  const render = () => hooks.render(() => NegotiationPriceInput({ request, offer: { ...offer, negotiationStage: 'driver_initial' }, actor: 'passenger', disabled: false,
    refresh() { refreshes++; }, onBusyChange() {} }));
  press(render(), 'Proposer mon prix').props.onPress();
  nodes(render()).find(n => n.type === 'TextInput').props.onChangeText('5600');
  press(render(), 'Envoyer mon prix').props.onPress();
  if (interrupted === 'account') version++;
  if (interrupted === 'unmount') hooks.unmount();
  reject(Error('offline')); await new Promise(done => setImmediate(done));
  assert.equal(acknowledgements.length, 0);
  assert.equal(refreshes, interrupted === 'network' ? 1 : 0);
  if (interrupted === 'network') {
    const tree = render();
    assert.match(words(tree), /Réponse non confirmée/);
    assert.equal(nodes(tree).find(n => n.type === 'TextInput').props.value, '5600');
  }
});

test('driver agreement reaches passenger by socket, without changing booking-response acceptance', () => {
  const data = { type: 'trip_request_accepted', ringAlert: 'request-accepted-v1', passengerId: id(2), driverId: id(4), tripRequestId: id(1) };
  assert.ok(parseRideRealtimeEvent({ kind: 'incoming', recipientId: id(2), eventId: id(7), data }));
  assert.equal(parseRideRealtimeEvent({ kind: 'incoming', recipientId: id(4), eventId: id(7), data }), null);
});

test('alternatives never promise agreement and reject stale/foreign/malformed estimates', () => {
  const data = { requestId: id(1), offerId: id(3), generatedAt: iso(0), radiusKm: 5, recent: 2, older: 1, truncated: false };
  const message = patch => alternativesMessage({ ...data, ...patch }, id(1), id(3), now);
  assert.match(message({}), /2 autres conducteurs.*accord n’est pas garanti/);
  assert.match(message({ recent: 0 }), /anciennes.*prendre du temps/);
  assert.match(message({ recent: 0, older: 0 }), /Aucun autre conducteur/);
  for (const patch of [{ requestId: id(9) }, { offerId: id(9) }, { generatedAt: iso(-90001) }, { recent: -1 }, { recent: NaN }, { radiusKm: 0 }])
    assert.match(message(patch), /inconnue/);
});

test('countdown identifies whose turn it is without granting extra time', () => {
  const { requestResponseLabel } = load('features/request-detail/requestResponseWindow.ts');
  assert.equal(requestResponseLabel('passenger', 42, true, true), 'Le conducteur a 42 s pour répondre');
  assert.equal(requestResponseLabel('passenger', 42, false, true), 'Répondez au passager sous 42 s');
  assert.match(requestResponseLabel('passenger', 0, false, true), /Délai écoulé/);
});

test('request summaries identify the actual respondent rather than waiting on the wrong person', () => {
  const { buildRequestDetailPresentation } = loader({ '@/constants/styles': { Colors: { gray: {}, warning: '#aaa', primary: '#bbb', success: '#ccc', danger: '#ddd' } } })('features/request-detail/requestPresentation.ts');
  const props = { tripRequest: request, myOffer: offer, compatibleActiveVehicles: [], canAcceptDirectly: false };
  const counter = buildRequestDetailPresentation(props);
  assert.equal(counter.driverHero.badge, 'À vous de répondre');
  assert.equal(counter.driverHero.title, 'Le passager propose un prix');
  assert.equal(counter.ownerHero.title, 'Votre prix a été envoyé');
  const final = buildRequestDetailPresentation({ ...props, myOffer: { ...offer, negotiationStage: 'driver_final' } });
  assert.match(final.driverHero.title, /prix ferme.*réponse du passager/);
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const press = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && words(n) === label);
for (const actor of ['passenger', 'driver']) test(`${actor} sends one immutable revision using total fare; duplicate taps are ignored`, async t => {
  const hooks = hookHarness(), calls = [], busy = [], ack = [];
  t.after(() => hooks.unmount());
  let resolve;
  const local = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@/store/api/priceNegotiationApi': { useNegotiateRequestPriceMutation: () => [args => { calls.push(args); return { unwrap: () => new Promise(done => { resolve = done; }) }; }, {}], useAcceptPassengerPriceMutation: () => [() => { throw Error('unexpected acceptance'); }, {}] },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/rideAlertSession': { acknowledgeRideAlerts: match => ack.push(match), pendingRideResponseNotices: () => [], dismissRideResponseNotice() {} },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Error' },
  });
  const { NegotiationPriceInput } = local('features/request-detail/NegotiationPriceInput.tsx');
  const props = { request, offer: { ...offer, negotiationStage: actor === 'driver' ? 'passenger_counter' : 'driver_initial' }, actor, disabled: false, refresh() {}, onBusyChange: value => busy.push(value) };
  const render = () => hooks.render(() => NegotiationPriceInput(props));
  press(render(), actor === 'driver' ? 'Proposer mon prix ferme' : 'Proposer mon prix').props.onPress();
  nodes(render()).find(n => n.type === 'TextInput').props.onChangeText('5600');
  const send = press(render(), actor === 'driver' ? 'Envoyer mon prix ferme' : 'Envoyer mon prix');
  send.props.onPress(); send.props.onPress();
  assert.deepEqual(calls, [{ requestId: id(1), offerId: id(3), pricePerSeat: 2800, stage: actor === 'driver' ? 'driver_final' : 'passenger_counter' }]);
  resolve(request); await new Promise(done => setImmediate(done));
  assert.deepEqual(busy, [true, false]);
  assert.equal(ack[0]({ recipientId: actor === 'driver' ? id(4) : id(2), data: { offerId: id(3) } }), true);
  assert.equal(ack[0]({ recipientId: id(9), data: { offerId: id(3) } }), false);
});
