const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { isUsableNearbyDriverPosition } = loader()('services/nearbyDriverLocationPolicy.ts');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView',
  ActivityIndicator: 'Spinner', StyleSheet: { create: value => value, hairlineWidth: 1 } };
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } };
const tick = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}

test('availability is a driver-only profile menu setting; existing menu navigation is preserved', () => {
  const { ProfileMenu } = loader({ ...mocks,
    './ProfileDriverAvailabilityEntry': { ProfileDriverAvailabilityEntry: 'Availability' },
    './ProfileStoreReviewButton': { ProfileStoreReviewButton: 'StoreReview' },
  })('components/profile/ProfileMenu.tsx');
  const calls = [];
  const props = { menuItems: [{ label: 'Notifications', icon: 'notifications-outline', route: '/notifications' }],
    router: { push: path => calls.push(path) } };
  for (const isDriver of [true, false]) {
    const tree = ProfileMenu({ ...props, isDriver });
    assert.equal(nodes(tree).some(node => node.type === 'Availability'), isDriver);
    nodes(tree).find(node => node.type === 'Button').props.onPress();
  }
  assert.deepEqual(calls, ['/notifications', '/notifications']);
});

test('profile entry explains its purpose, honors the server flag and skips reads offscreen', () => {
  let enabled = true, active = true, options;
  const calls = [];
  const { ProfileDriverAvailabilityEntry } = loader({ ...mocks,
    'expo-router': { useRouter: () => ({ push: path => calls.push(path) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/driverDispatchApi': { useDriverDispatchStatusQuery: (_arg, opts) => {
      options = opts; return { data: { enabled } };
    } },
  })('components/profile/ProfileDriverAvailabilityEntry.tsx');
  const tree = ProfileDriverAvailabilityEntry();
  assert.match(text(tree), /Alertes conducteur/);
  assert.match(text(tree), /Réservations et commandes proches, automatiquement/);
  tree.props.onPress();
  assert.deepEqual(calls, ['/driver-availability']);
  assert.equal(options.skip, false);
  active = false; ProfileDriverAvailabilityEntry(); assert.equal(options.skip, true);
  enabled = false; assert.equal(ProfileDriverAvailabilityEntry(), null);
});


function coordinator({ authenticated = true, signingOut = false, role = 'driver', permission = async () => ({ granted: true }),
  nativeRunning = false, activeRide = false, nativeError = false,
  position = async () => ({ timestamp: Date.now(), coords: { latitude: 1, longitude: 2, accuracy: 20 } }) } = {}) {
  const hooks = hookHarness(), calls = [], routes = [];
  let active = true, online = true;
  const user = { id: 'driver', role };
  const state = { enabled: true, automatic: true, pendingOfferId: null };
  const appState = { currentState: 'active' };
  const renew = body => ({ unwrap: async () => { calls.push(body); } });
  const refetch = () => ({ unwrap: async () => state });
  const Screen = loader({
    react: hooks.react, 'react-native': { AppState: appState },
    'expo-router': { useRouter: () => ({ navigate: path => routes.push(path) }) },
    'expo-location': { getForegroundPermissionsAsync: () => { calls.push('permission'); return permission(); } },
    '@/hooks/useAppIsActive': { useAppIsActive: () => active },
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { isAuthenticated: authenticated,
      logoutRequestId: signingOut ? 'logout-request' : undefined }, zwangaApi: { config: { online } } }) },
    '@/store/selectors': { selectIsAuthenticated: state => state.auth.isAuthenticated },
    '@/utils/accountRole': { isDriverAccount: value => value?.role === 'driver' },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: user }) },
    '@/store/api/driverDispatchApi': {
      useDriverDispatchStatusQuery: () => ({ data: state, refetch }),
      useRecordDriverPositionMutation: () => [renew],
    },
    '@/services/currentLocationRequest': { requestCurrentLocation: (...args) => { calls.push('gps'); return position(...args); } },
    '@/services/nearbyDriverLocation': {
      hasActiveRideLocationSession: async () => activeRide,
      ensureNearbyDriverLocation: async () => { if (nativeError) throw new Error('native unavailable'); return nativeRunning; },
      pauseNearbyDriverLocation: async () => {}, subscribeNearbyDriverLocation: () => () => {},
    },
    '@/services/nearbyDriverPositionDelivery': { sendNearbyDriverPosition: async (_id, location) => {
      if (isUsableNearbyDriverPosition(location)) await renew({ latitude: location.coords.latitude,
        longitude: location.coords.longitude, accuracy: location.coords.accuracy,
        recordedAt: new Date(location.timestamp).toISOString() }).unwrap();
    } },
  })('components/DriverPresenceCoordinator.tsx').DriverPresenceCoordinator;
  return { hooks, state, calls, routes, render: () => hooks.render(Screen),
    setOnline: value => { online = value; },
    deactivate: () => { active = false; appState.currentState = 'background'; } };
}

test('fresh authorized GPS is sent automatically, without a vehicle selection or permission prompt', async () => {
  const app = coordinator(); app.render(); await tick();
  assert.deepEqual(app.calls.slice(0, 2), ['permission', 'gps']);
  assert.deepEqual(Object.keys(app.calls[2]).sort(), ['accuracy', 'latitude', 'longitude', 'recordedAt']);
  assert.equal(app.calls[2].accuracy, 20);
  app.hooks.unmount();
});

test('automatic discovery never runs for a passenger, logged-out session or disabled service', async () => {
  for (const options of [{ role: 'passenger' }, { authenticated: false }, { signingOut: true }, {}]) {
    const app = coordinator(options);
    if (!Object.keys(options).length) app.state.enabled = false;
    app.render(); await tick();
    assert.deepEqual(app.calls, []);
    app.hooks.unmount();
  }
});

test('denied permission, stale GPS and poor precision cannot renew server eligibility', async () => {
  for (const options of [
    { permission: async () => ({ granted: false }) },
    { position: async () => ({ timestamp: Date.now() - 40000, coords: { accuracy: 10 } }) },
    { position: async () => ({ timestamp: Date.now(), coords: { accuracy: 300 } }) },
    { position: async () => { throw new Error('unavailable'); } },
  ]) {
    const app = coordinator(options); app.render(); await tick();
    assert.equal(app.calls.filter(value => typeof value === 'object').length, 0);
    app.hooks.unmount();
  }
});

test('foreground GPS is aborted on background and cannot publish a delayed fix', async () => {
  let complete, signal;
  const app = coordinator({ position: (_fresh, abortSignal) => {
    signal = abortSignal; return new Promise(resolve => { complete = resolve; });
  } });
  app.render(); await tick();
  app.deactivate(); app.render();
  assert.equal(signal.aborted, true);
  complete({ timestamp: Date.now(), coords: { accuracy: 10 } }); await tick();
  assert.deepEqual(app.calls, ['permission', 'gps']);
  app.hooks.unmount();
});

test('60-second foreground refreshes stop when the app leaves the foreground', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const app = coordinator(); app.render(); await tick();
  t.mock.timers.tick(60000); await tick();
  assert.equal(app.calls.filter(value => typeof value === 'object').length, 2);
  app.deactivate(); app.render();
  t.mock.timers.tick(90000); await tick();
  assert.equal(app.calls.filter(value => typeof value === 'object').length, 2);
  app.hooks.unmount();
});

test('native discovery or an active ride never adds a foreground GPS reader', async () => {
  for (const options of [{ nativeRunning: true }, { activeRide: true }]) {
    const app = coordinator(options); app.render(); await tick();
    assert.deepEqual(app.calls, []); app.hooks.unmount();
  }
});

test('a failed native start preserves existing foreground discovery', async () => {
  const app = coordinator({ nativeError: true }); app.render(); await tick();
  assert.deepEqual(app.calls.slice(0, 2), ['permission', 'gps']);
  assert.equal(app.calls.filter(value => typeof value === 'object').length, 1);
  app.hooks.unmount();
});

test('presence does not poll offline and resumes once on reconnect', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const app = coordinator(); app.setOnline(false); app.render(); await tick();
  t.mock.timers.tick(135000); await tick(); assert.equal(app.calls.length, 0);
  app.setOnline(true); app.render(); await tick();
  assert.equal(app.calls.filter(value => typeof value === 'object').length, 1);
  app.setOnline(false); app.render(); t.mock.timers.tick(135000); await tick();
  assert.equal(app.calls.filter(value => typeof value === 'object').length, 1);
  app.hooks.unmount();
});

test('settings explain automatic notifications and GPS freshness with no extra activation step', () => {
  const calls = [], hooks = hookHarness();
  const Screen = loader({ ...mocks, react: hooks.react,
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: true } } }) },
    '@/components/profile/NearbyDriverLocationPermission': { NearbyDriverLocationPermission: 'LocationPermission' },
    'react-native': { ...native, Linking: { openSettings: async () => calls.push('settings') } },
    'expo-router': { useRouter: () => ({ back() {} }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/driverDispatchApi': { useDriverDispatchStatusQuery: () => ({
      data: { enabled: true, automatic: true, positionFreshSeconds: 300 },
    }) },
  })('app/driver-availability.tsx').default;
  let tree = hooks.render(Screen);
  assert.match(text(tree), /automatiquement/);
  assert.doesNotMatch(text(tree), /5 minute|position trop ancienne/);
  assert.doesNotMatch(text(tree), /Places proposées|Avec quel véhicule|Me rendre disponible/);
  nodes(tree).find(node => node.type === 'Button' && /réglages du téléphone/.test(text(node))).props.onPress();
  assert.deepEqual(calls, ['settings']);
  nodes(tree).find(node => node.type === 'Button' && /En savoir plus/.test(text(node))).props.onPress();
  tree = hooks.render(Screen);
  assert.match(text(tree), /Aucune disponibilité à activer/);
  assert.match(text(tree), /5 minute/);
  assert.match(text(tree), /position trop ancienne/);
  hooks.unmount();
});
