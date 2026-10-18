const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(options = {}) {
  const calls = [], dialogs = [];
  const hooks = hookHarness();
  const state = { focused: true, app: 'active', version: 0 };
  const load = loader({
    react: hooks.react,
    '@react-navigation/native': { useIsFocused: () => state.focused },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    'react-native': { Platform: { OS: options.platform ?? 'android' }, AppState: { get currentState() { return state.app; } } },
    'expo-router': { useRouter: () => ({ push() {} }) },
    'expo-linking': { createURL: () => 'zwanga://kyc/didit-return', parse: () => ({ queryParams: {} }) },
    'expo-web-browser': { maybeCompleteAuthSession() {}, openAuthSessionAsync: async () => {
      calls.push('browser'); return { type: 'success', url: 'zwanga://kyc/didit-return' };
    } },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/services/analytics': { trackEvent: async () => {} },
    '@didit-protocol/sdk-react-native': {
      CameraLens: { Back: 'back', Front: 'front' },
      startVerification: async (token, config) => {
        calls.push(['sdk', token, config.languageCode]);
        if (options.sdkError) throw options.sdkError;
        if (options.block) await options.block;
        return options.result ?? { type: 'completed', session: { sessionId: 'owned-session', status: 'Pending' } };
      },
    },
    '@/store/api/userApi': {
      useLazyGetCurrentUserQuery: () => [() => ({ unwrap: async () => ({}) })],
      useCreateDiditKycSessionMutation: () => [() => ({ unwrap: async () => {
        calls.push('create');
        if (options.sessionBlock) await options.sessionBlock;
        return { sessionId: 'owned-session', sessionToken: 'synthetic-token',
          url: 'https://verify.didit.me/session/synthetic-token', ...options.session };
      } }), { isLoading: false }],
      useSyncDiditKycSessionMutation: () => [args => ({ unwrap: async () => {
        calls.push(['sync', args.sessionId]); return { status: 'pending' };
      } }), { isLoading: false }],
    },
  });
  const useFlow = load('hooks/useDiditKycFlow.ts').useDiditKycFlow;
  const render = () => hooks.render(() => useFlow({ sourceScreen: 'profile' }));
  render();
  return { calls, dialogs, hooks, state, render, start: () => render().startDiditKyc({ skipLegalIdentityConfirmation: true }) };
}

for (const exit of ['unmount', 'blur', 'account', 'background']) test(`late KYC session never opens SDK after ${exit}`, async () => {
  let release; const sessionBlock = new Promise(resolve => { release = resolve; });
  const f = fixture({ sessionBlock }); const task = f.start();
  if (exit === 'unmount') f.hooks.unmount();
  if (exit === 'blur') { f.state.focused = false; f.render(); }
  if (exit === 'account') f.state.version++;
  if (exit === 'background') f.state.app = 'background';
  release(); assert.equal(await task, null);
  assert.deepEqual(f.calls, ['create']); assert.deepEqual(f.dialogs, []);
  f.hooks.unmount();
});
test('a native SDK camera background transition does not discard a valid result', async () => {
  let release; const block = new Promise(resolve => { release = resolve; });
  const f = fixture({ block }); const task = f.start();
  await new Promise(resolve => setImmediate(resolve));
  f.state.app = 'background'; release();
  assert.equal((await task).status, 'pending');
  assert.ok(f.calls.some(call => Array.isArray(call) && call[0] === 'sync'));
  f.hooks.unmount();
});

for (const platform of ['android', 'ios']) {
  test(`${platform}: launches Didit with the backend SDK token, never the browser`, async () => {
    const f = fixture({ platform });
    const outcome = await f.start();
    assert.equal(outcome.launchMode, 'native_sdk');
    assert.deepEqual(f.calls, ['create', ['sdk', 'synthetic-token', 'fr'], ['sync', 'owned-session']]);
  });
}
for (const token of [null, '', '  ']) {
  test(`mobile: missing SDK token (${JSON.stringify(token)}) does not silently launch hosted KYC`, async () => {
    const f = fixture({ session: { sessionToken: token } });
    assert.equal(await f.start(), null);
    assert.deepEqual(f.calls, ['create']);
    assert.match(f.dialogs.at(-1).message, /session pour la validation dans l’application/);
  });
}
test('missing native module explains the need for a complete binary, without a browser fallback', async () => {
  const f = fixture({ sdkError: new Error('Cannot find native module NativeSdkReactNative') });
  assert.equal(await f.start(), null);
  assert.equal(f.calls.includes('browser'), false);
  assert.match(f.dialogs.at(-1).message, /dernière version complète/);
});
test('SDK expiration does not create a second paid session or launch the browser', async () => {
  const f = fixture({ result: { type: 'failed', error: { type: 'sessionExpired', message: 'synthetic expiration' } } });
  assert.equal(await f.start(), null);
  assert.equal(f.calls.filter(x => x === 'create').length, 1);
  assert.equal(f.calls.includes('browser'), false);
  assert.match(f.dialogs.at(-1).message, /expiré/);
});
test('cancellation does not falsely submit or approve the verification', async () => {
  const f = fixture({ result: { type: 'cancelled' } });
  assert.equal(await f.start(), null);
  assert.equal(f.calls.some(x => Array.isArray(x) && x[0] === 'sync'), false);
});
test('a browser build retains the hosted flow', async () => {
  const f = fixture({ platform: 'web' });
  assert.equal((await f.start()).launchMode, 'web_browser');
  assert.deepEqual(f.calls, ['create', 'browser', ['sync', 'owned-session']]);
});
test('two rapid taps create only one session and release the gate on completion', async () => {
  let release;
  const block = new Promise(resolve => { release = resolve; });
  const f = fixture({ block });
  const first = f.start();
  assert.equal(await f.start(), null);
  release();
  await first;
  assert.equal(f.calls.filter(x => x === 'create').length, 1);
  await f.start();
  assert.equal(f.calls.filter(x => x === 'create').length, 2);
});
