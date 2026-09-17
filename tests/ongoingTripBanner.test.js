const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const trip = { id: 'trip', driverId: 'driver', status: 'ongoing', departure: { name: 'Départ' }, arrival: { name: 'Arrivée' } };
const booking = { id: 'reservation', tripId: trip.id, passengerId: 'passenger', status: 'accepted', trip };
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
}

function banner(initial = {}) {
  const hooks = hookHarness(), routes = [], starts = [], stops = [];
  const data = { user: { id: 'passenger', isDriver: true }, trips: [], bookings: [booking], pathname: '/search', ...initial };
  const { OngoingTripBanner } = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Text: 'Text', TouchableOpacity: 'Button', View: 'View', StyleSheet: { create: value => value } },
    '../features/screen-styles/components/OngoingTripBanner/index': { styles: {} },
    '@/constants/navigation': { getFloatingBannerBottomOffset: () => 80 },
    '@/utils/dateHelpers': { formatDateTime: () => '' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'expo-router': { useRouter: () => ({ push: href => routes.push(href) }), usePathname: () => data.pathname },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/utils/reanimated': {
      default: { View: 'AnimatedView' }, Easing: { inOut: value => value, ease: null },
      useSharedValue: value => hooks.react.useRef({ value }).current,
      useAnimatedStyle: fn => fn(), withSpring: value => value, withTiming: value => value,
    },
    '@/store/hooks': { useAppSelector: () => data.user }, '@/store/selectors': { selectUser() {} },
    '@/store/api/tripApi': { useGetMyActivityTripsQuery: () => ({ data: data.trips }) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: data.bookings }) },
    '@/services/ongoingTripNotification': {
      getCurrentTripInfo: () => data.tracked ?? null,
      startOngoingTripTracking: value => starts.push(value), stopOngoingTripTracking: () => stops.push(true),
    },
  })('components/OngoingTripBanner.tsx');
  const render = () => hooks.render(OngoingTripBanner);
  const press = () => elements(render()).find(node => node.type === 'Button').props.onPress();
  return { data, render, press, routes, starts, stops, hooks };
}

test('passenger banner opens booking navigation, even for a driver-capable account', () => {
  const h = banner({ trips: [trip] }); // A trip belonging to someone else must never imply driver role.
  h.press();
  assert.deepEqual(h.routes, ['/booking/navigate/reservation']);
  assert.equal(h.starts[0].bookingId, 'reservation');
  assert.equal(h.starts[0].role, 'passenger');
  assert.equal(elements(h.render()).find(node => node.type === 'Button').props.accessibilityLabel, 'Reprendre ma navigation passager');
  h.hooks.unmount();
});

test('the actual driver still opens driver navigation', () => {
  const h = banner({ user: { id: 'driver' }, trips: [trip], bookings: [] });
  h.press(); assert.deepEqual(h.routes, ['/trip/navigate/trip']);
  assert.equal(h.starts[0].bookingId, undefined);
  h.hooks.unmount();
});

test('finished, cancelled, dropped-off and other-account reservations do not produce a passenger banner', () => {
  for (const patch of [{ status: 'completed' }, { status: 'cancelled' }, { droppedOff: true },
    { droppedOffConfirmedByPassenger: true }, { passengerId: 'someone-else' }, { trip: { ...trip, status: 'completed' } }]) {
    const h = banner({ bookings: [{ ...booking, ...patch }] });
    assert.equal(h.render(), null); assert.deepEqual(h.starts, []); h.hooks.unmount();
  }
});

test('restored tracking gains the booking ID without restarting on subsequent renders', () => {
  const h = banner({ tracked: { tripId: 'trip', role: 'passenger' } });
  h.render();
  assert.equal(h.stops.length, 1); assert.equal(h.starts[0].bookingId, 'reservation');
  for (let i = 0; i < 20; i++) h.render();
  assert.equal(h.starts.length, 1); assert.equal(h.stops.length, 1);
  h.data.user = { id: 'second-passenger' };
  h.data.bookings = [{ ...booking, id: 'second-reservation', passengerId: 'second-passenger' }];
  h.press();
  assert.equal(h.starts.at(-1).bookingId, 'second-reservation');
  assert.equal(h.routes.at(-1), '/booking/navigate/second-reservation');
  h.hooks.unmount();
});

test('the banner stays hidden on the passenger navigation screen', () => {
  const h = banner({ pathname: '/booking/navigate/reservation' });
  assert.equal(h.render(), null); h.hooks.unmount();
});

test('the ongoing notification retains the passenger booking and its navigation URL', async () => {
  const notices = [];
  const native = {
    createChannel: async () => 'channel', displayNotification: async notice => notices.push(notice), cancelNotification: async () => {},
  };
  const service = loader({
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@notifee/react-native': { default: native, AndroidImportance: { HIGH: 4 }, AndroidCategory: { NAVIGATION: 'navigation' }, AndroidVisibility: { PUBLIC: 1 } },
  })('services/ongoingTripNotification.ts');
  service.startOngoingTripTracking({ tripId: 'trip', bookingId: 'reservation', role: 'passenger', departure: 'A', arrival: 'B' });
  await service.forceShowNotification();
  assert.equal(notices[0].data.bookingId, 'reservation');
  assert.equal(notices[0].data.navigateTo, '/booking/navigate/reservation');
  service.stopOngoingTripTracking();
});

test('background notification taps use the same passenger route, including the quick action', async () => {
  let handler;
  const links = [];
  loader({
    'react-native': { Linking: { openURL: async href => links.push(href) } },
    './ongoingTripNotification': { ONGOING_TRIP_NOTIFICATION_ID: 'ongoing' },
    '@notifee/react-native': { default: { onBackgroundEvent: fn => { handler = fn; } }, EventType: { PRESS: 1, ACTION_PRESS: 2 } },
  })('services/notifeeBackgroundHandler.ts');
  for (const type of [1, 2]) await handler({ type, detail: { notification: {
    id: 'ongoing', data: { type: 'ongoing_trip', role: 'passenger', tripId: 'trip', bookingId: 'reservation', navigateTo: '/trip/trip' },
  } } });
  assert.deepEqual(links, ['zwanga://booking/navigate/reservation', 'zwanga://booking/navigate/reservation']);
});
