// Integration journeys: real mobile hooks, RTK Query and loopback HTTP.
// Server fixtures, React lifecycle and native speech are simulated, not device E2E.
require('./helpers/localOnlyNetwork.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi, fetchBaseQuery } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const point = { latitude: -4.31, longitude: 15.29, title: 'Ma position actuelle' };
const arrival = { latitude: -4.30, longitude: 15.32, title: 'Gare Centrale' };

async function fixture(t, geocoderAvailable = true) {
  const posts = [], routes = [], hooks = hookHarness(), storeModule = {};
  const state = { active: true, user: { id: 'local-user' }, spoken: [], stops: 0 };
  const wallet = { account: { id: 'local-wallet', userId: state.user.id, balance: 100,
    currency: 'PTS', withdrawableBalance: 60 }, withdrawal: { enabled: false, blocked: true,
    availableMoney: 0, currency: 'CDF', minimumTokens: 1, nonWithdrawableTokens: 100,
    disabledReason: { code: 'TOKEN_WITHDRAWALS_DISABLED' } } };
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/google-maps/reverse-geocode') {
        res.statusCode = geocoderAvailable ? 200 : 503;
        res.end(JSON.stringify(geocoderAvailable ? { formattedAddress: 'Rue des Écoles, Gombe, Kinshasa' } : { message: 'unavailable' }));
      } else if (req.method === 'POST' && ['/trips', '/trips/recurring', '/trip-requests'].includes(req.url)) {
        posts.push({ path: req.url, body });
        res.end(JSON.stringify({ id: 'local-created', ...body, driverId: 'local-driver', status: 'upcoming' }));
      } else if (req.url === '/trips/local-created') {
        res.end(JSON.stringify({ id: 'local-created', ...posts[0].body, driverId: 'local-driver', status: 'upcoming' }));
      } else if (req.url === '/wallet/me') res.end(JSON.stringify(wallet));
      else { res.statusCode = 404; res.end('{}'); }
    } catch { res.statusCode = 500; res.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    hooks.unmount();
    storeModule.store?.dispatch(api.util.resetApiState());
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  const http = fetchBaseQuery({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeout: 2000 });
  const api = createApi({ reducerPath: 'journey',
    // Loopback responses are immediate. Bound this fixture's HTTP deadlines:
    // RTK's Node timeout fallback otherwise keeps the worker alive for 60 s.
    baseQuery: (args, context, extra) => http(typeof args === 'string' ? args : { ...args, timeout: 2000 }, context, extra),
    tagTypes: ['Trip', 'MyTrips', 'RecurringTrip', 'TripRequest', 'MyTripRequests', 'Wallet'], endpoints: () => ({}) });
  const dispatch = (name, arg) => storeModule.store.dispatch(api.endpoints[name].initiate(arg));
  const load = loader({ react: hooks.react, './baseApi': { baseApi: api }, '@/store': storeModule,
    '@react-native-community/datetimepicker': {}, 'react-native-maps': { PROVIDER_GOOGLE: 'google' },
    './tripApi': { mapServerTripToClient: value => value },
    '@/features/wallet/topUpIntent': {},
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    './tokenSession': { getTokenSessionVersion: () => 0 },
    '@/services/analytics': { trackEvent() {} },
    '@/services/tripLocationPermission': { offerTripLocationPermission() {} },
    '@/services/driverPermissionOnboarding': { recordDriverPublication() {} },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => assert.fail(JSON.stringify(value)) }) },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true }) },
    'expo-router': { useRouter: () => ({ replace: value => routes.push(value) }) },
    '@/store/api/tripRequestApi': {
      useCreateTripRequestMutation: () => [body => dispatch('createTripRequest', body), { isLoading: false }],
      useLazyGetMyTripRequestsQuery: () => [() => assert.fail('unexpected recovery')],
    },
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: () => state.user }, '@/store/selectors': {},
    'expo-device': { isDevice: true }, 'react-native': { Platform: { OS: 'android' } },
    'expo-speech': { getAvailableVoicesAsync: async () => [{ language: 'fr-FR', identifier: 'test-voice' }],
      isSpeakingAsync: async () => false, speak: (text, options) => state.spoken.push({ text, options }),
      stop: async () => { state.stops++; } },
    './appActivity': { isAppActive: () => state.active },
    './foregroundRideSound': { isForegroundRideSoundReady: () => false,
      canPlayForegroundRideAudio: async () => false, pauseForegroundRideSoundForSpeech: () => () => {} },
    './rideAlertSession': { pendingRideAlerts: () => [] },
  });
  load('store/api/googleMapsApi.ts');
  const { buildGetTripsEndpoints } = load('store/api/trip/getTrips.endpoints.ts');
  api.injectEndpoints({ endpoints: builder => {
    const all = buildGetTripsEndpoints(builder);
    return { createTrip: all.createTrip, createRecurringTrip: all.createRecurringTrip, getTripById: all.getTripById };
  } });
  load('store/api/tripRequestApi.ts'); load('store/api/walletApi.ts');
  storeModule.store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: defaults => defaults().concat(api.middleware) });
  return { hooks, load, dispatch, posts, routes, state };
}

for (const recurring of [false, true]) test(`GPS to ${recurring ? 'recurring' : 'single'} publication through HTTP preserves labels and coordinates`, async t => {
  const f = await fixture(t);
  const { usePublishSubmission } = f.load('hooks/publish/usePublishSubmission.ts');
  const successes = [];
  const props = { publishInFlightRef: { current: false }, isSubmittingTrip: false,
    hasDepartureAddress: true, hasArrivalAddress: true, seats: '2', price: '2500',
    departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true, selectedVehicleId: 'local-vehicle',
    isPublishIdentityVerified: true, isRecurringTrip: recurring, recurringWeekdays: [1],
    departureAddress: 'Ma position', arrivalAddress: 'Gare Centrale', departureLocation: point, arrivalLocation: arrival,
    departureReference: 'Entrée principale', arrivalReference: '', description: '', acceptedPaymentModes: ['points'],
    formatDateOnlyValue: () => '2030-01-01', formatTimeOnlyValue: () => '12:00',
    createTrip: body => f.dispatch('createTrip', body), createRecurringTrip: body => f.dispatch('createRecurringTrip', body),
    setPublicationSuccess: value => successes.push(value), showDialog: value => assert.fail(JSON.stringify(value)),
  };
  const form = f.hooks.render(() => usePublishSubmission(props));
  await Promise.all([form.handlePublish(), form.handlePublish()]);
  assert.equal(f.posts.length, 1, 'double tap cannot publish twice');
  assert.equal(f.posts[0].path, recurring ? '/trips/recurring' : '/trips');
  assert.equal(f.posts[0].body.departureLocation, 'Rue des Écoles, Gombe, Kinshasa');
  assert.equal(f.posts[0].body.arrivalLocation, 'Gare Centrale');
  assert.deepEqual(f.posts[0].body.departureCoordinates, [15.29, -4.31]);
  assert.equal(f.posts[0].body.pricePerSeat, 2500); assert.equal(f.posts[0].body.totalSeats, 2);
  assert.deepEqual(successes, [{ recurring }]);
  if (!recurring) {
    const remote = await f.dispatch('getTripById', 'local-created').unwrap();
    assert.ok(JSON.stringify(remote).includes('Rue des Écoles'));
    assert.ok(!JSON.stringify(remote).includes('Ma position'));
  }
});

for (const online of [true, false]) test(`request form to HTTP and detail navigation with geocoder ${online ? 'online' : 'unavailable'}`, async t => {
  const f = await fixture(t, online);
  const { useRequestSubmission } = f.load('hooks/trip-request/useRequestSubmission.ts');
  const noop = () => {};
  const props = { arrivalLocation: arrival, departureLocation: point, timePreset: 'custom', hasChosenDepartureTime: true,
    setDepartureDateMin: noop, setFlexibilityMinutes: noop, description: '', departureReference: '', arrivalReference: '',
    hasSpecifiedNumberOfSeats: true, numberOfSeats: 1, selectedVehicleType: 'car', requestPaymentMode: 'cash',
    departureAddress: 'Ma position', arrivalAddress: 'Gare Centrale', hasDepartureAddress: true, hasArrivalAddress: true,
    canSubmitRequestDetails: true, budgetValue: 2500, selectedVehicleOptionUnavailable: false,
    getCurrentDepartureWindow: () => ({ min: new Date('2030-01-01T12:00:00Z'), max: new Date('2030-01-01T12:30:00Z'), flex: 30 }),
    setRequestFormStep: noop, setAddressSectionStep: noop };
  const form = f.hooks.render(() => useRequestSubmission(props));
  await Promise.all([form.handleCreateRequest(), form.handleCreateRequest()]);
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].path, '/trip-requests');
  assert.equal(f.posts[0].body.departureLocation, online ? 'Rue des Écoles, Gombe, Kinshasa' : 'Point de départ (voir la carte)');
  assert.deepEqual(f.posts[0].body.departureCoordinates, [15.29, -4.31]);
  assert.equal(f.posts[0].body.paymentMode, 'cash'); assert.equal(f.posts[0].body.maxPricePerSeat, 2500);
  assert.deepEqual(f.routes, [{ pathname: '/request-details/[id]', params: { id: 'local-created' } }]);
});

test('wallet HTTP response to visible screen speech respects actual withdrawal policy and stops on exit', async t => {
  const f = await fixture(t);
  const summary = await f.dispatch('getMyWallet').unwrap();
  const { useWalletAnnouncement } = f.load('hooks/wallet/useWalletAnnouncement.ts');
  const service = f.load('services/foregroundRideAnnouncement.ts');
  const render = visible => f.hooks.render(() => useWalletAnnouncement({ summary, userId: f.state.user.id,
    visible, loading: false, fetching: false, error: false }));
  render(true); render(true); service.reconcileRideAnnouncement(f.state.user.id); await tick();
  assert.equal(f.state.spoken.length, 1);
  assert.match(f.state.spoken[0].text, /100 jetons disponibles pour payer/);
  assert.match(f.state.spoken[0].text, /ne peuvent pas être retirés en argent/);
  render(true); service.reconcileRideAnnouncement(f.state.user.id); await tick();
  assert.equal(f.state.spoken.length, 1, 'same balance does not repeat');
  render(false); service.reconcileRideAnnouncement(f.state.user.id); await tick();
  assert.equal(f.state.stops, 1);
});

for (const role of ['passenger', 'driver']) test(`${role} payment model to visible hook to speech preserves the reduced server amount`, async t => {
  const f = await fixture(t), model = f.load('features/arrival-payment/paymentAnnouncement.ts');
  const { usePaymentAnnouncement } = f.load('hooks/notifications/usePaymentAnnouncement.ts');
  const service = f.load('services/foregroundRideAnnouncement.ts');
  // Payment execution/ledger are covered separately by real PostgreSQL suites.
  const message = role === 'passenger'
    ? model.passengerPaymentAnnouncement({ bookingId: 'local-booking', amount: 800, currency: 'CDF',
      receipt: { bookingId: 'local-booking', amount: 800, currency: 'CDF', cashInstructions: false } })
    : model.driverPaymentAnnouncement({ bookingId: 'local-booking', amount: 800, currency: 'CDF', mode: 'points' });
  f.hooks.render(() => usePaymentAnnouncement(message, true));
  service.reconcileRideAnnouncement(f.state.user.id); await tick();
  assert.equal(f.state.spoken.length, 1); assert.match(f.state.spoken[0].text, /800 francs congolais/);
  assert.match(f.state.spoken[0].text, /confirmé/);
  f.state.active = false; f.hooks.render(() => usePaymentAnnouncement(message, true));
  service.reconcileRideAnnouncement(f.state.user.id); await tick(); assert.equal(f.state.stops, 1);
});
