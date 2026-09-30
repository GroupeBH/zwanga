/* global __dirname, Buffer */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');

const jwt = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`;
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;
const access = jwt({ sub: 'account-1', exp: future });
const refresh = jwt({ sub: 'account-1', exp: future + 3600 });

test('only an identifiable, refreshable session can open private routes', () => {
  const policy = loader()('features/auth/sessionPolicy.ts');
  assert.equal(policy.hasRecoverableAuthSession(access, refresh), true);
  assert.equal(policy.hasRecoverableAuthSession(null, refresh), false);
  assert.equal(policy.hasRecoverableAuthSession(jwt({ exp: future }), refresh), false);
  assert.equal(policy.hasRecoverableAuthSession(access, jwt({ exp: past })), false);
  assert.equal(policy.hasRecoverableAuthSession(access, jwt({ exp: 'unknown' })), false);
  assert.equal(policy.hasUsableNewAuthSession(jwt({ sub: 'account-1', exp: past }), refresh), false);
  assert.equal(policy.hasRecoverableAuthSession(jwt({ sub: 'account-1', exp: past }), refresh), true);
});

test('every non-public app route is inside the session guard', () => {
  let authenticated = false;
  function Stack() { return null; }
  Stack.Screen = function Screen() { return null; };
  Stack.Protected = function Protected() { return null; };
  const { ProtectedAppStack } = loader({
    '@/store/selectors': { selectHasAuthenticatedSession: () => authenticated },
    '@/store/hooks': { useAppSelector: (selector) => selector() },
    'expo-router': { Stack },
    'react-native': { Platform: { OS: 'android' } },
    '@/hooks/navigation/useHomeRootNavigation': { useHomeRootNavigation: () => true },
  })('components/ProtectedAppStack.tsx');
  const tree = ProtectedAppStack();
  const children = Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children];
  const isPrivateGroup = child => child.type === Stack.Protected && child.props.children.some(screen => screen.props.name === '(tabs)');
  const protectedGroup = children.find(isPrivateGroup);
  assert.equal(protectedGroup.props.guard, false);
  authenticated = true;
  const activeChildren = ProtectedAppStack().props.children;
  assert.equal(activeChildren.find(isPrivateGroup).props.guard, true);
  const protectedScreens = new Set(protectedGroup.props.children.map((child) => child.props.name));
  assert.ok(protectedScreens.has('(tabs)'));
  assert.ok(protectedScreens.has('publish'));
  assert.ok(protectedScreens.has('request-create'));

  const publicRoutes = new Set(['index', 'splash', 'onboarding', 'background-location-disclosure', 'auth-entry', 'auth']);
  const appRoot = path.resolve(__dirname, '../app');
  const routes = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith('.tsx') && !entry.name.startsWith('_') && !entry.name.startsWith('+')) {
        routes.push(path.relative(appRoot, absolute).replaceAll('\\', '/').replace(/\.tsx$/, ''));
      }
    }
  }
  visit(appRoot);
  for (const route of routes) {
    if (route.startsWith('(tabs)/')) continue;
    if (publicRoutes.has(route)) continue;
    assert.ok(protectedScreens.has(route), `${route} needs a session guard`);
  }
});

test('invalid login tokens are rejected before storage or Redux authentication', async () => {
  let writes = 0;
  const auth = loader({
    '../../services/tokenRefresh': { validateAndRefreshTokens: async () => false },
    '../../services/tokenSession': { getTokenSessionVersion: () => 0 },
    '../../services/tokenStorage': { storeTokens: async () => { writes++; return true; } },
  })('store/slices/authSlice.ts');
  const { configureStore } = require('@reduxjs/toolkit');
  const store = configureStore({ reducer: auth.default });
  const result = await store.dispatch(auth.saveTokensAndUpdateState({
    accessToken: jwt({ exp: future }), refreshToken: refresh,
  }));
  assert.equal(result.meta.requestStatus, 'rejected');
  assert.equal(writes, 0);
  assert.equal(store.getState().isAuthenticated, false);
});

test('startup discards stored tokens that cannot identify an account', async () => {
  let clears = 0;
  const auth = loader({
    '../../services/tokenRefresh': { validateAndRefreshTokens: async () => true },
    '../../services/tokenSession': { getTokenSessionVersion: () => 3 },
    '../../services/tokenStorage': {
      getTokens: async () => ({ accessToken: jwt({ exp: future }), refreshToken: refresh }),
      clearTokens: async (version) => { assert.equal(version, 3); clears++; return true; },
    },
  })('store/slices/authSlice.ts');
  const { configureStore } = require('@reduxjs/toolkit');
  const store = configureStore({ reducer: auth.default });
  await store.dispatch(auth.initializeAuth());
  assert.equal(clears, 1);
  assert.equal(store.getState().isAuthenticated, false);
});
