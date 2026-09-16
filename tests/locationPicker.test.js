const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const point = { latitude: -4.32, longitude: 15.32 };
const place = { ...point, title: 'Gombe', address: 'Gombe, Kinshasa' };
const suggestion = { id: 'gombe', name: 'Gombe', fullAddress: 'Gombe, Kinshasa', coordinates: point, placeType: [] };

function pickerApp(t, extra = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  const calls = { search: [], details: [], geocode: [], reverse: [], selected: [], closed: 0, permissions: 0, positions: 0 };
  const io = {
    search: async () => [suggestion], details: async () => suggestion,
    permission: async () => ({ status: 'granted' }), cached: async () => ({ coords: point }),
    position: async () => ({ coords: point }),
  };
  const mutation = name => args => {
    const task = deferred();
    const request = { args, ...task, aborted: false, abort() { this.aborted = true; }, unwrap: () => task.promise };
    calls[name].push(request);
    return request;
  };
  const geocode = mutation('geocode'), reverse = mutation('reverse');
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Keyboard: { dismiss() {} } },
    '@/store': { store: {} },
    'expo-location': {
      Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: () => { calls.permissions++; return io.permission(); },
      getLastKnownPositionAsync: () => io.cached(), getCurrentPositionAsync: () => { calls.positions++; return io.position(); },
    },
    '@/utils/googleMapsPlaces': {
      searchGoogleMapsPlaces: (...args) => { calls.search.push(args); return io.search(...args); },
      getGoogleMapsPlaceDetails: (...args) => { calls.details.push(args); return io.details(...args); },
    },
    '@/store/api/googleMapsApi': { useGeocodeMutation: () => [geocode], useReverseGeocodeMutation: () => [reverse] },
  });
  const { useLocationPicker } = load('hooks/location-picker/useLocationPicker.ts');
  const props = { initialLocation: place, onSelect: value => calls.selected.push(value), onClose: () => calls.closed++, ...extra };
  const render = () => hooks.render(() => useLocationPicker(props));
  t.after(() => hooks.unmount());
  return { hooks, calls, io, props, render, load };
}

test('typing is debounced, moving the map does not restart search and stale results are ignored', async t => {
  const app = pickerApp(t);
  const old = deferred();
  app.io.search = () => old.promise;
  app.render().setQuery('Gom'); app.render();
  t.mock.timers.tick(300);
  app.render().setQuery('Gombe'); app.render();
  t.mock.timers.tick(549);
  assert.equal(app.calls.search.length, 0);
  t.mock.timers.tick(1);
  assert.equal(app.calls.search.length, 1);
  app.render().setQuery('Lemba'); app.render();
  old.resolve([suggestion]); await flush();
  assert.deepEqual(app.render().suggestions, []);
  app.render().choose({ ...place, latitude: -4.4 }); app.render();
  t.mock.timers.tick(1000);
  assert.equal(app.calls.search.length, 1, 'closing search after a selection cancels its next debounce');
});

test('a favorite or suggestion with coordinates is immediately usable without details or address requests', async t => {
  const app = pickerApp(t);
  await app.render().resolvePlace(suggestion);
  const state = app.render();
  assert.deepEqual(state.selection, place);
  assert.equal(state.resolving, false);
  assert.equal(state.searchOpen, false);
  assert.equal(app.calls.details.length, 0);
  assert.equal(app.calls.geocode.length, 0);
  state.confirm(); state.confirm();
  assert.equal(app.calls.selected.length, 1);
  assert.equal(app.calls.closed, 1);
});

test('a quick landmark resolves to a selection without launching another text search', async t => {
  const app = pickerApp(t);
  await app.render().selectLandmark({ id: 'gombe', name: 'Gombe', query: 'Gombe Kinshasa' });
  assert.equal(app.render().selection.title, 'Gombe');
  t.mock.timers.tick(1000);
  assert.equal(app.calls.search.length, 1);
  assert.equal(app.calls.details.length, 0);
});

test('a place lookup cannot replace a favorite selected while the network was slow', async t => {
  const app = pickerApp(t);
  const detail = deferred();
  app.io.details = () => detail.promise;
  const pending = app.render().resolvePlace({ ...suggestion, coordinates: { latitude: null, longitude: null } });
  assert.equal(app.render().resolving, true);
  app.render().choose({ ...place, title: 'Maison', latitude: -4.4 });
  detail.resolve(suggestion); await pending;
  assert.equal(app.render().selection.title, 'Maison');
  assert.equal(app.calls.geocode.length, 0);
});

test('map selection is committed before its address resolves and confirmation works offline', async t => {
  const app = pickerApp(t);
  const next = { latitude: -4.4, longitude: 15.4 };
  app.render().startPanning();
  app.render().confirm();
  assert.equal(app.calls.selected.length, 0);
  app.render().settleMap(next); app.render();
  t.mock.timers.tick(400);
  assert.equal(app.calls.reverse.length, 1);
  assert.equal(app.render().addressLoading, true);
  app.render().confirm();
  assert.equal(app.calls.selected[0].latitude, next.latitude);
  assert.equal(app.calls.selected[0].address, 'Position exacte enregistrée sur la carte');
  app.calls.reverse[0].reject(Error('offline')); await flush();
});

test('an old reverse-geocode result cannot move or rename a new selected point', async t => {
  const app = pickerApp(t);
  app.render().settleMap({ latitude: -4.4, longitude: 15.4 }); app.render();
  t.mock.timers.tick(400);
  const old = app.calls.reverse[0];
  app.render().startPanning(); app.render();
  assert.equal(old.aborted, true);
  app.render().settleMap({ latitude: -4.42, longitude: 15.42 }); app.render();
  old.resolve({ formattedAddress: 'Ancienne adresse' }); await flush();
  assert.notEqual(app.render().selection.title, 'Ancienne adresse');
  assert.equal(app.render().selection.latitude, -4.42);
});

test('reverse geocoding resolves a readable label, caches it and never moves the selected point', async t => {
  const app = pickerApp(t);
  const next = { latitude: -4.38, longitude: 15.32 };
  app.render().settleMap(next); app.render(); t.mock.timers.tick(400);
  assert.deepEqual(app.calls.reverse[0].args, { lat: next.latitude, lng: next.longitude, language: 'fr', region: 'cd' });
  app.calls.reverse[0].resolve({
    formattedAddress: 'J83F+5G4, Av. Bakole 1, Kinshasa', lat: -4.39, lng: 15.33,
    addressComponents: [{ longName: 'Av. Bakole 1', types: ['route'] }],
  });
  await flush();
  assert.deepEqual(app.render().selection, { ...next, title: 'Av. Bakole 1', address: 'Av. Bakole 1, Kinshasa' });
  app.render().settleMap(point); app.render();
  app.render().settleMap(next); app.render();
  t.mock.timers.tick(400);
  assert.equal(app.calls.reverse.length, 1, 'cached names need no further geocoding call');
  app.render().confirm();
  assert.deepEqual(app.calls.selected[0], { ...next, title: 'Av. Bakole 1', address: 'Av. Bakole 1, Kinshasa' });
});

test('historical selections and favorite labels are cleaned when entering the picker', t => {
  const app = pickerApp(t, { initialLocation: { ...point, title: 'J83F+5G4', address: 'J83F+5G4, Av. Bakole 1, Kinshasa' } });
  assert.equal(app.render().selection.title, 'Av. Bakole 1');
  app.render().choose({ ...point, title: 'Maison', address: 'HF6ZT7E, Av. Bakole 1, Kinshasa' });
  app.render().confirm();
  assert.deepEqual(app.calls.selected[0], { ...point, title: 'Maison', address: 'Av. Bakole 1, Kinshasa' });
  assert.equal(app.calls.reverse.length, 0);
});

test('a neighborhood-first reverse address submits the avenue to the parent form', async t => {
  const app = pickerApp(t);
  const next = { latitude: -4.45, longitude: 15.26 };
  app.render().settleMap(next); app.render(); t.mock.timers.tick(400);
  app.calls.reverse[0].resolve({
    formattedAddress: 'Q/Mazamba Domicile, 3b Av Matadi, Kinshasa, RDC',
    addressComponents: [{ longName: 'Q/Mazamba Domicile', types: ['premise'] }],
  });
  await flush();
  app.render().confirm();
  assert.deepEqual(app.calls.selected[0], {
    ...next, title: '3b Av Matadi', address: '3b Av Matadi, Q/Mazamba Domicile, Kinshasa, RDC',
  });
  assert.equal(app.calls.reverse.length, 1);
});

test('a late address must not overwrite a favorite just selected at the same coordinate', async t => {
  const app = pickerApp(t);
  const next = { latitude: -4.38, longitude: 15.32 };
  app.render().settleMap(next); app.render(); t.mock.timers.tick(400);
  app.render().choose({ ...next, title: 'Maison', address: 'Av. Bakole 1, Kinshasa' });
  app.calls.reverse[0].resolve({ formattedAddress: 'J83F+5G4, Ancienne avenue, Kinshasa' });
  await flush();
  assert.equal(app.render().selection.title, 'Maison');
});

test('denied and slow GPS never block manual map selection; repeated taps make one location request', async t => {
  const app = pickerApp(t);
  app.io.permission = async () => ({ status: 'denied' });
  await app.render().locate();
  assert.match(app.render().notice, /non autorisée/);
  const pending = deferred();
  app.io.permission = () => pending.promise;
  const gps = app.render().locate();
  void app.render().locate();
  assert.equal(app.calls.permissions, 2);
  t.mock.timers.tick(15_000);
  assert.equal(app.render().locating, false);
  app.render().choose({ ...place, title: 'Mon choix' });
  pending.resolve({ status: 'granted' }); await gps;
  assert.equal(app.render().selection.title, 'Mon choix');
});

test('a recent cached GPS location avoids a new GPS fix and does not wait for reverse geocoding', async t => {
  const app = pickerApp(t);
  await app.render().locate();
  assert.equal(app.calls.positions, 0);
  assert.equal(app.render().locating, false);
  assert.equal(app.render().selection.title, 'Ma position');
  app.render().confirm();
  assert.equal(app.calls.selected[0].latitude, point.latitude);
});

test('route restrictions preserve full-route snapping, including when the route arrives late', t => {
  const app = pickerApp(t);
  const route = [{ latitude: -4.3, longitude: 15.3 }, { latitude: -4.3, longitude: 15.4 }];
  app.render();
  app.props.routeCoordinates = route;
  app.render();
  assert.equal(app.render().selection.latitude, -4.3);
  app.render().choose({ ...place, latitude: -4.5, longitude: 15.35 });
  const state = app.render();
  assert.equal(state.selection.latitude, -4.3);
  state.confirm();
  assert.equal(app.calls.selected[0].latitude, -4.3);
});

test('closing/unmounting invalidates in-flight work without committing a selection', async t => {
  const app = pickerApp(t);
  const pending = deferred();
  app.io.details = () => pending.promise;
  const job = app.render().resolvePlace({ ...suggestion, coordinates: { latitude: null, longitude: null } });
  app.render().close(); app.hooks.unmount();
  pending.resolve(suggestion); await job;
  assert.equal(app.calls.geocode.length, 0);
  assert.equal(app.calls.selected.length, 0);
});

test('a historical favorite with swapped coordinates keeps its name', t => {
  const app = pickerApp(t);
  app.render().choose({ ...place, title: 'Maison', latitude: point.longitude, longitude: point.latitude });
  assert.deepEqual(app.render().selection, { ...place, title: 'Maison' });
});

test('RDC bounds, swapped coordinates and render-only route limits remain enforced', () => {
  const model = loader()('features/location-picker/locationPickerModel.ts');
  assert.deepEqual(model.getPickerCoordinate(15.32, -4.32), point);
  for (const coords of [[NaN, 15], [0, 0], [48, 2]]) assert.equal(model.getPickerCoordinate(...coords), null);
  const route = Array.from({ length: 10_000 }, (_, i) => ({ latitude: -4.3, longitude: 15 + i / 10_000 }));
  const result = model.pickerDisplayRoute(route);
  assert.equal(result.length, 400);
  assert.equal(result[0], route[0]);
  assert.equal(result.at(-1), route.at(-1));
  assert.equal(route.length, 10_000);
});

const nodes = tree => {
  const result = [];
  const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (React.isValidElement(node)) { result.push(node); visit(node.props.children); } };
  visit(tree); return result;
};

test('memoized map waits for readiness and never reanimates intermediate programmatic callbacks', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  const pans = [], settled = [], animations = [];
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFillObject: {} }, View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', TouchableOpacity: 'Button' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-maps': { __esModule: true, default: 'Map', Polyline: 'Polyline', PROVIDER_GOOGLE: 'google' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useSharedValue: value => hooks.react.useRef({ value }).current, useAnimatedStyle: fn => fn(), withTiming: value => value, cancelAnimation() {} },
  });
  const { LocationPickerMap } = load('components/location-picker/LocationPickerMap.tsx');
  assert.equal(LocationPickerMap.$$typeof, Symbol.for('react.memo'));
  const props = { enabled: false, target: point, route: [], restrictToRoute: false, onPanStart: () => pans.push(1), onSettle: value => settled.push(value), onPress() {} };
  const render = () => hooks.render(() => LocationPickerMap.type(props));
  const map = () => nodes(render()).find(node => node.type === 'Map');
  assert.equal(map(), undefined);
  props.enabled = true;
  const native = map();
  native.props.ref.current = { animateToRegion: value => animations.push(value) };
  props.target = { latitude: -4.4, longitude: 15.4 };
  render();
  assert.equal(animations.length, 0);
  map().props.onLayout({ nativeEvent: { layout: { width: 350, height: 400 } } });
  map().props.onMapReady(); render();
  assert.equal(animations.length, 1);
  for (let i = 0; i < 300; i++) map().props.onRegionChangeComplete({ ...point, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  assert.equal(animations.length, 1);
  assert.equal(settled.length, 0);
  t.mock.timers.tick(700);
  const moved = { latitude: -4.5, longitude: 15.5, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  map().props.onRegionChange(moved);
  map().props.onRegionChangeComplete(moved);
  assert.equal(pans.length, 1);
  assert.equal(settled.length, 1);
  hooks.unmount();
  t.mock.timers.tick(20_000);
});

test('the modal mounts its session only when visible and its map only after the opening animation', () => {
  const hooks = hookHarness();
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Modal: 'Modal', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': {},
    '@/store/api/googleMapsApi': {}, '@/store/api/userApi': {},
    '@/hooks/location-picker/useLocationPicker': {},
    '@/components/location-picker/LocationPickerMap': { LocationPickerMap: 'PickerMap' },
  });
  const Modal = load('components/LocationPickerModal.tsx').default;
  const props = { visible: false, onClose() {}, onSelect() {} };
  const render = () => hooks.render(() => Modal(props));
  assert.equal(render().props.children, false);
  props.visible = true;
  assert.equal(render().props.children.props.mapEnabled, false);
  render().props.onShow();
  assert.equal(render().props.children.props.mapEnabled, true);
  props.visible = false;
  assert.equal(render().props.children, false);
  props.visible = true;
  assert.equal(render().props.children.props.mapEnabled, false);
  hooks.unmount();
});

test('search overlays the map without resizing it and preserves its props; footer confirmation waits for a selected result', () => {
  let hooks = hookHarness();
  const state = {
    selection: place, cameraTarget: point, route: [], query: '', searchOpen: false, suggestions: [],
    searching: false, resolving: false, locating: false, panning: false, addressLoading: false,
    choose() {}, close() {}, locate() {}, resolvePlace() {}, startPanning() {}, settleMap() {}, confirm() {},
  };
  const react = { ...React, ...Object.fromEntries(Object.keys(hooks.react).map(key => [key, (...args) => hooks.react[key](...args)])) };
  const load = loader({
    react,
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: x => x }, Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', FlatList: 'FlatList', TouchableOpacity: 'Button' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 34 }) },
    '@/store/api/googleMapsApi': { useGetLandmarksQuery: () => ({ data: [] }) },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ data: [] }) },
    '@/hooks/location-picker/useLocationPicker': { useLocationPicker: () => state },
    '@/components/location-picker/LocationPickerMap': { LocationPickerMap: 'PickerMap' },
  });
  const Modal = load('components/LocationPickerModal.tsx').default;
  const content = hooks.render(() => Modal({ visible: true, onClose() {}, onSelect() {} })).props.children;
  hooks = hookHarness();
  const render = () => hooks.render(() => content.type(content.props));
  const normal = render();
  const map = nodes(normal).find(node => node.type === 'PickerMap');
  state.query = 'Gombe'; state.searchOpen = true;
  const searching = render();
  assert.equal(searching.type, 'KeyboardAvoidingView');
  const newMap = nodes(searching).find(node => node.type === 'PickerMap');
  for (const key of Object.keys(map.props)) assert.equal(newMap.props[key], map.props[key], `stable map prop: ${key}`);
  const list = nodes(searching).find(node => node.type === 'FlatList');
  assert.equal(list.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(list.props.windowSize, 3);
  const confirm = nodes(searching).find(node => node.props.onPress === state.confirm);
  assert.equal(confirm.props.disabled, true);
  const styles = load('features/location-picker/LocationPicker.styles.ts').styles;
  assert.equal(styles.results.position, 'absolute');
  assert.equal(styles.workspace.flex, 1);
  assert.ok(styles.confirm.minHeight >= 44);
  hooks.unmount();
});
