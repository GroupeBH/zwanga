const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const hooks = hookHarness();
  const state = { auth: { user: { id: 'me' }, tokenPayload: { sub: 'me' } }, focused: true, active: true };
  let calls = 0;
  const profile = { data: undefined, isFetching: true, isSuccess: false, isError: false, isUninitialized: false,
    refetch: () => { calls++; return Promise.resolve({ data: profile.data }); } };
  const load = loader({
    react: hooks.react,
    '@/features/navigation/appEntryContext': { useAppEntryPending: () => Boolean(state.entryPending) },
    '@/components/home/HomeDashboard': { HomeDashboard: 'Dashboard' },
    '@/components/home/HomeRoleLoader': { HomeRoleLoader: 'RoleLoader' },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/services/ongoingTripNotification': { getCurrentTripInfo: () => null },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => profile },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectAvailableTrips: () => [], selectLocationRadius: () => 5 },
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    'expo-router': { useRouter: () => ({}) },
    'react-native': { useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
  });
  const { default: HomeScreen } = load('app/(tabs)/index.tsx');
  const { useHomeContext } = load('hooks/home/useHomeContext.ts');
  return { state, profile, hooks, calls: () => calls,
    render: () => hooks.render(HomeScreen), context: () => hooks.render(useHomeContext) };
}

test('only a known role and a nonempty user ID can reveal Home, including legacy both', () => {
  const { isHomeProfileReady } = loader()('features/home/homeRolePolicy.ts');
  for (const user of [undefined, null, {}, { id: 'me' }, { role: 'driver' }, { id: '', role: 'driver' },
    { id: ' ', role: 'passenger' }, { id: 'me', role: 'admin' }, { id: 'me', isDriver: true }]) {
    assert.equal(isHomeProfileReady(user), false);
  }
  for (const role of ['driver', 'passenger', 'both']) assert.equal(isHomeProfileReady({ id: 'me', role }), true);
});

test('a resolved profile cannot mount Home until the shared ride decision is complete', () => {
  const app = fixture(); app.state.entryPending = true;
  Object.assign(app.profile, { data: { id: 'me', role: 'driver' }, isFetching: false, isSuccess: true });
  assert.equal(app.render(), null, 'the global loader is the only loading surface');
  app.state.active = false; assert.equal(app.render(), null, 'backgrounding cannot mount the dashboard');
  app.state.active = true; app.state.entryPending = false;
  const dashboard = app.render(); assert.equal(dashboard.type, 'Dashboard');
  app.state.entryPending = true;
  const checkingAgain = app.render();
  assert.equal(checkingAgain.type, dashboard.type); assert.equal(checkingAgain.key, dashboard.key);
  assert.equal(checkingAgain.props.context.isScreenActive, false, 'foreground work pauses without remounting an existing map');
  app.hooks.unmount();
});

test('profile and ride discovery may finish in either order without flashing the wrong Home', () => {
  for (const role of ['driver', 'passenger']) {
    const app = fixture(); app.state.entryPending = true;
    assert.equal(app.render(), null);
    Object.assign(app.profile, { data: { id: 'me', role }, isFetching: false, isSuccess: true });
    assert.equal(app.render(), null);
    app.state.entryPending = false;
    assert.equal(app.render().props.context.isDriver, role === 'driver');
    app.state.auth.tokenPayload.sub = 'other'; app.state.entryPending = true;
    assert.equal(app.render(), null, 'do not reuse another account dashboard');
    app.hooks.unmount();
  }
});

for (const role of ['driver', 'passenger', 'both']) {
  test(`first resolved ${role} profile reveals the correct Home immediately, never a passenger placeholder`, () => {
    const app = fixture();
    const waiting = app.render();
    assert.equal(waiting.type, 'RoleLoader');
    assert.equal(waiting.props.failed, false);
    assert.equal(waiting.props.active, true);
    assert.equal(waiting.props.children, undefined, 'dashboard/map/work hooks are not mounted behind the loader');
    Object.assign(app.profile, { data: { id: 'me', role }, isFetching: false, isSuccess: true });
    const ready = app.render();
    assert.equal(ready.type, 'Dashboard');
    assert.equal(ready.key, 'me');
    assert.equal(ready.props.context.isDriver, role !== 'passenger');
    assert.equal(ready.props.context.currentUser, app.profile.data);
    app.hooks.unmount();
  });
}

test('a cached same-account profile bypasses the loader, even on refetch or network failure', () => {
  const app = fixture();
  app.profile.data = { id: 'me', role: 'driver' };
  const ready = app.render();
  assert.equal(ready.type, 'Dashboard');
  for (const update of [{ isFetching: false, isSuccess: true }, { isFetching: true },
    { isFetching: false, isSuccess: false, isError: true }]) {
    Object.assign(app.profile, update);
    const refreshed = app.render();
    assert.equal(refreshed.type, ready.type);
    assert.equal(refreshed.key, ready.key, 'ordinary refetch cannot remount the native dashboard');
    assert.equal(refreshed.props.context.isDriver, true);
  }
  app.hooks.unmount();
});

test('switching accounts does not reveal the previous account profile or role', () => {
  const app = fixture();
  Object.assign(app.profile, { data: { id: 'me', role: 'driver' }, isFetching: false, isSuccess: true });
  assert.equal(app.render().type, 'Dashboard');
  app.state.auth.tokenPayload = { userId: 'next' };
  app.profile.isFetching = true;
  assert.equal(app.render().type, 'RoleLoader');
  assert.equal(app.context().currentUser, undefined);
  app.profile.data = { id: 'next', role: 'passenger' };
  app.profile.isFetching = false;
  const ready = app.render();
  assert.equal(ready.type, 'Dashboard');
  assert.equal(ready.key, 'next');
  assert.equal(ready.props.context.isDriver, false);
  app.hooks.unmount();
});

test('failed or invalid profile reads show inline retry, then recover with the resolved role', async () => {
  const app = fixture();
  Object.assign(app.profile, { isFetching: false, isError: true });
  const failed = app.render();
  assert.equal(failed.type, 'RoleLoader');
  assert.equal(failed.props.failed, true);
  await failed.props.onRetry();
  assert.equal(app.calls(), 1);
  Object.assign(app.profile, { data: { id: 'me', role: 'unknown' }, isError: false, isSuccess: true });
  assert.equal(app.render().props.failed, true);
  app.profile.data.role = 'driver';
  assert.equal(app.render().props.context.isDriver, true);
  app.hooks.unmount();
});

test('profile retries pause out of focus, in the background, before subscription and during fetching', async () => {
  const app = fixture();
  app.profile.isFetching = false;
  for (const field of ['focused', 'active']) {
    app.state[field] = false;
    assert.equal(app.render().props.active, false);
    await app.context().retryHomeRole();
    app.state[field] = true;
  }
  for (const field of ['isFetching', 'isUninitialized']) {
    app.profile[field] = true;
    await app.context().retryHomeRole();
    app.profile[field] = false;
  }
  assert.equal(app.calls(), 0);
  await app.context().retryHomeRole();
  assert.equal(app.calls(), 1);
  app.hooks.unmount();
});

test('a failed retry never escapes as an unhandled promise or a synchronous exception', async () => {
  const app = fixture();
  Object.assign(app.profile, { isFetching: false, isError: true });
  for (const refetch of [() => Promise.reject(new Error('offline')), () => { throw new Error('unsubscribed'); }]) {
    app.profile.refetch = refetch;
    await assert.doesNotReject(app.context().retryHomeRole());
    assert.equal(app.render().props.failed, true);
  }
  app.hooks.unmount();
});

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  return [element, ...nodes(element.props.children)];
}
const { HomeRoleLoader } = loader({
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/components/home/HomeRideLoaderVisual': { HomeRideLoaderVisual: 'Journey' },
  'react-native': { ScrollView: 'Scroll', Text: 'Text', View: 'View',
    TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
  'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
})('components/home/HomeRoleLoader.tsx');

test('role loader is neutral and scrollable, and pauses its illustrated journey when inactive', () => {
  for (const active of [true, false]) {
    const tree = HomeRoleLoader({ failed: false, active, retrying: true, onRetry() {} });
    const rendered = nodes(tree);
    assert.equal(tree.props.testID, 'home-role-loader');
    assert.ok(rendered.some(node => node.type === 'Scroll'));
    assert.equal(rendered.find(node => node.type === 'Journey').props.running, active);
    const status = rendered.find(node => node.props.accessibilityRole === 'progressbar');
    assert.equal(status.props.accessible, true);
    assert.equal(status.props.accessibilityState.busy, true);
    assert.equal(status.props.accessibilityLabel, 'Préparation de votre accueil');
    assert.equal(rendered.some(node => node.type === 'Button'), false);
    const copy = rendered.filter(node => node.type === 'Text').map(node => node.props.children).join(' ');
    assert.doesNotMatch(copy, /passager|conducteur|publier|commander/i);
  }
});

test('inline error exposes an accessible retry and removes it while retrying', () => {
  let retries = 0;
  const props = { failed: true, active: true, retrying: false, onRetry: () => { retries++; } };
  const rendered = nodes(HomeRoleLoader(props));
  assert.equal(rendered.find(node => node.type === 'Journey').props.running, false);
  const button = rendered.find(node => node.type === 'Button');
  assert.equal(button.props.accessibilityLabel, 'Réessayer');
  assert.equal(button.props.disabled, false);
  assert.ok(button.props.style[0].minHeight >= 48);
  button.props.onPress();
  assert.equal(retries, 1);
  assert.equal(nodes(HomeRoleLoader({ ...props, active: false })).find(node => node.type === 'Button').props.disabled, true);
  const retrying = nodes(HomeRoleLoader({ ...props, retrying: true }));
  assert.equal(retrying.find(node => node.type === 'Journey').props.running, true);
  assert.equal(retrying.some(node => node.type === 'Button'), false);
});
