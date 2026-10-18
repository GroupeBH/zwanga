const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const pendingBooking = { id: 'booking-test', tripId: 'trip-test', status: 'pending', passengerName: 'Passager test' };
const trip = { id: 'trip-test', driverId: 'driver-test', status: 'upcoming' };
const native = { StyleSheet: { create: value => value }, Platform: { OS: 'ios' } };
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function bookingFixture() {
  const h = hookHarness(), calls = { accept: [], reject: [], cancel: [], feedback: [], commits: [], refresh: 0, dialogs: [] };
  let rejection = deferred(), cancellation = deferred(), reconciled = null;
  const params = {
    trip, userId: trip.driverId, isScreenActive: true, bookings: [pendingBooking],
    setFeedback: feedback => calls.feedback.push(feedback),
    commitBookingDecision: (...args) => calls.commits.push(args),
    rememberAcceptedBooking() {},
    setProcessingBookingId: value => { params.processing = value; },
    showDialog: value => calls.dialogs.push(value),
    refreshAll: async () => { calls.refresh++; },
    reconcileBookingStatus: async () => reconciled,
    acceptBooking: value => { calls.accept.push(value); return { unwrap: () => rejection.promise }; },
    rejectBooking: value => { calls.reject.push(value); return { unwrap: () => rejection.promise }; },
    cancelBooking: value => { calls.cancel.push(value); return { unwrap: () => cancellation.promise }; },
  };
  const { useManageTripBookingActions } = loader({
    react: h.react, 'react-native': native,
    '@/services/analytics': { trackEvent: async () => {} },
  })('hooks/manage-trip/useManageTripBookingActions.ts');
  return { h, calls, params, rejection, cancellation,
    nextRejection: () => { rejection = deferred(); return rejection; },
    nextCancellation: () => { cancellation = deferred(); return cancellation; },
    reconcile: value => { reconciled = value; },
    render: () => h.render(() => useManageTripBookingActions(params)),
  };
}

test('refusal is direct, without a reason form or confirmation screen', async () => {
  const env = bookingFixture(), actions = env.render();
  const pending = actions.handleRejectBooking(pendingBooking);
  assert.deepEqual(env.calls.reject, [{ id: pendingBooking.id, reason: 'Refus du conducteur' }]);
  assert.equal(env.calls.dialogs.length, 0);
  env.rejection.resolve({ ...pendingBooking, status: 'rejected' }); await pending;
  assert.deepEqual(env.calls.feedback, [{ type: 'success', message: 'Réservation refusée.' }]);
  assert.equal(env.calls.commits[0][1], 'rejected');
  assert.equal(actions.openRejectModal, undefined); env.h.unmount();
});

test('accept/refuse double taps share one lock and confirmed decisions cannot replay from stale cards', async () => {
  const env = bookingFixture(), actions = env.render();
  const first = actions.handleAcceptBooking(pendingBooking.id), second = actions.handleRejectBooking(pendingBooking);
  assert.deepEqual(env.calls.accept, [pendingBooking.id]); assert.deepEqual(env.calls.reject, []);
  env.rejection.resolve({});
  await Promise.all([first, second]);
  await actions.handleAcceptBooking(pendingBooking.id); await actions.handleRejectBooking(pendingBooking);
  assert.deepEqual(env.calls.accept, [pendingBooking.id]); assert.deepEqual(env.calls.reject, []);
  assert.equal(env.params.processing, null); assert.equal(env.calls.refresh, 1);
  assert.equal(env.calls.feedback.at(-1).type, 'success'); env.h.unmount();
});

test('refusal network error stays inline, never replays and releases the lock for a deliberate retry', async () => {
  const env = bookingFixture(), actions = env.render();
  const first = actions.handleRejectBooking(pendingBooking);
  env.rejection.reject(new Error('offline')); await first;
  assert.equal(env.calls.feedback.at(-1).type, 'error'); assert.equal(env.calls.dialogs.length, 0);
  assert.equal(env.calls.commits.length, 0);
  const retry = env.nextRejection();
  const second = env.render().handleRejectBooking(pendingBooking);
  retry.resolve({}); await second;
  assert.equal(env.calls.reject.length, 2); assert.equal(env.calls.feedback.at(-1).type, 'success'); env.h.unmount();
});

test('refusal reconciled from server state updates the card without a second write', async () => {
  const env = bookingFixture(); env.reconcile({ ...pendingBooking, status: 'rejected' });
  const action = env.render().handleRejectBooking(pendingBooking);
  env.rejection.reject(new Error('timeout')); await action;
  assert.equal(env.calls.reject.length, 1); assert.equal(env.calls.commits[0][1], 'rejected');
  assert.equal(env.calls.feedback.at(-1).type, 'success'); env.h.unmount();
});

test('wrong owner, inactive screen, already processed booking and old account callbacks do not respond', async () => {
  for (const patch of [{ userId: 'other' }, { isScreenActive: false }, { bookings: [{ ...pendingBooking, status: 'accepted' }] },
    { bookings: [{ ...pendingBooking, tripId: 'other' }] }, { trip: { ...trip, status: 'completed' } }]) {
    const env = bookingFixture(); Object.assign(env.params, patch);
    await env.render().handleRejectBooking(pendingBooking);
    assert.equal(env.calls.reject.length, 0); env.h.unmount();
  }
  const env = bookingFixture(), stale = env.render();
  env.params.userId = 'other'; env.render(); await stale.handleRejectBooking(pendingBooking);
  assert.equal(env.calls.reject.length, 0); env.h.unmount();
});

test('leaving the screen while answering cannot show feedback or patch another account', async () => {
  for (const leave of ['unmount', 'account', 'background']) {
    const env = bookingFixture(), pending = env.render().handleRejectBooking(pendingBooking);
    if (leave === 'unmount') env.h.unmount();
    else { if (leave === 'account') env.params.userId = 'other'; else env.params.isScreenActive = false; env.render(); }
    env.rejection.resolve({}); await pending;
    assert.equal(env.calls.feedback.length, 0); assert.equal(env.calls.commits.length, 0);
    env.h.unmount();
  }
});

test('failed background refresh does not turn a confirmed refusal into an error', async () => {
  const env = bookingFixture(); env.params.refreshAll = async () => { throw Error('offline'); };
  const pending = env.render().handleRejectBooking(pendingBooking); env.rejection.resolve({}); await pending;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(env.calls.feedback, [{ type: 'success', message: 'Réservation refusée.' }]); env.h.unmount();
});

test('booking cancellation still requires confirmation, refuses a boarded passenger, and coalesces writes', async () => {
  const env = bookingFixture(), actions = env.render();
  const booking = { ...pendingBooking, status: 'accepted' };
  actions.handleCancelBookingBeforePickup({ ...booking, pickedUp: true });
  assert.equal(env.calls.dialogs.length, 0); assert.equal(env.calls.cancel.length, 0);
  actions.handleCancelBookingBeforePickup(booking);
  assert.equal(env.calls.cancel.length, 0);
  const confirm = env.calls.dialogs[0].actions.find(action => action.label === 'Oui, annuler').onPress;
  const first = confirm(), second = confirm();
  assert.deepEqual(env.calls.cancel, [booking.id]);
  env.cancellation.resolve({}); await Promise.all([first, second]);
  assert.equal(env.calls.feedback.at(-1).type, 'success'); assert.equal(env.params.processing, null); env.h.unmount();
});

test('trip cancellation coalesces repeated confirmation and goes Home only after server success', async () => {
  const h = hookHarness(); const request = deferred(), dialogs = [], writes = [], feedback = []; let exits = 0;
  const { useManageTripActions } = loader({
    react: h.react, 'react-native': native, '@/hooks/navigation/useTripStartTransition': { useTripStartTransition: () => ({}) },
    '@/services/analytics': { trackEvent: async () => {} },
  })('hooks/manage-trip/useManageTripActions.ts');
  const actions = h.render(() => useManageTripActions({
    trip, showDialog: value => dialogs.push(value), showFeedback: (...args) => feedback.push(args),
    updateTripStatus: value => { writes.push(value); return { unwrap: () => request.promise }; },
    goHome: () => exits++,
  }));
  actions.handleCancelTrip(); assert.equal(writes.length, 0); assert.equal(exits, 0);
  const confirm = dialogs[0].actions.find(action => action.label === 'Oui, annuler').onPress;
  const first = confirm(), second = confirm();
  assert.deepEqual(writes, [{ id: trip.id, updates: { status: 'cancelled' } }]);
  request.resolve({}); await Promise.all([first, second]);
  assert.equal(exits, 1); assert.equal(feedback.at(-1)[0], 'success'); h.unmount();
});

test('trip cancellation error remains on screen and allows a new attempt', async () => {
  const h = hookHarness(); const dialogs = []; let writes = 0, exits = 0;
  const { useManageTripActions } = loader({
    react: h.react, 'react-native': native, '@/hooks/navigation/useTripStartTransition': { useTripStartTransition: () => ({}) },
    '@/services/analytics': { trackEvent: async () => {} },
  })('hooks/manage-trip/useManageTripActions.ts');
  const actions = h.render(() => useManageTripActions({
    trip, showDialog: value => dialogs.push(value), showFeedback() {},
    updateTripStatus: () => ({ unwrap: async () => { if (++writes === 1) throw new Error('offline'); } }),
    goHome: () => exits++,
  }));
  actions.handleCancelTrip(); await dialogs[0].actions[1].onPress(); assert.equal(exits, 0);
  actions.handleCancelTrip(); await dialogs[1].actions[1].onPress();
  assert.equal(writes, 2); assert.equal(exits, 1); h.unmount();
});

test('manage screen scopes confirmation and form overlays to its focus and wires native back dismissal', () => {
  const close = () => {};
  const model = { trip, state: { tripId: trip.id, isOwner: true, isIdentityVerified: true,
    isScreenActive: true, insets: { bottom: 0 }, editRouteModalVisible: true },
    actions: {}, bookingsActions: {}, routeEditor: { closeEditRouteModal: close }, tracking: {} };
  const { default: Screen } = loader({
    'react-native': { ...native, View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input', ActivityIndicator: 'Spinner' },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'Animated' }, FadeInDown: {} },
    '@/components/trip/DriverTripAccessGuard': { DriverTripAccessGuard: 'Guard' },
    '../../../hooks/manage-trip/useManageTripController': { useManageTripController: () => model },
    '../../../features/manage-trip/ManageTripContent': { ManageTripContent: 'Content' },
    '../../../features/manage-trip/ManageTripActionsFooter': { ManageTripActionsFooter: 'Footer' },
    '@/features/manage-trip/ManageTripContactModal': { ManageTripContactModal: 'Contact' },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: 'Scope' },
    '@/components/forms/FormLayout': { FormModal: 'Modal' },
    '../../../features/screen-styles/app/trip/manage/detail/index': { styles: {} },
  })('app/trip/manage/[id].tsx');
  const owner = Screen().props.children.type;
  let tree = owner(); assert.equal(tree.type, 'Scope'); assert.equal(tree.props.scopeKey, 'manage:trip-test');
  assert.equal(tree.props.active, true);
  assert.equal(nodes(tree).find(node => node.type === 'Modal' && node.props.visible).props.onRequestClose, close);
  assert.equal(nodes(tree).filter(node => node.type === 'Modal').length, 1, 'no refusal form remains');
  model.state.isScreenActive = false; tree = owner(); assert.equal(tree.props.active, false);
});
