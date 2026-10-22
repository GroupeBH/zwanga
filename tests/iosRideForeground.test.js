const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('iOS Firebase passenger responses share deduplication and stop on the matching trip; foreign and late callbacks are ignored', () => {
  const hooks = hookHarness(), displays = [];
  let receive, stopped = 0, version = 1;
  const state = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const router = { navigate: () => assert.fail('delivery is not a navigation action') };
  const load = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    './tokenSession': { getTokenSessionVersion: () => version },
    './useRideRealtime': { useRideRealtime() {} },
    '@/services/iosFirebaseMessaging': { subscribeIosFirebaseMessages: fn => { receive = fn; return () => { stopped++; }; } },
    'expo-router': { useRouter: () => router },
    'react-native': { Platform: { OS: 'ios' }, AppState: state },
    'expo-notifications': { addNotificationReceivedListener: () => ({ remove() {} }),
      addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: async () => null },
    '@notifee/react-native': { onForegroundEvent: () => () => {}, EventType: {} },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {}, displayDriverInvitation: async data => displays.push(data) },
    '@/services/driverNotificationResponse': { respondToDriverNotification: () => assert.fail('no automatic mutation') },
  });
  const hook = load('hooks/notifications/useDriverNotifications.ts').useDriverNotifications;
  const session = load('services/rideAlertSession.ts');
  const parse = load('features/notifications/rideAlert.ts').parseRideAlert;
  hooks.render(() => hook(id(1), false));
  const data = { type: 'booking_response', ringAlert: 'booking-response-v1', passengerId: id(1),
    bookingId: id(2), tripId: id(3), status: 'accepted', ringUntil: new Date(Date.now() + 30000).toISOString() };
  receive({ ...data, passengerId: id(9) }); assert.equal(session.pendingRideAlerts(id(1)).length, 0);
  state.currentState = 'background'; receive(data); assert.equal(session.pendingRideAlerts(id(1)).length, 0);
  state.currentState = 'active'; receive(data); receive(data); session.rememberRideAlert(parse(data));
  assert.equal(session.pendingRideAlerts(id(1)).length, 1, 'FCM and Expo coalesce');
  session.setRideAlertScreen(id(1), `/trip/${id(3)}`); receive(data);
  assert.equal(session.pendingRideAlerts(id(1)).length, 0, 'opening the corresponding trip acknowledges the response');
  version++; receive({ ...data, bookingId: id(4), tripId: id(5) });
  assert.equal(session.pendingRideAlerts(id(1)).length, 0, 'token session changed before React unmounted');
  hooks.unmount(); receive({ ...data, bookingId: id(4), tripId: id(5) });
  assert.equal(stopped, 1); assert.equal(session.pendingRideAlerts(id(1)).length, 0); assert.deepEqual(displays, []);
});
