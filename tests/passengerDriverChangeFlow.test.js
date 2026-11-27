const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const request = { id: 'order', passengerId: 'passenger', status: 'driver_selected',
  selectedDriverId: 'driver', selectedAt: '2026-11-24T10:00:00.000Z', tripId: 'trip' };
const trip = { id: 'trip', driverId: 'driver', tripRequestId: request.id, status: 'upcoming',
  departureTime: '2099-01-01T10:00:00Z', price: 5000 };
const booking = { id: 'booking', passengerId: 'passenger', tripId: trip.id, status: 'accepted', numberOfSeats: 1 };
const reopened = { ...request, status: 'pending', selectedDriverId: null, selectedAt: null, tripId: null };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node)
  ? [node, ...nodes(node.props.children)] : [];
const native = { ...Object.fromEntries(['View', 'Text', 'Pressable', 'TouchableOpacity', 'ActivityIndicator'].map(n => [n, n])),
  StyleSheet: { create: value => value } };

function fixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const env = { userId: 'passenger', online: true, version: 1, request, isError: false };
  const calls = [], effects = [], reads = [];
  let dialog, resolve, reject;
  const loaded = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    'expo-router': { useRouter: () => ({ replace: target => effects.push(['navigate', target]) }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => { dialog = value; } }) },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: env.userId } } }),
      useAppDispatch: () => action => effects.push(action) },
    '@/store/api/requestDriverApi': { useChangeRequestDriverMutation: () => [body => {
      calls.push(body); return { unwrap: () => new Promise((ok, fail) => { resolve = ok; reject = fail; }) };
    }, { isLoading: false }] },
    '@/store/api/tripRequestApi': {
      tripRequestApi: { util: { upsertQueryData: (...args) => ['cache', ...args], invalidateTags: tags => ['invalidate', tags] } },
      useGetTripRequestByIdQuery: (id, options) => { reads.push({ id, options }); return { currentData: env.request, isError: env.isError }; },
    },
    '@/hooks/useDisplayReads': { displayReadOptions: enabled => ({ skip: !enabled }), useDisplayReadsEnabled: enabled => enabled && env.online },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
  })('features/request-detail/ChangeRequestDriverButton.tsx');
  const props = { request, booking, trip, onPendingChange: value => effects.push(['busy', value]) };
  return { env, props, effects, calls, reads, hooks, loaded,
    render: () => nodes(hooks.render(() => loaded.ChangeRequestDriverButton(props))),
    dialog: () => dialog, resolve: value => resolve(value), reject: () => reject(new Error('timeout')) };
}

test('passenger confirms once, keeps the order and opens its new search instead of cancelling it', async t => {
  const f = fixture(t);
  f.render().find(n => n.type === 'Pressable').props.onPress();
  assert.match(f.dialog().message, /commande est conservée/);
  assert.match(f.dialog().message, /ne vous sera plus affecté/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.dialog().actions[0].label, 'Garder ce conducteur');
  const confirm = f.dialog().actions[1].onPress;
  const pending = confirm(); await confirm();
  assert.deepEqual(f.calls, [{ id: request.id, selectedDriverId: request.selectedDriverId, selectedAt: request.selectedAt }]);
  f.resolve(reopened); await pending;
  assert.deepEqual(f.effects, [
    ['busy', true], ['cache', 'getTripRequestById', request.id, reopened],
    ['navigate', { pathname: '/request/[id]', params: { id: request.id } }],
    ['invalidate', ['Booking', 'Trip']], ['busy', false],
  ]);
});

test('the visible change action suggests another driver after 15 minutes, but never sends automatically', async t => {
  const now = Date.parse(request.selectedAt);
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const f = fixture(t);
  f.props.request = { ...request, immediateDispatch: true };
  const hasNotice = tree => tree.some(n => n.type === 'Text' && n.props.children === 'Toujours en attente ?');
  assert.equal(hasNotice(f.render()), false);
  assert.ok(f.render().some(n => n.props.accessibilityLabel === 'Changer de conducteur'));
  t.mock.timers.tick(15 * 60_000);
  assert.equal(hasNotice(f.render()), true);
  assert.equal(f.dialog(), undefined); assert.deepEqual(f.calls, []);
  f.render().find(n => n.type === 'Pressable').props.onPress();
  assert.match(f.dialog().message, /recherche d’un autre conducteur reprendra/);
  const pending = f.dialog().actions[1].onPress();
  f.resolve(reopened); await pending;
  assert.equal(f.calls.length, 1);
  f.props.request = reopened;
  assert.deepEqual(f.render(), [], 'advice and action disappear as soon as the assignment is released');
});

test('scheduled orders keep the manual action without the immediate-order wait suggestion', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse(request.selectedAt) + 60 * 60_000 });
  const f = fixture(t); f.props.request = { ...request, immediateDispatch: false };
  assert.ok(f.render().some(n => n.props.accessibilityLabel === 'Changer de conducteur'));
  assert.ok(!f.render().some(n => n.type === 'Text' && n.props.children === 'Toujours en attente ?'));
});

test('compact change button keeps the same confirmation and wait protection without the long caption', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse(request.selectedAt) });
  const f = fixture(t); f.props.compact = true; f.props.request = { ...request, immediateDispatch: true };
  assert.ok(!f.render().some(n => n.type === 'Text' && n.props.children === 'Votre commande est conservée.'));
  t.mock.timers.tick(15 * 60_000);
  assert.ok(f.render().some(n => n.type === 'Text' && /Plus de 15 min/.test(n.props.children)));
  assert.equal(f.calls.length, 0);
  f.render().find(n => n.type === 'Pressable').props.onPress();
  assert.match(f.dialog().message, /commande est conservée/);
  const pending = f.dialog().actions[1].onPress(); f.resolve(reopened); await pending;
  assert.equal(f.calls.length, 1);
});

for (const scenario of ['account', 'session', 'revision', 'selection', 'order', 'boarding', 'payment', 'closed-trip', 'offline', 'inactive', 'unmount']) {
  test(`an old passenger confirmation cannot change the driver after ${scenario}`, async t => {
    const f = fixture(t); f.render().find(n => n.type === 'Pressable').props.onPress();
    if (scenario === 'account') f.env.userId = 'other';
    if (scenario === 'session') f.env.version++;
    if (scenario === 'revision') f.props.request = { ...request, selectedAt: 'new' };
    if (scenario === 'selection') f.props.request = { ...request, selectedDriverId: 'other' };
    if (scenario === 'order') f.props.request = { ...request, id: 'other' };
    if (scenario === 'boarding') f.props.booking = { ...booking, pickedUp: true };
    if (scenario === 'payment') f.props.booking = { ...booking, paymentStatus: 'initiated' };
    if (scenario === 'closed-trip') f.props.trip = { ...trip, status: 'cancelled' };
    if (scenario === 'offline') f.env.online = false;
    if (scenario === 'inactive') f.props.disabled = true;
    if (scenario === 'unmount') f.hooks.unmount(); else f.render();
    await f.dialog().actions[1].onPress();
    assert.deepEqual(f.calls, []);
  });
}

test('a timeout keeps an explicit error and never claims a new search or resends automatically', async t => {
  const f = fixture(t); f.render().find(n => n.type === 'Pressable').props.onPress();
  const pending = f.dialog().actions[1].onPress(); f.reject(); await pending;
  assert.ok(f.render().some(n => n.type === 'Text' && /Changement non confirmé/.test(n.props.children)));
  assert.deepEqual(f.effects, [['busy', true], ['busy', false]]);
  assert.equal(f.calls.length, 1);
});

test('late success after logout cannot overwrite cache or redirect another account', async t => {
  const f = fixture(t); f.render().find(n => n.type === 'Pressable').props.onPress();
  const pending = f.dialog().actions[1].onPress(); f.env.version++;
  f.resolve(reopened); await pending;
  assert.deepEqual(f.effects, [['busy', true]]);
});

test('pickup action reads only the current order while online and rejects a different assignment', t => {
  const f = fixture(t);
  const props = { requestId: request.id, booking, trip, active: true };
  const render = () => f.hooks.render(() => f.loaded.PickupDriverChange(props));
  assert.equal(render().props.request, request);
  f.env.request = { ...request, tripId: 'other' }; assert.equal(render().props.request, undefined);
  f.env.request = { ...request, id: 'other' }; assert.equal(render().props.request, undefined);
  f.env.request = request; f.env.isError = true; assert.equal(render().props.disabled, true);
  f.env.online = false; render(); assert.equal(f.reads.at(-1).options.skip, true);
  f.env.online = true; props.active = false; render(); assert.equal(f.reads.at(-1).options.skip, true);
});

function footerFixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const effects = [];
  const { TripDetailActionsFooter } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/request-detail/ChangeRequestDriverButton': { PickupDriverChange: 'ChangeDriver' },
  })('features/trip-detail/TripDetailActionsFooter.tsx');
  const props = {
    data: { trip, isTripDriver: false, isScreenActive: true, insets: { bottom: 0 }, returnToRequest: id => effects.push(['returnToRequest', id]) },
    activity: { activeBooking: booking }, access: { availableSeats: 1, activeBookingStatus: { label: 'Acceptée' } },
    editor: {}, pricing: { canPayActiveBooking: true }, payment: {},
    bookingState: { setIsDetailMapReady: value => effects.push(['map', value]), setMapModalVisible: value => effects.push(['mapModal', value]) },
    bookingSubmission: {}, bookingLocation: {},
  };
  return { props, effects, render: () => nodes(hooks.render(() => TripDetailActionsFooter(props))) };
}

test('accepted upcoming order exposes change in trip detail and locks competing actions during submission', t => {
  const f = footerFixture(t);
  const action = f.render().find(n => n.type === 'ChangeDriver');
  assert.equal(action.props.active, true); assert.equal(action.props.requestId, request.id);
  assert.equal(action.props.booking, booking); assert.equal(action.props.trip, trip);
  action.props.onPendingChange(true);
  assert.ok(f.render().filter(n => n.type === 'TouchableOpacity').every(n => n.props.disabled));
  action.props.onChanged(request.id);
  assert.deepEqual(f.effects, [['returnToRequest', request.id]]);
  action.props.onPendingChange(false);
  assert.ok(f.render().filter(n => n.type === 'TouchableOpacity').every(n => !n.props.disabled));
});

test('driver change is not a cancellation action for published trips, boarded passengers or closed rides', t => {
  const f = footerFixture(t);
  for (const patch of [{ tripRequestId: null }, { status: 'cancelled' }, { status: 'completed' }]) {
    f.props.data.trip = { ...trip, ...patch };
    assert.ok(!f.render().some(n => n.type === 'ChangeDriver'));
  }
  f.props.data.trip = trip;
  f.props.activity.activeBooking = { ...booking, pickedUp: true };
  assert.ok(!f.render().some(n => n.type === 'ChangeDriver'));
  f.props.activity.activeBooking = booking; f.props.data.isTripDriver = true;
  assert.ok(!f.render().some(n => n.type === 'ChangeDriver'));
});

test('real RTK endpoint sends the selection revision and reconciles trip/booking on ambiguous failure', async t => {
  const { createApi } = require('@reduxjs/toolkit/query');
  const { configureStore } = require('@reduxjs/toolkit');
  const calls = []; let timeout = false;
  const baseApi = createApi({ reducerPath: 'api',
    tagTypes: ['TripRequest', 'MyTripRequests', 'AccountActivity', 'Notification', 'Trip', 'Booking'],
    baseQuery: async args => {
      calls.push(args);
      return args.method ? timeout ? { error: { status: 'TIMEOUT_ERROR' } } : { data: reopened } : { data: {} };
    },
    endpoints: build => ({
      trip: build.query({ query: () => ({ url: '/trips/trip' }), providesTags: ['Trip'] }),
      booking: build.query({ query: () => ({ url: '/bookings/booking' }), providesTags: ['Booking'] }),
    }),
  });
  const { requestDriverApi: api } = loader({ './baseApi': { baseApi },
    './trip-request/requestMapper': { mapServerTripRequestToClient: value => value },
  })('store/api/requestDriverApi.ts');
  const store = configureStore({ reducer: { api: api.reducer }, middleware: getDefault => getDefault().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  await store.dispatch(api.endpoints.trip.initiate()); await store.dispatch(api.endpoints.booking.initiate());
  const payload = { id: request.id, selectedDriverId: request.selectedDriverId, selectedAt: request.selectedAt };
  assert.deepEqual(await store.dispatch(api.endpoints.changeRequestDriver.initiate(payload)).unwrap(), reopened);
  assert.deepEqual(calls[2], { url: '/trip-requests/order/change-driver', method: 'PUT', timeout: 15000,
    body: { selectedDriverId: request.selectedDriverId, selectedAt: request.selectedAt } });
  // A successful UI transition owns the refresh after releasing the old screen.
  assert.equal(calls.length, 3);
  timeout = true;
  await assert.rejects(store.dispatch(api.endpoints.changeRequestDriver.initiate(payload)).unwrap());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice(4).map(call => call.url).sort(), ['/bookings/booking', '/trips/trip']);
  assert.equal(calls.filter(call => call.method).length, 2, 'no automatic mutation replay');
});
