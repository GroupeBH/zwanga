const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture() {
  const hooks = hookHarness(), calls = [];
  const user = { id: 'a', phone: '+243000000000', isPhoneVerified: false };
  const io = { version: 0, authenticated: true, userId: 'a', segments: ['(tabs)'],
    profile: { currentData: user, isFetching: false, isError: false }, result: { ...user, isPhoneVerified: true } };
  const state = { auth: { tokenPayload: { sub: 'a' } } };
  const load = loader({
    react: hooks.react,
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', TouchableOpacity: 'Button' },
    'expo-router': { useSegments: () => io.segments },
    '@/config/env': { isAccountPhoneVerificationRequired: true },
    '@/store/hooks': { useAppSelector: selector => selector(state), useAppDispatch: () => action => {
      if (action.kind === 'running') return io.running;
      calls.push(action); return { unwrap: async () => io.result };
    } },
    '@/store/selectors': { selectHasAuthenticatedSession: () => io.authenticated },
    '@/store/slices/authSlice': { performLogout: () => ({ kind: 'logout' }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    '@/store/api/userApi': {
      useGetCurrentUserQuery: (_arg, options) => { io.options = options; return io.profile; },
      userApi: { util: { getRunningQueryThunk: () => ({ kind: 'running' }) },
        endpoints: { getCurrentUser: { initiate: (_arg, options) => ({ kind: 'get', options }) } } },
    },
    './auth/AccountPhoneVerification': { AccountPhoneVerification: 'Form', PhoneVerificationShell: 'Shell', accountPhoneStyles: {} },
  });
  const Component = load('components/AccountPhoneVerificationGate.tsx').AccountPhoneVerificationGate;
  const render = () => hooks.render(() => Component({ children: blocked => ({ navigatorMounted: true, blocked }) }));
  const modal = () => render().props.children[1];
  const form = () => modal().props.children.props.children;
  return { io, calls, state, render, modal, form };
}

test('root gate keeps navigation mounted, blocks Back and pauses private coordinators until phone verified', () => {
  const f = fixture();
  assert.deepEqual(f.render().props.children[0], { navigatorMounted: true, blocked: true });
  assert.equal(f.modal().props.visible, true);
  f.modal().props.onRequestClose(); assert.equal(f.modal().props.visible, true);
  f.io.profile.currentData.isPhoneVerified = true;
  assert.equal(f.modal().props.visible, false);
  assert.equal(f.render().props.children[0].blocked, false);
  f.io.authenticated = false; f.render(); assert.equal(f.io.options.skip, true);
});

test('unknown profile, wrong account or network error never unlock the gate', () => {
  const f = fixture();
  for (const profile of [{ isError: true }, { isFetching: true },
    { currentData: { id: 'b', isPhoneVerified: true } }]) {
    f.io.profile = profile;
    assert.equal(f.modal().props.visible, true);
    assert.equal(f.render().props.children[0].blocked, true);
  }
});

test('auth finalization/KYC remains accessible but private coordinators stay paused', () => {
  const f = fixture(); f.io.segments = ['auth'];
  assert.equal(f.modal().props.visible, false);
  assert.equal(f.render().props.children[0].blocked, true);
  f.io.segments = ['request-details', 'trip']; assert.equal(f.modal().props.visible, true);
});

test('successful OTP forces a profile read AFTER any pre-verification GET', async () => {
  const f = fixture(), running = deferred(); f.io.running = running.promise;
  const work = f.form().props.refreshProfile(); assert.deepEqual(f.calls, []);
  running.resolve(); await work;
  assert.deepEqual(f.calls, [{ kind: 'get', options: { subscribe: false, forceRefetch: true } }]);
  for (const result of [{ id: 'b', isPhoneVerified: true }, { id: 'a', isPhoneVerified: false }]) {
    f.io.result = result;
    await assert.rejects(f.form().props.refreshProfile(), /pas encore confirmée/);
  }
});

test('session switch while waiting for the old GET prevents a new request', async () => {
  const f = fixture(), running = deferred(); f.io.running = running.promise;
  const work = f.form().props.refreshProfile(); f.io.version++;
  running.resolve(); await work; assert.deepEqual(f.calls, []);
});
