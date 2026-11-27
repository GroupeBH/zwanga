const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const a = { latitude: -4.3, longitude: 15.3 }, bend = { latitude: -4.31, longitude: 15.32 }, b = { latitude: -4.32, longitude: 15.3 };
function encode(points) {
  let lat = 0, lng = 0;
  const delta = n => {
    let v = n < 0 ? -2 * n - 1 : 2 * n, result = '';
    while (v >= 32) { result += String.fromCharCode(63 + 32 + v % 32); v = Math.floor(v / 32); }
    return result + String.fromCharCode(63 + v);
  };
  return points.map(p => {
    const nextLat = Math.round(p.latitude * 1e5), nextLng = Math.round(p.longitude * 1e5);
    const result = delta(nextLat - lat) + delta(nextLng - lng); lat = nextLat; lng = nextLng; return result;
  }).join('');
}
const route = (parts = [[a, bend], [bend, b]]) => ({ overviewPolyline: encode([a, b]),
  legs: [{ duration: 600, distance: 3000, steps: parts.map(points => ({ polyline: encode(points) })) }] });
const decode = loader()('utils/routes/bookingRouteGeometry.ts').bookingRouteCoordinates;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('booking follows detailed road bends, not the straight overview', () => {
  assert.deepEqual(decode(route()), [a, bend, b]);
  assert.deepEqual(decode(route([[a, b]])), [a, b], 'a genuine two-point road is still a valid road');
});
test('missing, malformed, disconnected and oversized steps never invent a road', () => {
  for (const value of [null, {}, { legs: [] }, { legs: [{}] }, { legs: [{ steps: [] }] },
    { legs: [{ steps: [{ polyline: '?' }] }] }, route([[a, bend], [a, b]]),
    { legs: [{ steps: [{ polyline: '??'.repeat(100001) }] }] },
    route([Array.from({ length: 10001 }, () => a)])]) assert.deepEqual(decode(value), []);
});
test('the picker and fullscreen map preserve a short bend even above old preview budgets', () => {
  const points = Array.from({ length: 900 }, (_, i) => ({ latitude: -4.3 - i / 1e5, longitude: 15.3 }));
  points[451] = { ...points[451], longitude: 15.32 };
  const detailed = decode(route([points]));
  const display = loader()('features/location-picker/locationPickerModel.ts').pickerDisplayRoute;
  assert.equal(detailed.length, 900);
  assert.equal(display(detailed, 400, true), detailed);
  assert.equal(display(detailed, 400).length, 400, 'unchanged legacy preview budget');
  assert.deepEqual(display(Array(10001).fill(a), 400, true), []);
  const h = hookHarness();
  const stable = loader({ react: h.react })('hooks/maps/useStableMapRoute.ts').useStableMapRoute;
  assert.equal(h.render(() => stable(detailed, true)).length, 900);
  assert.equal(h.render(() => stable([...detailed], true)), detailed, 'no repeated native bridge geometry');
  h.unmount();
});
function apiFixture() {
  const state = { response: { data: { routes: [route()] } }, requests: [], resets: 0 };
  const api = loader({
    '@/store': { store: { dispatch: args => {
      state.requests.push(args);
      return Object.assign(Promise.resolve(state.response), { abort() {}, reset() { state.resets++; } });
    } } },
    '@/store/api/googleMapsApi': { TravelMode: { DRIVING: 'driving' }, googleMapsApi: {
      endpoints: { getDirections: { initiate: args => args } },
    } },
    '@/utils/routeHelpers': { calculateDistance: () => 1 },
  })('utils/routeApi.ts');
  return { state, api };
}
test('strict route reads share requests/cache but never reuse an overview cache', async () => {
  const { state, api } = apiFixture();
  await api.getRouteInfo(a, b);
  const [first, second] = await Promise.all([api.getRouteInfo(a, b, { requireDetailedRoute: true }), api.getRouteInfo(a, b, { requireDetailedRoute: true })]);
  assert.deepEqual(first.coordinates, [a, bend, b]); assert.equal(first.geometry, 'detailed'); assert.equal(first, second);
  assert.equal(state.requests.length, 2);
  assert.deepEqual(state.requests[1], { origin: { lat: a.latitude, lng: a.longitude }, destination: { lat: b.latitude, lng: b.longitude }, mode: 'driving', alternatives: false });
  assert.equal(await api.getRouteInfo(a, b, { requireDetailedRoute: true }), first);
  assert.equal(state.requests.length, 2); assert.equal(state.resets, 2);
});
test('a failed strict route has no estimated line or ETA, and retry can recover immediately', async () => {
  const { state, api } = apiFixture();
  state.response = { error: { status: 503 } };
  const failed = await api.getRouteInfo(a, b, { requireDetailedRoute: true });
  assert.deepEqual(failed, { coordinates: [], duration: 0, distance: 0, geometry: 'fallback' });
  state.response = { data: { routes: [route()] } };
  assert.equal((await api.getRouteInfo(a, b, { requireDetailedRoute: true })).geometry, 'detailed');
  assert.equal(state.requests.length, 2);
});
test('an overview-only legacy server is unavailable for booking, never disguised as a road', async () => {
  const { state, api } = apiFixture();
  state.response = { data: { routes: [{ overviewPolyline: encode([a, bend, b]), legs: [] }] } };
  assert.deepEqual((await api.getRouteInfo(a, b, { requireDetailedRoute: true })).coordinates, []);
});
test('strict route retries respect the shared server throttling cooldown', async () => {
  const { state, api } = apiFixture();
  state.response = { error: { status: 429 } };
  await api.getRouteInfo(a, b, { requireDetailedRoute: true });
  await api.getRouteInfo(a, b, { requireDetailedRoute: true });
  assert.equal(state.requests.length, 1);
});
test('detail rejects fallback geometry, retries on demand and ignores responses after leaving', async () => {
  const h = hookHarness(), pending = [], state = {};
  const hook = loader({ react: h.react,
    '../../features/trip-detail/tripDetailModel': { isValidMapCoordinate: () => true },
    '@/utils/routeApi': { getRouteInfo: (_a, _b, options) => {
      assert.equal(options.requireDetailedRoute, true);
      return new Promise(resolve => pending.push(resolve));
    } },
  })('hooks/trip-detail/useTripDetailRouteCoordinates.ts').useTripDetailRouteCoordinates;
  const props = { isScreenActive: true, trip: { id: 'test', departure: { lat: a.latitude, lng: a.longitude }, arrival: { lat: b.latitude, lng: b.longitude } },
    setRouteCoordinates: x => { state.coordinates = x; }, setRouteInfo: x => { state.info = x; },
    setCalculatedArrivalTime: x => { state.arrival = x; }, setIsLoadingRoute: x => { state.loading = x; } };
  const render = () => h.render(() => hook(props));
  assert.equal(render().routeStatus, 'loading');
  pending[0]({ coordinates: [a, b], duration: 600, geometry: 'fallback' }); await flush();
  assert.equal(render().routeStatus, 'unavailable'); assert.equal(state.coordinates, null);
  render().retryRoute(); assert.equal(render().routeStatus, 'loading');
  pending[1]({ coordinates: [a, bend, b], duration: 600, geometry: 'detailed' }); await flush();
  assert.equal(render().routeStatus, 'ready'); assert.deepEqual(state.coordinates, [a, bend, b]);
  props.trip = { ...props.trip, id: 'next' }; assert.equal(render().routeStatus, 'loading');
  props.isScreenActive = false; render();
  pending[2]({ coordinates: [a, b], geometry: 'detailed' }); await flush();
  assert.equal(state.coordinates, null); h.unmount();
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
test('the booking picker blocks only while its route is missing, exposes retry and retains the selected point', () => {
  const h = hookHarness(), calls = [], inputs = [], selected = { ...a, title: 'Lieu test', address: 'Adresse test' };
  const picker = { selection: selected, cameraTarget: a, recovery: {}, route: [], suggestions: [], query: '', choose() {},
    confirm: () => calls.push('confirm') };
  const { LocationPickerContent } = loader({
    react: { ...React, ...h.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll',
      KeyboardAvoidingView: 'Keyboard', ActivityIndicator: 'Spinner', Platform: { OS: 'ios' }, StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/components/forms/FormLayout': { FormModal: 'Modal' },
    '@/store/api/googleMapsApi': { useGetLandmarksQuery: () => ({ data: [] }) },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ data: [] }) },
    '@/components/location-picker/LocationPickerMap': { LocationPickerMap: 'Map' },
    '@/components/location/LocationRecoveryAction': { LocationRecoveryAction: 'Recovery' },
    '@/hooks/location-picker/useLocationPicker': { useLocationPicker: props => { inputs.push(props); return picker; } },
  })('components/LocationPickerModal.tsx');
  const props = { visible: true, mapEnabled: true, onClose() {}, onSelect() {}, routeStatus: 'unavailable', routeCoordinates: [a, b], onRetryRoute: () => calls.push('retry') };
  const render = () => nodes(h.render(() => LocationPickerContent(props)));
  let tree = render();
  assert.equal(inputs.at(-1).routeCoordinates, undefined, 'do not snap against old/fallback geometry');
  const confirm = () => render().find(n => n.type === 'Button' && n.props.onPress === picker.confirm);
  assert.equal(confirm().props.disabled, true);
  tree.find(n => n.props.accessibilityLabel === 'Réessayer le chargement de l’itinéraire').props.onPress();
  assert.deepEqual(calls, ['retry']); assert.equal(picker.selection, selected);
  props.routeStatus = 'loading'; tree = render(); assert.equal(confirm().props.disabled, true);
  assert.equal(tree.some(n => n.props.onPress === props.onRetryRoute), false);
  props.routeStatus = 'ready'; tree = render(); assert.equal(confirm().props.disabled, false);
  assert.equal(tree.find(n => n.type === 'Map').props.preserveRouteGeometry, true);
  assert.equal(inputs.at(-1).routeCoordinates, props.routeCoordinates);
  props.routeStatus = undefined; assert.equal(confirm().props.disabled, false, 'ordinary place pickers remain usable without routing');
  h.unmount();
});
