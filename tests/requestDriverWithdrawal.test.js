const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { readFileSync } = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { canWithdrawRequestDriver } = loader()('features/request-detail/requestDriverChangePolicy.ts');
const request = { id: 'order', passengerId: 'passenger', status: 'driver_selected', selectedDriverId: 'driver',
  selectedAt: '2026-11-06T12:00:00.000Z', tripId: 'trip' };
const trip = { id: 'trip', driverId: 'driver', status: 'ongoing', tripRequestId: 'order' };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted' };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node)
  ? [node, ...nodes(node.props.children)] : [];

test('driver can withdraw the accepted order before pickup, with or without a created trip', () => {
  assert.equal(canWithdrawRequestDriver({ ...request, tripId: null }, 'driver'), true);
  assert.equal(canWithdrawRequestDriver(request, 'driver', trip, [booking]), true);
  assert.equal(canWithdrawRequestDriver(request, 'driver', { ...trip, status: 'upcoming' }, [booking]), true);
  assert.equal(canWithdrawRequestDriver(request, 'driver', trip, [booking, { ...booking, status: 'cancelled' }]), true);
  for (const id of [undefined, 'other', 'passenger']) assert.equal(canWithdrawRequestDriver(request, id, trip, [booking]), false);
  for (const patch of [{ status: 'pending' }, { selectedAt: null }, { selectedDriverId: 'other' }])
    assert.equal(canWithdrawRequestDriver({ ...request, ...patch }, 'driver', trip, [booking]), false);
  for (const patch of [{ id: 'other' }, { driverId: 'other' }, { status: 'completed' }, { status: 'cancelled' }])
    assert.equal(canWithdrawRequestDriver(request, 'driver', { ...trip, ...patch }, [booking]), false);
  assert.equal(canWithdrawRequestDriver(request, 'driver', trip), false);
  assert.equal(canWithdrawRequestDriver(request, 'driver', trip, []), false);
  for (const patch of [{ pickedUp: true }, { pickedUpConfirmedByPassenger: true }, { status: 'completed' },
    { paymentStatus: 'initiated' }, { paidAt: 'date' }, { mixedTokenAmount: 10 }])
    assert.equal(canWithdrawRequestDriver(request, 'driver', trip, [{ ...booking, ...patch }]), false);
});

function fixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const env = { userId: 'driver', online: true, version: 1, bookings: [booking] };
  const calls = [], effects = [], reads = [];
  let dialog, resolve, reject;
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'ActivityIndicator'].map(name => [name, name]));
  native.StyleSheet = { create: value => value };
  const component = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => { dialog = value; } }) },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: env.userId } } }),
      useAppDispatch: () => action => effects.push(['cache', action]) },
    '@/store/api/requestDriverApi': { useWithdrawRequestDriverMutation: () => [body => {
      calls.push(body); return { unwrap: () => new Promise((ok, fail) => { resolve = ok; reject = fail; }) };
    }, { isLoading: false }] },
    '@/store/api/tripRequestApi': { tripRequestApi: { util: { invalidateTags: tags => tags } } },
    '@/store/api/bookingApi': { useGetTripBookingsQuery: (id, options) => {
      reads.push({ id, options }); return { currentData: env.bookings, isError: false };
    } },
    '@/hooks/useDisplayReads': { displayReadOptions: enabled => ({ skip: !enabled }), useDisplayReadsEnabled: enabled => enabled && env.online },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/utils/errorHelpers': { getApiErrorMessage: (_cause, fallback) => fallback },
  })('features/request-detail/WithdrawRequestDriverButton.tsx').WithdrawRequestDriverButton;
  const props = { request, trip, onWithdrawn: () => effects.push(['exit']), onPendingChange: value => effects.push(['busy', value]) };
  const render = () => nodes(hooks.render(() => component(props)));
  return { env, props, hooks, render, calls, effects, reads, dialog: () => dialog,
    resolve: value => resolve(value), reject: () => reject(new Error('network timeout')) };
}

test('withdrawal explains relaunch, confirms once, blocks double taps and exits before invalidation', async t => {
  const f = fixture(t);
  f.render().find(n => n.type === 'Pressable').props.onPress();
  assert.match(f.dialog().message, /commande sera relancée/);
  assert.equal(f.calls.length, 0);
  const confirm = f.dialog().actions[1].onPress;
  const pending = confirm(); await confirm();
  assert.deepEqual(f.calls, [{ id: request.id, selectedAt: request.selectedAt }]);
  f.resolve({ id: request.id, withdrawn: true }); await pending;
  assert.deepEqual(f.effects.map(e => e[0]), ['busy', 'exit', 'cache', 'busy']);
  assert.equal(f.effects.at(-1)[1], false);
});

for (const scenario of ['account', 'revision', 'request', 'boarding', 'offline', 'unmount']) {
  test(`old driver confirmation cannot act after ${scenario} changes`, async t => {
    const f = fixture(t);
    f.render().find(n => n.type === 'Pressable').props.onPress();
    if (scenario === 'account') f.env.version++;
    if (scenario === 'revision') f.props.request = { ...request, selectedAt: 'new' };
    if (scenario === 'request') f.props.request = { ...request, id: 'another' };
    if (scenario === 'boarding') f.env.bookings = [{ ...booking, pickedUp: true }];
    if (scenario === 'offline') f.env.online = false;
    if (scenario === 'unmount') f.hooks.unmount(); else f.render();
    await f.dialog().actions[1].onPress();
    assert.equal(f.calls.length, 0);
  });
}

test('network failure remains explicit and never exits or replays withdrawal', async t => {
  const f = fixture(t); f.render().find(n => n.type === 'Pressable').props.onPress();
  const pending = f.dialog().actions[1].onPress(); f.reject(); await pending;
  assert.ok(f.render().some(n => n.type === 'Text' && /Annulation non confirmée/.test(n.props.children)));
  assert.equal(f.calls.length, 1);
  assert.ok(!f.effects.some(e => e[0] === 'exit' || e[0] === 'cache'));
});

test('late response after logout cannot redirect or invalidate another account', async t => {
  const f = fixture(t); f.render().find(n => n.type === 'Pressable').props.onPress();
  const pending = f.dialog().actions[1].onPress(); f.env.version++;
  f.resolve({ id: request.id, withdrawn: true }); await pending;
  assert.deepEqual(f.effects.map(e => e[0]), ['busy']);
});

test('navigation reuses existing bookings and disables reads outside the active screen', t => {
  const f = fixture(t); f.props.bookings = [booking]; f.render();
  assert.equal(f.reads.at(-1).options.skip, true);
  f.props.bookings = undefined; f.props.disabled = true; f.render();
  assert.equal(f.reads.at(-1).options.skip, true);
});

test('both driver surfaces expose the dedicated action and passenger change stays in the fixed footer', () => {
  const driver = readFileSync('features/request-detail/RequestDriverCourse.tsx', 'utf8');
  assert.match(driver, /<WithdrawRequestDriverButton/); assert.doesNotMatch(driver, /Gérer ou annuler/);
  assert.match(readFileSync('features/manage-trip/ManageTripActionsFooter.tsx', 'utf8'), /<TripDriverWithdrawal/);
  const navigation = readFileSync('features/driver-navigation/DriverNavigationTopPanel.tsx', 'utf8');
  assert.match(navigation, /onWithdrawn=\{model.session.foundation.exitActions.navigateHomeSafely\}/);
  const passenger = readFileSync('features/request-detail/RequestPassengerTicket.tsx', 'utf8');
  assert.equal((passenger.match(/<ChangeRequestDriverButton/g) ?? []).length, 1);
  assert.match(passenger.slice(passenger.indexOf('export function RequestPassengerActions')), /<ChangeRequestDriverButton/);
  assert.match(passenger, /booking=\{model.passengerBooking\}/);
});
