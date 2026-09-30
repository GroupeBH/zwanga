const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { getHomeRootState, STARTUP_ROUTES } = load('features/navigation/homeBackPolicy.ts');
// Exercise the installed routers as well as the app policy; no native BackHandler is mocked into the policy.
const { StackRouter } = load('node_modules/@react-navigation/routers/src/StackRouter.tsx');
const { TabRouter } = load('node_modules/@react-navigation/routers/src/TabRouter.tsx');
const rootNames = [...STARTUP_ROUTES, 'auth-entry', 'auth', '(tabs)', 'wallet', 'trip/[id]', 'trip/navigate/[id]', 'request-create'];
const options = names => ({ routeNames: names, routeParamList: {}, routeGetIdList: {}, routeKeyChanges: [] });
const rootOptions = options(rootNames);
const stack = StackRouter({});
const route = (name, key = name) => ({ name, key });
function state(routes) {
  return { ...stack.getInitialState(rootOptions), key: 'root', routes, index: routes.length - 1 };
}
const back = (value, router = stack, config = rootOptions) => router.getStateForAction(value, { type: 'GO_BACK' }, config);

test('login history is removed: Back from Home cannot reveal splash or authentication', () => {
  const home = route('(tabs)', 'home');
  const before = state([route('splash'), route('auth-entry'), route('auth'), home]);
  const after = getHomeRootState(before, true);
  assert.deepEqual(after.routes, [home]); assert.equal(after.index, 0);
  assert.equal(after.key, before.key); assert.equal(after.routes[0], home);
  assert.equal(back(after), null, 'root no longer consumes Back; Android may leave the activity');
  assert.equal(getHomeRootState(after, true), null, 'idempotent repair');
});

test('deep-linked detail keeps params/key and gains a Home entry underneath, including nested state', () => {
  const detail = { ...route('trip/[id]', 'trip-current'), params: { id: 'trip-A', openEdit: '1' },
    state: { index: 0, routes: [{ name: 'nested' }] } };
  const after = getHomeRootState(state([route('splash'), detail]), true);
  assert.deepEqual(after.routes.map(item => item.name), ['(tabs)', 'trip/[id]']);
  assert.equal(after.routes[after.index], detail);
  assert.equal(after.routes[1].params, detail.params); assert.equal(after.routes[1].state, detail.state);
  const home = back(after); assert.equal(home.routes[home.index].name, '(tabs)');
  assert.equal(back(home), null);
});

test('replacing Home by a destination still leaves Home as the last screen, without replaying a form', () => {
  const detail = route('request-create', 'draft');
  const before = state([detail]);
  const after = getHomeRootState(before, true);
  assert.equal(after.routes[1], detail);
  assert.deepEqual(back(after).routes.map(item => item.name), ['(tabs)']);
  assert.deepEqual(before.routes, [detail], 'never mutate navigation state');
});

test('ordinary navigation is untouched and returns through details before reaching Home', () => {
  const before = state([route('(tabs)'), route('wallet'), route('trip/[id]')]);
  assert.equal(getHomeRootState(before, true), null);
  const wallet = back(before); assert.equal(wallet.routes[wallet.index].name, 'wallet');
  const home = back(wallet); assert.equal(home.routes[home.index].name, '(tabs)');
  assert.equal(back(home), null);
});

test('a later Home visit starts a fresh back chain while preserving the focused tab', () => {
  const currentHome = { ...route('(tabs)', 'home-later'), state: { index: 1, routes: [route('index'), route('profile')] } };
  const before = state([route('(tabs)', 'home-old'), route('request-create'), currentHome, route('wallet')]);
  const after = getHomeRootState(before, true);
  assert.deepEqual(after.routes.map(item => item.key), ['home-later', 'wallet']);
  assert.equal(after.routes[0], currentHome); assert.equal(after.routes[0].state, currentHome.state);
});

test('startup/onboarding and auth/PIN flows are not redirected and no Home is added without a session', () => {
  for (const name of [...STARTUP_ROUTES, 'auth', 'auth-entry']) {
    assert.equal(getHomeRootState(state([route(name)]), true), null);
  }
  assert.equal(getHomeRootState(state([route('wallet')]), false), null);
  assert.equal(getHomeRootState(undefined, true), null);
  assert.equal(getHomeRootState({ ...state([route('wallet')]), routeNames: ['wallet'] }, true), null);
});

test('every tab returns directly to Home, then delegates Back to the root instead of replaying tab visits', () => {
  const tabs = TabRouter({ initialRouteName: 'index', backBehavior: 'initialRoute' });
  const tabOptions = options(['index', 'discover', 'trips', 'messages', 'profile']);
  let current = tabs.getInitialState(tabOptions);
  for (const name of tabOptions.routeNames.slice(1)) {
    current = tabs.getStateForAction(current, { type: 'JUMP_TO', payload: { name } }, tabOptions);
    const home = back(current, tabs, tabOptions);
    assert.equal(home.routes[home.index].name, 'index');
    assert.equal(back(home, tabs, tabOptions), null);
  }
});

test('removing startup guards prunes splash history and logout falls back to auth-entry, not Home', () => {
  const namesAfterStartup = rootNames.filter(name => !STARTUP_ROUTES.has(name));
  const home = state([route('splash'), route('(tabs)')]);
  const pruned = stack.getStateForRouteNamesChange(home, options(namesAfterStartup));
  assert.deepEqual(pruned.routes.map(item => item.name), ['(tabs)']);
  const logout = stack.getStateForRouteNamesChange(pruned, options(['auth-entry', 'auth']));
  assert.deepEqual(logout.routes.map(item => item.name), ['auth-entry']);
  assert.equal(back(logout, stack, options(['auth-entry', 'auth'])), null);
});

function hookFixture(platform = 'android') {
  const hooks = hookHarness(), resets = [];
  const readyListeners = new Set();
  const f = { hasSession: true, ready: true, root: state([route('splash')]), observed: null };
  const navigation = { isReady: () => f.ready, getRootState: () => f.root,
    addListener: (event, listener) => {
      assert.equal(event, 'ready'); readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    resetRoot: next => { resets.push(next); f.root = next; } };
  const { useHomeRootNavigation } = loader({ react: hooks.react,
    'react-native': { Platform: { OS: platform } },
    'expo-router': { useNavigationContainerRef: () => navigation, useRootNavigationState: () => f.observed || f.root },
  })('hooks/navigation/useHomeRootNavigation.ts');
  return { f, hooks, resets, readyListeners, render: () => hooks.render(() => useHomeRootNavigation(f.hasSession)) };
}

test('opening flow stays available until first exit, never reopens on resume/logout, resets only on a real remount', () => {
  const env = hookFixture(); assert.equal(env.render(), true);
  env.f.root = state([route('onboarding')]); assert.equal(env.render(), true);
  env.f.root = state([route('background-location-disclosure')]); assert.equal(env.render(), true);
  env.f.root = state([route('auth-entry')]); env.render(); assert.equal(env.render(), false);
  assert.equal(env.resets.length, 0);
  env.f.root = state([route('auth-entry'), route('(tabs)')]); env.render();
  assert.equal(env.resets.length, 1); assert.equal(env.render(), false);
  env.render(); assert.equal(env.resets.length, 1);
  env.f.hasSession = false; env.f.root = state([route('auth-entry')]);
  assert.equal(env.render(), false); assert.equal(env.resets.length, 1);
  env.hooks.unmount();
  const reopened = hookFixture(); assert.equal(reopened.render(), true); reopened.hooks.unmount();
});

test('ready native repair uses latest root state, not an outdated render snapshot; web is untouched', () => {
  const env = hookFixture(); env.f.ready = false;
  env.f.root = state([route('trip/[id]')]); env.render(); assert.equal(env.resets.length, 0);
  env.f.ready = true; env.f.observed = env.f.root;
  const newer = route('trip/navigate/[id]', 'navigation-current');
  env.f.root = state([route('splash'), newer]);
  env.readyListeners.forEach(listener => listener());
  assert.equal(env.resets.at(-1).routes.at(-1), newer);
  env.hooks.unmount();
  assert.equal(env.readyListeners.size, 0);
  const web = hookFixture('web'); web.f.root = state([route('wallet')]);
  assert.equal(web.render(), true); assert.equal(web.resets.length, 0); web.hooks.unmount();
});

test('ProtectedAppStack has independent startup/session guards and always retains public login', () => {
  let allowStartup = true, session = false;
  const Stack = Object.assign(() => null, { Screen: 'Screen', Protected: 'Protected' });
  const { ProtectedAppStack } = loader({ react: React,
    '@/store/selectors': { selectHasAuthenticatedSession: () => session },
    '@/store/hooks': { useAppSelector: selector => selector() },
    '@/hooks/navigation/useHomeRootNavigation': { useHomeRootNavigation: () => allowStartup },
    'expo-router': { Stack }, 'react-native': { Platform: { OS: 'android' } },
  })('components/ProtectedAppStack.tsx');
  const getGroups = () => ProtectedAppStack().props.children.filter(child => child.type === 'Protected');
  assert.deepEqual(getGroups().map(group => group.props.guard), [true, false]);
  allowStartup = false; session = true;
  assert.deepEqual(getGroups().map(group => group.props.guard), [false, true]);
  session = false;
  assert.deepEqual(getGroups().map(group => group.props.guard), [false, false]);
  const publicScreens = ProtectedAppStack().props.children.filter(child => child.type === 'Screen');
  assert.deepEqual(publicScreens.map(child => child.props.name), ['auth-entry', 'auth']);
});
