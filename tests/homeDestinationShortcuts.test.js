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
  const state = { active: true, online: true, favorites: [], recent: [] };
  const load = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active && state.online },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: (_, options) => { queries.push(options); return { data: state.favorites }; } },
  });
  const { HomeDestinationShortcuts } = load('components/home/HomeDestinationShortcuts.tsx');
  const draw = () => hooks.render(() => HomeDestinationShortcuts.type({ active: state.active, recentDestinations: state.recent }));
  const press = label => nodes(draw()).find(node => node.props.accessibilityLabel === label).props.onPress();
  return { state, routes, queries, draw, press, hooks };
}

test('Maison and Travail open address management if unset, otherwise prefill a search with valid coordinates', () => {
  const app = environment();
  app.press('Maison'); assert.deepEqual(app.routes.pop(), '/favorite-locations');
  app.state.favorites = [
    { type: 'home', name: 'Secondary', coordinates: { latitude: -4.4, longitude: 15.3 } },
    { type: 'home', name: 'Home test', isDefault: true, coordinates: { latitude: -4.3, longitude: 15.2 } },
    { type: 'work', name: 'Work test', coordinates: { latitude: NaN, longitude: 999 } },
  ];
  app.press('Maison'); assert.deepEqual(app.routes.pop(), { pathname: '/search', params: {
    arrival: 'Home test', mode: 'map', arrivalLat: '-4.3', arrivalLng: '15.2', arrivalRadiusKm: '5',
  } });
  app.press('Travail'); assert.deepEqual(app.routes.pop(), { pathname: '/search', params: { arrival: 'Work test' } });
  app.hooks.unmount();
});

test('recent destinations expand inline, offer an empty state and navigate without mutating a booking', () => {
  const app = environment();
  assert.doesNotMatch(text(app.draw()), /prochaines destinations/);
  app.press('Destinations récentes'); assert.match(text(app.draw()), /prochaines destinations/);
  app.state.recent = [{ name: 'Recent test', lat: 0, lng: 0, hasCoordinates: false }];
  const row = nodes(app.draw()).find(node => node.type === 'Button' && text(node) === 'Recent test');
  row.props.onPress();
  assert.deepEqual(app.routes, [{ pathname: '/search', params: { arrival: 'Recent test' } }]);
  assert.equal(nodes(app.draw()).find(node => node.props.accessibilityLabel === 'Destinations récentes').props.accessibilityState.expanded, false);
  app.hooks.unmount();
});

test('favorite queries are cached and skipped while Home is inactive or offline', () => {
  const app = environment(); app.draw();
  assert.deepEqual(app.queries.at(-1), { skip: false, refetchOnMountOrArgChange: 60 });
  app.state.active = false; app.draw(); assert.equal(app.queries.at(-1).skip, true);
  app.state.active = true; app.state.online = false; app.draw(); assert.equal(app.queries.at(-1).skip, true);
  app.hooks.unmount();
});
