const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getPaidRequestCompletionKey: eligible } = loader()('features/driver-navigation/paidRequestCompletion.ts');
const trip = { id: 'trip', driverId: 'driver', tripRequestId: 'request', status: 'ongoing' };
const booking = { id: 'booking', tripId: 'trip', status: 'completed', droppedOff: true, paymentMode: 'points', paymentStatus: 'succeeded', paymentAmount: 3500 };
const gate = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

for (const requestId of ['request', undefined]) test(`only own ongoing rides with all passengers completed and paid are eligible (${requestId ?? 'published'})`, () => {
  const trip = { id: 'trip', driverId: 'driver', tripRequestId: requestId, status: 'ongoing' };
  assert.equal(eligible(trip, [booking], 'driver'), 'driver:trip');
  for (const patch of [{ status: 'upcoming' }, { status: 'completed' }, { status: 'cancelled' }, { driverId: 'other' }]) {
    assert.equal(eligible({ ...trip, ...patch }, [booking], 'driver'), null);
  }
  for (const rows of [undefined, [], [{ ...booking, tripId: 'other' }], [{ ...booking, status: 'accepted' }],
    [{ ...booking, status: 'cancelled' }], [{ ...booking, status: 'rejected' }], [{ ...booking, status: 'no_show' }],
    [{ ...booking, droppedOff: false }], [{ ...booking, paymentStatus: 'pending' }],
    [booking, { ...booking, id: 'onboard', status: 'accepted' }], [booking, { ...booking, id: 'waiting', status: 'pending' }],
    [booking, { ...booking, id: 'uncertain', status: 'boarding_uncertain' }]]) {
    assert.equal(eligible(trip, rows, 'driver'), null);
  }
  assert.equal(eligible(trip, [booking, { ...booking, status: 'cancelled' }], 'driver'), 'driver:trip');
  assert.equal(eligible(trip, [booking, { ...booking, id: 'second', paymentMode: 'cash', cashReceivedAt: 'date' }], 'driver'), 'driver:trip');
});
test('cash and mixed cash require confirmed collection; partial token debit cannot finish a request', () => {
  const cash = { ...booking, paymentMode: 'cash', paymentStatus: 'not_required', mixedPaymentAt: 'date', mixedTokenAmount: 650 };
  assert.equal(eligible(trip, [cash], 'driver'), null);
  assert.equal(eligible(trip, [{ ...cash, cashReceivedAt: 'date' }], 'driver'), 'driver:trip');
  for (const amount of [null, undefined, NaN, '', 3500]) assert.equal(eligible(trip, [{ ...cash, paymentAmount: amount }], 'driver'), null);
  assert.equal(eligible(trip, [{ ...cash, paymentAmount: 0 }], 'driver'), 'driver:trip');
});

function fixture() {
  const hooks = hookHarness(); let version = 1;
  const task = gate(), events = [];
  const { usePaidRequestCompletion } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
  })('hooks/driver-navigation/usePaidRequestCompletion.ts');
  const params = { trip, bookings: [booking], driverId: 'driver', active: true, blocked: false, completingRef: { current: false },
    completeTrip: id => { events.push(['complete', id]); return { unwrap: () => task.promise }; },
    reconcileTripStatus: async () => null, onCompleted: value => events.push(['done', value]), refresh: () => events.push(['refresh']) };
  return { hooks, task, events, params, logout: () => version++, render: () => hooks.render(() => usePaidRequestCompletion(params)) };
}
test('dismissal survives data rerenders and foreground returns without completing automatically', () => {
  const f = fixture(); assert.equal(f.render().visible, true); f.render().dismiss();
  for (let i = 0; i < 30; i++) { f.params.bookings = [{ ...booking }]; assert.equal(f.render().visible, false); }
  f.params.active = false; f.render(); f.params.active = true; assert.equal(f.render().visible, false);
  assert.equal(f.events.length, 0); f.hooks.unmount();
});

test('published ride can continue then explicitly reopen completion without submitting', () => {
  const f = fixture(); f.params.trip = { ...trip, tripRequestId: undefined };
  assert.equal(f.render().available, true);
  f.render().dismiss(); assert.equal(f.render().visible, false);
  assert.equal(f.render().available, true, 'navigation keeps the manual action available');
  f.render().reopen(); assert.equal(f.render().visible, true);
  assert.equal(f.events.length, 0, 'only confirmation, never opening the panel, completes a published ride');
  f.hooks.unmount();
});

for (const change of ['inactive', 'blocked', 'other-trip', 'unpaid', 'logout', 'already-completing', 'unmounted']) {
  test(`old reopen callback cannot act after ${change}`, () => {
    const f = fixture(), action = f.render().reopen;
    f.render().dismiss();
    if (change === 'inactive') f.params.active = false;
    if (change === 'blocked') f.params.blocked = true;
    if (change === 'other-trip') f.params.trip = { ...trip, id: 'other' };
    if (change === 'unpaid') f.params.bookings = [{ ...booking, paymentStatus: 'pending' }];
    if (change === 'already-completing') f.params.completingRef.current = true;
    if (change === 'logout') f.logout();
    if (change === 'unmounted') f.hooks.unmount(); else f.render();
    action();
    // Restore eligibility without an explicit new action: dismissed UI must stay closed.
    f.params.active = true; f.params.blocked = false; f.params.trip = trip;
    f.params.bookings = [booking]; f.params.completingRef.current = false;
    if (change !== 'logout' && change !== 'unmounted') assert.equal(f.render().visible, false);
    assert.equal(f.events.length, 0); f.hooks.unmount();
  });
}
test('completion is single-flight, awaits server success and reuses the completed trip flow', async () => {
  const f = fixture(), action = f.render().confirm;
  const first = action(); await action();
  assert.equal(f.render().busy, true); assert.equal(f.events.length, 1);
  f.render().dismiss(); assert.equal(f.render().visible, true, 'cannot dismiss an in-flight mutation');
  f.task.resolve({ ...trip, status: 'completed' }); await first;
  assert.deepEqual(f.events.map(e => e[0]), ['complete', 'done', 'refresh']);
  assert.equal(f.render().visible, false); assert.equal(f.params.completingRef.current, false);
  assert.equal(f.render().available, false, 'a completed response disables reopening even before cache refresh');
  f.render().reopen(); await action(); assert.equal(f.events.length, 3);
  f.hooks.unmount();
});

test('automatic completion runs once after collection; failures never create a retry loop', async () => {
  const f = fixture(); f.params.autoComplete = true;
  f.render(); assert.equal(f.events.length, 1);
  f.task.reject({ status: 'FETCH_ERROR' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.render().error);
  for (let i = 0; i < 10; i++) f.render();
  assert.equal(f.events.length, 1);
  assert.equal(f.events.some(e => e[0] === 'done'), false);
  f.hooks.unmount();
});

test('automatic completion waits for active screen and never bypasses a payment overlay', () => {
  const f = fixture(); f.params.autoComplete = true; f.params.blocked = true;
  f.render(); assert.equal(f.events.length, 0);
  f.params.blocked = false; f.params.active = false; f.render(); assert.equal(f.events.length, 0);
  f.params.active = true; f.render(); assert.equal(f.events.length, 1);
  f.task.resolve({ ...trip, status: 'completed' }); f.hooks.unmount();
});
test('failure stays actionable without pretending the trip ended, retry succeeds', async () => {
  const f = fixture(); const request = f.render().confirm();
  f.task.reject({ status: 'FETCH_ERROR' }); await request;
  assert.equal(f.render().visible, true); assert.ok(f.render().error); assert.equal(f.render().busy, false);
  assert.equal(f.events.some(e => e[0] === 'done'), false);
  f.params.completeTrip = () => ({ unwrap: async () => ({ ...trip, status: 'completed' }) });
  await f.render().confirm(); assert.equal(f.render().visible, false); f.hooks.unmount();
});
test('ambiguous mutation uses existing reconciliation and never resubmits automatically', async () => {
  const f = fixture(); f.params.reconcileTripStatus = async () => ({ ...trip, status: 'completed' });
  const request = f.render().confirm(); f.task.reject({ status: 'FETCH_ERROR' }); await request;
  assert.equal(f.events.filter(e => e[0] === 'complete').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'done').length, 1); f.hooks.unmount();
});
for (const change of ['inactive', 'blocked', 'other-trip', 'unpaid', 'logout', 'already-completing']) {
  test(`old confirm callback cannot act after ${change}`, async () => {
    const f = fixture(), action = f.render().confirm;
    if (change === 'inactive') f.params.active = false;
    if (change === 'blocked') f.params.blocked = true;
    if (change === 'other-trip') f.params.trip = { ...trip, id: 'other' };
    if (change === 'unpaid') f.params.bookings = [{ ...booking, paymentStatus: 'pending' }];
    if (change === 'already-completing') f.params.completingRef.current = true;
    if (change === 'logout') f.logout();
    f.render(); await action(); assert.equal(f.events.length, 0); f.hooks.unmount();
  });
}
test('late completion after unmount/logout never presents a modal for the old session', async () => {
  const f = fixture(); const request = f.render().confirm(); f.hooks.unmount(); f.logout();
  f.task.resolve({ ...trip, status: 'completed' }); await request;
  assert.deepEqual(f.events.map(e => e[0]), ['complete']);
  assert.equal(f.params.completingRef.current, false);
});

test('dismissed prompt rejects its old confirm callback; a response still ongoing is not a success', async () => {
  const f = fixture(), action = f.render().confirm;
  f.render().dismiss(); await action(); assert.equal(f.events.length, 0); f.hooks.unmount();
  const g = fixture(); const request = g.render().confirm(); g.task.resolve(trip); await request;
  assert.equal(g.render().visible, true); assert.ok(g.render().error);
  assert.equal(g.events.some(e => e[0] === 'done'), false); g.hooks.unmount();
});

test('a payment received while inactive waits for foreground; ending in background never opens UI there', async () => {
  const f = fixture(); f.params.active = false; assert.equal(f.render().visible, false);
  f.params.active = true; assert.equal(f.render().visible, true);
  const request = f.render().confirm(); f.params.active = false; f.render();
  f.task.resolve({ ...trip, status: 'completed' }); await request;
  assert.equal(f.events.some(e => e[0] === 'done'), false);
  assert.equal(f.events.filter(e => e[0] === 'refresh').length, 1); f.hooks.unmount();
});

function panelFixture(published = false) {
  const React = require('react');
  const hooks = hookHarness(), task = gate(); let requests = 0, completed = 0;
  const load = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', ScrollView: 'Scroll',
      StyleSheet: { create: value => value, hairlineWidth: 1 } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
  });
  const { DriverPaidRequestCompletionPrompt: Panel } = load('features/driver-navigation/DriverPaidRequestCompletionPrompt.tsx');
  const { useDriverPaidTripCompletion } = load('hooks/driver-navigation/useDriverPaidTripCompletion.ts');
  const model = { presentation: { hasValidTripCoordinates: true }, session: { foundation: { data: {
    trip: { ...trip, tripRequestId: published ? undefined : 'request' }, tripId: trip.id, bookings: [booking], driverId: 'driver', isScreenActive: true, isOnline: true,
    insets: { bottom: 20 }, completeTrip: () => { requests++; return { unwrap: () => task.promise }; },
    refetchTrip() {}, refetchBookings() {}, reconcileTripStatus: async () => null,
  }, refs: { autoCompletingTripRef: { current: false } }, mapState: {} }, completion: { presentCompletedTripFromServerSync: () => completed++ } } };
  const render = (blocked = false) => hooks.render(() => {
    const prompt = useDriverPaidTripCompletion({ model, blocked });
    return { prompt, tree: Panel({ prompt, insets: model.session.foundation.data.insets }) };
  });
  return { model, hooks, task, render, get requests() { return requests; }, get completed() { return completed; } };
}

test('navigation panel wires both decisions and yields to payment/SOS panels without a native modal', async () => {
  const f = panelFixture();
  const render = () => f.render().tree;
  const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
  render(); // The first effect starts automatic completion; the next render shows progress.
  let tree = render(); assert.equal(tree.props.visible, true); assert.equal(tree.props.inApp, true);
  assert.ok(tree.props.priority < 30, 'existing payment notice and confirmation overlays keep priority');
  const buttons = all(tree).filter(n => n.type === 'Button'); assert.equal(buttons.length, 2);
  buttons[0].props.onPress(); assert.equal(f.requests, 1);
  assert.ok(all(render()).filter(n => n.type === 'Button').every(n => n.props.disabled));
  f.task.resolve({ ...trip, status: 'completed' }); await new Promise(resolve => setImmediate(resolve));
  tree = render(); assert.equal(tree.props.visible, false); assert.equal(f.completed, 1); f.hooks.unmount();
});

test('published ride offers a choice only after the final passenger payment; continuing and reopening are manual', async () => {
  const f = panelFixture(true), data = f.model.session.foundation.data;
  const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
  const words = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(words).join(' ') : words(n?.props?.children ?? []);
  const buttons = () => all(f.render().tree).filter(n => n.type === 'Button');
  data.bookings = [booking, { ...booking, id: 'second', paymentMode: 'cash', paymentStatus: 'not_required' }];
  assert.equal(f.render().prompt.available, false); assert.equal(f.render().tree.props.visible, false);
  data.bookings[1] = { ...data.bookings[1], cashReceivedAt: 'date' };
  const first = f.render(); assert.equal(first.tree.props.visible, true); assert.equal(first.prompt.autoComplete, false);
  assert.match(words(first.tree), /Passagers déposés · Paiements réglés/);
  assert.equal(words(buttons()[0]).trim(), 'Terminer le trajet'); assert.equal(words(buttons()[1]).trim(), 'Continuer');
  assert.equal(f.requests, 0);
  buttons()[1].props.onPress(); assert.equal(f.render().tree.props.visible, false);
  for (let i = 0; i < 10; i++) f.render();
  assert.equal(f.requests, 0); assert.equal(f.render().prompt.available, true);
  f.render().prompt.reopen(); assert.equal(f.render().tree.props.visible, true);
  buttons()[0].props.onPress(); buttons()[0].props.onPress(); assert.equal(f.requests, 1);
  assert.ok(buttons().every(n => n.props.disabled));
  f.task.resolve({ ...data.trip, status: 'completed' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.completed, 1); assert.equal(f.render().prompt.available, false); f.hooks.unmount();
});

for (const flag of ['offlineTrip', 'offlineBookings', 'navigationReadsFailed', 'isPausingTrip', 'isRestartingTrip',
  'isRequestingDriverInterruption', 'isCancellingDriverInterruption', 'isAcceptingBooking', 'isRejectingBooking',
  'isCancellingPickupBypassBooking', 'isConfirmingPassengerInterruption', 'isRejectingPassengerInterruption']) {
  test(`published completion cannot use stale data or compete with ${flag}`, () => {
    const f = panelFixture(true); f.model.session.foundation.data[flag] = true;
    assert.equal(f.render().prompt.available, false); assert.equal(f.render().tree.props.visible, false);
    f.render().prompt.reopen(); assert.equal(f.requests, 0); f.hooks.unmount();
  });
}

test('completion waits for online, active, loaded and valid navigation, and yields to priority overlays', () => {
  const f = panelFixture(true), data = f.model.session.foundation.data;
  assert.equal(f.render(true).prompt.available, false);
  data.isOnline = false; assert.equal(f.render().prompt.available, false);
  data.isOnline = true; data.isScreenActive = false; assert.equal(f.render().prompt.available, false);
  data.isScreenActive = true; data.bookingsLoading = true; assert.equal(f.render().prompt.available, false);
  data.bookingsLoading = false; data.tripId = 'other'; assert.equal(f.render().prompt.available, false);
  data.tripId = trip.id;
  data.bookingsLoading = false; f.model.presentation.hasValidTripCoordinates = false; assert.equal(f.render().prompt.available, false);
  f.model.presentation.hasValidTripCoordinates = true; f.model.session.foundation.mapState.tripEndNotice = {};
  assert.equal(f.render().prompt.available, false);
  assert.equal(f.requests, 0); f.hooks.unmount();
});
