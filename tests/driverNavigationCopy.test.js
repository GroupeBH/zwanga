const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const load = loader();
const { rideActionLabel, rideSavedActionLabel, rideStageMessage, rideBookingStages, rideRecoveryTrigger } = load('features/ride-recovery/rideRecoveryPresentation.ts');
const { passengerPanelLabels } = load('features/driver-navigation/passengerPanelModel.ts');

test('driver actions say what happened, while saving never claims server confirmation', () => {
  assert.equal(rideActionLabel('driver', 'pickup'), 'Le passager est monté');
  assert.equal(rideActionLabel('driver', 'dropoff'), 'Le passager est arrivé');
  for (const stage of ['pickup', 'dropoff']) {
    assert.equal(rideSavedActionLabel('driver', stage), 'Réponse enregistrée');
    assert.doesNotMatch(rideSavedActionLabel('driver', stage), /confirmée/);
  }
  assert.equal(rideRecoveryTrigger('driver', ['pickup', 'dropoff']).label, 'Choisir un passager');
  assert.equal(rideRecoveryTrigger('driver', []).label, 'Voir mes passagers');
  assert.equal(rideActionLabel('passenger', 'pickup'), 'Je suis à bord');
  assert.equal(rideActionLabel('passenger', 'dropoff'), 'Je suis arrivé à destination');
  assert.equal(rideSavedActionLabel('passenger', 'pickup'), 'Embarquement déclaré');
  assert.equal(rideRecoveryTrigger('passenger', []).label, 'Voir les confirmations');
});

test('simple driver statuses distinguish local storage, sending, receipt and final confirmation', () => {
  for (const stage of ['pickup', 'dropoff']) {
    const queued = rideStageMessage({ stage, entry: { state: 'queued', decision: 'confirm' } }, 'driver');
    assert.match(queued, /Gardé sur ce téléphone/);
    assert.doesNotMatch(queued, /reçue|confirmée/);
    const sending = rideStageMessage({ stage, entry: { state: 'sending', decision: 'confirm' } }, 'driver');
    assert.match(sending, /Envoi en cours/);
    assert.doesNotMatch(sending, /reçue|confirmée/);
    assert.match(rideStageMessage({ stage, entry: { state: 'received' } }, 'driver'), /confirmation est reçue/);
    assert.match(rideStageMessage({ stage, status: 'ready' }, 'driver'), /Vérification en cours/);
    assert.equal(rideStageMessage({ stage, status: 'confirmed' }, 'driver'), stage === 'pickup' ? 'Montée confirmée.' : 'Arrivée confirmée.');
    assert.match(rideStageMessage({ stage, status: 'disputed' }, 'driver'), /répondu différemment.*Contactez l’aide/);
  }
});

test('driver wording does not mistake the passenger answer for the driver answer or hide blocked errors', () => {
  const stage = { stage: 'pickup', status: 'awaiting_other', other: 'confirm' };
  assert.equal(rideStageMessage(stage, 'driver'), 'Le passager a confirmé. À vous de confirmer.');
  const queued = rideStageMessage({ ...stage, entry: { state: 'queued' } }, 'driver');
  assert.doesNotMatch(queued, /Votre confirmation est reçue/);
  assert.match(rideStageMessage({ stage: 'pickup', status: 'awaiting_other' }, 'driver'), /En attente de la réponse/);
  const message = 'Cette réponse est bloquée. Contactez l’assistance.';
  assert.equal(rideStageMessage({ stage: 'pickup', status: 'confirmed', entry: { state: 'blocked', decision: 'reject', message } }, 'driver'), message);
  assert.equal(rideStageMessage({ stage: 'pickup', entry: { state: 'queued', message } }, 'driver'), message);
  assert.match(rideStageMessage({ stage: 'dropoff', status: 'awaiting_other', own: 'confirm' }, 'passenger'), /serveur prépare le paiement/);
});

test('short driver labels preserve boarding eligibility, booked places and source booking state', () => {
  const booking = Object.freeze({ id: 'booking', status: 'accepted', numberOfSeats: 3 });
  const before = JSON.stringify(booking);
  const [pickup, dropoff] = rideBookingStages(booking, undefined, [], 'driver');
  assert.equal(pickup.unavailable, false);
  assert.equal(dropoff.unavailable, true);
  const [savedPickup, next] = rideBookingStages(booking, undefined, [{ bookingId: 'booking', stage: 'pickup', decision: 'confirm', state: 'queued' }], 'driver');
  assert.equal(savedPickup.unavailable, true);
  assert.equal(next.canArrive, true, 'offline arrival eligibility is unchanged, not server progress');
  assert.equal(JSON.stringify(booking), before);
  assert.equal(passengerPanelLabels({ status: 'waiting', seats: 3, waypoint: { type: 'pickup' } }).status, 'À chercher');
  assert.equal(passengerPanelLabels({ status: 'onboard', seats: 3, waypoint: { type: 'dropoff' } }).status, 'Avec vous');
  assert.equal(passengerPanelLabels({ status: 'droppedOff', seats: 3, waypoint: { type: 'dropoff' } }).status, 'Arrivé');
  assert.equal(passengerPanelLabels({ status: 'waiting', seats: 3, waypoint: { type: 'pickup' } }).seats, '3 places');
});

test('early arrival uses a concrete action, keeps the group target and prevents taps while busy', () => {
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : words(node?.props?.children ?? '');
  const { DriverInterruptionPrompt } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
  })('features/driver-navigation/DriverInterruptionPrompt.tsx');
  const booking = { id: 'group', passengerName: 'Passager test', numberOfSeats: 3 };
  const calls = [];
  const props = { booking, queuedCount: 1, onConfirm: value => calls.push(value), onReject() {} };
  const tree = DriverInterruptionPrompt(props);
  assert.match(words(tree), /Le passager veut descendre.*Passager test.*ses\s+3\s+places/);
  assert.doesNotMatch(words(tree), /interruption|titulaire|participation/i);
  const confirm = all(tree).find(node => node.type === 'Button' && words(node).includes('Il est descendu'));
  confirm.props.onPress(); assert.deepEqual(calls, [booking]);
  assert.ok(all(DriverInterruptionPrompt({ ...props, busy: true, confirming: true })).filter(node => node.type === 'Button').every(node => node.props.disabled));
});

test('spoken booking decisions clearly identify the driver, not the passenger, as the actor', async () => {
  for (const decision of ['accept', 'reject']) {
    const hooks = hookHarness(), speech = [], commits = [];
    const { useDriverBookingActions } = loader({ react: hooks.react,
      '../../features/driver-navigation/navigationPresentation': { getBookingActionErrorMessage: () => 'Erreur' },
      '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    })('hooks/driver-navigation/useDriverBookingActions.ts');
    const booking = { id: 'booking', passengerName: 'Passager test' };
    const response = { ...booking, status: decision === 'accept' ? 'accepted' : 'rejected' };
    const actions = hooks.render(() => useDriverBookingActions({
      beginBookingAction: item => ({ booking: item, isCurrent: () => true, complete() {}, finish() {} }),
      acceptBooking: () => ({ unwrap: async () => response }), rejectBooking: () => ({ unwrap: async () => response }),
      commitBookingDecision: (_source, status) => commits.push(status), rememberAcceptedBooking() {},
      lastRouteFetchTimeRef: { current: 0 }, routeFetchedRef: { current: false },
      refetchBookings: async () => ({}), refetchTrip: async () => ({}),
      speakNavigationMessage: async message => speech.push(message),
      showDialog: () => assert.fail('a successful decision must not produce a failure dialog'),
    }));
    await actions[decision === 'accept' ? 'handleAcceptPendingBooking' : 'handleRejectPendingBooking'](booking);
    assert.deepEqual(commits, [response.status]);
    assert.match(speech[0], decision === 'accept' ? /^Vous avez accepté Passager test/ : /^Vous avez refusé Passager test/);
    assert.doesNotMatch(speech[0], /Passager test accepte|Passager test refuse|itinéraire/);
    hooks.unmount();
  }
});
