const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
function text(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : '';
}
function environment() {
  const hooks = hookHarness(), routes = [], queries = [];
  const state = { active: true, online: true, favorites: [], recent: [], version: 0 };
  const load = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active && state.online },
    '@/components/LocationPickerModal': { __esModule: true, default: 'Picker' },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: (_, options) => { queries.push(options); return { data: state.favorites }; } },
  });
  const { HomeDestinationShortcuts } = load('components/home/HomeDestinationShortcuts.tsx');
  const draw = () => hooks.render(() => HomeDestinationShortcuts.type({ active: state.active, recentDestinations: state.recent }));
  const press = label => nodes(draw()).find(node => node.props.accessibilityLabel === label).props.onPress();
  const picker = () => nodes(draw()).find(node => node.type === 'Picker').props;
  return { state, routes, queries, draw, press, hooks, picker };
}

test('Maison centers the map on the default favorite; confirmation alone prefills the destination', () => {
  const app = environment();
  app.press('Maison'); assert.deepEqual(app.routes.pop(), '/favorite-locations');
  app.state.favorites = [
    { type: 'home', name: 'Secondary', coordinates: { latitude: -4.4, longitude: 15.3 } },
    { type: 'home', name: 'Home test', isDefault: true, coordinates: { latitude: -4.3, longitude: 15.2 } },
    { type: 'work', name: 'Work test', coordinates: { latitude: NaN, longitude: 999 } },
  ];
  app.press('Maison');
  assert.deepEqual(app.picker().initialLocation, { title: 'Home test', address: 'Home test', latitude: -4.3, longitude: 15.2 });
  assert.equal(app.picker().autoLocateOnOpen, false);
  assert.equal(app.picker().confirmLabel, 'Confirmer cette destination');
  assert.equal(app.routes.length, 0);
  const adjusted = { title: 'Point ajusté', address: 'Rue de test', latitude: -4.31, longitude: 15.21 };
  const picker = app.picker(); picker.onSelect(adjusted); picker.onSelect({ ...adjusted, latitude: -4.4 });
  assert.equal(app.routes.length, 0, 'wait for native/modal dismissal before navigating');
  app.picker().onDismiss(); app.picker().onDismiss();
  assert.deepEqual(app.routes.pop(), { pathname: '/request-create', params: {
    entry: 'home',
    arrival: 'Point ajusté', arrivalAddress: 'Rue de test', arrivalLat: '-4.31', arrivalLng: '15.21',
  } });
  app.press('Travail');
  assert.equal(app.picker().initialLocation, null);
  assert.equal(app.picker().initialSearchQuery, 'Work test');
  app.picker().onClose(); app.picker().onDismiss();
  assert.equal(app.routes.length, 0, 'cancel or invalid coordinates never invent a destination');
  app.hooks.unmount();
});

test('recents without coordinates open location search, not a fake map point or booking mutation', () => {
  const app = environment();
  assert.doesNotMatch(text(app.draw()), /prochaines destinations/);
  app.press('Destinations récentes'); assert.match(text(app.draw()), /prochaines destinations/);
  app.state.recent = [{ name: 'Recent test', lat: 0, lng: 0, hasCoordinates: false }];
  const row = nodes(app.draw()).find(node => node.type === 'Button' && text(node) === 'Recent test');
  row.props.onPress();
  assert.deepEqual(app.routes, []);
  assert.equal(app.picker().initialLocation, null);
  assert.equal(app.picker().initialSearchQuery, 'Recent test');
  assert.equal(nodes(app.draw()).find(node => node.props.accessibilityLabel === 'Destinations récentes').props.accessibilityState.expanded, false);
  app.hooks.unmount();
});

for (const interruption of ['blur', 'account']) test(`pending shortcut confirmation is discarded on ${interruption}`, () => {
  const app = environment();
  app.state.favorites = [{ type: 'home', name: 'Home', coordinates: { latitude: -4.3, longitude: 15.2 } }];
  app.press('Maison'); const picker = app.picker(); picker.onSelect(picker.initialLocation);
  if (interruption === 'blur') app.state.active = false;
  else app.state.version++;
  app.picker().onDismiss();
  assert.deepEqual(app.routes, []);
  app.hooks.unmount();
});

test('favorite queries are cached and skipped while Home is inactive or offline', () => {
  const app = environment(); app.draw();
  assert.deepEqual(app.queries.at(-1), { skip: false, refetchOnMountOrArgChange: 60 });
  app.state.active = false; app.draw(); assert.equal(app.queries.at(-1).skip, true);
  app.state.active = true; app.state.online = false; app.draw(); assert.equal(app.queries.at(-1).skip, true);
  app.hooks.unmount();
});
