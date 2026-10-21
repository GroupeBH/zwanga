const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const trip = { id: 'trip', driverId: 'driver', status: 'upcoming', departureTime: '2026-10-22T08:00:00Z' };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'pending', trip };
const now = 100000;
const fresh = data => ({ data, isSuccess: true, startedTimeStamp: now - 100, fulfilledTimeStamp: now - 50 });
const { manageBookingPreview } = loader()('features/manage-trip/manageBookingPreview.ts');

test('a verified focused booking is usable before the full list, without pretending it is complete', () => {
  const preview = manageBookingPreview(trip, 'driver', 'booking', fresh(booking), undefined, now);
  assert.deepEqual(preview, { bookings: [booking], partial: true });
  const older = { data: [{ ...booking, id: 'other' }], fulfilledTimeStamp: now - 500 };
  assert.deepEqual(manageBookingPreview(trip, 'driver', 'booking', fresh(booking), older, now),
    { bookings: [booking, older.data[0]], partial: true });
  assert.equal(older.data.length, 1, 'do not mutate query data');
});

test('a newer complete list, including empty or answered, always supersedes the preview', () => {
  for (const data of [[], [{ ...booking, status: 'rejected' }], [{ ...booking, status: 'accepted' }]]) {
    const list = { data, fulfilledTimeStamp: now };
    assert.deepEqual(manageBookingPreview(trip, 'driver', 'booking', fresh(booking), list, now), { bookings: data, partial: false });
  }
});

test('old, mismatched, foreign, invalidated or failed detail cannot supply a preview', () => {
  for (const read of [fresh({ ...booking, id: 'other' }), fresh({ ...booking, tripId: 'other' }),
    fresh({ ...booking, passengerId: 'driver' }), { ...fresh(booking), startedTimeStamp: 1, fulfilledTimeStamp: 2 },
    { ...fresh(booking), isError: true }, { ...fresh(booking), status: 'pending' }]) {
    assert.equal(manageBookingPreview(trip, 'driver', 'booking', read, undefined, now).bookings, undefined);
  }
  assert.equal(manageBookingPreview(trip, 'other', 'booking', fresh(booking), undefined, now).bookings, undefined);
  assert.equal(manageBookingPreview({ ...trip, status: 'completed' }, 'driver', 'booking', fresh(booking), undefined, now).bookings, undefined);
});

test('priming only inserts a missing owned trip and never a fabricated full booking list', () => {
  const actions = []; let cached = {};
  const api = { endpoints: { getTripById: { select: () => () => cached } }, util: { upsertQueryEntries: entries => entries } };
  const { primePendingBookingTrip } = loader({ '@/store/api/tripApi': { tripApi: api } })('store/api/booking/entrySnapshot.ts');
  const state = { auth: { user: { id: 'driver' } } };
  const run = snapshot => primePendingBookingTrip(snapshot, 'driver')(action => actions.push(action), () => state);
  run({ booking, trip });
  assert.deepEqual(actions, [[{ endpointName: 'getTripById', arg: 'trip', value: trip }]]);
  for (const snapshot of [{ booking, trip: { ...trip, driverId: 'other' } },
    { booking: { ...booking, status: 'accepted' }, trip }, { booking: { ...booking, tripId: 'other' }, trip }]) run(snapshot);
  cached = { status: 'pending' }; run({ booking, trip });
  cached = { data: { ...trip, status: 'ongoing' } }; run({ booking, trip });
  cached = {}; state.auth.user.id = 'other'; run({ booking, trip });
  assert.equal(actions.length, 1);
});

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  StyleSheet: { create: value => value } };
const uiLoad = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/components/trip/CompactCardAvatar': { CompactCardAvatar: 'Avatar' },
  '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: 'Cash' } });
const { ManageTripBookings } = uiLoad('features/manage-trip/ManageTripBookings.tsx');
const { ManageTripBookingsReadState } = uiLoad('features/manage-trip/ManageTripBookingsReadState.tsx');
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');

test('loading, failure and offline never claim no reservations; confirmed empty does', () => {
  for (const state of [{ bookingsLoading: true }, { bookingsError: true }, { bookingsOffline: true }, { bookingsFetching: true }]) {
    const tree = ManageTripBookings({ state: { trip, ...state }, tracking: { visibleBookings: state.bookingsFetching ? [] : undefined }, actions: {}, bookingsActions: {} });
    assert.doesNotMatch(words(tree), /Aucune réservation/);
    if (!state.bookingsFetching) assert.doesNotMatch(words(tree), /0 réservation/);
    const notice = nodes(tree).find(n => n.type === ManageTripBookingsReadState);
    assert.ok(words(ManageTripBookingsReadState(notice.props)).length > 0);
  }
  const tree = ManageTripBookings({ state: { trip }, tracking: { visibleBookings: [] }, actions: {}, bookingsActions: {} });
  assert.match(words(tree), /Aucune réservation/);
});

test('a failed list retains focused booking actions and an explicit accessible retry', () => {
  let retries = 0;
  const tree = ManageTripBookings({ state: { trip, bookingsError: true, bookingsPartial: true, canRetryBookings: true,
    refetchBookings: () => { retries++; } }, tracking: { visibleBookings: [booking] }, actions: {}, bookingsActions: {} });
  assert.match(words(tree), /Réservation sélectionnée/);
  assert.doesNotMatch(words(tree), /1 réservation/);
  const buttons = nodes(tree).filter(n => n.type === 'Button');
  assert.ok(buttons.some(n => words(n) === 'Accepter'));
  assert.ok(buttons.some(n => words(n) === 'Refuser'));
  const notice = nodes(tree).find(n => n.type === ManageTripBookingsReadState);
  const retry = nodes(ManageTripBookingsReadState(notice.props)).find(n => n.type === 'Button');
  assert.equal(retry.props.accessibilityRole, 'button'); retry.props.onPress(); assert.equal(retries, 1);
  const offline = ManageTripBookingsReadState({ ...notice.props, offline: true, canRetry: false });
  assert.equal(nodes(offline).filter(n => n.type === 'Button').length, 0);
});

test('the actual management hook starts the list from seeded trip and exposes the preview before its response', () => {
  const hooks = hookHarness(), calls = [];
  let list = { isFetching: true }, focused = fresh(booking), online = true;
  const query = (name, result) => (arg, options) => { calls.push({ name, arg, options }); return { ...result(), refetch: async () => ({}) }; };
  const api = endpoints => new Proxy(endpoints, { get: (target, key) => target[key] ?? (() => [() => {}, {}]) });
  const load = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { user: { id: 'driver' } }, zwangaApi: { config: { online } } }) },
    '@/store/selectors': { selectUser: state => state.auth.user },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true }) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/components/ui/DialogProvider': { useDialog: () => ({}) },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({ id: 'trip', bookingId: 'booking', section: 'passengers' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
    '@/store/api/tripApi': api({ useGetTripByIdQuery: query('trip', () => ({ currentData: trip })) }),
    '@/store/api/bookingApi': api({ bookingApi: { endpoints: { getBookingById: { select: () => () => focused } } },
      useGetTripBookingsQuery: query('list', () => list) }),
    '@/store/api/googleMapsApi': api({}),
  });
  // Real clock here: cache lifetime is checked by the actual state hook.
  focused = { ...fresh(booking), startedTimeStamp: Date.now() - 10, fulfilledTimeStamp: Date.now() };
  const hook = load('hooks/manage-trip/useManageTripState.ts').useManageTripState;
  let view = hooks.render(hook);
  assert.equal(calls.find(x => x.name === 'list').options.skip, false);
  assert.equal(calls.find(x => x.name === 'trip').options.refetchOnMountOrArgChange, 30);
  assert.deepEqual(view.bookings, [booking]); assert.equal(view.bookingsPartial, true);
  list = { isError: true }; view = hooks.render(hook);
  assert.deepEqual(view.bookings, [booking]); assert.equal(view.bookingsError, true);
  list = { currentData: [], fulfilledTimeStamp: Date.now() + 1 }; view = hooks.render(hook);
  assert.deepEqual(view.bookings, []); assert.equal(view.bookingsPartial, false);
  online = false; list = {}; view = hooks.render(hook);
  assert.equal(view.bookingsOffline, true); assert.equal(view.canRetryBookings, false);
  assert.deepEqual(view.bookings, [], 'offline does not resurrect a reservation absent from the newer list');
  hooks.unmount();
});
