const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const userId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const responseData = (type = 'trip_request_accepted', status = 'accepted') => ({
  type, status, passengerId: userId, tripRequestId: requestId, bookingId: requestId,
  ringAlert: type === 'trip_request_accepted' ? 'request-accepted-v1' : 'booking-response-v1',
  ringUntil: new Date(Date.now() + 60000).toISOString(),
});

function ringFixture(t, platform) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hooks = hookHarness();
  const io = { state: 'active', plays: [], stops: 0, remote: [], cancelled: [], native: [], nativeCancelled: [], prepared: [], driverRestores: [], silenced: [] };
  const load = loader({ react: hooks.react, 'expo-router': { usePathname: () => '/home' },
    'react-native': { Platform: { OS: platform }, AppState: { get currentState() { return io.state; },
      addEventListener: (_, cb) => { io.change = cb; return { remove() {} }; } } },
    'expo-notifications': { addNotificationReceivedListener: cb => { io.receive = cb; return { remove() {} }; },
      getPresentedNotificationsAsync: async () => io.remote, dismissNotificationAsync: async id => io.cancelled.push(id) },
    '@notifee/react-native': { getDisplayedNotifications: async () => io.native },
    '@/services/backgroundRideAudio': { cancelRideNotification: async id => io.nativeCancelled.push(id),
      prepareForegroundRideAudio: async id => { io.prepared.push(id); return true; } },
    '@/services/foregroundRideSound': { startForegroundRideSound: async key => io.plays.push(key), stopForegroundRideSound: () => io.stops++ },
    '@/services/foregroundRideAnnouncement': { reconcileRideAnnouncement() {}, stopRideAnnouncement() {}, clearRideAnnouncementSession() {}, silenceRestoredRideAnnouncement: key => io.silenced.push(key) },
    '@/services/driverNotifications': { displayDriverInvitation: async data => io.driverRestores.push(data) },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
    '@/services/backgroundRideRinging': { BACKGROUND_RIDE_RING_PREFIX: 'ride-handoff-', reconcileBackgroundRideRinging: async () => {}, clearBackgroundRideRinging: async () => {} },
  });
  const session = load('services/rideAlertSession.ts');
  const parse = load('features/notifications/rideAlert.ts').parseRideAlert;
  hooks.render(() => load('hooks/notifications/useRideRinging.ts').useRideRinging(userId));
  t.after(() => hooks.unmount());
  return { io, session, parse, receive: data => io.receive({ request: { identifier: 'response-card', content: { data } } }),
    state: state => { io.state = state; io.change(state); } };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: counteroffer rings even on the request until the passenger explicitly opens or dismisses it`, async t => {
    const f = ringFixture(t, platform); await tick();
    const data = { ...responseData(), type: 'driver_offer', ringAlert: 'counter-offer-v1', offerId: otherId };
    delete data.bookingId;
    const alert = f.parse(data);
    f.session.setRideAlertScreen(userId, `/request/${requestId}`);
    f.receive(data); await tick();
    assert.equal(f.io.plays.at(-1), alert.key);
    assert.equal(f.session.pendingRideResponseNotices(userId).length, 1);
    f.session.dismissRideResponseNotice(alert);
    assert.equal(f.session.pendingRideAlerts(userId).length, 0);
    const played = f.io.plays.length;
    f.receive(data); await tick(); assert.equal(f.io.plays.length, played, 'duplicate push cannot restart a read price alert');
  });

  test(`${platform}: live accepted/refused replies do not ring; driver alerts still do until acknowledged`, async t => {
    const f = ringFixture(t, platform); await tick();
    for (const [type, status] of [['trip_request_accepted', 'accepted'], ['booking_response', 'accepted'], ['booking_response', 'rejected']]) {
      const data = responseData(type, status); f.receive(data); f.receive(data);
    }
    assert.equal(f.io.plays.length, 0);
    assert.equal(f.session.pendingRideResponseNotices(userId).length, 3, 'duplicate transports do not duplicate notices');
    for (const [type, kind] of [['new_booking', 'booking'], ['driver_dispatch_offer', 'dispatch'], ['trip_request_nearby', 'nearby']]) {
      const data = { ...responseData(), type, actionProtocol: 'driver-v1', driverId: userId,
        passengerId: otherId, ringAlert: 'nearby-request-v1', offerId: requestId,
        expiresAt: new Date(Date.now() + 60000).toISOString() };
      const alert = f.parse(data); assert.equal(alert.kind, kind);
      f.session.rememberRideAlert(alert); await tick();
      assert.equal(f.io.plays.at(-1), alert.key);
      const stops = f.io.stops;
      f.session.acknowledgeRideAlerts(item => item.key === alert.key);
      assert.ok(f.io.stops > stops);
      const plays = f.io.plays.length;
      f.session.rememberRideAlert(alert); await tick(); assert.equal(f.io.plays.length, plays, 'accepted driver alert cannot restart');
    }
  });

  test(`${platform}: restored passenger reply stops its OS card and never starts foreground sound`, async t => {
    const f = ringFixture(t, platform); await tick();
    f.state('background');
    const data = responseData();
    f.io.remote = [{ request: { identifier: 'remote', content: { data } } }];
    f.io.native = [{ id: 'ride-handoff-response', notification: { data, android: {} } }];
    f.state('active'); await tick();
    assert.equal(f.io.plays.length, 0);
    assert.deepEqual(f.io.cancelled, ['remote']);
    if (platform === 'android') {
      assert.deepEqual(f.io.nativeCancelled, ['ride-handoff-response']);
      assert.deepEqual(f.io.prepared, [], 'a response never transfers native audio to a foreground player');
    }
    assert.equal(f.session.pendingRideResponseNotices(userId).length, 1);
  });

  test(`${platform}: a response card arriving after the unlock read is also silenced`, async t => {
    const f = ringFixture(t, platform); await tick();
    f.state('background'); f.state('active'); await tick();
    const data = responseData();
    f.io.remote = [{ request: { identifier: 'late-response', content: { data } } }];
    const driverData = { ...data, type: 'new_booking', passengerId: otherId, driverId: userId, actionProtocol: 'driver-v1' };
    f.io.remote.push({ request: { identifier: 'driver-card', content: { data: driverData } } });
    f.io.native = [{ id: 'driver-card', notification: { data: driverData, android: {} } }];
    f.receive(data); await tick();
    assert.deepEqual(f.io.cancelled, ['late-response']);
    assert.equal(f.io.plays.length, 0);
    assert.equal(f.session.pendingRideResponseNotices(userId).length, 1);
    assert.deepEqual(f.io.driverRestores, []);
    assert.ok(f.io.silenced.every(key => key === f.parse(data).key), 'late response cleanup never suppresses a driver announcement');
  });
}

test('response notice survives the open-trip audio acknowledgement, but not dismissal, expiry or account change', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  let version = 0;
  const load = loader({ './tokenSession': { getTokenSessionVersion: () => version } });
  const session = load('services/rideAlertSession.ts'), parse = load('features/notifications/rideAlert.ts').parseRideAlert;
  const alert = parse(responseData());
  session.setRideAlertScreen(userId, `/request-details/${requestId}`);
  session.rememberRideAlert(alert); session.rememberRideAlert(alert);
  assert.deepEqual(session.pendingRideAlerts(userId), []);
  assert.deepEqual(session.pendingRideResponseNotices(userId), [alert]);
  assert.deepEqual(session.pendingRideResponseNotices(otherId), []);
  session.dismissRideResponseNotice(alert); session.rememberRideAlert(alert);
  assert.deepEqual(session.pendingRideResponseNotices(userId), []);
  session.clearRideAlertSession(); session.rememberRideAlert(alert);
  t.mock.timers.tick(180001); assert.deepEqual(session.pendingRideResponseNotices(userId), []);
  session.rememberRideAlert(parse(responseData('booking_response')));
  version++; assert.deepEqual(session.pendingRideResponseNotices(userId), []);
});

test('response panel appears only in-app, speaks only when visible and opens the existing trip route', () => {
  const React = require('react'), hooks = hookHarness();
  const io = { active: true, authenticated: true, user: { id: userId, role: 'passenger' }, routes: [], speech: [], overlay: null };
  const load = loader({ react: { ...React, ...hooks.react, useSyncExternalStore: (_, read) => read() },
    'react-native': { View: 'View', ScrollView: 'ScrollView', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
    'expo-router': { useRouter: () => ({ push: href => io.routes.push(href) }) },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.active },
    '@/hooks/notifications/usePaymentAnnouncement': { useScreenAnnouncement: (...args) => io.speech.push(args) },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: selector => selector === 'user' ? io.user : io.authenticated },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => tags } } },
    '@/store/selectors': { selectUser: 'user', selectIsAuthenticated: 'authenticated' },
    '@/store/api/tripRequestApi': { useGetTripRequestByIdQuery: () => ({}) },
    '@/hooks/useDisplayReads': { displayReadOptions: enabled => ({ skip: !enabled }), useDisplayReadsEnabled: enabled => enabled },
    '@/features/navigation/RideModal': { RideModal: 'RideModal' },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({ active: io.overlay }) },
  });
  const session = load('services/rideAlertSession.ts');
  const alert = load('features/notifications/rideAlert.ts').parseRideAlert(responseData());
  session.rememberRideAlert(alert);
  const render = () => hooks.render(() => load('components/PassengerRideResponseCoordinator.tsx').PassengerRideResponseCoordinator());
  let ui = render(); assert.equal(ui.props.visible, true);
  const panel = ui.props.children;
  panel.type(panel.props); assert.equal(io.speech.at(-1)[1], false, 'covered panels stay silent');
  io.overlay = { children: panel };
  const content = panel.type(panel.props); assert.equal(io.speech.at(-1)[1], true);
  assert.equal(io.speech.at(-1)[2], 'response');
  ui.props.onShow(); assert.equal(session.pendingRideAlerts(userId).length, 0);
  assert.equal(session.pendingRideResponseNotices(userId).length, 1);
  io.active = false; ui = render(); assert.equal(ui.props.visible, false);
  io.active = true; io.authenticated = false; ui = render(); assert.equal(ui.props.visible, false);
  io.authenticated = true; io.user = { id: otherId }; ui = render(); assert.equal(ui.props.visible, false);
  io.user = { id: userId, role: 'passenger' };
  const buttons = content.props.children.props.children.filter(child => child.type === 'Button');
  buttons[0].props.onPress();
  assert.deepEqual(io.routes, [{ pathname: '/request-details/[id]', params: { id: requestId } }]);
  assert.equal(session.pendingRideResponseNotices(userId).length, 0);
  hooks.unmount();
});
