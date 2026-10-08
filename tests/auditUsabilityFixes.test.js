const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('') : React.isValidElement(tree) ? words(tree.props.children) : '';

test('access feedback distinguishes connection, server, not-found and permission failures without granting access', () => {
  const { tripAccessFeedback } = loader()('features/navigation/tripAccessFeedback.ts');
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR']) {
    const feedback = tripAccessFeedback({ status }, false);
    assert.match(feedback.title, /Connexion/); assert.equal(feedback.retry, true);
  }
  assert.match(tripAccessFeedback({ status: 404 }, false).title, /introuvable/);
  assert.equal(tripAccessFeedback({ status: 403 }, false).retry, false);
  assert.match(tripAccessFeedback({ status: 401 }, false).title, /compte/);
  assert.equal(tripAccessFeedback({ status: 503 }, false).retry, true);
});

test('driver access retry stays visibly busy and cannot retry during an outstanding read', () => {
  let fetching = false, retries = 0;
  const Component = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: v => v } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'expo-router': { useRouter: () => ({ replace() {} }), useLocalSearchParams: () => ({ id: 'trip' }), Redirect: 'Redirect' },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: 'driver' } } }) },
    '@/hooks/navigation/useOfflineRideData': { useOfflineRideData: () => ({ data: undefined }) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({}) },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({ error: { status: 'FETCH_ERROR' }, isFetching: fetching,
      refetch: () => { retries++; fetching = true; } }) },
  })('components/trip/DriverTripAccessGuard.tsx').DriverTripAccessGuard;
  let tree = Component({ children: 'protected content' });
  assert.match(words(tree), /Connexion/); assert.doesNotMatch(words(tree), /protected content/);
  nodes(tree).find(n => n.type === 'Button' && words(n) === 'Réessayer').props.onPress();
  tree = Component({ children: 'protected content' });
  assert.match(words(tree), /Vérification du trajet/);
  const button = nodes(tree).find(n => n.type === 'Button' && words(n) === 'Vérification…');
  assert.equal(button.props.disabled, true); button.props.onPress(); assert.equal(retries, 1);
});

test('active trip feeds have no independent poll, query only the visible tab and stop reads offline', async () => {
  const hooks = hookHarness(), reads = [], refreshes = [];
  const state = { active: true, online: true, tab: 'published', sub: 'upcoming' };
  const query = name => (_arg, options) => {
    reads.push({ name, options });
    return { data: [], currentData: { pages: [] }, hasNextPage: true,
      refetch: async () => { refreshes.push(name); return { data: [] }; }, fetchNextPage: () => refreshes.push(name) };
  };
  const hook = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    '@/store/api/tripApi': { useGetMyActivityTripsQuery: query('trips'), useGetMyTripHistoryInfiniteQuery: query('tripHistory') },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: query('bookings'), useGetMyBookingHistoryInfiniteQuery: query('bookingHistory') },
  })('hooks/trips/useTripsFeeds.ts').useTripsFeeds;
  const render = () => hooks.render(() => hook(state.tab, state.sub, ''));
  const options = name => reads.filter(r => r.name === name).at(-1).options;
  render(); assert.equal(options('trips').skip, false); assert.equal(options('bookings').skip, true);
  assert.equal(options('trips').pollingInterval, 0); assert.equal(options('bookings').pollingInterval, 0);
  state.tab = 'bookings'; render(); assert.equal(options('trips').skip, true); assert.equal(options('bookings').skip, false);
  state.online = false; let view = render(); await view.refetchTrips(); await view.refetchBookings();
  assert.deepEqual(refreshes, []); assert.ok(reads.slice(-4).every(r => r.options.skip));
  state.sub = 'completed'; view = render(); view.loadMore(); assert.deepEqual(refreshes, []);
  state.online = true; view = render(); assert.equal(options('bookingHistory').skip, false);
  assert.equal(options('bookings').skip, true); view.loadMore(); assert.deepEqual(refreshes, ['bookingHistory']);
  hooks.unmount();
});

test('vehicle creation control has a comfortable 48-unit touch target', () => {
  const { styles } = loader({ 'react-native': { StyleSheet: { create: value => value } } })('features/profile/ProfileVehiclesSection.styles.ts');
  assert.equal(styles.vehicleAddButton.width, 48); assert.equal(styles.vehicleAddButton.height, 48);
});
