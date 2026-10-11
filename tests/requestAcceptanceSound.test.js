const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { readDriverPushData } = load('features/notifications/driverInvitation.ts');
const { isRemoteRequestAcceptanceAlert, isRemoteNearbyRequestAlert } = load('features/notifications/rideSound.ts');
const data = { type: 'trip_request_accepted', tripRequestId: 'synthetic-request', ringAlert: 'request-accepted-v1' };
const nearby = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1',
  driverId: '00000000-0000-4000-8000-000000000001', tripRequestId: '00000000-0000-4000-8000-000000000002' };

test('scheduled nearby alert keeps request navigation and never becomes an exclusive invitation', () => {
  for (const envelope of [nearby, { data: nearby }, { data: { dataString: JSON.stringify(nearby) } },
    { notification: { request: { content: { data: nearby } } } }]) {
    const parsed = readDriverPushData(envelope);
    assert.equal(isRemoteNearbyRequestAlert(parsed), true);
    assert.equal(load('features/notifications/driverInvitation.ts').parseDriverInvitation(parsed), null);
    assert.deepEqual(load('utils/notificationNavigation.ts').getNotificationHref(parsed), {
      pathname: '/request-details/[id]', params: { id: nearby.tripRequestId },
    });
  }
  for (const invalid of [undefined, {}, data, { ...nearby, ringAlert: undefined },
    { ...nearby, type: 'message' }, { ...nearby, driverId: 'bad' }, { ...nearby, tripRequestId: '../auth' }])
    assert.equal(isRemoteNearbyRequestAlert(invalid), false);
});

test('acceptance alert is recognized in each Expo envelope without becoming a driver invitation', () => {
  for (const envelope of [data, { data }, { data: { dataString: JSON.stringify(data) } },
    { notification: { request: { content: { data } } } }]) {
    const parsed = readDriverPushData(envelope);
    assert.equal(isRemoteRequestAcceptanceAlert(parsed), true);
    assert.equal(load('features/notifications/driverInvitation.ts').parseDriverInvitation(parsed), null);
  }
  for (const invalid of [undefined, {}, { ...data, type: 'message' }, { ...data, ringAlert: undefined }])
    assert.equal(isRemoteRequestAcceptanceAlert(invalid), false);
});

test('background task does not replay the remote acceptance on the default channel', async () => {
  let task; const calls = [];
  loader({
    'expo-constants': { __esModule: true, default: { appOwnership: 'standalone' } },
    'expo-notifications': {},
    'expo-task-manager': { defineTask: (_name, handler) => { task = handler; } },
    './pushNotifications': { handleIncomingNotification: async () => calls.push('standard') },
    './driverNotifications': { displayDriverInvitation: async () => calls.push('driver') },
  })('services/backgroundNotificationTask.ts');
  await task({ data: { notification: { request: { content: { title: 'Acceptée', data } } } } });
  await task({ data: { data: { dataString: JSON.stringify(data) } } });
  await task({ data: { notification: { request: { content: { title: 'Programmée', data: nearby } } } } });
  await task({ data: { data: { dataString: JSON.stringify(nearby) } } });
  assert.deepEqual(calls, []);
  await task({ data: { notification: { request: { content: { title: 'Message', data: { type: 'message' } } } } } });
  assert.deepEqual(calls, ['standard']);
});

test('acceptance opens the request or created trip without an accept/decline action', () => {
  const { getNotificationHref } = load('utils/notificationNavigation.ts');
  assert.deepEqual(getNotificationHref(data), { pathname: '/request-details/[id]', params: { id: 'synthetic-request' } });
  assert.equal(getNotificationHref({ ...data, tripId: 'synthetic-trip' }), '/trip/synthetic-trip');
});

test('foreground scheduled alerts keep a visible banner but no ringtone on iOS and Android', async () => {
  for (const platform of ['ios', 'android']) {
    const hooks = hookHarness(); let handler;
    let user = { id: nearby.driverId, role: 'driver' };
    const loadComponent = loader({
      react: hooks.react,
      'expo-router': { usePathname: () => '/home', useRouter: () => ({}) },
      'react-native': { Platform: { OS: platform }, InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) },
        Linking: { addEventListener: () => ({ remove() {} }) } },
      'expo-notifications': { setNotificationHandler: value => { handler = value; },
        addNotificationReceivedListener: () => ({ remove() {} }), addNotificationResponseReceivedListener: () => ({ remove() {} }) },
      '../hooks/notifications/useOverdueRequestNotification': { useOverdueRequestNotification: () => ({}) },
      '@/hooks/notifications/useDriverNotifications': { useDriverNotifications() {} },
      '@/components/ui/DialogProvider': { useDialog: () => ({}) },
      '@/services/pushNotifications': {}, '@/services/backgroundNotificationTask': {},
      '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: user }) },
      '@/store/api/tripRequestApi': { useGetMyTripRequestsQuery: () => ({ data: [] }), useReleaseOverdueDriverMutation: () => [() => {}] },
      '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: () => true },
      '@/store/selectors': { selectIsAuthenticated() {} }, '@/store/api/baseApi': {},
    });
    hooks.render(() => loadComponent('components/NotificationHandler.tsx').NotificationHandler());
    const notification = data => ({ request: { content: { data } } });
    const result = await handler.handleNotification(notification(nearby));
    assert.equal(result.shouldPlaySound, false); assert.equal(result.shouldShowBanner, true);
    assert.equal((await handler.handleNotification(notification({ type: 'message' }))).shouldPlaySound, true);
    user = { ...user, role: 'passenger' };
    hooks.render(() => loadComponent('components/NotificationHandler.tsx').NotificationHandler());
    for (const type of ['trip_request', 'new_trip_request', 'driver_dispatch_offer', 'trip_request_nearby']) {
      const hidden = await handler.handleNotification(notification({ ...nearby, type }));
      assert.equal(Object.values(hidden).every(value => value === false), true, type);
    }
    assert.equal((await handler.handleNotification(notification({ type: 'trip_request_accepted' }))).shouldShowBanner, true);
    hooks.unmount();
  }
});
