const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const React = require('react');
const { getNotificationHref, extractTripRequestId, getTripUrl, handleNotificationNavigation } =
  loader()('utils/notificationNavigation.ts');

const requestHref = id => ({ pathname: '/request-details/[id]', params: { id } });

test('manual confirmation notices open the recipient navigation, not the original request', () => {
  assert.equal(getNotificationHref({ type: 'ride_confirmation_required', role: 'passenger', bookingId: 'booking', tripId: 'trip', requestId: 'request' }), '/booking/navigate/booking');
  assert.equal(getNotificationHref({ type: 'ride_confirmation_required', role: 'driver', bookingId: 'booking', tripId: 'trip' }), '/trip/navigate/trip');
});

test('ongoing passenger notices open their reservation navigation with legacy fallbacks', () => {
  const payload = { type: 'ongoing_trip', role: 'passenger', tripId: 'trip', bookingId: 'reservation', navigateTo: '/trip/trip' };
  assert.equal(getNotificationHref(payload, { id: 'passenger', isDriver: true }), '/booking/navigate/reservation');
  assert.equal(getNotificationHref({ data: payload }), '/booking/navigate/reservation');
  assert.equal(getNotificationHref({ type: 'ongoing_trip', navigateTo: '/booking/navigate/reservation' }), '/booking/navigate/reservation');
  assert.equal(getNotificationHref({ type: 'ongoing_trip', role: 'passenger', tripId: 'trip' }), '/trip/trip');
});

test('accepted requests open the created trip, with support for legacy and nested payloads', () => {
  for (const type of ['trip_request_accepted', 'trip-request-accepted']) {
    assert.equal(getNotificationHref({ type, tripRequestId: 'request', tripId: 'trip' }), '/trip/trip');
    assert.equal(getNotificationHref({ data: { type, requestId: 'request', tripId: 'trip' } }), '/trip/trip');
    assert.deepEqual(getNotificationHref({ type, requestId: 'request' }), requestHref('request'));
  }
});

test('trip lifecycle events prioritize the trip over the original request ID', () => {
  for (const type of ['trip_started', 'trip_paused', 'trip_completed', 'trip_cancelled', 'trip_update', 'trip_request_started']) {
    assert.equal(getNotificationHref({ type, tripId: 'trip', tripRequestId: 'request', requestId: 'unrelated' }), '/trip/trip');
  }
});

test('actual backend emergency payloads route to the recipient’s trip view, never to the interruption ID', () => {
  const cases = [
    ['driver_trip_interruption_requested', 'passenger'],
    ['driver_trip_interruption_cancelled', 'passenger'],
    ['driver_trip_interruption_completed', 'passenger'],
    ['driver_trip_interruption_completed', 'driver'],
    ['driver_trip_interruption_passenger_confirmed', 'driver'],
    ['driver_trip_interruption_passenger_rejected', 'driver'],
    ['passenger_trip_interruption_requested', 'driver'],
    ['passenger_trip_interruption_confirmed', 'passenger'],
    ['passenger_trip_interruption_rejected', 'passenger'],
  ];
  for (const [type, role] of cases) {
    const data = { type, role, tripId: 'trip', bookingId: 'booking', requestId: 'interruption' };
    assert.equal(extractTripRequestId(data), null);
    assert.equal(getNotificationHref(data), role === 'driver' ? '/trip/manage/trip' : '/trip/trip');
    assert.equal(getNotificationHref({ data }), getNotificationHref(data));
  }
  assert.equal(getNotificationHref({ type: 'driver_trip_interruption_requested', requestId: 'interruption' }), null);
});

test('request IDs are explicit first and request offers/overdue recovery retain the request route', () => {
  assert.equal(extractTripRequestId({ tripRequestId: 'actual', requestId: 'ambiguous' }), 'actual');
  for (const type of ['trip_request', 'new-trip-request', 'trip_request_offer_received', 'trip_request_driver_overdue', 'trip_request_expired', 'driver_offer', 'offer_accepted']) {
    assert.deepEqual(getNotificationHref({ type, tripRequestId: 'request', tripId: 'trip' }), requestHref('request'));
  }
  for (const data of [{ trip_request_id: 'request' }, { data: { tripRequest: { id: 'request' } } }, { requestId: 'request' }]) {
    assert.deepEqual(getNotificationHref(data), requestHref('request'));
  }
});

test('explicit participant role takes precedence over account/driver hints', () => {
  const both = { id: 'me', role: 'both', isDriver: true };
  assert.equal(getTripUrl('trip', { role: 'passenger', driverId: 'me' }, both, 'booking_pending'), '/trip/trip');
  assert.equal(getTripUrl('trip', { driverId: 'me' }, both), '/trip/manage/trip');
  assert.equal(getTripUrl('trip', { driverId: 'other' }, both), '/trip/trip');
  assert.equal(getNotificationHref({ type: 'trip_started', tripId: 'trip', role: 'driver' }), '/trip/manage/trip');
});

test('chat, earnings, bookings, reviews, referrals and ongoing notifications keep their targets', () => {
  assert.deepEqual(getNotificationHref({ type: 'message', conversationId: 'chat', tripId: 'trip' }), { pathname: '/chat/[id]', params: { id: 'chat' } });
  for (const type of ['driver_trip_revenue', 'driver_booking_earning_confirmed']) {
    assert.equal(getNotificationHref({ type, tripId: 'trip' }), '/driver-earnings');
  }
  assert.equal(getNotificationHref({ type: 'referral_new_referral' }), '/referrals');
  assert.equal(getNotificationHref({ type: 'review', tripId: 'trip' }), '/rate/trip');
  assert.equal(getNotificationHref({ type: 'booking_accepted', bookingId: 'booking' }), '/bookings');
  assert.equal(getNotificationHref({ type: 'ongoing_trip', tripId: 'trip', role: 'driver', navigateTo: '/trip/manage/trip' }), '/trip/manage/trip');
  assert.equal(getNotificationHref({ type: 'ongoing_trip', navigateTo: '/trip/manage/trip' }), '/trip/manage/trip');
});

test('invalid identifiers and unknown payloads do not generate broken detail routes', () => {
  for (const value of [{}, [], true, NaN, Infinity, '', '  ', '../elsewhere', 'trip?id=another']) {
    assert.equal(getNotificationHref({ tripId: value }), null);
  }
  assert.equal(getNotificationHref({ type: 'ongoing_trip', navigateTo: 'https://example.com' }), null);
  assert.equal(getNotificationHref({ type: 'unknown', requestId: 'interruption' }), null);
  assert.equal(getNotificationHref(null), null);
});

test('push/inbox navigation uses the same target and issues one navigation after dismissal', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const routes = [];
  handleNotificationNavigation({ type: 'driver_trip_interruption_requested', tripId: 'trip', requestId: 'interruption', role: 'passenger' }, { push: href => routes.push(href) });
  assert.deepEqual(routes, []);
  t.mock.timers.tick(100);
  assert.deepEqual(routes, ['/trip/trip']);
  t.mock.timers.tick(1000);
  assert.equal(routes.length, 1);
});

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
}

function inbox(data) {
  const hooks = hookHarness(), routes = [], acknowledgements = [];
  let resolveRead, rejectRead;
  const read = new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
  const notification = { id: 'notice', title: 'Trajet', body: 'Votre trajet', isRead: false, data };
  const markRead = args => { acknowledgements.push(['read', args]); return { unwrap: () => read }; };
  const disable = args => { acknowledgements.push(['disable', args]); return { unwrap: async () => {} }; };
  const Screen = loader({
    react: { ...React, ...hooks.react },
    'react-native': {
      Platform: { OS: 'android' }, StyleSheet: { create: value => value },
      TouchableOpacity: 'TouchableOpacity', Text: 'Text', View: 'View', Modal: 'Modal',
      ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', RefreshControl: 'RefreshControl',
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => ({ push: href => routes.push(href), back() {} }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: { id: 'passenger' } }) },
    '@/store/api/notificationApi': {
      useGetNotificationPagesInfiniteQuery: () => ({ data: { pages: [{ notifications: [notification], unreadCount: 1 }] } }),
      useMarkNotificationsAsReadMutation: () => [markRead],
      useDisableNotificationsMutation: () => [disable],
      useMarkAllNotificationsAsReadMutation: () => [() => ({ unwrap: async () => {} })],
    },
  })('app/notifications.tsx').default;
  const render = () => hooks.render(Screen);
  const press = () => {
    const list = elements(render()).find(node => node.type === 'FlatList');
    return list.props.renderItem({ item: notification }).props.onPress(notification);
  };
  return { hooks, render, press, routes, acknowledgements, resolveRead, rejectRead };
}

test('the inbox opens the trip without waiting for slow read/disable requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = inbox({ type: 'driver_trip_interruption_requested', tripId: 'trip', requestId: 'interruption', role: 'passenger' });
  const pending = app.press();
  t.mock.timers.tick(100);
  assert.deepEqual(app.routes, ['/trip/trip']);
  assert.deepEqual(app.acknowledgements.map(([kind]) => kind), ['read']);
  app.resolveRead();
  await pending;
  assert.deepEqual(app.acknowledgements.map(([kind]) => kind), ['read', 'disable']);
  app.hooks.unmount();
});

test('failed inbox acknowledgements do not block accepted-trip navigation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = inbox({ type: 'trip_request_accepted', tripRequestId: 'request', tripId: 'trip' });
  const pending = app.press();
  app.rejectRead(new Error('Offline'));
  await pending;
  t.mock.timers.tick(100);
  assert.deepEqual(app.routes, ['/trip/trip']);
  app.hooks.unmount();
});

test('a notification without a destination displays its message, not an invalid request detail', async () => {
  const app = inbox({ type: 'driver_trip_interruption_requested', requestId: 'interruption' });
  const pending = app.press();
  assert.equal(elements(app.render()).find(node => node.type === 'Modal').props.visible, true);
  assert.deepEqual(app.routes, []);
  app.resolveRead();
  await pending;
  app.hooks.unmount();
});
