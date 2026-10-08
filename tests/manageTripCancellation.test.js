const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const pendingBooking = { id: 'booking-test', status: 'pending', passengerName: 'Passager test' };
const trip = { id: 'trip-test', status: 'upcoming' };
const native = { StyleSheet: { create: value => value }, Platform: { OS: 'ios' } };
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function bookingFixture() {
  const h = hookHarness(), calls = { reject: [], cancel: [], feedback: [], keyboard: 0, refresh: 0, dialogs: [] };
  let rejection = deferred(), cancellation = deferred(), reconciled = null;
  const params = {
    trip, targetBooking: pendingBooking, rejectReason: '  Indisponible  ', isRejecting: false,
    setFeedback: feedback => calls.feedback.push(feedback),
    setTargetBooking: value => { params.targetBooking = value; },
    setRejectReason: value => { params.rejectReason = value; },
    setRejectError: value => { params.error = value; },
    setRejectModalVisible: value => { params.visible = value; },
    setProcessingBookingId: value => { params.processing = value; },
    showDialog: value => calls.dialogs.push(value),
    refreshAll: async () => { calls.refresh++; },
    reconcileBookingStatus: async () => reconciled,
    rejectBooking: value => { calls.reject.push(value); return { unwrap: () => rejection.promise }; },
    cancelBooking: value => { calls.cancel.push(value); return { unwrap: () => cancellation.promise }; },
  };
  const { useManageTripBookingActions } = loader({
    react: h.react, 'react-native': { ...native, Keyboard: { dismiss: () => calls.keyboard++ } },
    '@/services/analytics': { trackEvent: async () => {} },
  })('hooks/manage-trip/useManageTripBookingActions.ts');
  return { h, calls, params, rejection, cancellation,
    nextRejection: () => { rejection = deferred(); return rejection; },
    nextCancellation: () => { cancellation = deferred(); return cancellation; },
    reconcile: value => { reconciled = value; },
    render: () => h.render(() => useManageTripBookingActions(params)),
  };
}

test('booking refusal requires a reason and sends nothing when the form is closed', async () => {
  const env = bookingFixture();
  env.params.rejectReason = '  ';
  await env.render().handleRejectSubmit();
  assert.equal(env.calls.reject.length, 0); assert.match(env.params.error, /motif/);
  env.render().closeRejectModal();
  assert.equal(env.params.visible, false); assert.equal(env.params.targetBooking, null);
  assert.equal(env.calls.keyboard, 1); env.h.unmount();
});

test('refusal double-taps issue one request, keep the target locked, and close the keyboard after success', async () => {
  const env = bookingFixture(), actions = env.render();
  const first = actions.handleRejectSubmit(), second = actions.handleRejectSubmit();
  actions.closeRejectModal();
  actions.openRejectModal({ id: 'other', status: 'pending' });
  assert.deepEqual(env.calls.reject, [{ id: pendingBooking.id, reason: 'Indisponible' }]);
  assert.equal(env.params.targetBooking.id, pendingBooking.id);
  env.params.isRejecting = true; env.render().closeRejectModal();
  env.rejection.resolve({});
  await Promise.all([first, second]);
  assert.equal(env.params.visible, false);
  assert.equal(env.params.targetBooking, null); assert.equal(env.params.processing, null);
  assert.equal(env.calls.keyboard, 1); assert.equal(env.calls.refresh, 1);
  assert.equal(env.calls.feedback.at(-1).type, 'success'); env.h.unmount();
});

test('refusal network error preserves the reason for retry and releases the lock', async () => {
  const env = bookingFixture(), actions = env.render();
  const first = actions.handleRejectSubmit();
  env.rejection.reject(new Error('offline')); await first;
  assert.equal(env.params.targetBooking.id, pendingBooking.id);
  assert.equal(env.params.rejectReason, '  Indisponible  ');
  assert.ok(env.params.error); assert.equal(env.calls.keyboard, 0);
  const retry = env.nextRejection();
  const second = env.render().handleRejectSubmit();
  retry.resolve({}); await second;
  assert.equal(env.calls.reject.length, 2); assert.equal(env.params.targetBooking, null); env.h.unmount();
});

test('refusal reconciled from server state closes the form without a second write', async () => {
  const env = bookingFixture(); env.reconcile({ ...pendingBooking, status: 'rejected' });
  const action = env.render().handleRejectSubmit();
  env.rejection.reject(new Error('timeout')); await action;
  assert.equal(env.calls.reject.length, 1); assert.equal(env.params.visible, false);
  assert.equal(env.params.targetBooking, null); assert.equal(env.calls.keyboard, 1); env.h.unmount();
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
    isScreenActive: true, insets: { bottom: 0 }, rejectModalVisible: true },
    actions: {}, bookingsActions: { closeRejectModal: close }, routeEditor: {}, tracking: {} };
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
  model.state.isScreenActive = false; tree = owner(); assert.equal(tree.props.active, false);
});
