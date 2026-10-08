const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function all(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(all);
  return [node, ...all(node.props?.children), ...(node.type === 'List' ? [
    ...all(node.props.ListHeaderComponent), ...node.props.data.flatMap((item, index) => all(node.props.renderItem({ item, index }))),
  ] : [])];
}
function words(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(words).join('');
  if (node?.type === 'List') return words(node.props.ListHeaderComponent) + node.props.data.map((item, index) => words(node.props.renderItem({ item, index }))).join('');
  return node?.props ? words(node.props.children) : '';
}
function setup() {
  const hooks = hookHarness();
  const state = { auth: { user: { id: 'passenger' } }, zwangaApi: { config: { online: false } }, rideRecovery: { userId: 'passenger', entries: [], error: null } };
  let snapshots = [];
  let active = true;
  const queries = [];
  const sent = [];
  const results = [];
  const io = { enqueue: async () => {} };
  const booking = { id: 'booking', passengerId: 'passenger', tripId: 'trip', status: 'accepted', numberOfSeats: 1, passengerName: 'Test' };
  const native = { View: 'View', Text: 'Text', FlatList: 'List', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
  const { RideRecoveryControl } = loader({
    react: { ...React, ...hooks.react, memo: component => component },
    'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/components/forms/FormLayout': { FormModal: 'Modal' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/hooks/navigation/useRideActionFeedback': { useRideActionFeedback: () => ({ saved: (target, receipt) => results.push({ target, receipt }), failed: (target, error) => results.push({ target, error }) }) },
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: 'BookingRevenue' },
    '@/store/hooks': { useAppSelector: fn => fn(state) },
    '@/store/api/rideRecoveryApi': { useGetRideDeclarationsQuery: (args, options) => { queries.push({ args, options }); return { currentData: snapshots, refetch() {} }; } },
    '@/services/rideOutbox': { rideOutbox: { enqueue: async input => { sent.push(input); return io.enqueue(input); } } },
  })('features/ride-recovery/RideRecoveryControl.tsx');
  let props = { tripId: 'trip', booking, actor: 'passenger' };
  let tree;
  const render = () => { tree = hooks.render(() => RideRecoveryControl(props)); return tree; };
  const button = label => all(all(tree).find(node => node.type === 'Modal')).find(node => node.type === 'Button' && words(node) === label);
  const trigger = () => all(tree).find(node => node.type === 'Button');
  render();
  return { state, booking, queries, sent, results, io, hooks, render, button, trigger, tree: () => tree, props: value => { props = value; }, snapshots: value => { snapshots = value; }, active: value => { active = value; } };
}

test('one passenger tap saves pickup directly, then reports its result without an intermediate modal', async () => {
  const h = setup();
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'none' }, dropoff: { status: 'none' } }]); h.render();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  h.trigger().props.onPress(); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
  assert.equal(h.queries.at(-1).options.skip, true);
  assert.equal(h.button('Je suis arrivé à destination'), undefined);
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm' }]);
  assert.equal(h.booking.pickedUp, undefined);
  assert.equal(h.results.length, 1); assert.equal(h.results[0].target.stage, 'pickup');
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
  assert.equal(h.trigger().props.disabled, true);
  assert.match(words(h.tree()), /Enregistré sur ce téléphone/);
  h.hooks.unmount();
});

test('condensed passenger controls retain both confirmations and the offline receipt', async () => {
  for (const stage of ['pickup', 'dropoff']) {
    const h = setup();
    h.props({ tripId: 'trip', booking: { ...h.booking, pickedUp: stage === 'dropoff' }, actor: 'passenger', condensed: true });
    h.render();
    assert.match(words(h.tree()), stage === 'pickup' ? /Confirmez une fois à bord/ : /Confirmez une fois à destination/);
    assert.match(words(h.tree()), /Le conducteur confirme aussi/);
    h.trigger().props.onPress();
    await new Promise(resolve => setImmediate(resolve)); h.render();
    assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage, decision: 'confirm' }]);
    assert.match(words(h.tree()), /Enregistré sur ce téléphone/);
    assert.equal(h.trigger().props.disabled, true);
    h.hooks.unmount();
  }
});

test('driver confirms either stage in one tap without acting for the passenger', async () => {
  for (const stage of ['pickup', 'dropoff']) {
    const h = setup(); h.state.auth.user.id = 'driver'; h.state.rideRecovery.userId = 'driver';
    h.props({ tripId: 'trip', bookings: [{ ...h.booking, pickedUp: stage === 'dropoff' }], actor: 'driver', compact: true });
    h.render(); h.render();
    assert.equal(words(h.trigger()), stage === 'pickup' ? 'Confirmer l’embarquement' : 'Confirmer l’arrivée à destination');
    const press = h.trigger().props.onPress; press(); press();
    await new Promise(resolve => setImmediate(resolve)); h.render(); press();
    assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage, decision: 'confirm' }]);
    assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
    assert.equal(h.booking.pickedUp, undefined); assert.equal(h.booking.droppedOff, undefined);
    assert.equal(h.results.length, 1); assert.equal(h.results[0].target.actor, 'driver'); assert.equal(h.results[0].target.stage, stage);
    assert.equal(h.trigger().props.disabled, true);
    h.hooks.unmount();
  }
});

test('bypassed pickup saves only the driver declaration then reports its result without another validation', async () => {
  const hooks = hookHarness();
  const booking = { id: 'booking', tripId: 'trip', status: 'accepted' };
  const confirmation = { waypoint: { booking, passenger: { name: 'Passager' } } };
  const calls = [], sent = [], results = [];
  let allowed = true;
  const props = {
    tripId: 'trip', pickupBypassAction: null,
    pickupBypassConfirmationRef: { current: confirmation }, pickupNoticeRef: { current: { waypoint: { booking } } },
    setPickupNotice: value => calls.push(['notice', value]), setPickupNoticeCountdown: value => calls.push(['countdown', value]),
    setPickupBypassConfirmation: value => calls.push(['reminder', value]), setPickupBypassAction() {},
    speakNavigationMessage: async text => calls.push(['speech', text]),
    showDialog: () => assert.fail('a successful declaration needs no dialog'),
    beginBookingAction: (item, operation) => { assert.equal(item, booking); assert.equal(operation, 'pickup-confirm');
      if (!allowed) return null; allowed = false;
      return { isCurrent: () => true, finish: () => { calls.push(['released']); allowed = true; } }; },
    cancelBooking: () => assert.fail('confirmation is not cancellation'),
    commitBookingDecision: () => assert.fail('a declaration must not invent final booking state'),
  };
  const { useDriverPickupActions } = loader({ react: { ...React, ...hooks.react },
    '@/hooks/navigation/useRideActionFeedback': { useRideActionFeedback: () => ({ saved: target => results.push(target), failed: () => assert.fail('no failure') }) },
    '@/services/rideOutbox': { rideOutbox: { enqueue: async input => sent.push(input) } },
  })('hooks/driver-navigation/useDriverPickupActions.ts');
  const actions = hooks.render(() => useDriverPickupActions(props));
  await Promise.all([actions.handleConfirmBypassedPickup(), actions.handleConfirmBypassedPickup()]);
  assert.deepEqual(sent, [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm' }]);
  assert.equal(results.length, 1); assert.equal(results[0].actor, 'driver');
  assert.equal(props.pickupBypassConfirmationRef.current, null);
  assert.equal(props.pickupNoticeRef.current, null); assert.equal(booking.pickedUp, undefined);
  assert.ok(calls.some(call => call[0] === 'released'));
  props.pickupBypassConfirmationRef.current = confirmation; allowed = false;
  const count = calls.length; await actions.handleConfirmBypassedPickup();
  assert.equal(calls.length, count); assert.equal(props.pickupBypassConfirmationRef.current, confirmation);
  hooks.unmount();
});

test('driver bypass modal explains dual confirmation and preserves cancellation or private-trip pause', () => {
  const { NavigationPickupBypassModal } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
  })('features/driver-navigation/NavigationPickupBypassModal.tsx');
  let confirmed = 0;
  const props = { pickupBypassConfirmation: { waypoint: { passenger: { name: 'Passager' } } },
    insets: { bottom: 0 }, trip: {}, handleConfirmBypassedPickup: () => { confirmed++; }, handleCancelBypassedPickup() {}, pauseTripWithoutPassengerConfirmation() {} };
  const tree = NavigationPickupBypassModal(props);
  assert.match(words(tree), /Je suis à bord.*deux confirmations.*détection automatique/);
  const button = all(tree).find(node => node.type === 'Button' && words(node) === 'Confirmer l’embarquement');
  button.props.onPress(); assert.equal(confirmed, 1);
  assert.match(words(tree), /Annuler la réservation/);
  assert.match(words(NavigationPickupBypassModal({ ...props, trip: { tripRequestId: 'request' } })), /Arrêter le trajet/);
  const paused = NavigationPickupBypassModal({ ...props, isPausingTrip: true });
  assert.equal(all(paused).find(node => node.type === 'Button' && words(node) === 'Confirmer l’embarquement').props.disabled, true);
});

test('waiting copy identifies the other actor and never calls a queued vote server-received', () => {
  for (const actor of ['driver', 'passenger']) {
    const h = setup(); h.state.auth.user.id = actor; h.state.rideRecovery.userId = actor;
    h.props({ tripId: 'trip', actor, ...(actor === 'driver' ? { bookings: [h.booking] } : { booking: h.booking }) });
    h.snapshots([{ bookingId: 'booking', pickup: { status: 'awaiting_other', [actor]: 'confirm' }, dropoff: { status: 'none' } }]);
    h.render(); h.render();
    assert.match(words(h.tree()), actor === 'driver' ? /Votre validation est reçue. En attente du passager/ : /Votre validation est reçue. En attente du conducteur/);
    const other = actor === 'driver' ? 'passenger' : 'driver';
    h.snapshots([{ bookingId: 'booking', pickup: { status: 'awaiting_other', [other]: 'confirm' }, dropoff: { status: 'none' } }]);
    h.render();
    assert.match(words(h.tree()), /a confirmé. Votre validation est attendue/);
    assert.doesNotMatch(words(h.tree()), /Votre validation est reçue/);
    h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm', state: 'queued' }];
    h.render();
    const modal = all(h.tree()).find(node => node.type === 'Modal');
    const inline = all(h.tree()).filter(node => node.type === 'Text' && !all(modal).includes(node)).map(words).join('');
    assert.match(inline, /Enregistré sur ce téléphone/);
    assert.doesNotMatch(inline, /Votre validation est reçue/);
    h.hooks.unmount();
  }
});

test('the optional status link preserves disagreement without adding a step to positive confirmation', async () => {
  const h = setup();
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'awaiting_other', driver: 'confirm' }, dropoff: { status: 'none' } }]);
  h.render(); h.render();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  const inspect = all(h.tree()).find(node => node.type === 'Button' && words(node) === 'Vérifier les confirmations');
  inspect.props.onPress(); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, true);
  h.button('Ce n’est pas exact').props.onPress(); h.render();
  assert.equal(h.sent.length, 0, 'a disagreement still requires review');
  await h.button('Enregistrer ma réponse').props.onPress(); h.render();
  assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'reject' }]);
  h.hooks.unmount();
});

test('a saved pickup allows queuing arrival, but neither is displayed as server-confirmed', () => {
  const h = setup();
  h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', state: 'queued', decision: 'confirm' }];
  h.render(); assert.ok(h.button('Je suis arrivé à destination')); assert.equal(h.button('Je suis à bord'), undefined);
  assert.equal(words(h.trigger()), 'Je suis arrivé à destination');
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

test('passenger arrival is saved in one tap with a result but no intermediate confirmation or invented payment', async () => {
  const h = setup();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  assert.equal(all(h.trigger()).find(node => node.type === 'Icon').props.name, 'car-outline');
  h.booking.pickedUp = true;
  h.props({ tripId: 'trip', booking: { ...h.booking }, actor: 'passenger' }); h.render();
  assert.equal(words(h.trigger()), 'Je suis arrivé à destination');
  assert.equal(h.trigger().props.accessibilityLabel, 'Je suis arrivé à destination');
  assert.equal(all(h.trigger()).find(node => node.type === 'Icon').props.name, 'flag-outline');
  h.trigger().props.onPress(); h.render();
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage: 'dropoff', decision: 'confirm' }]);
  assert.equal(h.booking.droppedOff, undefined); assert.equal(h.booking.paymentStatus, undefined);
  assert.equal(h.results.length, 1); assert.equal(h.results[0].target.stage, 'dropoff');
  assert.equal(h.trigger().props.disabled, true); assert.match(words(h.trigger()), /Arrivée à destination déclarée/);
  h.hooks.unmount();
});

test('server pickup confirmation updates the label even if the booking cache is older', () => {
  const h = setup();
  h.snapshots([{ bookingId: 'booking', pickup: { status: 'confirmed' }, dropoff: { status: 'none' } }]); h.render();
  assert.equal(words(h.trigger()), 'Je suis arrivé à destination');
  h.hooks.unmount();
});

test('driver labels cover pickup, dropoff and passengers at different stages', () => {
  const h = setup();
  const props = { tripId: 'trip', actor: 'driver', compact: true };
  h.props({ ...props, bookings: [h.booking] }); h.render();
  assert.equal(words(h.trigger()), 'Confirmer l’embarquement');
  const onboard = { ...h.booking, id: 'onboard', passengerName: 'À bord', pickedUp: true };
  h.props({ ...props, bookings: [onboard] }); h.render();
  assert.equal(words(h.trigger()), 'Confirmer l’arrivée à destination');
  h.props({ ...props, bookings: [h.booking, onboard] }); h.render();
  assert.equal(words(h.trigger()), 'Embarquement ou arrivée à destination');
  h.trigger().props.onPress(); h.render();
  all(h.tree()).find(node => node.props?.accessibilityLabel === 'Voir les confirmations de Test').props.onPress(); h.render();
  assert.ok(h.button('Confirmer l’embarquement')); assert.equal(h.button('Confirmer l’arrivée à destination'), undefined);
  all(h.tree()).find(node => node.props?.accessibilityLabel === 'Voir les confirmations de À bord').props.onPress(); h.render();
  assert.ok(h.button('Confirmer l’arrivée à destination'));
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
  assert.equal(h.button('Je suis arrivé à destination'), undefined);
  h.hooks.unmount();
});

test('blocked, disputed or other-account pickup entries do not advertise arrival', () => {
  const h = setup();
  for (const state of ['blocked', 'disputed']) {
    h.state.rideRecovery.entries = [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', state, decision: 'confirm' }];
    h.render(); assert.equal(words(h.trigger()), 'Voir les confirmations');
    assert.equal(h.button('Je suis arrivé à destination'), undefined);
  }
  h.state.rideRecovery.userId = 'someone-else'; h.render();
  assert.equal(words(h.trigger()), 'Je suis à bord');
  h.hooks.unmount();
});

test('three reserved seats require one holder confirmation, not three individual actions', async () => {
  const h = setup();
  h.props({ tripId: 'trip', booking: { ...h.booking, numberOfSeats: 3 }, actor: 'passenger' }); h.render();
  assert.match(h.trigger().props.accessibilityHint, /toutes les places/);
  const save = h.trigger().props.onPress;
  save(); save(); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.deepEqual(h.sent, [{ bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm' }]);
  h.hooks.unmount();
});

test('direct pickup stays busy during disk persistence, keeps the same action and rejects stale repeated taps', async () => {
  const h = setup(); let finish;
  h.io.enqueue = () => new Promise(resolve => { finish = resolve; });
  const press = h.trigger().props.onPress; press(); press(); h.render();
  assert.equal(h.sent.length, 1); assert.equal(h.trigger().props.disabled, true);
  assert.equal(h.trigger().props.accessibilityState.busy, true);
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
  finish(); await new Promise(resolve => setImmediate(resolve)); press(); h.render();
  assert.equal(h.sent.length, 1); assert.equal(h.trigger().props.disabled, true);
  h.hooks.unmount();
});

test('failures on both stages report the selected operation once and suppress late inactive results', async () => {
  for (const stage of ['pickup', 'dropoff']) for (const actor of ['passenger', 'driver']) for (const inactive of [false, true]) {
    const h = setup(); let reject;
    h.state.auth.user.id = actor; h.state.rideRecovery.userId = actor;
    const booking = { ...h.booking, pickedUp: stage === 'dropoff' };
    h.props({ tripId: 'trip', actor, ...(actor === 'driver' ? { bookings: [booking] } : { booking }) }); h.render(); h.render();
    h.io.enqueue = () => new Promise((_resolve, fail) => { reject = fail; });
    const press = h.trigger().props.onPress; press(); press();
    if (inactive) { h.active(false); h.render(); }
    reject(new Error('disk full')); await new Promise(resolve => setImmediate(resolve)); h.render();
    assert.equal(h.results.length, inactive ? 0 : 1);
    if (!inactive) { assert.equal(h.results[0].target.stage, stage); assert.equal(h.results[0].target.actor, actor); assert.ok(h.results[0].error); }
    h.hooks.unmount();
  }
});

test('a disk error reports a failure and leaves direct pickup available for retry', async () => {
  const h = setup(); h.io.enqueue = async () => { throw new Error('disk full'); };
  h.trigger().props.onPress(); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.trigger().props.disabled, false);
  assert.equal(h.results.length, 1); assert.equal(h.results[0].target.stage, 'pickup'); assert.ok(h.results[0].error);
  assert.match(words(h.tree()), /Impossible d’enregistrer/);
  assert.doesNotMatch(words(h.tree()), /disk full/);
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
  h.io.enqueue = async () => {}; h.trigger().props.onPress(); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.trigger().props.disabled, true); assert.equal(h.sent.length, 2);
  h.hooks.unmount();
});

test('an old pickup callback cannot submit after blur, account change or automatic boarding', () => {
  for (const change of ['inactive', 'account', 'boarded', 'cancelled']) {
    const h = setup(), press = h.trigger().props.onPress;
    if (change === 'inactive') h.active(false);
    if (change === 'account') h.state.auth.user = { id: 'another' };
    if (change === 'boarded') h.snapshots([{ bookingId: 'booking', pickup: { status: 'confirmed' }, dropoff: { status: 'none' } }]);
    if (change === 'cancelled') h.props({ tripId: 'trip', booking: { ...h.booking, status: 'cancelled' }, actor: 'passenger' });
    h.render(); press(); assert.equal(h.sent.length, 0, change); h.hooks.unmount();
  }
});

test('a late storage result cannot show success or a modal on a different account', async () => {
  const h = setup(); let finish;
  h.io.enqueue = () => new Promise(resolve => { finish = resolve; });
  h.trigger().props.onPress(); h.state.auth.user = { id: 'another' }; h.render();
  finish(); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(words(h.trigger()), 'Voir les confirmations');
  assert.equal(h.results.length, 0, 'no result modal for a different account');
  assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
  h.hooks.unmount();
});

test('foreign holders/trips cannot produce manual declarations even with a supplied booking', () => {
  const h = setup();
  for (const patch of [{ passengerId: 'other' }, { tripId: 'another-trip' }]) {
    h.props({ tripId: 'trip', booking: { ...h.booking, ...patch }, actor: 'passenger' }); h.render();
    assert.equal(h.button('Je suis à bord'), undefined);
    assert.equal(all(h.tree()).find(node => node.type === 'List').props.data.length, 0);
  }
  assert.deepEqual(h.sent, []); h.hooks.unmount();
});

test('multiple groups confirm the selected reservation directly, including after reordering', async () => {
  const h = setup();
  const bookings = Array.from({ length: 100 }, (_, i) => ({ ...h.booking, id: `b${i}`, passengerName: `Titulaire ${i}`, numberOfSeats: 3, pickedUp: true }));
  const props = { tripId: 'trip', bookings, actor: 'driver' };
  h.props(props); h.render(); h.render(); h.trigger().props.onPress(); h.render();
  const select = name => all(h.tree()).find(node => node.props?.accessibilityLabel === `Voir les confirmations de ${name}`);
  select('Titulaire 1').props.onPress(); h.render();
  h.props({ ...props, bookings: [...bookings].reverse() }); h.render();
  assert.equal(select('Titulaire 1').props.accessibilityState.expanded, true);
  assert.equal(all(h.tree()).find(node => node.type === 'List').props.initialNumToRender, 6);
  const press = h.button('Confirmer l’arrivée à destination').props.onPress; press(); press();
  await new Promise(resolve => setImmediate(resolve)); h.render(); press();
  assert.deepEqual(h.sent, [{ bookingId: 'b1', tripId: 'trip', stage: 'dropoff', decision: 'confirm' }]);
  assert.equal(h.button('Enregistrer ma réponse'), undefined);
  assert.equal(h.button('Validation enregistrée').props.disabled, true);
  h.snapshots([{ bookingId: 'b1', pickup: { status: 'confirmed' }, dropoff: { status: 'confirmed' } }]); h.render(); press();
  assert.equal(h.sent.length, 1);
  assert.equal(all(h.tree()).find(node => node.type === 'BookingRevenue').props.bookingId, 'b1');
  h.hooks.unmount();
});

test('dropoff keeps the synchronous double-tap guard and stale-action checks for the holder', async () => {
  for (const change of ['none', 'inactive', 'account', 'arrived', 'cancelled']) {
    const h = setup();
    h.props({ tripId: 'trip', booking: { ...h.booking, numberOfSeats: 3, pickedUp: true }, actor: 'passenger' }); h.render();
    const press = h.trigger().props.onPress;
    if (change === 'inactive') h.active(false);
    if (change === 'account') h.state.auth.user = { id: 'another' };
    if (change === 'arrived') h.snapshots([{ bookingId: 'booking', pickup: { status: 'confirmed' }, dropoff: { status: 'confirmed' } }]);
    if (change === 'cancelled') h.props({ tripId: 'trip', booking: { ...h.booking, pickedUp: true, status: 'cancelled' }, actor: 'passenger' });
    h.render(); press(); press(); await new Promise(resolve => setImmediate(resolve)); h.render(); press();
    assert.equal(h.sent.length, change === 'none' ? 1 : 0, change);
    assert.equal(all(h.tree()).find(node => node.type === 'Modal').props.visible, false);
    h.hooks.unmount();
  }
});
