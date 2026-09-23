const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const booking = { id: 'booking', tripId: 'trip', passengerId: 'holder', numberOfSeats: 3, status: 'accepted', pickedUp: true };
const request = { id: 'request', tripId: 'trip', status: 'pending', requestedAt: '2026-09-23T12:00:00Z',
  confirmations: [{ bookingId: booking.id, passengerId: booking.passengerId, status: 'pending' }] };
const trip = { id: 'trip', status: 'ongoing', interruptionRequest: request };
const confirmed = { ...trip, status: 'upcoming', interruptionRequest: { ...request, status: 'confirmed',
  confirmations: [{ ...request.confirmations[0], status: 'confirmed' }] } };

function harness() {
  const hooks = hookHarness(), sent = [], dialogs = [], committed = [];
  const { usePassengerNavigationInterruption } = loader({ react: { ...React, ...hooks.react },
    '@/features/passenger-navigation/PassengerInterruptionFarePreview': { PassengerInterruptionFarePreview: 'Preview' },
  })('hooks/passenger-navigation/usePassengerNavigationInterruption.ts');
  const props = { booking, trip, tripId: trip.id, isScreenActive: true,
    refetchBooking: async () => {}, refetchTrip: async () => {}, showDialog: d => dialogs.push(d),
    commitDriverInterruptionResponse: (...args) => committed.push(args),
    confirmDriverTripInterruption: input => { sent.push(input); return { unwrap: async () => confirmed }; },
    rejectDriverTripInterruption: input => { sent.push(input); return { unwrap: async () => ({ ...trip, interruptionRequest: null }) }; },
  };
  return { hooks, props, sent, dialogs, committed, render: () => hooks.render(() => usePassengerNavigationInterruption(props)) };
}

test('passenger confirmation commits the server response without waiting for stalled refreshes', async () => {
  const h = harness(); let finished = false;
  h.props.refetchBooking = h.props.refetchTrip = () => new Promise(() => {});
  const actions = h.render();
  void actions.handleConfirmDriverInterruption().then(() => { finished = true; });
  await flush();
  assert.equal(finished, true);
  assert.deepEqual(h.committed, [[confirmed, request.id]]);
  assert.deepEqual(h.sent, [{ tripId: 'trip', bookingId: 'booking' }]);
  await actions.handleConfirmDriverInterruption(); await actions.handleRejectDriverInterruption();
  assert.equal(h.sent.length, 1, 'same response must not be submitted again while a stale read is still visible');
  const acknowledged = h.render();
  assert.equal(acknowledged.hasRespondedToDriverInterruption, true);
  assert.equal(acknowledged.driverInterruptionConfirmation.status, 'confirmed');
  assert.equal(acknowledged.canRespondToDriverInterruption, false);
  h.hooks.unmount();
});

test('failed refresh after confirmed interruption cannot turn success into a failure', async () => {
  const h = harness();
  h.props.refetchBooking = () => { throw new Error('read failed'); };
  h.props.refetchTrip = async () => { throw new Error('read failed'); };
  await h.render().handleConfirmDriverInterruption(); await flush();
  assert.equal(h.committed.length, 1);
  assert.ok(h.dialogs.every(d => d.variant !== 'danger'));
  h.hooks.unmount();
});

test('a rejected confirmation is not committed and remains retryable', async () => {
  const h = harness(); let calls = 0;
  h.props.confirmDriverTripInterruption = () => ({ unwrap: async () => { calls++; throw { status: 400, data: { message: 'Cette interruption est annulée.' } }; } });
  await h.render().handleConfirmDriverInterruption();
  assert.equal(h.committed.length, 0); assert.equal(h.dialogs.at(-1).title, 'Confirmation impossible');
  await h.render().handleConfirmDriverInterruption(); assert.equal(calls, 2);
  h.hooks.unmount();
});

test('stale confirm callback cannot answer a replacement interruption or an inactive screen', async () => {
  const h = harness(); const old = h.render();
  h.props.trip = { ...trip, interruptionRequest: { ...request, id: 'replacement' } }; h.render();
  await old.handleConfirmDriverInterruption(); assert.equal(h.sent.length, 0);
  h.props.isScreenActive = false;
  await h.render().handleConfirmDriverInterruption(); assert.equal(h.sent.length, 0);
  h.hooks.unmount();
});

test('a late response after leaving the screen cannot reopen or commit its interruption', async () => {
  const h = harness(); let finish;
  h.props.confirmDriverTripInterruption = () => ({ unwrap: () => new Promise(resolve => { finish = resolve; }) });
  const pending = h.render().handleConfirmDriverInterruption();
  h.props.isScreenActive = false; h.render(); finish(confirmed); await pending;
  assert.equal(h.committed.length, 0); assert.equal(h.dialogs.length, 0);
  h.hooks.unmount();
});

test('response for another trip is never committed as a successful confirmation', async () => {
  const h = harness();
  h.props.confirmDriverTripInterruption = () => ({ unwrap: async () => ({ ...confirmed, id: 'other' }) });
  await h.render().handleConfirmDriverInterruption();
  assert.equal(h.committed.length, 0); assert.equal(h.dialogs.at(-1).title, 'Confirmation impossible');
  h.hooks.unmount();
});

test('refusal remains immediate and visible when the follow-up reads are slow', async () => {
  const h = harness(); let finished = false;
  h.props.refetchBooking = h.props.refetchTrip = () => new Promise(() => {});
  void h.render().handleRejectDriverInterruption().then(() => { finished = true; }); await flush();
  assert.equal(finished, true); assert.equal(h.committed.length, 1);
  assert.equal(h.dialogs.at(-1).title, 'Réponse envoyée');
  assert.equal(h.render().driverInterruptionConfirmation.status, 'rejected');
  h.hooks.unmount();
});

test('acknowledgement of an old request does not prevent responding to the next request', async () => {
  const h = harness();
  await h.render().handleConfirmDriverInterruption();
  h.props.trip = { ...trip, interruptionRequest: { ...request, id: 'replacement' } };
  const next = h.render();
  assert.equal(next.hasRespondedToDriverInterruption, false); assert.equal(next.canRespondToDriverInterruption, true);
  h.hooks.unmount();
});

const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
const words = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(words).join('') : n?.props ? words(n.props.children) : '';
test('the paused trip notice is reachable after confirmation, outside ongoing-only actions', () => {
  const { PassengerNavigationInfoCard } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInUp: { duration: () => ({ delay: () => null }) } },
    '../screen-styles/app/booking/navigate/detail/index': { styles: {} },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/components/trip/PausedPassengerRideNotice': { PausedPassengerRideNotice: 'PausedNotice' },
  })('features/passenger-navigation/PassengerNavigationInfoCard.tsx');
  const tree = PassengerNavigationInfoCard({ data: { booking: { ...booking, passengerOrigin: 'Départ', passengerDestination: 'Arrivée' }, trip: confirmed, insets: { bottom: 24 } },
    state: {}, presentation: {}, interruption: {}, tripActions: {} });
  assert.equal(all(tree).filter(n => n.type === 'PausedNotice').length, 1);
  assert.doesNotMatch(words(tree), /pas encore démarré/);
});
