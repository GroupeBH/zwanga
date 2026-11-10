// Actual mobile draft/controller/schedule/submission. Native I/O and server replies simulated.
const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const departure = { latitude: -4.31, longitude: 15.29, title: 'Départ test', address: 'Rue test A' };
const arrival = { latitude: -4.33, longitude: 15.32, title: 'Arrivée test', address: 'Rue test B' };

function fixture(t, { withDeparture = true, entry = 'home', gpsFails = false } = {}) {
  const hooks = hookHarness('home-command'), posts = [], routes = [], dialogs = [], listeners = new Set();
  const slice = loader()('store/slices/requestDraftsSlice.ts');
  const store = configureStore({ reducer: { requestDrafts: slice.default } });
  const state = { active: true, params: { entry }, response: () => Promise.resolve({ id: 'synthetic-command' }), gps: 0,
    gpsRead: async () => { if (gpsFails) throw Error('GPS unavailable'); return null; },
    address: async point => ({ ...point, title: 'Position test', address: 'Rue GPS test' }) };
  if (withDeparture) Object.assign(state.params, { departure: departure.title, departureAddress: departure.address,
    departureLat: String(departure.latitude), departureLng: String(departure.longitude) });
  const load = loader({ react: { ...hooks.react, startTransition: fn => fn() },
    'react-native': { Platform: { OS: 'android' }, Keyboard: { dismiss() {} },
      BackHandler: { addEventListener: (_, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } } },
    '@react-native-community/datetimepicker': { DateTimePickerAndroid: { dismiss: async () => {}, open() {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-router': { useLocalSearchParams: () => state.params, useRouter: () => ({ replace: route => routes.push(route), back: () => routes.push('back') }),
      useFocusEffect: callback => hooks.react.useEffect(() => state.active ? callback() : undefined, [state.active, callback]) },
    'react-redux': { useStore: () => store },
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: select => select(store.getState()) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/hooks/useUserLocation': { useUserLocation: () => ({ getCurrentLocation: async () => {
      state.gps++; return state.gpsRead();
    } }) },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ data: [] }) },
    '@/store/api/googleMapsApi': { useGeocodeMutation: () => [() => assert.fail('unexpected geocode')] },
    './useRequestRouteEffects': { useRequestRouteEffects: () => ({}) },
    './useRequestQuickPlaces': { useRequestQuickPlaces: () => ({}) },
    './useDirectDriverPrefill': { useDirectDriverPrefill: () => ({ blocked: false }) },
    './useRequestVehicleOptions': { useRequestVehicleOptions: () => ({ vehicleOptions: [
      { vehicleType: 'car', recommendedPricePerSeat: 2500, availableForRequestedSeats: true },
      { vehicleType: 'motorcycle_2_wheels', recommendedPricePerSeat: 1500, availableForRequestedSeats: true },
    ], isPriceLoading: false, isVehicleOptionsError: false }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true, checkIdentity() {}, refreshKycStatus() {} }) },
    '@/services/sharedRouteAddresses': { resolveSharedRouteAddresses: async (start, end) => ({ departureAddress: start.text, arrivalAddress: end.text }) },
    '@/utils/currentLocationSelection': { buildCurrentLocationSelection: point => state.address(point) },
    '@/utils/errorHelpers': { isAmbiguousTransportError: error => error.status === 'TIMEOUT_ERROR',
      getApiErrorMessage: (_error, fallback) => fallback, isPassengerKycRequiredError: () => false, isExtraSeatsIdentityError: () => false },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/services/tripLocationPermission': { offerTripLocationPermission() {} },
    '@/store/api/tripRequestApi': {
      useCreateTripRequestMutation: () => [body => ({ unwrap: () => { posts.push(body); return state.response(); } }), { isLoading: false }],
      useLazyGetMyTripRequestsQuery: () => [() => ({ unwrap: async () => [] })],
    },
  });
  const { useRequestTripController } = load('hooks/trip-request/useRequestTripController.ts');
  const { useHomeRequestFlow } = load('hooks/trip-request/useHomeRequestFlow.ts');
  const render = () => hooks.render(() => {
    const form = useRequestTripController();
    return { form, flow: useHomeRequestFlow(form) };
  });
  t.after(() => hooks.unmount());
  const settle = () => { let result; for (let i = 0; i < 4; i++) result = render(); return result; };
  const select = point => {
    const { flow } = settle();
    flow.onSelect(point); flow.closePicker(); // Real picker confirms then closes in the same event.
    assert.deepEqual(routes, [], 'confirmation must not navigate back before React rerenders');
    return settle();
  };
  return { render, settle, select, hooks, state, posts, routes, dialogs, listeners, back: () => [...listeners].at(-1)?.() };
}

const gpsFix = () => ({ coords: { latitude: departure.latitude, longitude: departure.longitude, accuracy: 20 }, timestamp: Date.now() });

test('destination selection goes straight to the quote without any dismiss callback or price step', t => {
  const f = fixture(t); let view = f.settle();
  assert.equal(view.flow.pickerTarget, 'arrival'); assert.equal(view.form.timePreset, 'now');
  assert.deepEqual(view.form.departureLocation, departure); assert.equal(f.state.gps, 0);
  view = f.select(arrival);
  assert.equal(view.flow.pickerTarget, null); assert.equal(view.form.requestFormStep, 'details');
  assert.equal(f.posts.length, 0, 'only explicit order confirmation submits');
  view.form.applyPreset('custom'); f.state.active = false; f.settle(); f.state.active = true;
  view = f.settle(); assert.equal(view.form.timePreset, 'custom'); assert.equal(view.flow.pickerTarget, null);
});

test('failed GPS shows the pickup workspace directly and keeps the confirmed destination', async t => {
  const f = fixture(t, { withDeparture: false }); f.settle(); await tick();
  let view = f.select(arrival); assert.equal(view.flow.pickerTarget, 'departure');
  assert.deepEqual(view.form.arrivalLocation, arrival); assert.equal(view.form.departureLocation, null);
  view = f.select(departure); assert.equal(view.flow.pickerTarget, null); assert.equal(view.form.requestFormStep, 'details');
  assert.equal(f.posts.length, 0); await view.flow.submit();
  assert.deepEqual(f.posts[0].departureCoordinates, [departure.longitude, departure.latitude]);
  assert.deepEqual(f.posts[0].arrivalCoordinates, [arrival.longitude, arrival.latitude]);
});

test('old route-only state with both coordinates recovers directly to the quote', t => {
  const f = fixture(t); f.settle(); let view = f.select(arrival);
  view.form.setRequestFormStep('route'); view = f.settle();
  assert.equal(view.flow.pickerTarget, null); assert.equal(view.form.requestFormStep, 'details');
  assert.equal(f.posts.length, 0);
});

for (const target of ['arrival', 'departure']) test('closing incomplete ' + target + ' leaves the order, never an empty intermediate page', async t => {
  const f = fixture(t, { withDeparture: false }); f.settle(); await tick();
  if (target === 'departure') f.select(arrival);
  const view = f.settle(); assert.equal(view.flow.pickerTarget, target);
  view.flow.closePicker(); assert.deepEqual(f.routes, ['back']); assert.equal(f.posts.length, 0);
  f.hooks.unmount(); view.flow.onSelect(departure); assert.equal(f.posts.length, 0);
});

test('editing either confirmed endpoint then closing returns to the quote with draft unchanged', t => {
  const f = fixture(t); f.settle(); let view = f.select(arrival);
  view.form.updateBudget(3500); view.form.setDescription('Note de test'); view = f.settle();
  for (const target of ['arrival', 'departure']) {
    view.flow.openPicker(target); view = f.settle(); assert.equal(view.flow.pickerTarget, target);
    view.flow.closePicker(); view = f.settle(); assert.equal(view.flow.pickerTarget, null);
    assert.equal(view.form.budgetValue, 3500); assert.equal(view.form.description, 'Note de test');
    assert.deepEqual(view.form.departureLocation, departure); assert.deepEqual(view.form.arrivalLocation, arrival);
  }
  assert.deepEqual(f.routes, []);
});

test('Android back closes an edit, then leaves the quote; listener is paused and removed', t => {
  const f = fixture(t); f.settle(); let view = f.select(arrival);
  view.flow.openPicker('arrival'); f.settle(); assert.equal(f.listeners.size, 1);
  assert.equal(f.back(), true); view = f.settle(); assert.equal(view.flow.pickerTarget, null);
  assert.deepEqual(f.routes, []); f.back(); assert.deepEqual(f.routes, ['back']);
  f.state.active = false; f.settle(); assert.equal(f.listeners.size, 0);
  f.state.active = true; f.settle(); assert.equal(f.listeners.size, 1);
  f.hooks.unmount(); assert.equal(f.listeners.size, 0);
});

test('duplicate, stale and invalid picker results cannot change the other endpoint', async t => {
  const f = fixture(t, { withDeparture: false }); f.settle(); await tick();
  let view = f.settle(); const old = view.flow.onSelect;
  old({ ...arrival, latitude: NaN }); assert.equal(f.settle().form.arrivalLocation, null);
  old(arrival); old(departure); view = f.settle();
  assert.deepEqual(view.form.arrivalLocation, arrival); assert.equal(view.flow.pickerTarget, 'departure');
  old(arrival); assert.equal(f.settle().form.departureLocation, null);
  f.state.active = false; f.settle(); view.flow.onSelect(departure);
  assert.equal(f.settle().form.departureLocation, null);
  f.state.active = true; f.settle(); view = f.select(departure); assert.equal(view.flow.pickerTarget, null);
});

for (const planned of [false, true]) test('single quote confirmation keeps payload and duplicate-submit guard, planned=' + planned, async t => {
  const f = fixture(t); f.settle(); let view = f.select(arrival);
  view.form.updateBudget(3500); view.form.setSelectedVehicleTypes(['car', 'motorcycle_2_wheels']);
  view.form.setDepartureReference('Devant le portail'); view.form.setDescription('Un bagage');
  if (planned) { view.form.applyPreset('custom'); view.form.setHasChosenDepartureTime(true); }
  view = f.settle(); const pending = view.flow.submit(); await view.flow.submit(); await pending;
  assert.equal(f.posts.length, 1); assert.deepEqual(f.dialogs, []);
  const body = f.posts[0];
  assert.deepEqual(body.departureCoordinates, [departure.longitude, departure.latitude]);
  assert.deepEqual(body.arrivalCoordinates, [arrival.longitude, arrival.latitude]);
  assert.deepEqual(body.vehicleTypes, ['car', 'motorcycle_2_wheels']); assert.equal(body.maxPricePerSeat, 3500);
  assert.equal(body.paymentMode, 'cash'); assert.equal(body.immediateDispatch, !planned);
  assert.equal(body.departureReference, 'Devant le portail'); assert.equal(body.description, 'Un bagage');
  assert.ok(Date.parse(body.departureDateMax) > Date.parse(body.departureDateMin));
  assert.deepEqual(f.routes, [{ pathname: '/request-details/[id]', params: { id: 'synthetic-command' } }]);
});

test('failed submission preserves the quote and retry; success cannot be mistaken for a failure', async t => {
  const f = fixture(t); f.settle(); let view = f.select(arrival);
  f.state.response = () => Promise.reject({ status: 400, data: { message: 'Commande impossible' } });
  await view.flow.submit(); view = f.settle();
  assert.ok(view.form.submissionError); assert.equal(view.flow.pickerTarget, null);
  assert.deepEqual(view.form.arrivalLocation, arrival); assert.equal(f.routes.length, 0);
  f.state.response = () => Promise.resolve({ id: 'synthetic-command' });
  await view.flow.submit(); assert.equal(f.posts.length, 2); assert.equal(f.routes.length, 1);
});

test('slow GPS prevents submission, then fills the quote without a continue button', async t => {
  const f = fixture(t, { withDeparture: false }); let finish;
  f.state.gpsRead = () => new Promise(resolve => { finish = resolve; });
  f.settle(); let view = f.select(arrival); assert.equal(view.flow.pickerTarget, null);
  assert.equal(view.flow.pickup.status, 'loading'); await view.flow.submit(); assert.equal(f.posts.length, 0);
  finish(gpsFix()); await tick(); view = f.settle();
  assert.equal(view.form.requestFormStep, 'details'); assert.equal(view.flow.pickerTarget, null);
  await view.flow.submit(); assert.equal(f.posts.length, 1);
});

for (const unavailable of [false, true]) test('prefilled destination shortcut does not ask for that destination again, GPS unavailable=' + unavailable, async t => {
  const f = fixture(t, { withDeparture: false });
  Object.assign(f.state.params, { arrival: arrival.title, arrivalAddress: arrival.address,
    arrivalLat: String(arrival.latitude), arrivalLng: String(arrival.longitude) });
  f.state.gpsRead = async () => unavailable ? null : gpsFix(); f.settle(); await tick(); const view = f.settle();
  assert.deepEqual(view.form.arrivalLocation, arrival);
  assert.equal(view.flow.pickerTarget, unavailable ? 'departure' : null); assert.equal(f.state.gps, 1); assert.equal(f.posts.length, 0);
});

for (const kind of ['old', 'future', 'inaccurate', 'unknown-accuracy', 'invalid', 'throws']) {
  test('GPS ' + kind + ' leaves only the manual pickup workspace, no intermediary', async t => {
    const f = fixture(t, { withDeparture: false }); const fix = gpsFix();
    if (kind === 'old') fix.timestamp -= 15 * 60_000;
    if (kind === 'future') fix.timestamp += 60_000;
    if (kind === 'inaccurate') fix.coords.accuracy = 1000;
    if (kind === 'unknown-accuracy') fix.coords.accuracy = null;
    if (kind === 'invalid') fix.coords.latitude = NaN;
    f.state.gpsRead = async () => { if (kind === 'throws') throw Error('GPS unavailable'); return fix; };
    f.settle(); f.select(arrival); await tick(); let view = f.settle();
    assert.equal(view.form.departureLocation, null); assert.equal(view.flow.pickerTarget, 'departure');
    view = f.select(departure); assert.equal(view.flow.pickerTarget, null);
    assert.equal(view.form.requestFormStep, 'details'); assert.deepEqual(view.form.arrivalLocation, arrival);
  });
}

test('late GPS cannot replace a manually confirmed point or change an unmounted draft', async t => {
  const f = fixture(t, { withDeparture: false }); let finish;
  f.state.gpsRead = () => new Promise(resolve => { finish = resolve; });
  f.settle(); f.select(arrival).flow.openPicker('departure'); f.settle();
  let view = f.select(departure); finish(gpsFix()); await tick(); view = f.settle();
  assert.deepEqual(view.form.departureLocation, departure); assert.equal(view.flow.pickup.source, 'manual');
  const other = fixture(t, { withDeparture: false }); let late;
  other.state.gpsRead = () => new Promise(resolve => { late = resolve; });
  other.settle(); other.hooks.unmount(); late(gpsFix()); await tick(); assert.equal(other.posts.length, 0);
});

test('GPS timeout goes directly to manual selection and ignores a late result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const f = fixture(t, { withDeparture: false }); let finish;
  f.state.gpsRead = () => new Promise(resolve => { finish = resolve; });
  f.settle(); f.select(arrival); t.mock.timers.tick(20_001); await tick();
  assert.equal(f.settle().flow.pickerTarget, 'departure'); finish(gpsFix()); await tick();
  assert.equal(f.settle().form.departureLocation, null); assert.equal(f.select(departure).flow.pickerTarget, null);
});

test('reverse address timeout preserves real coordinates and proceeds to the quote', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const f = fixture(t, { withDeparture: false });
  f.state.gpsRead = async () => gpsFix(); f.state.address = () => new Promise(() => {});
  f.settle(); f.select(arrival); await tick(); t.mock.timers.tick(2_001); await tick(); const view = f.settle();
  assert.equal(view.flow.pickerTarget, null); assert.equal(view.form.departureLocation.latitude, departure.latitude);
  assert.equal(view.form.departureLocation.longitude, departure.longitude);
});
