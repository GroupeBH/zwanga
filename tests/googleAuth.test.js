const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const success = () => ({ type: 'success', data: { idToken: 'test-token', user: { email: 'example@example.invalid', name: 'Test' } } });

function fixture(overrides = {}) {
  const calls = [];
  const sdk = {
    configure: () => calls.push('configure'),
    hasPlayServices: async () => { calls.push('services'); return true; },
    signIn: async () => { calls.push('native'); return success(); },
    signOut: async () => calls.push('signOut'),
    ...overrides,
  };
  const load = loader({
    'expo-constants': { expoConfig: { extra: {} } },
    '@react-native-google-signin/google-signin': { GoogleSignin: sdk,
      isSuccessResponse: value => value.type === 'success',
      statusCodes: { IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS', SIGN_IN_CANCELLED: '12501', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' } },
  });
  return { calls, sdk, service: load('services/googleAuth.ts'), errors: load('features/auth/googleAuthErrors.ts') };
}

test('first Google press configures lazily; remount/repeated setup configures only once', async () => {
  const app = fixture();
  assert.deepEqual(app.calls, []);
  assert.equal((await app.service.signInWithGoogle()).idToken, 'test-token');
  app.service.configureGoogleSignIn();
  await app.service.signInWithGoogle();
  assert.deepEqual(app.calls, ['configure', 'services', 'native', 'services', 'native']);
});

test('concurrent calls share one native operation even while Play services or the account picker is slow', async () => {
  const services = deferred(), native = deferred();
  let checks = 0, starts = 0;
  const app = fixture({ hasPlayServices: () => { checks++; return services.promise; }, signIn: () => { starts++; return native.promise; } });
  const first = app.service.signInWithGoogle();
  assert.equal(app.service.signInWithGoogle(), first);
  assert.equal(checks, 1);
  assert.equal(starts, 0);
  services.resolve(true);
  await tick();
  assert.equal(starts, 1);
  assert.equal(app.service.signInWithGoogle(), first);
  native.resolve(success());
  assert.equal((await first).idToken, 'test-token');
  await app.service.signInWithGoogle();
  assert.equal(starts, 2, 'a completed attempt releases the lock');
});

for (const code of ['ASYNC_OP_IN_PROGRESS', 'IN_PROGRESS', 'SIGN_IN_CURRENTLY_IN_PROGRESS', '12502', 12502]) {
  test(`Google native busy code ${code} becomes French without retry or sign-out`, async () => {
    let starts = 0;
    const app = fixture({ signIn: async () => { starts++; throw { code, message: 'Sign-in in progress' }; } });
    await assert.rejects(app.service.signInWithGoogle(), error => {
      assert.equal(error.kind, 'in_progress');
      assert.match(error.message, /Google est encore occupé/);
      assert.doesNotMatch(error.message, /in progress|12502|ASYNC_OP|Sign-In/);
      return true;
    });
    assert.equal(starts, 1);
    assert.ok(!app.calls.includes('signOut'));
    app.sdk.signIn = async () => success();
    assert.equal((await app.service.signInWithGoogle()).idToken, 'test-token');
  });
}

test('plain/native-wrapped errors without a known code never leak English or technical content', () => {
  const { normalizeGoogleAuthError } = fixture().errors;
  for (const error of [new Error('Sign-in in progress'), { code: 'unknown', message: 'SIGN_IN_CURRENTLY_IN_PROGRESS' }, 'operation in progress']) {
    assert.equal(normalizeGoogleAuthError(error).kind, 'in_progress');
  }
  for (const error of [new Error('Something horrible happened to private-token'), { code: 'unknown', message: 'Java exception at google.internal' }, null]) {
    const result = normalizeGoogleAuthError(error);
    assert.equal(result.kind, 'unavailable');
    assert.match(result.message, /connexion Google/);
    assert.doesNotMatch(result.message, /private-token|Java|exception|horrible/);
  }
  assert.equal(normalizeGoogleAuthError({ code: '7' }).kind, 'network');
  assert.equal(normalizeGoogleAuthError({ code: '10' }).kind, 'configuration');
});

test('cancelled results and native Android/iOS cancellation codes retain a silent-cancellation category', async () => {
  const app = fixture({ signIn: async () => ({ type: 'cancelled' }) });
  await assert.rejects(app.service.signInWithGoogle(), error => error.kind === 'cancelled');
  for (const code of ['12501', '-5', 'SIGN_IN_CANCELLED']) {
    app.sdk.signIn = async () => { throw { code, message: 'The user cancelled' }; };
    await assert.rejects(app.service.signInWithGoogle(), error => error.kind === 'cancelled');
  }
});

test('unavailable Play services stop before signIn, and missing tokens never produce an authenticated result', async () => {
  const app = fixture({ hasPlayServices: async () => false });
  await assert.rejects(app.service.signInWithGoogle(), error => error.kind === 'services_unavailable');
  assert.ok(!app.calls.includes('native'));
  app.sdk.hasPlayServices = async () => true;
  app.sdk.signIn = async () => ({ ...success(), data: { ...success().data, idToken: null } });
  await assert.rejects(app.service.signInWithGoogle(), error => error.kind === 'missing_token');
});

test('synchronous configuration failure releases the attempt without displaying native debug text', async () => {
  const app = fixture({ configure: () => { throw new Error('Native configuration exploded'); } });
  await assert.rejects(app.service.signInWithGoogle(), error => error.kind === 'unavailable' && !error.message.includes('exploded'));
  app.sdk.configure = () => {};
  assert.equal((await app.service.signInWithGoogle()).idToken, 'test-token');
});
