const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node)
  ? [node, ...nodes(node.props.children)] : [];
const native = Object.fromEntries(['View', 'Text', 'Pressable', 'FlatList', 'ActivityIndicator', 'TextInput', 'KeyboardAvoidingView'].map(type => [type, type]));
native.Platform = { OS: 'android' };
native.StyleSheet = { create: value => value, absoluteFill: {} };
const ui = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
  '@/features/navigation/RideModal': { RideModal: 'Modal' } };

test('driver choices are read only while visible and active; search waits for typing to settle', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const env = { active: true, online: true }, calls = [], selected = [];
  const item = { id: 'driver', name: 'Conducteur test', vehicle: 'Voiture', distanceKm: '1.2' };
  const props = { departure: { latitude: -4.3, longitude: 15.31 }, seats: 1, vehicleType: 'car', selected: null,
    onSelect: value => selected.push(value) };
  const { RequestDriverPicker } = loader({ ...ui, react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => env.active },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active && env.online, displayReadOptions: enabled => ({ skip: !enabled }) },
    '@/store/api/requestDriverApi': { useRequestDriverChoicesQuery: (args, options) => {
      calls.push({ args, options }); return { currentData: [item], isError: false, isFetching: false };
    } },
  })('components/trip-request/RequestDriverPicker.tsx');
  const render = () => nodes(hooks.render(() => RequestDriverPicker(props)));
  let tree = render(); assert.equal(calls.at(-1).options.skip, true);
  tree.find(n => n.props.accessibilityLabel === 'Choisir un conducteur, facultatif').props.onPress();
  tree = render(); assert.equal(calls.at(-1).options.skip, false);
  const list = tree.find(n => n.type === 'FlatList'); assert.deepEqual(list.props.data, [item]);
  list.props.renderItem({ item }).props.onPress();
  assert.deepEqual(selected, [{ ...item, vehicleType: 'car' }]);
  tree = render(); assert.equal(calls.at(-1).options.skip, true);
  tree.find(n => n.props.accessibilityLabel === 'Choisir un conducteur, facultatif').props.onPress();
  tree = render(); tree.filter(n => n.props.accessibilityRole === 'tab')[1].props.onPress();
  tree = render(); assert.equal(calls.at(-1).options.skip, true);
  tree.find(n => n.type === 'TextInput').props.onChangeText('Conducteur');
  render(); assert.equal(calls.at(-1).options.skip, true);
  t.mock.timers.tick(350); tree = render();
  assert.equal(calls.at(-1).args.search, 'Conducteur'); assert.equal(calls.at(-1).options.skip, false);
  env.online = false; tree = render();
  assert.deepEqual(tree.find(n => n.type === 'FlatList').props.data, []);
  assert.equal(calls.at(-1).options.skip, true);
  env.active = false; tree = render(); assert.equal(tree.find(n => n.type === 'Modal').props.visible, false);
});

test('driver search and explicit audience expansion use their dedicated RTK Query endpoints', async t => {
  const calls = [];
  const baseApi = createApi({ reducerPath: 'api', tagTypes: ['TripRequest', 'MyTripRequests', 'AccountActivity', 'Notification'],
    baseQuery: async args => { calls.push(args); return { data: args.method ? { id: 'request' } : [] }; }, endpoints: () => ({}) });
  const { requestDriverApi: api } = loader({ './baseApi': { baseApi },
    './trip-request/requestMapper': { mapServerTripRequestToClient: value => value },
  })('store/api/requestDriverApi.ts');
  const store = configureStore({ reducer: { api: api.reducer }, middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const args = { latitude: -4.3, longitude: 15.31, vehicleType: 'car', seats: 1, search: 'Test' };
  await store.dispatch(api.endpoints.requestDriverChoices.initiate(args)).unwrap();
  await store.dispatch(api.endpoints.openRequestToNearbyDrivers.initiate('request')).unwrap();
  await store.dispatch(api.endpoints.targetRequestMapDriver.initiate({ id: 'request', markerId: 'a'.repeat(64), expectedUpdatedAt: 'date' })).unwrap();
  await store.dispatch(api.endpoints.changeRequestDriver.initiate({ id: 'request', selectedDriverId: 'driver', selectedAt: 'date' })).unwrap();
  assert.deepEqual(calls, [{ url: '/trip-requests/driver-choices', params: args, timeout: 10000 },
    { url: '/trip-requests/request/open-search', method: 'POST', timeout: 10000 },
    { url: '/trip-requests/request/target-map-driver', method: 'POST', body: { markerId: 'a'.repeat(64), expectedUpdatedAt: 'date' }, timeout: 15000 },
    { url: '/trip-requests/request/change-driver', method: 'PUT', body: { selectedDriverId: 'driver', selectedAt: 'date' }, timeout: 15000 }]);
});

test('targeted passenger card broadens only on explicit action, guards double taps and displays a failed send', async t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  let calls = 0, reject;
  const request = { id: 'request', targetDriverId: 'driver', targetDriverName: 'Conducteur test', status: 'pending' };
  const { RequestTargetDriver } = loader({ ...ui, react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '@/store/api/requestDriverApi': { useOpenRequestToNearbyDriversMutation: () => [() => {
      calls++; return { unwrap: () => new Promise((_resolve, fail) => { reject = fail; }) };
    }, { isLoading: false }] },
  })('features/request-detail/RequestTargetDriver.tsx');
  const render = () => hooks.render(() => RequestTargetDriver({ request }));
  let tree = nodes(render()); assert.equal(calls, 0);
  const button = tree.find(n => n.type === 'Pressable');
  button.props.onPress(); button.props.onPress(); assert.equal(calls, 1);
  reject(new Error('offline')); await new Promise(resolve => setImmediate(resolve));
  tree = nodes(render()); assert.ok(tree.some(n => n.type === 'Text' && String(n.props.children).includes('Envoi non confirmé')));
  request.targetDriverId = null; assert.equal(render(), null);
});
