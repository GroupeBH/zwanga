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
    'useHomeRequestHighlight', 'useHomeTracking', 'useHomePassengerMarkers', 'useHomeMap', 'useHomeUserLocation', 'useHomeSheet', 'useHomePriorityDismissals', 'useHomeMapMarkers', 'useHomeSupportingData', 'useHomeRequestPickup', 'useHomeAcceptedDriverCourse'];
  const mocks = Object.fromEntries(hookNames.map(name => [`./${name}`, {
    [name]: props => {
      received[name] = props;
      return name === 'useHomeDriverActivity'
        ? { ongoingDriverTrip: { id: 'ongoing', driverId: user.id, status: 'ongoing' } } : {};
    },
  }]));
  const load = loader({ ...mocks, react: hooks.react,
    '@/features/navigation/appEntryContext': { useAppEntryPending: () => Boolean(state.entryPending) },
    '@/features/navigation/homePreparationContext': { useHomePreparationAllowed: () => state.preparationAllowed !== false },
    'react-native': { Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 400, height: 800 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 20 }) },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    '@/hooks/useAppIsActive': {
      useAppIsActive: () => state.active, useScreenIsActive: () => state.focused && state.active,
    },
    'expo-router': { useRouter: () => router, usePathname: () => '/' },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
    '@/services/ongoingTripNotification': { getCurrentTripInfo: () => trackedTripInfo },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: user }) },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector({ auth: { user } }) },
    '@/store/selectors': { selectAvailableTrips: () => empty, selectLocationRadius: () => 10 },
    '@/hooks/useUserLocation': { useUserLocation: options => {
      received.locationOptions = options;
      return { getCurrentLocation() {}, lastKnownLocation: { coords: { latitude: -4.325, longitude: 15.3222 } } };
    } },
  });
  const { useHomeController } = load('hooks/home/useHomeController.ts');
  const { useHomeContext } = load('hooks/home/useHomeContext.ts');
  return { state, hooks, received, routes, render: () => hooks.render(() => useHomeController(useHomeContext())) };
}

test('Home keeps the map and GPS lifecycle during brief AppState transitions while pausing foreground work', () => {
  const app = controllerFixture();
  const workHooks = ['useHomeDriverActivity', 'useHomeTripFeed', 'useHomePassengerActivity', 'useHomeTracking', 'useHomeMap', 'useHomeUserLocation'];
  assert.equal(app.render().shouldRenderHomeMap, true);
  assert.equal(app.received.useHomePassengerMarkers, undefined, 'unused passenger markers are not calculated');
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

test('entry prepares display reads under the cover but keeps modal, speech, camera and tracking work paused', () => {
  const app = controllerFixture(); app.state.entryPending = true;
  const home = app.render();
  assert.equal(home.isScreenActive, false); assert.equal(home.isDataActive, true);
  for (const name of ['useHomeDriverActivity', 'useHomeTripFeed', 'useHomePassengerActivity']) {
    assert.equal(app.received[name].isFocused, true, name);
  }
  for (const name of ['useHomeTracking', 'useHomeMap', 'useHomeUserLocation']) {
    assert.equal(app.received[name].isFocused, false, name);
  }
  assert.equal(app.received.useHomeRequestHighlight.enabled, false);
  assert.equal(app.received.locationOptions.promptOnMount, false);
  app.state.preparationAllowed = false; app.render();
  assert.equal(app.received.useHomeTripFeed.isFocused, false, 'phone/auth security gate still blocks preparatory reads');
  assert.equal(app.received.locationOptions.autoRequest, false, 'no GPS startup behind a security gate');
  app.state.preparationAllowed = true;
  app.state.active = false; app.render();
  assert.equal(app.received.useHomeTripFeed.isFocused, false);
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

test('Home readiness requires its real layout, core data and native map initialization', () => {
  const hooks = hookHarness(); let reports = 0;
  const home = { shouldRenderHomeMap: true, homeDataPrepared: false, isScreenActive: false, onHomeLayout() {} };
  const parts = ['HomeHeader', 'HomeLocationButton', 'HomeMap', 'HomeTripsSheet', 'HomeActivityCards', 'HomeOngoingTripSheet', 'HomeRequestPickupSheet', 'HomeAcceptedDriverCourseSheet', 'HomeRequestModal'];
  const { HomeDashboard } = loader({
    react: hooks.react,
    ...Object.fromEntries(parts.map(name => [`@/components/home/${name}`, { [name]: name }])),
    '@/features/navigation/homePreparationContext': { useReportHomePrepared: () => report },
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/components/AppUpdatePrompt': { AppUpdatePrompt: 'UpdatePrompt' },
    '@/store/hooks': { useAppSelector: () => 3 },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/features/home/HomeScreen.styles': { styles: {} },
    'react-native': { View: 'View' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
  })('components/home/HomeDashboard.tsx');
  const report = () => { reports++; };
  const context = { isHomeRoleReady: true, isDataActive: true };
  const render = () => hooks.render(() => HomeDashboard({ context }));
  let tree = render(); const mapReady = tree.props.children[0].props.onReady;
  tree.props.onLayout({}); tree = render(); assert.equal(reports, 0);
  home.homeDataPrepared = true; tree = render(); assert.equal(reports, 0);
  mapReady(); tree = render(); assert.equal(reports, 1);
  assert.equal(tree.props.children[0].props.onReady, mapReady, 'stable callback preserves memoized map rendering');
  home.isScreenActive = true; render(); render(); assert.equal(reports, 1);
  hooks.unmount();
});

test('slow, empty, failed and refreshing trip queries keep the same map position in the Home render tree', () => {
  const hooks = hookHarness();
  const home = { showInitialHomeLoader: true, shouldRenderHomeMap: true, sheetLoading: true, sheetError: false, isDriver: true, width: 390,
    hasMapPriorities: true, mapPriorityLayout: { top: 100, bottom: 400 }, highlightedDriverRequest: { id: 'nearby' } };
  const parts = ['HomeHeader', 'HomeLocationButton', 'HomeMap', 'HomeTripsLoadingScreen', 'HomeTripsSheet', 'HomeActivityCards', 'HomeOngoingTripSheet', 'HomeRequestPickupSheet', 'HomeAcceptedDriverCourseSheet', 'HomeRequestModal'];
  const load = loader({
    react: hooks.react,
    '@/features/navigation/homePreparationContext': { useReportHomePrepared: () => null },
    ...Object.fromEntries(parts.map(name => [`@/components/home/${name}`, { [name]: name }])),
    '@/components/AppUpdatePrompt': { AppUpdatePrompt: 'UpdatePrompt' },
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/store/hooks': { useAppSelector: () => 3 },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/features/home/HomeScreen.styles': { styles: {} },
    'react-native': { View: 'View' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
  });
  const { HomeDashboard } = load('components/home/HomeDashboard.tsx');
  const render = () => hooks.render(() => HomeDashboard({ context: {} }));
  for (const update of [{}, { showInitialHomeLoader: false, sheetLoading: false },
    { sheetLoading: true }, { sheetLoading: false, sheetError: true }, { sheetError: false }]) {
    Object.assign(home, update);
    const tree = render(), rendered = nodes(tree);
    const keys = tree.props.children.filter(node => node?.key != null).map(node => node.key);
    assert.equal(new Set(keys).size, keys.length, 'sibling keys distinguish components, even without an account');
    assert.equal(tree.type, 'SafeArea');
    assert.equal(tree.props.children[0].type, 'HomeMap');
    assert.equal(rendered.filter(node => node.type === 'HomeMap').length, 1);
    assert.equal(rendered.some(node => node.type === 'HomeTripsLoadingScreen'), false);
    assert.equal(rendered.find(node => node.type === 'HomeTripsSheet').props.sheetLoading, home.sheetLoading);
    assert.equal(rendered.find(node => node.type === 'HomeTripsSheet').props.isDriver, home.isDriver);
    assert.equal(rendered.find(node => node.type === 'HomeHeader').props.unreadMessages, 3);
    const sheet = rendered.find(node => node.type === 'HomeTripsSheet');
    const priority = rendered.find(node => node.type === 'HomeActivityCards');
    assert.equal(sheet.props.priorityContent, undefined);
    assert.equal(tree.props.children.includes(priority), true, 'priorities are an overlay sibling, not inside the sheet or native map');
    assert.deepEqual(priority.props.mapLayout, home.mapPriorityLayout);
    assert.equal(priority.props.highlightedDriverRequest, undefined);
    assert.equal(rendered.find(node => node.type === 'HomeRequestModal').props.request.id, 'nearby');
  }
  for (const update of [{ hasMapPriorities: false }, { hasMapPriorities: true, shouldRenderHomeMap: false }]) {
    Object.assign(home, update);
    assert.equal(nodes(render()).some(node => node.type === 'HomeActivityCards'), false);
  }
  Object.assign(home, { hasMapPriorities: false, shouldRenderHomeMap: true });
  home.currentUser = { id: 'first' };
  const beforeKeys = render().props.children.filter(node => node?.key != null).map(node => node.key);
  home.currentUser = { id: 'second' };
  const afterKeys = render().props.children.filter(node => node?.key != null).map(node => node.key);
  assert.equal(beforeKeys.some(key => afterKeys.includes(key)), false, 'a new account resets all scoped children');
  for (const driverCategory of ['transport', 'private', null]) {
    home.currentUser = { id: 'driver-test', driverCategory };
    const rendered = nodes(render());
    assert.equal(rendered.find(node => node.type === 'HomeTripsSheet').props.driverCategory, driverCategory);
    assert.equal(rendered.find(node => node.type === 'HomeRequestModal').props.request.id, 'nearby');
  }
  for (const role of ['driver', 'passenger']) {
    home.activeHomeTrip = { id: 'ride', status: 'ongoing' };
    home.ongoingDriverTrip = role === 'driver' ? home.activeHomeTrip : null;
    home.ongoingBookingId = role === 'passenger' ? 'booking' : null;
    const tree = render(), rendered = nodes(tree);
    assert.equal(tree.props.children[0].type, 'HomeMap', 'starting a ride does not move/remount the map');
    assert.equal(rendered.some(node => node.type === 'HomeTripsSheet'), false);
    const panel = rendered.find(node => node.type === 'HomeOngoingTripSheet');
    assert.equal(panel.props.activeHomeTrip, home.activeHomeTrip);
    assert.equal(panel.props.width, 390, 'the responsive panel receives the real Home viewport width');
    assert.equal(panel.props.ongoingBookingId, home.ongoingBookingId);
    assert.equal(rendered.find(node => node.type === 'HomeHeader').props.showOngoingShortcut, false);
  }
  Object.assign(home, { activeHomeTrip: null, ongoingDriverTrip: null, ongoingBookingId: null });
  const restored = nodes(render());
  assert.equal(render().props.children[0].type, 'HomeMap');
  assert.equal(restored.some(node => node.type === 'HomeOngoingTripSheet'), false);
  assert.equal(restored.some(node => node.type === 'HomeTripsSheet'), true);
  assert.equal(restored.find(node => node.type === 'UpdatePrompt').props.enabled, false,
    'the optional update prompt remains deferred until role and activity are verified');
  hooks.unmount();
});
