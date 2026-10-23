const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = '00000000-0000-4000-8000-000000000001';
const driverId = '00000000-0000-4000-8000-000000000002';
const tripId = '00000000-0000-4000-8000-000000000003';
const booking = { id, tripId, status: 'pending', trip: { id: tripId, driverId, status: 'upcoming' } };
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };
function fixture() {
  const hooks = hookHarness(), routes = [], dismissals = [], queries = [];
  const state = { params: { id, driverId }, userId: driverId, active: true,
    query: { currentData: booking, isFetching: false, isError: false, refetch() {} } };
  const router = { replace: path => routes.push(path) };
  const { IncomingBookingRedirect } = loader({ react: hooks.react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    'expo-router': { useLocalSearchParams: () => state.params, useRouter: () => router },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: state.userId } } }) },
    '@/store/api/bookingApi': { useGetBookingByIdQuery: (key, options) => { queries.push({ key, ...options }); return state.query; } },
    '@/services/driverNotifications': { dismissDriverInvitation: async invitation => dismissals.push(invitation) },
  })('features/notifications/IncomingBookingRedirect.tsx');
  return { state, routes, dismissals, queries, hooks, render: () => hooks.render(IncomingBookingRedirect) };
}
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('') : words(tree?.props?.children ?? '');

test('booking links open the existing passenger list directly, without an acceptance/success screen', () => {
  for (const status of ['pending', 'accepted', 'rejected', 'cancelled']) {
    const f = fixture(); f.state.query.currentData = { ...booking, status };
    const tree = f.render(); f.render();
    assert.deepEqual(f.routes, [{ pathname: '/trip/manage/[id]', params: { id: tripId, bookingId: id, section: 'passengers' } }]);
    assert.equal(f.dismissals.length, status === 'pending' ? 0 : 1);
    assert.doesNotMatch(words(tree), /Un passager vous attend|C’est confirmé|Voir les détails|Accepter|Refuser/);
    f.hooks.unmount();
  }
});

test('ongoing trips go directly to navigation; finished trips keep their management/history screen', () => {
  for (const status of ['ongoing', 'completed', 'cancelled']) {
    const f = fixture(); f.state.query.currentData = { ...booking, trip: { ...booking.trip, status } };
    f.render(); assert.equal(f.routes[0].pathname, status === 'ongoing' ? '/trip/navigate/[id]' : '/trip/manage/[id]');
    f.hooks.unmount();
  }
});

test('loading, stale query data, network failure and wrong recipients never navigate or answer', () => {
  for (const patch of [{ isFetching: true }, { isError: true }, { currentData: undefined, data: booking },
    { currentData: { ...booking, id: 'another' } }, { currentData: { ...booking, tripId: 'another' } },
    { currentData: { ...booking, trip: { ...booking.trip, driverId: 'another' } } }]) {
    const f = fixture(); Object.assign(f.state.query, patch); f.render();
    assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []); f.hooks.unmount();
  }
  for (const patch of [{ active: false }, { userId: 'another' }, { params: { id: '../auth', driverId } }]) {
    const f = fixture(); Object.assign(f.state, patch); f.render();
    assert.equal(f.queries[0].skip, true); assert.deepEqual(f.routes, []); f.hooks.unmount();
  }
});

test('a successful retry routes once and no mutation is inferred from URL parameters', () => {
  const f = fixture(); f.state.query.isError = true; f.state.params.accept = 'true';
  const tree = f.render(); assert.match(words(tree), /Réessayer/); assert.deepEqual(f.routes, []);
  f.state.query.isError = false; f.render(); f.render(); assert.equal(f.routes.length, 1); f.hooks.unmount();
});

test('foreground booking delivery does not open a screen; pressing it opens the read-only resolver', async () => {
  const hooks = hookHarness(), routes = [], actions = [];
  let nativeListener, expoListener;
  const payload = { type: 'new_booking', actionProtocol: 'driver-v1', bookingId: id, driverId };
  const router = { navigate: path => routes.push(path) };
  const { useDriverNotifications } = loader({ react: hooks.react,
    './useRideRealtime': { useRideRealtime() {} },
    '@/services/iosFirebaseMessaging': { subscribeIosFirebaseMessages: () => () => {} },
    'expo-router': { useRouter: () => router },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-notifications': { addNotificationReceivedListener: fn => { expoListener = fn; return { remove() {} }; },
      addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: async () => null },
    '@notifee/react-native': { __esModule: true, default: { onForegroundEvent: fn => { nativeListener = fn; return () => {}; },
      getInitialNotification: async () => null }, EventType: { DELIVERED: 3, PRESS: 1, ACTION_PRESS: 2 } },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {}, displayDriverInvitation: async () => {}, silenceDriverInvitations: async () => {} },
    '@/services/driverNotificationResponse': { respondToDriverNotification: async (...args) => actions.push(args) },
  })('hooks/notifications/useDriverNotifications.ts');
  hooks.render(() => useDriverNotifications(driverId, true));
  expoListener({ request: { content: { data: payload } } });
  nativeListener({ type: 3, detail: { notification: { data: payload } } });
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(routes, []); assert.deepEqual(actions, []);
  nativeListener({ type: 1, detail: { notification: { data: payload }, pressAction: { id: 'default' } } });
  assert.equal(routes.length, 1); assert.equal(routes[0].pathname, '/incoming-driver');
  assert.equal(routes[0].params.kind, 'booking'); assert.deepEqual(actions, []);
  nativeListener({ type: 2, detail: { notification: { data: payload }, pressAction: { id: 'driver-decline' } } });
  assert.equal(actions.length, 1); assert.equal(routes.length, 1, 'native response adds no confirmation page');
  hooks.unmount();
});

test('foreground nearby broadcasts reach the banner handler only for the driver; navigation requires a tap', async () => {
  const hooks = hookHarness(), routes = [], displayed = [];
  let nativeListener, expoListener;
  const payload = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
    tripRequestId: id, driverId, ringUntil: new Date(Date.now() + 30000).toISOString(), dataString: 'Un client près de vous' };
  const router = { navigate: path => routes.push(path) };
  const { useDriverNotifications } = loader({ react: hooks.react,
    './useRideRealtime': { useRideRealtime() {} },
    '@/services/iosFirebaseMessaging': { subscribeIosFirebaseMessages: () => () => {} },
    'expo-router': { useRouter: () => router },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-notifications': { addNotificationReceivedListener: fn => { expoListener = fn; return { remove() {} }; },
      addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: async () => null },
    '@notifee/react-native': { __esModule: true, default: { onForegroundEvent: fn => { nativeListener = fn; return () => {}; },
      getInitialNotification: async () => null }, EventType: { DELIVERED: 3, PRESS: 1, ACTION_PRESS: 2 } },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {},
      displayDriverInvitation: async data => displayed.push(data), silenceDriverInvitations: async () => {} },
    '@/services/driverNotificationResponse': { respondToDriverNotification: async () => assert.fail('no automatic decision') },
  })('hooks/notifications/useDriverNotifications.ts');
  hooks.render(() => useDriverNotifications(driverId, true));
  expoListener({ data: payload });
  nativeListener({ type: 3, detail: { notification: { data: payload } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(displayed, [payload]); assert.deepEqual(routes, []);
  nativeListener({ type: 1, detail: { notification: { data: payload }, pressAction: { id: 'default' } } });
  assert.deepEqual(routes, [{ pathname: '/request-details/[id]', params: { id } }]);
  assert.deepEqual(displayed, [payload, payload], 'body tap requests the idempotent foreground sound handoff');
  expoListener({ data: { ...payload, driverId: '00000000-0000-4000-8000-000000000099' } });
  hooks.render(() => useDriverNotifications(driverId, false));
  expoListener({ data: payload });
  assert.equal(displayed.length, 2, 'no other-driver or passenger alerts');
  hooks.unmount();
});
