const { Buffer } = require('node:buffer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jwt = id => `x.${Buffer.from(JSON.stringify({ sub: id, exp: 9999999999 })).toString('base64url')}.x`;
const credentials = { accessToken: jwt('test-account'), refreshToken: jwt('test-account') };

function fixture() {
  const hooks = hookHarness(), response = gate(), storage = gate(), profile = gate(), dialogs = [], events = [], writes = [];
  const baseApi = createApi({ reducerPath: 'testAuth', baseQuery: () => response.promise,
    tagTypes: ['User'], endpoints: () => ({}) });
  const load = loader({ react: hooks.react, 'expo-constants': { expoConfig: {} },
    'expo-secure-store': { setItemAsync: async key => { writes.push(key); await storage.promise; } },
    '@react-native-async-storage/async-storage': { getItem: async () => null, removeItem: async () => {} },
    '../../services/tokenRefresh': {}, './baseApi': { baseApi },
    '../api/userApi': { userApi: { endpoints: { getCurrentUser: { initiate: () => () => profile.promise } } } },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/services/googleAuth': { signInWithGoogle: async () => ({ idToken: 'test-google' }) },
  });
  const auth = load('store/slices/authSlice.ts'), { authApi } = load('store/api/authApi.ts');
  const session = load('services/tokenSession.ts');
  const { usePinLogin } = load('hooks/auth/usePinLogin.ts');
  const store = configureStore({ reducer: { auth: auth.default, [baseApi.reducerPath]: baseApi.reducer },
    middleware: defaults => defaults().concat(baseApi.middleware, () => next => action => {
      events.push(action.type); return next(action);
    }) });
  const props = { active: true, phone: '+243000000000', login: payload => store.dispatch(authApi.endpoints.login.initiate(payload)),
    dispatch: store.dispatch, setPin() {}, showDialog: dialog => dialogs.push(dialog), onRetry() {} };
  return { load, hooks, auth, authApi, store, session, response, storage, profile, writes, events, dialogs, props,
    render: () => hooks.render(() => usePinLogin(props)),
    close: () => { hooks.unmount(); profile.resolve({}); store.dispatch(baseApi.util.resetApiState()); } };
}

for (const endpoint of ['login', 'register', 'googleMobile', 'appleMobile']) {
  test(`${endpoint}: HTTP success alone never authenticates behind the form's lifecycle`, async () => {
    const e = fixture();
    try {
      const request = e.store.dispatch(e.authApi.endpoints[endpoint].initiate({ phone: '+243000000000', pin: '1234', idToken: 'test' }));
      e.response.resolve({ data: credentials });
      await request.unwrap(); await tick();
      assert.equal(e.session.getTokenSessionVersion(), 0);
      assert.deepEqual(e.writes, []);
      assert.equal(e.store.getState().auth.isAuthenticated, false);
    } finally { e.storage.resolve(); e.close(); }
  });
}

test('PIN + actual RTK lifecycle: waits for one secure pair before publishing the session once', async () => {
  const e = fixture();
  try {
    let completed = false;
    const work = e.render().submit('1234').then(() => { completed = true; });
    e.response.resolve({ data: credentials }); await tick();
    assert.equal(completed, false, 'form must own and await persistence');
    assert.equal(e.store.getState().auth.isAuthenticated, false);
    assert.equal(e.render().isPending, true);
    assert.equal(e.writes.length, 2);
    e.storage.resolve(); await work; await tick();
    assert.equal(e.session.getTokenSessionVersion(), 1);
    assert.equal(e.events.filter(type => type === 'auth/setTokens').length, 1);
    assert.equal(e.store.getState().auth.isAuthenticated, true);
    assert.equal(e.render().isPending, true);
    assert.deepEqual(e.dialogs, []);
  } finally { e.storage.resolve(); e.close(); }
});

test('PIN + actual RTK lifecycle: persistence failure is visible, never authenticates', async () => {
  const e = fixture();
  try {
    const work = e.render().submit('1234');
    e.response.resolve({ data: credentials }); await tick();
    e.storage.reject(new Error('Synthetic storage failure')); await work; await tick();
    assert.ok(e.render().errorMessage, 'a detached API lifecycle must not swallow the failure');
    assert.equal(e.dialogs.length, 0, 'no native dialog on failed PIN login');
    assert.equal(e.store.getState().auth.isAuthenticated, false);
    assert.equal(e.render().isPending, false);
  } finally { e.close(); }
});

test('leaving PIN before HTTP completes cannot install a session in the background', async () => {
  const e = fixture();
  try {
    const work = e.render().submit('1234');
    e.props.active = false; e.render();
    e.response.resolve({ data: credentials }); e.storage.resolve(); await work; await tick();
    assert.equal(e.writes.length, 0);
    assert.equal(e.store.getState().auth.isAuthenticated, false);
  } finally { e.close(); }
});

for (const error of [{ status: 401, data: { message: 'Numéro de téléphone ou code PIN invalide' } },
  { status: 'FETCH_ERROR', error: 'Network request failed' }, { status: 503, data: {} }]) {
  test(`PIN: ${error.status} stays on the form, without native dialog or token writes`, async () => {
    const e = fixture();
    try {
      const work = e.render().submit('1234');
      e.response.resolve({ error }); await work; await tick();
      const message = e.render().errorMessage;
      assert.ok(message);
      assert.equal(e.render().isPending, false);
      assert.equal(e.writes.length, 0);
      assert.equal(e.store.getState().auth.isAuthenticated, false);
      assert.deepEqual(e.dialogs, []);
      assert.equal(e.render().errorMessage, message, 'feedback persists across renders');
    } finally { e.close(); }
  });
}

for (const sameAccount of [true, false]) test(`optional server profile is kept only for the saved JWT (${sameAccount})`, async () => {
  const e = fixture();
  try {
    const work = e.render().submit('1234');
    e.response.resolve({ data: { ...credentials, user: { id: sameAccount ? 'test-account' : 'other', firstName: 'Test' } } });
    e.storage.resolve(); await work;
    assert.equal(e.store.getState().auth.user.id, 'test-account');
    assert.equal(e.store.getState().auth.user.firstName, sameAccount ? 'Test' : undefined);
    assert.equal(e.events.filter(type => type === 'auth/setTokens').length, 1);
  } finally { e.close(); }
});

test('optional profile enrichment is nonblocking and preserves full profile fields', async () => {
  const e = fixture();
  try {
    const work = e.render().submit('1234');
    e.response.resolve({ data: credentials }); e.storage.resolve(); await work;
    assert.equal(e.store.getState().auth.isAuthenticated, true);
    assert.equal(e.store.getState().auth.user.firstName, undefined);
    e.profile.resolve({ data: { id: 'test-account', firstName: 'Test', role: 'passenger' } }); await tick();
    assert.equal(e.store.getState().auth.user.firstName, 'Test');
    assert.equal(e.events.filter(type => type === 'auth/setTokens').length, 1);
  } finally { e.close(); }
});

test('optional profile error cannot reverse login, late profile cannot replace another account', async () => {
  for (const fail of [true, false]) {
    const e = fixture();
    try {
      const work = e.render().submit('1234');
      e.response.resolve({ data: credentials }); e.storage.resolve(); await work;
      if (fail) e.profile.reject(new Error('Synthetic profile read error'));
      else {
        e.session.invalidateTokenSession();
        e.store.dispatch(e.auth.setTokens({ accessToken: jwt('other'), refreshToken: jwt('other') }));
        e.profile.resolve({ data: { id: 'test-account', firstName: 'Test' } });
      }
      await tick();
      assert.equal(e.store.getState().auth.isAuthenticated, true);
      assert.equal(e.store.getState().auth.user.id, fail ? 'test-account' : 'other');
      assert.equal(e.render().errorMessage, null);
    } finally { e.close(); }
  }
});

for (const fail of [true, false]) test(`Google with actual RTK/storage observes its own session result (${fail})`, async () => {
  const e = fixture();
  const { useGoogleAuthActions } = e.load('hooks/auth/useGoogleAuthActions.ts');
  const noop = () => {};
  const props = { attemptInFlight: { current: false }, onSignupRequired: noop, setGoogleFlow: noop,
    setSocialProvider: noop, setGoogleIdToken: noop, setGoogleProfileName: noop,
    setGoogleFirstName: noop, setGoogleLastName: noop, setGoogleEmail: noop,
    googleMobile: payload => e.store.dispatch(e.authApi.endpoints.googleMobile.initiate(payload)),
    confirmSession: tokens => e.store.dispatch(e.auth.saveTokensAndUpdateState(tokens)).unwrap(),
    showDialog: dialog => e.dialogs.push(dialog) };
  try {
    const render = () => e.hooks.render(() => useGoogleAuthActions(props));
    const work = render().handleGoogleLogin();
    e.response.resolve({ data: credentials }); await tick();
    if (fail) e.storage.reject(new Error('Synthetic storage error'));
    else e.storage.resolve();
    await work;
    assert.equal(e.dialogs.length, fail ? 1 : 0);
    assert.equal(e.store.getState().auth.isAuthenticated, !fail);
    assert.equal(render().isGoogleLoading, !fail);
    assert.equal(e.session.getTokenSessionVersion(), 1);
  } finally { e.close(); }
});
