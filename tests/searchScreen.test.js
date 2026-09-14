const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const native = {
  Platform: { OS: 'android' }, StyleSheet: { create: value => value },
  View: 'View', Text: 'Text', TextInput: 'TextInput', Image: 'Image',
  TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList',
  Keyboard: { dismiss() {} }, InteractionManager: { runAfterInteractions: callback => callback() },
};
const loadToolbar = loader({ 'react-native': native });
const { SearchResultsToolbar } = loadToolbar('components/search/SearchResultsToolbar.tsx');
function nodes(tree) {
  const result = [];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!React.isValidElement(value)) return;
    result.push(value);
    visit(value.props.children);
  };
  visit(tree);
  return result;
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}

test('search count and filters occupy separate intrinsic-height rows, preventing the squeezed-count layout', () => {
  const { styles } = loadToolbar('features/search/SearchResultsToolbar.styles.ts');
  const tree = SearchResultsToolbar.type({ searchMode: 'requests', sortMode: 'nearby', resultsCountLabel: '123 demandes trouvées', isRefreshingResults: false, onSortChange() {} });
  assert.equal(tree.props.style.flexDirection, 'column');
  assert.equal(tree.props.style.alignItems, 'stretch');
  assert.equal(tree.props.children.length, 2);
  assert.equal(tree.props.children[0].props.style, styles.countRow);
  assert.equal(styles.countRow.flex, undefined);
  assert.equal(styles.countRow.width, undefined);
  assert.equal(styles.count.flexShrink, 1);
  assert.equal(styles.sortOptions.flexWrap, 'wrap');
  assert.equal(styles.sortOptions.alignSelf, 'stretch');
  assert.equal(styles.sortButton.maxWidth, '100%');
  assert.ok(styles.sortButton.minHeight >= 44);
  assert.equal(text(tree.props.children[0]), '123 demandes trouvées');
  for (const style of [styles.container, styles.countRow, styles.sortOptions]) {
    assert.equal(style.height, undefined);
    assert.notEqual(style.justifyContent, 'space-between');
  }
});

test('request filters preserve labels, selection and actions; trips retain their two filters', () => {
  const changes = [];
  const render = searchMode => SearchResultsToolbar.type({ searchMode, sortMode: 'nearby', resultsCountLabel: '1 résultat', isRefreshingResults: false, onSortChange: value => changes.push(value) });
  const requestButtons = nodes(render('requests')).filter(node => node.type === 'TouchableOpacity');
  assert.deepEqual(requestButtons.map(text), ['Plus proches', 'Meilleur budget', 'Plus tôt']);
  assert.deepEqual(requestButtons.map(button => button.props.accessibilityState.selected), [true, false, false]);
  requestButtons.forEach(button => button.props.onPress());
  assert.deepEqual(changes, ['nearby', 'cheap', 'early']);
  assert.equal(requestButtons.every(button => button.props.accessibilityRole === 'button'), true);
  assert.deepEqual(nodes(render('trips')).filter(node => node.type === 'TouchableOpacity').map(text), ['Moins cher', 'Plus tôt']);
});

test('refreshing adds only the small count-row indicator and keeps the toolbar memoized', () => {
  const props = { searchMode: 'requests', sortMode: 'nearby', resultsCountLabel: '1 demande trouvée', onSortChange() {} };
  assert.equal(SearchResultsToolbar.$$typeof, Symbol.for('react.memo'));
  assert.equal(nodes(SearchResultsToolbar.type({ ...props, isRefreshingResults: false })).filter(node => node.type === 'ActivityIndicator').length, 0);
  const busy = SearchResultsToolbar.type({ ...props, isRefreshingResults: true });
  assert.equal(nodes(busy.props.children[0]).filter(node => node.type === 'ActivityIndicator').length, 1);
  assert.equal(busy.props.children[1].props.children.length, 3);
});

const location = { name: 'Gombe', address: 'Gombe Kinshasa', lat: -4.325, lng: 15.3222 };
const trip = id => ({ id, driverId: 'driver', departure: location, arrival: location, departureTime: '2026-09-20T10:00:00Z', availableSeats: 2, price: 2000 });
const request = (id, extra = {}) => ({ id, passengerId: 'passenger', status: 'pending', departure: location, arrival: location, departureDateMin: '2026-09-20T10:00:00Z', createdAt: '2026-09-12T10:00:00Z', numberOfSeats: 2, maxPricePerSeat: 2000, ...extra });

function screenApp() {
  const hooks = hookHarness(), params = {}, queryCalls = [], routes = [];
  const router = { push: value => routes.push(value), back() {} };
  const app = { trips: [trip('trip')], requests: [request('request')], coordinateReads: 0, isDriver: true };
  const coords = { latitude: -4.325, longitude: 15.3222 };
  const state = {
    trips: { items: [] },
    location: { get lastKnownLocation() { app.coordinateReads++; return { coords }; } },
  };
  const load = loader({
    react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@react-navigation/native': { useFocusEffect: callback => hooks.react.useEffect(callback, [callback]) },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => params },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/hooks/useTripArrivalTime': { useTripArrivalTime: () => null },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: { id: 'me', firstName: 'Alice', isDriver: app.isDriver } }) },
    '@/store/api/tripApi': {
      useGetTripsQuery: (args, options) => { queryCalls.push({ name: 'trips', args, options }); return { data: app.trips, isLoading: false, isFetching: false, refetch() {} }; },
      useSearchTripsByCoordinatesMutation: () => [() => { throw new Error('Unexpected coordinate request'); }, { isLoading: false }],
    },
    '@/store/api/tripRequestApi': {
      useGetAvailableTripRequestsQuery: (args, options) => { queryCalls.push({ name: 'requests', args, options }); return { data: app.requests, isLoading: false, isFetching: false, isError: false, refetch() {} }; },
    },
  });
  const Screen = load('app/search.tsx').default;
  const Toolbar = load('components/search/SearchResultsToolbar.tsx').SearchResultsToolbar;
  const render = () => hooks.render(Screen);
  const list = tree => nodes(tree).find(node => node.type === 'FlatList');
  const toolbar = tree => nodes(list(tree).props.ListHeaderComponent).find(node => node.type === Toolbar);
  const switchMode = (tree, mode) => nodes(list(tree).props.ListHeaderComponent).find(node => node.type === 'TouchableOpacity' && text(node) === (mode === 'requests' ? 'Demandes' : 'Trajets')).props.onPress();
  return Object.assign(app, { hooks, render, list, toolbar, switchMode, queryCalls, routes });
}

test('the screen keeps one virtualized list and the compact toolbar in its header', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = screenApp(), tree = app.render(), list = app.list(tree);
  assert.equal(nodes(tree).filter(node => node.type === 'FlatList').length, 1);
  assert.equal(nodes(tree).some(node => node.type === 'ScrollView'), false);
  assert.equal(list.props.initialNumToRender, 5);
  assert.equal(list.props.maxToRenderPerBatch, 5);
  assert.equal(list.props.windowSize, 7);
  assert.equal(list.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(app.toolbar(tree).props.resultsCountLabel, '1 trajet trouvé');
  assert.equal(list.props.data[0].trip.id, 'trip');
  app.hooks.unmount();
});

test('typing keeps the result data stable until the existing debounce applies the search', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = screenApp();
  let tree = app.render();
  tree = app.render();
  const oldData = app.list(tree).props.data;
  const oldToolbarProps = app.toolbar(tree).props;
  nodes(app.list(tree).props.ListHeaderComponent).find(node => node.type === 'TextInput' && node.props.placeholder === 'Point de départ').props.onChangeText('unknown');
  tree = app.render();
  assert.equal(app.list(tree).props.data, oldData);
  assert.equal(app.toolbar(tree).props.onSortChange, oldToolbarProps.onSortChange);
  assert.equal(app.toolbar(tree).props.resultsCountLabel, oldToolbarProps.resultsCountLabel);
  t.mock.timers.tick(449);
  assert.equal(app.list(app.render()).props.data, oldData);
  t.mock.timers.tick(1);
  tree = app.render();
  assert.equal(app.list(tree).props.data.length, 0);
  app.hooks.unmount();
});

test('hidden tabs are not filtered and GPS is read only for nearby request ordering', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = screenApp();
  let requestReads = 0, tripReads = 0;
  app.trips = [{ ...trip('trip'), get departure() { tripReads++; return location; } }];
  app.requests = [{ ...request('request'), get departure() { requestReads++; return location; } }];
  let tree = app.render();
  assert.equal(requestReads, 0);
  assert.equal(app.coordinateReads, 0);
  assert.ok(tripReads > 0);
  app.switchMode(tree, 'requests');
  tripReads = 0;
  tree = app.render();
  assert.equal(tripReads, 0);
  assert.ok(requestReads > 0);
  assert.ok(app.coordinateReads > 0);
  assert.equal(app.queryCalls.filter(call => call.name === 'trips').at(-1).options.skip, true);
  assert.equal(app.queryCalls.filter(call => call.name === 'requests').at(-1).options.skip, false);
  app.toolbar(tree).props.onSortChange('cheap');
  app.coordinateReads = 0;
  tree = app.render();
  assert.equal(app.coordinateReads, 0);
  assert.equal(app.toolbar(tree).props.sortMode, 'cheap');
  app.hooks.unmount();
});

test('nearby remains the default request ordering, explicit budget sorting and per-tab choices are preserved', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = screenApp();
  app.requests = Object.freeze([
    request('far', { departure: { ...location, lat: -4.5, lng: 15.5 }, maxPricePerSeat: 4000 }),
    request('near', { maxPricePerSeat: 1000 }),
  ]);
  let tree = app.render(); app.switchMode(tree, 'requests'); tree = app.render();
  assert.equal(app.toolbar(tree).props.sortMode, 'nearby');
  assert.deepEqual(app.list(tree).props.data.map(item => item.request.id), ['near', 'far']);
  app.toolbar(tree).props.onSortChange('cheap'); tree = app.render();
  assert.deepEqual(app.list(tree).props.data.map(item => item.request.id), ['far', 'near']);
  app.switchMode(tree, 'trips'); tree = app.render();
  app.toolbar(tree).props.onSortChange('early'); tree = app.render();
  app.switchMode(tree, 'requests'); tree = app.render();
  assert.equal(app.toolbar(tree).props.sortMode, 'cheap');
  assert.deepEqual(app.requests.map(item => item.id), ['far', 'near']);
  app.hooks.unmount();
});
