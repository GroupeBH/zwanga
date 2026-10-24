const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(options = {}) {
  const calls = [], dialogs = [];
  const hooks = hookHarness();
  const disk = options.disk ?? new Map();
  const state = { focused: true, app: 'active', version: 0 };
  const load = loader({
    react: hooks.react,
    'expo-secure-store': { getItemAsync: async key => disk.get(key) ?? null,
      setItemAsync: async (key, value) => { disk.set(key, value); }, deleteItemAsync: async key => { disk.delete(key); } },
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
      useLazyGetCurrentUserQuery: () => [() => ({ unwrap: async () => ({ id: 'synthetic-user' }) })],
      useCreateDiditKycSessionMutation: () => [() => ({ unwrap: async () => {
        calls.push('create');
        if (options.sessionBlock) await options.sessionBlock;
        return { sessionId: 'owned-session', sessionToken: 'synthetic-token',
          url: 'https://verify.didit.me/session/synthetic-token', ...options.session };
      } }), { isLoading: false }],
      useSyncDiditKycSessionMutation: () => [args => ({ unwrap: async () => {
        if (!args.sessionId) return options.preflight ? await options.preflight() : null;
        calls.push(['sync', args.sessionId]);
        if (options.syncError) throw options.syncError;
        return Object.hasOwn(options, 'syncResult') ? options.syncResult : { status: 'pending' };
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
  await new Promise(resolve => setImmediate(resolve));
  if (exit === 'unmount') f.hooks.unmount();
  if (exit === 'blur') { f.state.focused = false; f.render(); }
  if (exit === 'account') f.state.version++;
  if (exit === 'background') f.state.app = 'background';
  release(); assert.equal(await task, null);
  assert.deepEqual(f.calls, ['create']); assert.deepEqual(f.dialogs, []);
  f.hooks.unmount();
});

test('retry after failed sync resumes server state instead of creating a second session', async () => {
  let checks = 0;
  const f = fixture({ syncError: { status: 503 },
    preflight: () => ++checks === 1 ? null : { status: 'pending', diditSessionId: 'owned-session' } });
  assert.equal(await f.start(), null);
  assert.equal((await f.start()).status, 'pending');
  assert.equal(f.calls.filter(call => call === 'create').length, 1);
  f.hooks.unmount();
});

test('preflight outage never creates a session', async () => {
  const f = fixture({ preflight: () => { throw { status: 503 }; } });
  assert.equal(await f.start(), null); assert.deepEqual(f.calls, []);
  f.hooks.unmount();
});

test('unfinished SDK session resumes after remount without creating another session', async () => {
  const disk = new Map();
  const first = fixture({ disk, result: { type: 'cancelled' } });
  await first.start(); first.hooks.unmount();
  const next = fixture({ disk, preflight: () => ({ status: 'pending', provider: 'didit',
    diditSessionStatus: 'In Progress', diditSessionId: 'owned-session' }) });
  await next.start();
  assert(!next.calls.includes('create'));
  assert(next.calls.some(call => Array.isArray(call) && call[0] === 'sdk'));
  next.hooks.unmount();
});

for (const providerStatus of ['In Progress', 'Not Started']) test(`submitted SDK session resumes after restart with delayed ${providerStatus} decision`, async () => {
  const disk = new Map();
  const first = fixture({ disk, syncError: { status: 503 } });
  await first.start(); first.hooks.unmount();
  assert(!JSON.stringify([...disk.values()]).includes('synthetic-token'));
  const next = fixture({ disk, preflight: () => ({ status: 'pending', provider: 'didit',
    diditSessionStatus: providerStatus, diditSessionId: 'owned-session' }) });
  assert.equal((await next.start()).status, 'pending');
  assert.deepEqual(next.calls, []);
  next.hooks.unmount();
});

test('SDK approval with a null server decision never displays approval', async () => {
  const f = fixture({ syncResult: null, result: { type: 'completed',
    session: { sessionId: 'owned-session', status: 'Approved' } } });
  assert.equal((await f.start()).status, 'pending');
  assert(!f.dialogs.some(dialog => dialog.title === 'Identité vérifiée !'));
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

for (const platform of ['android', 'ios']) test(`${platform}: explicit hosted mode opens the same owned session without a second creation`, async () => {
  const f = fixture({ platform, session: { launchMode: 'hosted', sessionToken: null } });
  assert.equal((await f.start()).launchMode, 'web_browser');
  assert.deepEqual(f.calls, ['create', 'browser', ['sync', 'owned-session']]);
  f.hooks.unmount();
});

for (const url of ['https://evil.invalid/session/test', 'http://verify.didit.me/session/test',
  'https://user:pass@verify.didit.me/session/test', 'https://verify.didit.me:444/session/test']) {
  test(`hosted launch rejects an untrusted URL ${url}`, async () => {
    const f = fixture({ session: { launchMode: 'hosted', sessionToken: null, url } });
    assert.equal(await f.start(), null);
    assert.deepEqual(f.calls, ['create']); f.hooks.unmount();
  });
}
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
