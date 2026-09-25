const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function controllerFixture() {
  const hooks = hookHarness(), received = {}, routes = [], empty = [];
  const state = { focused: true, active: true };
  const user = { id: 'driver', role: 'driver' };
  const router = { push: route => routes.push(route), replace: route => routes.push(route) };
  const trackedTripInfo = { tripId: 'ongoing', role: 'driver' };
  const dispatch = () => {};
  const showDialog = () => {};
  const hookNames = ['useHomeDriverActivity', 'useHomeTripFeed', 'useHomePassengerActivity', 'useHomeTripSelection',
    'useHomeRequestHighlight', 'useHomeTracking', 'useHomePassengerMarkers', 'useHomeMap', 'useHomeUserLocation', 'useHomeSheet', 'useHomePriorityDismissals'];
  const mocks = Object.fromEntries(hookNames.map(name => [`./${name}`, {
    [name]: props => {
      received[name] = props;
      return name === 'useHomeDriverActivity'
        ? { ongoingDriverTrip: { id: 'ongoing', driverId: user.id, status: 'ongoing' } } : {};
    },
  }]));
  const load = loader({ ...mocks, react: hooks.react,
    'react-native': { Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 400, height: 800 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 20 }) },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    '@/hooks/useAppIsActive': {
      useAppIsActive: () => state.active, useScreenIsActive: () => state.focused && state.active,
    },
    'expo-router': { useRouter: () => router },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
    '@/services/ongoingTripNotification': { getCurrentTripInfo: () => trackedTripInfo },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: user }) },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector() },
    '@/store/selectors': { selectAvailableTrips: () => empty, selectLocationRadius: () => 10 },
    '@/hooks/useUserLocation': { useUserLocation: options => {
      received.locationOptions = options;
      return { getCurrentLocation() {}, lastKnownLocation: { coords: { latitude: -4.325, longitude: 15.3222 } } };
    } },
  });
  const { useHomeController } = load('hooks/home/useHomeController.ts');
  return { state, hooks, received, routes, render: () => hooks.render(useHomeController) };
}

test('Home keeps the map and GPS lifecycle during brief AppState transitions while pausing foreground work', () => {
  const app = controllerFixture();
  const workHooks = ['useHomeDriverActivity', 'useHomeTripFeed', 'useHomePassengerActivity', 'useHomeTracking', 'useHomeMap', 'useHomeUserLocation'];
  assert.equal(app.render().shouldRenderHomeMap, true);
  for (let i = 0; i < 50; i++) {
    app.state.active = false;
    const inactive = app.render();
    assert.equal(inactive.isFocused, true);
    assert.equal(inactive.isScreenActive, false);
    assert.equal(inactive.shouldRenderHomeMap, true);
    assert.equal(app.received.locationOptions.autoRequest, true);
    workHooks.forEach(name => assert.equal(app.received[name].isFocused, false, name));
    app.state.active = true;
    assert.equal(app.render().shouldRenderHomeMap, true);
    workHooks.forEach(name => assert.equal(app.received[name].isFocused, true, name));
  }
  assert.equal(app.received.locationOptions.trackingProfile, 'navigation');
  app.hooks.unmount();
});

test('leaving the Home route still removes its map and releases the location lifecycle', () => {
  const app = controllerFixture(); app.render();
  app.state.focused = false;
  const result = app.render();
  assert.equal(result.shouldRenderHomeMap, false);
  assert.equal(result.isScreenActive, false);
  assert.equal(app.received.locationOptions.autoRequest, false);
  app.state.focused = true;
  assert.equal(app.render().shouldRenderHomeMap, true);
  app.hooks.unmount();
});

test('backgrounding cancels pending detail navigation without hiding the Home map', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = controllerFixture();
  app.render().openTripDetail('trip');
  assert.equal(app.render().shouldRenderHomeMap, false);
  app.state.active = false; app.render();
  assert.equal(app.render().shouldRenderHomeMap, true);
  t.mock.timers.tick(2000);
  assert.deepEqual(app.routes, []);
  app.render().openTripDetail('ignored');
  t.mock.timers.tick(2000);
  assert.deepEqual(app.routes, []);
  app.state.active = true;
  app.render().openTripDetail('trip');
  t.mock.timers.tick(40);
  assert.deepEqual(app.routes, ['/trip/trip']);
  app.hooks.unmount();
});

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  return [element, ...nodes(element.props.children)];
}

test('slow, empty, failed and refreshing trip queries keep the same map position in the Home render tree', () => {
  const home = { showInitialHomeLoader: true, shouldRenderHomeMap: true, sheetLoading: true, sheetError: false };
  const parts = ['HomeHeader', 'HomeLocationButton', 'HomeMap', 'HomeTripsLoadingScreen', 'HomeTripsSheet'];
  const load = loader({
    ...Object.fromEntries(parts.map(name => [`@/components/home/${name}`, { [name]: name }])),
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/features/home/HomeScreen.styles': { styles: {} },
    'react-native': { View: 'View' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
  });
  const { default: HomeScreen } = load('app/(tabs)/index.tsx');
  for (const update of [{}, { showInitialHomeLoader: false, sheetLoading: false },
    { sheetLoading: true }, { sheetLoading: false, sheetError: true }, { sheetError: false }]) {
    Object.assign(home, update);
    const tree = HomeScreen(), rendered = nodes(tree);
    assert.equal(tree.type, 'SafeArea');
    assert.equal(tree.props.children[0].type, 'HomeMap');
    assert.equal(rendered.filter(node => node.type === 'HomeMap').length, 1);
    assert.equal(rendered.some(node => node.type === 'HomeTripsLoadingScreen'), false);
    assert.equal(rendered.find(node => node.type === 'HomeTripsSheet').props.sheetLoading, home.sheetLoading);
  }
});
