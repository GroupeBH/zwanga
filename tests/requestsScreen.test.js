/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const fs = require('node:fs');
const path = require('node:path');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input', FlatList: 'List',
  ActivityIndicator: 'Spinner', RefreshControl: 'Refresh', StyleSheet: { create: value => value, hairlineWidth: 1 } };
const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements)
  : [node, ...elements(node.props?.children), ...elements(node.props?.ListHeaderComponent)];
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('')
  : typeof node === 'object' ? text(node.props?.children) : String(node);
const button = (tree, label) => elements(tree).find(node => node.type === 'Button' && (text(node) === label || node.props.accessibilityLabel === label));
const item = (id, name = 'Gombe') => ({ id, departure: { name }, arrival: { name: 'Lemba' } });

function fixture() {
  const hooks = hookHarness(), calls = [], tabs = [];
  const data = { available: [item('first')], own: [item('mine')], isDriver: true,
    isLoading: false, isFetching: false, isError: false, hasData: true, proximityAvailable: true };
  const router = { push: route => calls.push(route), back: () => calls.push('back') };
  const load = loader({ react: { ...React, ...hooks.react }, 'react-native': { ...native, Keyboard: { dismiss() {} } },
    'expo-router': { useRouter: () => router }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/requests/useRequestsData': { useRequestsData: tab => {
      tabs.push(tab); return { ...data, requests: tab === 'available' ? data.available : data.own, refresh: () => calls.push('refresh') };
    } },
  });
  const { default: Screen } = load('app/requests.tsx');
  return { data, calls, tabs, hooks, render: () => hooks.render(Screen) };
}
const list = tree => elements(tree).find(node => node.type === 'List');

test('compact accessible tabs replace the context card and never show unqueried zero counters', () => {
  const f = fixture(); f.data.hasData = false; f.data.isLoading = true; f.data.available = [];
  const tree = f.render(), tabs = elements(tree).filter(node => node.props?.accessibilityRole === 'tab');
  assert.deepEqual(tabs.map(text), ['Disponibles', 'Mes demandes']);
  assert.deepEqual(tabs.map(node => node.props.accessibilityState.selected), [true, false]);
  assert.equal(elements(tree).some(node => node.props?.children === '0 demande'), false);
  assert.equal(elements(tree).some(node => node.props?.children === 'Demandes publiées par d’autres passagers'), false);
  assert.equal(list(tree).props.initialNumToRender, 6);
  assert.equal(list(tree).props.keyboardShouldPersistTaps, 'handled');
  button(tree, 'Retour').props.onPress(); assert.deepEqual(f.calls, ['back']);
  f.hooks.unmount();
});

test('search filters locally, resets scroll and clears when switching tabs; creation has one entry', () => {
  const f = fixture(); f.data.available = [item('first'), item('second', 'Matadi')];
  let tree = f.render(); const offsets = [];
  list(tree).props.ref.current = { scrollToOffset: value => offsets.push(value) };
  elements(tree).find(node => node.type === 'Input').props.onChangeText('matadi');
  tree = f.render(); assert.deepEqual(list(tree).props.data.map(item => item.id), ['second']);
  assert.deepEqual(offsets[0], { offset: 0, animated: false });
  assert.ok(elements(tree).some(node => node.props?.children === '1 résultat'));
  button(tree, 'Mes demandes').props.onPress(); tree = f.render();
  assert.equal(elements(tree).find(node => node.type === 'Input').props.value, '');
  assert.deepEqual(list(tree).props.data.map(item => item.id), ['mine']);
  const create = elements(tree).filter(node => node.type === 'Button' && text(node) === 'Commander un trajet');
  assert.equal(create[0]?.props.accessibilityLabel, 'Commander un trajet');
  assert.equal(create.length, 1); create[0].props.onPress();
  assert.deepEqual(f.calls, [{ pathname: '/request-create' }]);
  f.hooks.unmount();
});

test('opening a list item retains the request details route and role-only acceptance entry', () => {
  const f = fixture();
  for (const driver of [false, true]) {
    f.data.isDriver = driver;
    const tree = f.render(), row = list(tree).props.renderItem({ item: item('request-id') });
    assert.equal(row.props.canAccept, driver);
    row.props.onOpen('request-id');
  }
  assert.deepEqual(f.calls, Array(2).fill({ pathname: '/request-details/[id]', params: { id: 'request-id' } }));
  f.hooks.unmount();
});

test('empty/error lists keep pull-to-refresh and cached results show an explicit retry notice', () => {
  const f = fixture(); f.data.available = []; f.data.isError = true; f.data.hasData = false;
  let tree = f.render();
  assert.equal(list(tree).props.ListEmptyComponent.props.error, true);
  list(tree).props.refreshControl.props.onRefresh(); assert.deepEqual(f.calls, ['refresh']);
  f.data.available = [item('cached')]; f.data.hasData = true; tree = f.render();
  assert.equal(list(tree).props.data.length, 1);
  assert.match(text(list(tree).props.ListHeaderComponent), /dernières demandes chargées restent affichées/);
  button(tree, 'Réessayer').props.onPress(); assert.deepEqual(f.calls, ['refresh', 'refresh']);
  f.hooks.unmount();
});

test('proximity hint falls back to departure order without requesting GPS permission', () => {
  const f = fixture(); f.data.proximityAvailable = false;
  assert.match(text(list(f.render()).props.ListHeaderComponent), /les plus tôt/);
  f.hooks.unmount();
});

test('empty states distinguish loading, network error, no match and first request, with working actions', () => {
  const { RequestsListState } = loader({ react: React, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/requests/RequestsListState.tsx');
  const calls = [];
  const props = { loading: false, error: false, searching: false, busy: false, tab: 'available',
    onRetry: () => calls.push('retry'), onClearSearch: () => calls.push('clear') };
  const render = changes => RequestsListState({ ...props, ...changes });
  assert.ok(elements(render({ loading: true })).some(node => node.type === 'Spinner'));
  assert.match(text(render({ error: true })), /Impossible de charger/);
  button(render({ error: true }), 'Réessayer').props.onPress();
  button(render({ searching: true }), 'Effacer la recherche').props.onPress();
  button(render({}), 'Actualiser').props.onPress();
  assert.deepEqual(calls, ['retry', 'clear', 'retry']);
  assert.equal(button(render({ error: true, busy: true }), 'Réessayer').props.disabled, true);
  assert.equal(elements(render({ tab: 'my-requests' })).filter(node => node.type === 'Button').length, 0,
    'the single create action lives outside the scrolling list');
});

test('request layout keeps flexible content, accessible touch targets and a reviewed style baseline', () => {
  const { styles } = loader({ 'react-native': native })('features/screen-styles/app/requests/index.ts');
  for (const key of ['headerButton', 'tab', 'clearButton', 'createButton', 'secondaryButton']) {
    assert.ok(styles[key].minHeight >= 44, key);
    assert.equal(styles[key].height, undefined, 'text can grow without fixed-height clipping');
  }
  assert.equal(styles.list.flex, 1); assert.equal(styles.emptyListContent.flexGrow, 1);
  const { properties, stylesHash } = require('./helpers/extractionSnapshot.cjs');
  const baseline = require('./fixtures/sourceExtractions.json');
  const parts = ['container.styles', 'detailText.styles'].map(name => {
    const file = `features/screen-styles/app/requests/${name}.ts`;
    return properties(file, fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), 'styles');
  });
  assert.deepEqual(stylesHash(Object.assign({}, ...parts)), baseline.styles['features/screen-styles/app/requests/index.ts']);
});
