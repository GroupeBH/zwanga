const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture(t, os = 'ios') {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const hooks = hookHarness(), updates = hookHarness();
  const states = new Set(), foreground = new Set(), expo = new Set();
  const io = { state: 'background', ready: false, user: undefined, version: 1,
    routes: [], links: [], dialogs: [], actions: [], failLink: false };
  let background;
  const router = { push: href => io.routes.push(href), replace: href => io.routes.push(href) };
  const dispatch = action => io.actions.push(action);
  const noOverdue = async () => false;
  const showDialog = value => io.dialogs.push(value);
  const notifee = { onBackgroundEvent: fn => { background = fn; },
    onForegroundEvent: fn => { foreground.add(fn); return () => foreground.delete(fn); } };
  const native = { Platform: { OS: os },
    AppState: { get currentState() { return io.state; }, addEventListener: (_type, fn) => {
      states.add(fn); return { remove: () => states.delete(fn) };
    } },
    Linking: { addEventListener: () => ({ remove() {} }), openURL: async url => {
      io.links.push(url); if (io.failLink) throw Error('native link unavailable');
    } }, InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) } };
  const common = {
    'expo-router': { useRouter: () => router, usePathname: () => '/(tabs)',
      useRootNavigationState: () => io.ready ? { key: 'root' } : undefined },
    'react-native': native,
    '@notifee/react-native': { __esModule: true, default: notifee,
      EventType: { PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3, DISMISSED: 4 } },
    'expo-notifications': { setNotificationHandler() {},
      addNotificationReceivedListener: () => ({ remove() {} }),
      addNotificationResponseReceivedListener: fn => { expo.add(fn); return { remove: () => expo.delete(fn) }; },
      getLastNotificationResponseAsync: async () => null, clearLastNotificationResponseAsync: async () => {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    './ongoingTripNotification': { ONGOING_TRIP_NOTIFICATION_ID: 'ongoing' },
    './driverNotificationResponse': { respondToDriverNotification: async () => assert.fail('not a decision') },
    './nearbyNotificationAction': { isNearbyNotificationAction: () => false },
    '@/hooks/notifications/useDriverNotifications': { useDriverNotifications() {} },
    '@/hooks/notifications/useRideRinging': { useRideRinging() {} },
    '@/hooks/notifications/useIosRideAlertRecovery': { useIosRideAlertRecovery() {} },
    '../hooks/notifications/useOverdueRequestNotification': { useOverdueRequestNotification: () => ({ handlePassengerOverdueNotification: noOverdue }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog, hideDialogFor() {} }) },
    '@/services/pushNotifications': {}, '@/services/backgroundNotificationTask': {},
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: io.user }) },
    '@/store/api/tripRequestApi': { useGetMyActivityRequestsQuery: () => ({ data: [] }), useReleaseOverdueDriverMutation: () => [() => {}] },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: () => Boolean(io.user) },
    '@/store/selectors': { selectIsAuthenticated() {} },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => ({ tags }) } } },
  };
  const load = loader({ ...common, react: hooks.react });
  const queue = load('features/notifications/pendingIosNotificationOpen.ts');
  const updateLoad = loader({ ...common, react: updates.react,
    '@/features/notifications/pendingIosNotificationOpen': queue });
  load('services/notifeeBackgroundHandler.ts');
  const Handler = load('components/NotificationHandler.tsx').NotificationHandler;
  const useUpdates = updateLoad('hooks/useUpdateNotificationOpen.ts').useUpdateNotificationOpen;
  const render = () => { hooks.render(Handler); updates.render(useUpdates); };
  const event = (data, type = 1, action = 'default') => ({ type, detail: { notification: { id: 'notice', data }, pressAction: { id: action } } });
  const settle = async () => { await tick(); t.mock.timers.tick(100); await tick(); };
  t.after(() => { hooks.unmount(); updates.unmount(); });
  return { io, render, settle, hooks, queue,
    ready: () => { io.ready = true; io.user = { id: 'user', role: 'passenger' }; render(); },
    state: value => { io.state = value; for (const fn of states) fn(value); },
    background: (data, type, action) => background(event(data, type, action)),
    foreground: data => { for (const fn of foreground) fn(event(data)); },
    expo: data => { for (const fn of expo) fn({ notification: { request: { content: { data } } } }); },
  };
}

test('iOS cold notification tap waits for active app, navigation and profile, then routes once without opening an OS URL', async t => {
  const f = fixture(t); f.render();
  await f.background({ type: 'message', conversationId: 'chat' }); await f.settle();
  assert.deepEqual(f.io.links, []); assert.deepEqual(f.io.routes, []);
  f.state('active'); await f.settle(); assert.deepEqual(f.io.routes, []);
  f.io.ready = true; f.render(); await f.settle(); assert.deepEqual(f.io.routes, []);
  f.ready(); await f.settle();
  assert.deepEqual(f.io.routes, [{ pathname: '/chat/[id]', params: { id: 'chat' } }]);
  f.state('inactive'); f.state('active'); await f.settle();
  assert.equal(f.io.routes.length, 1); assert.deepEqual(f.io.links, []);
});

test('unknown payloads, unknown actions, deliveries and dismissals cannot force open iOS or navigate after resume', async t => {
  const f = fixture(t); f.ready();
  for (const [data, type, action] of [[{}, 1], [{ navigateTo: 'https://example.invalid' }, 1],
    [{ type: 'message', conversationId: 'chat' }, 2, 'mark-as-read'],
    [{ type: 'message', conversationId: 'chat' }, 3], [{ type: 'message', conversationId: 'chat' }, 4]]) {
    await f.background(data, type, action);
  }
  f.state('inactive'); f.state('active'); await f.settle();
  assert.deepEqual(f.io.routes, []); assert.deepEqual(f.io.links, []);
});

for (const first of ['native', 'expo']) test(`iOS ${first}-first duplicate tap is coalesced but a later deliberate tap works`, async t => {
  const f = fixture(t); f.ready(); f.state('active');
  const data = { type: 'wallet_admin_adjustment' };
  if (first === 'native') f.foreground(data); else f.expo(data);
  await f.settle();
  if (first === 'native') f.expo(data); else f.foreground(data);
  await f.settle(); assert.deepEqual(f.io.routes, ['/wallet']);
  t.mock.timers.tick(1001); f.foreground(data); await f.settle();
  assert.deepEqual(f.io.routes, ['/wallet', '/wallet']); assert.deepEqual(f.io.links, []);
});

test('ongoing passenger trip and driver financial modal remain accessible on iOS', async t => {
  const f = fixture(t); f.ready();
  await f.background({ type: 'ongoing_trip', role: 'passenger', tripId: 'trip', bookingId: 'booking' });
  f.state('active'); await f.settle(); assert.deepEqual(f.io.routes, ['/booking/navigate/booking']);
  f.foreground({ type: 'driver_booking_earning_confirmed', amount: '1000', currency: 'CDF' }); await f.settle();
  assert.equal(f.io.dialogs[0].title, 'Gain maintenant disponible');
  assert.equal(f.io.routes.length, 1); assert.deepEqual(f.io.links, []);
});

test('late iOS background callback after activation is routed without waiting for another resume', async t => {
  const f = fixture(t); f.ready(); f.state('active'); await f.settle();
  await f.background({ type: 'message', conversationId: 'late' }); await f.settle();
  assert.deepEqual(f.io.routes, [{ pathname: '/chat/[id]', params: { id: 'late' } }]);
  assert.deepEqual(f.io.links, []);
});

test('moving the device clock backwards does not suppress a new deliberate iOS tap', async t => {
  const f = fixture(t); f.ready(); f.state('active');
  f.foreground({ type: 'wallet_admin_adjustment' }); await f.settle();
  t.mock.timers.setTime(90000);
  f.foreground({ type: 'wallet_admin_adjustment' }); await f.settle();
  assert.deepEqual(f.io.routes, ['/wallet', '/wallet']); assert.deepEqual(f.io.links, []);
});

for (const reason of ['expired', 'session', 'unmount']) test(`queued iOS tap cannot leak after ${reason}`, async t => {
  const f = fixture(t); f.ready();
  await f.background({ type: 'message', conversationId: 'chat' });
  if (reason === 'expired') t.mock.timers.tick(60001);
  if (reason === 'session') f.io.version++;
  if (reason === 'unmount') f.hooks.unmount();
  f.state('active'); await f.settle();
  assert.deepEqual(f.io.routes, []); assert.deepEqual(f.io.links, []);
});

test('public update cold tap waits for navigation and active iOS, without requiring login', async t => {
  const f = fixture(t); f.render();
  const data = { type: 'app_update', releaseId: 'release' };
  await f.background(data); f.state('active'); await f.settle(); assert.deepEqual(f.io.routes, []);
  f.io.ready = true; f.render(); await f.settle();
  f.foreground(data); f.expo(data); await f.settle();
  assert.deepEqual(f.io.routes, ['/app-update']); assert.deepEqual(f.io.links, []);
});

test('Android background links and native-failure fallback remain unchanged', async t => {
  const f = fixture(t, 'android');
  await f.background({ type: 'message', conversationId: 'chat' });
  assert.deepEqual(f.io.links, ['zwanga://chat/chat']);
  f.io.failLink = true;
  await f.background({ type: 'message', conversationId: 'other' });
  assert.deepEqual(f.io.links, ['zwanga://chat/chat', 'zwanga://chat/other', 'zwanga://']);
});
