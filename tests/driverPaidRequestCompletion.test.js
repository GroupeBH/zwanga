const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getPaidRequestCompletionKey: eligible } = loader()('features/driver-navigation/paidRequestCompletion.ts');
const trip = { id: 'trip', driverId: 'driver', tripRequestId: 'request', status: 'ongoing' };
const booking = { id: 'booking', tripId: 'trip', status: 'completed', paymentMode: 'points', paymentStatus: 'succeeded', paymentAmount: 3500 };
const gate = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('only own ongoing requested rides with all passengers completed and paid are eligible', () => {
  assert.equal(eligible(trip, [booking], 'driver'), 'driver:trip');
  for (const patch of [{ tripRequestId: null }, { status: 'completed' }, { status: 'cancelled' }, { driverId: 'other' }]) {
    assert.equal(eligible({ ...trip, ...patch }, [booking], 'driver'), null);
  }
  for (const rows of [undefined, [], [{ ...booking, tripId: 'other' }], [{ ...booking, status: 'accepted' }],
    [booking, { ...booking, id: 'onboard', status: 'accepted' }], [booking, { ...booking, id: 'waiting', status: 'pending' }]]) {
    assert.equal(eligible(trip, rows, 'driver'), null);
  }
  assert.equal(eligible(trip, [booking, { ...booking, status: 'cancelled' }], 'driver'), 'driver:trip');
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
test('completion is single-flight, awaits server success and reuses the completed trip flow', async () => {
  const f = fixture(), action = f.render().confirm;
  const first = action(); await action();
  assert.equal(f.render().busy, true); assert.equal(f.events.length, 1);
  f.render().dismiss(); assert.equal(f.render().visible, true, 'cannot dismiss an in-flight mutation');
  f.task.resolve({ ...trip, status: 'completed' }); await first;
  assert.deepEqual(f.events.map(e => e[0]), ['complete', 'done', 'refresh']);
  assert.equal(f.render().visible, false); assert.equal(f.params.completingRef.current, false);
  f.hooks.unmount();
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

test('navigation panel wires both decisions and yields to payment/SOS panels without a native modal', async () => {
  const React = require('react');
  const hooks = hookHarness(), task = gate(); let requests = 0, completed = 0;
  const { DriverPaidRequestCompletionPrompt: Panel } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', ScrollView: 'Scroll',
      StyleSheet: { create: value => value, hairlineWidth: 1 } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '../screen-styles/app/trip/navigate/detail/index': { styles: {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
  })('features/driver-navigation/DriverPaidRequestCompletionPrompt.tsx');
  const model = { session: { foundation: { data: { trip, bookings: [booking], driverId: 'driver', isScreenActive: true,
    insets: { bottom: 20 }, completeTrip: () => { requests++; return { unwrap: () => task.promise }; },
    refetchTrip() {}, refetchBookings() {}, reconcileTripStatus: async () => null,
  }, refs: { autoCompletingTripRef: { current: false } }, mapState: {} }, completion: { presentCompletedTripFromServerSync: () => completed++ } } };
  const render = () => hooks.render(() => Panel({ model, blocked: false }));
  const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
  let tree = render(); assert.equal(tree.props.visible, true); assert.equal(tree.props.inApp, true);
  assert.ok(tree.props.priority < 30, 'existing payment notice and confirmation overlays keep priority');
  const buttons = all(tree).filter(n => n.type === 'Button'); assert.equal(buttons.length, 2);
  buttons[0].props.onPress(); assert.equal(requests, 1);
  assert.ok(all(render()).filter(n => n.type === 'Button').every(n => n.props.disabled));
  task.resolve({ ...trip, status: 'completed' }); await new Promise(resolve => setImmediate(resolve));
  tree = render(); assert.equal(tree.props.visible, false); assert.equal(completed, 1); hooks.unmount();
});
