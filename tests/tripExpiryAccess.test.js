const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { isTripExpired, resolveTripDetailAvailability } = loader()('features/trip-detail/tripDetailAvailability.ts');
const past = '2000-01-01T08:00:00Z', future = '2099-01-01T08:00:00Z';
const expired = { id: 'trip', driverId: 'driver', departureTime: past, status: 'completed',
  isExpired: true, canReprogram: true };

test('the owner keeps expired details and reprogramming, other viewers only see expiry', () => {
  const owner = resolveTripDetailAvailability({ trip: expired, userId: 'driver', loading: false });
  assert.equal(owner.trip, expired);
  assert.equal(owner.feedback, null);
  for (const userId of ['passenger', 'outsider', undefined]) {
    const view = resolveTripDetailAvailability({ trip: expired, userId, loading: false });
    assert.equal(view.trip, undefined);
    assert.equal(view.expired, true);
    assert.equal(view.feedback.title, 'Ce trajet a expiré');
    assert.equal(view.feedback.retry, false);
  }
});

test('only expired departures are hidden, never ongoing or actually completed rides', () => {
  assert.equal(isTripExpired({ ...expired, status: 'upcoming', canReprogram: false, isExpired: undefined }), true);
  for (const trip of [
    { ...expired, status: 'ongoing' }, { ...expired, status: 'cancelled' },
    { ...expired, canReprogram: false, isExpired: false, startedAt: past },
    { ...expired, canReprogram: false, isExpired: undefined },
    { ...expired, status: 'upcoming', canReprogram: false, isExpired: false, departureTime: future },
    { ...expired, status: 'upcoming', canReprogram: false, isExpired: undefined, departureTime: 'invalid' },
  ]) {
    assert.equal(isTripExpired(trip), false);
    assert.equal(resolveTripDetailAvailability({ trip, userId: 'passenger', loading: false }).trip, trip);
  }
});

test('network errors do not claim a trip was deleted; retry remains available', () => {
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR', 500, 503]) {
    const view = resolveTripDetailAvailability({ loading: false, error: { status } });
    assert.equal(view.feedback.title, 'Trajet temporairement indisponible');
    assert.equal(view.feedback.retry, true);
    const cachedOwner = resolveTripDetailAvailability({ trip: expired, userId: 'driver', loading: false, error: { status } });
    assert.equal(cachedOwner.trip, expired);
  }
});

test('authoritative missing or forbidden responses cannot be bypassed by cached owner details', () => {
  for (const [status, title] of [[401, 'Connexion nécessaire'], [403, 'Trajet privé'], [404, 'Trajet introuvable']]) {
    const view = resolveTripDetailAvailability({ trip: expired, userId: 'driver', loading: false, error: { status } });
    assert.equal(view.trip, undefined);
    assert.equal(view.feedback.title, title);
  }
  for (const error of [{ status: 410 }, { status: 404, data: { code: 'TRIP_EXPIRED' } }]) {
    assert.equal(resolveTripDetailAvailability({ error, loading: false }).feedback.title, 'Ce trajet a expiré');
  }
  assert.equal(resolveTripDetailAvailability({ loading: true }).loading, true);
});

function detailEnvironment() {
  const hooks = hookHarness(), calls = { driver: [], activity: [], history: [] };
  const env = { trip: expired, cached: undefined, error: undefined, fetching: false, user: { id: 'driver' }, id: 'trip' };
  const booking = key => (_id, options) => { calls[key].push(options); return { refetch() {} }; };
  const { useTripDetailData } = loader({
    react: hooks.react,
    '../../features/trip-detail/tripDetailModel': { pointToLatLng: () => null },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({}) },
    '@/hooks/useUserLocation': { useUserLocation: () => ({}) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: booking('activity'),
      useGetMyBookingsForTripQuery: booking('history'), useGetTripBookingsQuery: booking('driver') },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({ data: env.trip, error: env.error,
      isFetching: env.fetching, isLoading: env.fetching && !env.trip, refetch() {} }) },
    '@/store/hooks': { useAppSelector: selector => selector(env) },
    '@/store/selectors': { selectTripById: () => state => state.cached, selectUser: state => state.user },
    '@react-navigation/native': { useIsFocused: () => true },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    'expo-router': { useLocalSearchParams: () => ({ id: env.id }), useRouter: () => ({ replace() {} }) },
    'react-native': { useWindowDimensions: () => ({ height: 800 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  })('hooks/trip-detail/useTripDetailData.ts');
  return { env, calls, hooks, render: () => hooks.render(useTripDetailData) };
}

test('expired non-owner detail never loads driver/passenger booking feeds', () => {
  const app = detailEnvironment();
  assert.equal(app.render().trip, expired);
  assert.equal(app.calls.driver.at(-1).skip, false);
  app.env.user = { id: 'passenger' };
  const passenger = app.render();
  assert.equal(passenger.trip, undefined);
  assert.equal(passenger.tripFeedback.title, 'Ce trajet a expiré');
  for (const calls of Object.values(app.calls)) assert.equal(calls.at(-1).skip, true);
  app.hooks.unmount();
});

test('changing route IDs cannot display previous details; failures distinguish network and missing', () => {
  const app = detailEnvironment();
  app.render();
  app.env.id = 'another-trip'; app.env.cached = expired; app.env.fetching = true;
  let view = app.render();
  assert.equal(view.trip, undefined); assert.equal(view.tripLoading, true);
  app.env.fetching = false; app.env.error = { status: 'FETCH_ERROR' };
  view = app.render();
  assert.equal(view.tripFeedback.retry, true);
  assert.equal(view.tripFeedback.title, 'Trajet temporairement indisponible');
  app.env.error = { status: 404 };
  assert.equal(app.render().tripFeedback.title, 'Trajet introuvable');
  app.hooks.unmount();
});

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  StyleSheet: { create: x => x, hairlineWidth: 1 }, Platform: { OS: 'ios', select: x => x.ios } };
const ui = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  'react-native-safe-area-context': { SafeAreaView: 'SafeArea' } });
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function text(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}

test('owner can open the expired-trip editor, but no edit action is shown to another viewer', () => {
  const { TripDetailActionsFooter } = ui('features/trip-detail/TripDetailActionsFooter.tsx');
  let opened = 0;
  const props = { data: { trip: expired, isTripDriver: true, insets: { bottom: 0 }, router: { push() {} } },
    access: {}, activity: {}, editor: { openEditModal: () => opened++ }, pricing: {}, bookingState: {} };
  const owner = nodes(TripDetailActionsFooter(props));
  const edit = owner.find(n => n.type === 'Button' && text(n).includes('Modifier'));
  assert.ok(edit); edit.props.onPress(); assert.equal(opened, 1);
  const passenger = nodes(TripDetailActionsFooter({ ...props, data: { ...props.data, isTripDriver: false } }));
  assert.equal(passenger.some(n => n.type === 'Button' && text(n).includes('Modifier')), false);
});

test('expiry message is concise and retry appears only for temporary failures', () => {
  const { TripUnavailableState } = ui('features/trip-detail/TripUnavailableState.tsx');
  let retries = 0;
  const base = { loading: false, fetching: false, onRetry: () => retries++, onHome() {} };
  const feedback = resolveTripDetailAvailability({ trip: expired, userId: 'passenger', loading: false }).feedback;
  const tree = TripUnavailableState({ ...base, feedback });
  assert.match(text(tree), /Ce trajet a expiré/);
  assert.doesNotMatch(text(tree), /introuvable|Réessayer/);
  const failure = resolveTripDetailAvailability({ loading: false, error: { status: 500 } }).feedback;
  const retry = nodes(TripUnavailableState({ ...base, feedback: failure })).find(n => n.type === 'Button' && text(n) === 'Réessayer');
  assert.ok(retry); retry.props.onPress(); assert.equal(retries, 1);
});

function editorEnvironment() {
  const hooks = hookHarness(), calls = { reprogram: [], update: [], routes: [], dialogs: [], closed: 0 };
  const { useTripDetailEditSubmission } = loader({
    react: hooks.react,
    '../../features/trip-detail/tripDetailModel': {
      getLocationText: point => point?.address ?? '', getLocationCoordinatesTuple: () => null,
    },
    '@/store/api/tripApi': { useReprogramTripMutation: () => [payload => {
      calls.reprogram.push(payload); return { unwrap: async () => ({ id: 'new-trip' }) };
    }] },
    'expo-router': { useRouter: () => ({ replace: route => calls.routes.push(route) }) },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Erreur', isPassengerKycRequiredError: () => false },
  })('hooks/trip-detail/useTripDetailEditSubmission.ts');
  const props = { trip: { ...expired, price: 2000 }, editDateTime: new Date(future), isTripDriver: true,
    showDialog: dialog => calls.dialogs.push(dialog), editVehicleId: 'vehicle', editSeats: '2', editPrice: '2500',
    editRouteMode: 'map', editDepartureSelection: { address: 'Départ test' }, editArrivalSelection: { address: 'Arrivée test' },
    editRequiresPassengerKyc: false, updateTripMutation: payload => { calls.update.push(payload); return { unwrap: async () => ({}) }; },
    closeEditModal: () => calls.closed++, refetchTrip() {} };
  return { props, calls, hooks, render: () => hooks.render(() => useTripDetailEditSubmission(props)) };
}

test('saving an editable expired trip publishes the replacement and does not update the historical trip', async () => {
  const app = editorEnvironment();
  await app.render().handleSaveTrip();
  assert.equal(app.calls.reprogram.length, 1);
  assert.equal(app.calls.reprogram[0].id, 'trip');
  assert.equal(app.calls.reprogram[0].updates.departureDate, new Date(future).toISOString());
  assert.equal(app.calls.update.length, 0);
  assert.equal(app.props.trip.status, 'completed');
  assert.equal(app.calls.closed, 1);
  assert.deepEqual(app.calls.routes, ['/trip/new-trip']);
  app.hooks.unmount();
});

test('past/invalid replacement dates and non-owner edits never send mutations', async () => {
  const app = editorEnvironment();
  for (const date of [new Date(past), new Date('invalid')]) {
    app.props.editDateTime = date;
    await app.render().handleSaveTrip();
    assert.equal(app.calls.dialogs.at(-1).title, 'Date de départ');
  }
  app.props.editDateTime = new Date(future); app.props.isTripDriver = false;
  await app.render().handleSaveTrip();
  assert.equal(app.calls.reprogram.length, 0); assert.equal(app.calls.update.length, 0);
  app.hooks.unmount();
});

test('editing an ongoing trip keeps the existing update path and its original departure time', async () => {
  const app = editorEnvironment();
  app.props.trip = { ...app.props.trip, status: 'ongoing', canReprogram: false, isExpired: false };
  app.props.editDateTime = new Date(past);
  await app.render().handleSaveTrip();
  assert.equal(app.calls.reprogram.length, 0);
  assert.equal(app.calls.update.length, 1);
  app.hooks.unmount();
});
