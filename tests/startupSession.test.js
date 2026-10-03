const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const jwt = (sub, seconds = 3600) => `x.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')}.x`;

function fixture(options = {}) {
  let store;
  const io = { failReads: false, reads: 0, requests: [], clears: [], ...options };
  const disk = new Map();
  if (options.access) disk.set('zwanga_accessToken', options.access);
  if (options.refresh) disk.set('zwanga_refreshToken', options.refresh);
  const load = loader({
    'expo-constants': { expoConfig: {} },
    'expo-secure-store': {
      getItemAsync: async key => { io.reads++; if (io.failReads) throw Error('Native keychain temporarily locked'); return disk.get(key) ?? null; },
      setItemAsync: async (key, value) => { disk.set(key, value); },
      deleteItemAsync: async key => { io.clears.push(key); disk.delete(key); },
    },
    '../store/storeAccessor': { getStoreDispatch: () => store.dispatch },
    '../store/api/authRefreshApi': { authRefreshApi: { endpoints: { refreshSession: { initiate: payload => () => {
      const request = deferred(); io.requests.push({ ...request, payload });
      return { unwrap: () => request.promise, reset() {} };
    } } } } },
    '@/store/hooks': { useAppSelector: selector => selector(store.getState()) },
    'expo-router': { Redirect: 'Redirect' },
    '@/features/auth/AuthWelcome': { AuthWelcome: 'Welcome' },
  });
  const auth = load('store/slices/authSlice.ts');
  store = configureStore({ reducer: { auth: auth.default } });
  return { io, store, auth, load, disk };
}

test('valid stored tokens open Home on cold start without a network call or onboarding flag reads', async () => {
  const e = fixture({ access: jwt('test-account'), refresh: jwt('test-account', 7200) });
  await e.store.dispatch(e.auth.initializeAuth()).unwrap();
  assert.equal(e.io.reads, 2, 'one read per token, then memory cache');
  assert.equal(e.io.requests.length, 0);
  assert.equal(e.store.getState().auth.user.id, 'test-account');
  for (const route of ['app/index.tsx', 'app/splash.tsx', 'app/onboarding.tsx', 'app/background-location-disclosure.tsx', 'app/auth-entry.tsx']) {
    const tree = e.load(route).default();
    assert.equal(tree.type, 'Redirect'); assert.equal(tree.props.href, '/(tabs)', route);
  }
});

test('a new install reaches a single welcome screen directly, while a signed-out user has no private session', async () => {
  const e = fixture(); await e.store.dispatch(e.auth.initializeAuth()).unwrap();
  assert.equal(e.store.getState().auth.isAuthenticated, false);
  for (const route of ['app/index.tsx', 'app/splash.tsx', 'app/onboarding.tsx', 'app/background-location-disclosure.tsx']) {
    assert.equal(e.load(route).default().props.href, '/auth-entry', route);
  }
  assert.equal(e.load('app/auth-entry.tsx').default().type, 'Welcome');
  assert.equal(e.io.requests.length, 0);
});

test('temporarily inaccessible credentials reject startup, stay on disk and can be restored on retry', async () => {
  const e = fixture({ access: jwt('test-account'), refresh: jwt('test-account', 7200), failReads: true });
  await assert.rejects(e.store.dispatch(e.auth.initializeAuth()).unwrap(), /./);
  assert.equal(e.io.clears.length, 0);
  assert.equal(e.io.requests.length, 0);
  assert.equal(e.disk.size, 2);
  e.io.failReads = false;
  await e.store.dispatch(e.auth.initializeAuth()).unwrap();
  assert.equal(e.io.reads, 4, 'a failed read must not poison the in-memory cache');
  assert.equal(e.load('app/index.tsx').default().props.href, '/(tabs)');
});

test('expired access is renewed once before Home; temporary network failures keep recoverable offline context', async () => {
  for (const failure of [false, true]) {
    const e = fixture({ access: jwt('test-account', -60), refresh: jwt('test-account', 7200) });
    const startup = e.store.dispatch(e.auth.initializeAuth()); await flush();
    assert.equal(e.io.requests.length, 1);
    if (failure) e.io.requests[0].reject({ status: 'FETCH_ERROR' });
    else e.io.requests[0].resolve({ accessToken: jwt('test-account'), refreshToken: jwt('test-account', 7200) });
    await startup.unwrap();
    assert.equal(e.load('app/index.tsx').default().props.href, '/(tabs)');
    const bearer = await e.load('services/tokenRefresh.ts').getValidAccessToken();
    assert.equal(Boolean(bearer), !failure, 'expired access must never authorize HTTP while offline');
    assert.equal(e.io.clears.length, 0);
  }
});

test('expired or server-revoked refresh credentials still require login', async () => {
  for (const expired of [true, false]) {
    const e = fixture({ access: jwt('test-account', -60), refresh: jwt('test-account', expired ? -30 : 7200) });
    const startup = e.store.dispatch(e.auth.initializeAuth()); await flush();
    if (!expired) e.io.requests[0].reject({ status: 401 });
    await startup.unwrap();
    assert.equal(e.load('app/index.tsx').default().props.href, '/auth-entry');
    assert.equal(e.disk.size, 0);
  }
});

function bootstrapFixture(t) {
  const hooks = hookHarness(), requests = [], listeners = new Set();
  const { useAuthBootstrap } = loader({ react: hooks.react, 'react-native': { AppState: {
    addEventListener: (_name, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
  } } })('hooks/auth/useAuthBootstrap.ts');
  const initialize = () => { const request = deferred(); requests.push(request); return request.promise; };
  const render = () => hooks.render(() => useAuthBootstrap(initialize));
  t.after(() => hooks.unmount());
  return { hooks, requests, listeners, render };
}

test('startup gate remains loading until restoration completes; failures expose retry, not the navigator', async t => {
  const e = bootstrapFixture(t);
  assert.equal(e.render().status, 'loading');
  e.render().retry(); assert.equal(e.requests.length, 1);
  e.requests[0].reject(Error('Temporary storage failure')); await flush();
  assert.equal(e.render().status, 'error');
  const action = e.render(); action.retry(); action.retry();
  assert.equal(e.render().status, 'loading'); assert.equal(e.requests.length, 2);
  e.requests[1].resolve(null); await flush();
  assert.equal(e.render().status, 'ready');
  assert.equal(e.listeners.size, 0);
});

test('returning to the foreground retries failed startup once, without restarting a restored session', async t => {
  const e = bootstrapFixture(t); e.render();
  e.requests[0].reject(Error('locked')); await flush(); e.render();
  assert.equal(e.listeners.size, 1);
  e.listeners.forEach(listener => { listener('background'); listener('active'); listener('active'); });
  e.render(); assert.equal(e.requests.length, 2);
  e.requests[1].resolve({}); await flush(); e.render();
  assert.equal(e.listeners.size, 0); assert.equal(e.render().status, 'ready');
});

test('unmounted startup ignores late responses and removes its listeners', async t => {
  const e = bootstrapFixture(t); e.render(); e.hooks.unmount();
  e.requests[0].resolve({}); await flush();
  assert.equal(e.render().status, 'loading'); assert.equal(e.listeners.size, 0);
});

for (const authenticated of [false, true]) {
  test(authenticated ? 'the global guard leaves an authenticated auth/KYC screen to its own redirect policy' :
    'the global guard does not race the initial empty route with an auth-entry redirect', async t => {
    const hooks = hookHarness(), routes = [];
    const token = jwt('test-account');
    const state = { auth: { isAuthenticated: authenticated, isLoading: false,
      accessToken: authenticated ? token : null, refreshToken: authenticated ? token : null } };
    const { AuthGuard } = loader({ react: hooks.react,
      'react-native': { View: 'View', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x },
        AppState: { currentState: 'active' }, InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) } },
      '../hooks/auth/useAuthForegroundSession': { useAuthForegroundSession() {} },
      '@/store/hooks': { useAppSelector: selector => selector(state), useAppDispatch: () => () => ({ unwrap: async () => {} }) },
      '@/store/slices/authSlice': { performLogout() {}, setTokens() {} },
      '@/store/api/userApi': { useUpdateFcmTokenMutation: () => [() => ({ unwrap: async () => {} })] },
      '@/services/pushNotifications': { clearStoredFcmToken: async () => {}, obtainFcmToken: async () => null, subscribeToFcmRefresh: () => () => {} },
      '@/services/tokenRefresh': { validateAndRefreshTokens: async () => false, proactiveTokenRefresh: async () => false },
      '@/services/tokenStorage': { getTokens: async () => ({ accessToken: null, refreshToken: null }) },
      'expo-router': { useSegments: () => authenticated ? ['auth'] : [],
        useRootNavigationState: () => ({ key: 'root', routeNames: ['index', 'auth-entry', 'auth', '(tabs)'] }),
        useRouter: () => ({ replace: target => routes.push(target) }) },
    })('components/AuthGuard.tsx');
    t.after(() => hooks.unmount());
    hooks.render(() => AuthGuard({ children: 'screen' })); await flush();
    assert.deepEqual(routes, []);
  });
}
