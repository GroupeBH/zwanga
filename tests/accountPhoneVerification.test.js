const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const phone = '+243000000000';
const policy = loader()('features/auth/accountPhoneVerification.ts').accountPhoneGate;

test('only an explicit server phone verification for the current account unlocks the updated app', () => {
  const args = { enabled: true, authenticated: true, userId: 'a' };
  assert.equal(policy({ ...args, enabled: false }), 'off');
  assert.equal(policy({ ...args, authenticated: false }), 'off');
  assert.equal(policy(args), 'checking');
  assert.equal(policy({ ...args, profile: { id: 'b', phone, isPhoneVerified: true } }), 'checking');
  const { mapServerUser } = loader({ '@react-native-async-storage/async-storage': {} })('store/api/user/profileMapper.ts');
  const profile = mapServerUser({ id: 'a', phone, isEmailVerified: true, isPhoneVerified: false });
  assert.equal(profile.verified, true);
  assert.equal(policy({ ...args, profile }), 'required', 'verified email cannot bypass SMS');
  assert.equal(policy({ ...args, profile: { ...profile, isPhoneVerified: true } }), 'verified');
  assert.equal(policy({ ...args, profile: { ...profile, phone: '' } }), 'unavailable');
  for (const value of [undefined, 'true', 1]) {
    const unknown = mapServerUser({ id: 'a', phone, isPhoneVerified: value });
    assert.equal(policy({ ...args, profile: unknown }), 'unavailable');
  }
});

function otpFixture(t) {
  const hooks = hookHarness(), calls = [];
  const io = { version: 0, verifyResult: { valid: true }, refreshError: null, sendError: null, wait: null };
  const mutation = name => payload => {
    calls.push([name, payload]);
    return { unwrap: async () => {
      if (io.wait) await io.wait;
      if (name === 'send' && io.sendError) throw io.sendError;
      return name === 'verify' ? io.verifyResult : { codeLength: 5 };
    }, reset: () => calls.push(['reset']), abort: () => calls.push(['abort']) };
  };
  const send = mutation('send'), verify = mutation('verify');
  const { useAccountPhoneOtp } = loader({
    react: hooks.react,
    '@/store/api/userApi': { useSendPhoneVerificationOtpMutation: () => [send], useVerifyPhoneOtpMutation: () => [verify] },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    '@/features/auth/authModel': { getAuthErrorMessage: (cause, fallback) => cause.message || fallback },
  })('hooks/auth/useAccountPhoneOtp.ts');
  const refresh = async () => { calls.push(['refresh']); if (io.refreshError) throw io.refreshError; };
  const render = () => hooks.render(() => useAccountPhoneOtp(phone, refresh));
  t.after(() => hooks.unmount());
  return { render, hooks, io, calls };
}

test('existing account explicitly requests update OTP; no automatic SMS and no duplicate taps', async t => {
  const f = otpFixture(t);
  let flow = f.render(); assert.deepEqual(f.calls, []);
  const pending = deferred(); f.io.wait = pending.promise;
  const first = flow.send(); await flow.send();
  assert.equal(f.calls.filter(([name]) => name === 'send').length, 1);
  pending.resolve(); await first;
  flow = f.render(); assert.equal(flow.sent, true);
  assert.deepEqual(f.calls[0], ['send', { phone, context: 'update' }]);
  await flow.send(); assert.equal(f.calls.filter(([name]) => name === 'send').length, 1);
  assert.ok(flow.cooldown > 0);
});

test('invalid OTP cannot confirm the account and successful OTP must reread the profile', async t => {
  const f = otpFixture(t); await f.render().send();
  f.render().setCode(['1', '2', '3', '4', '5']);
  f.io.verifyResult = { valid: false };
  await f.render().verify();
  assert.equal(f.render().confirmed, false);
  assert.ok(f.render().error);
  assert.equal(f.calls.some(([name]) => name === 'refresh'), false);
  f.io.verifyResult = { valid: true, verificationToken: 'discard-this-fixture-proof' };
  await f.render().verify();
  assert.equal(f.render().confirmed, true);
  assert.deepEqual(f.render().code, ['', '', '', '', '']);
  assert.equal(f.calls.filter(([name]) => name === 'refresh').length, 1);
  assert.equal(JSON.stringify(f.render()).includes('discard-this-fixture-proof'), false);
});

test('profile refresh failure retries confirmation without consuming another OTP or sending SMS', async t => {
  const f = otpFixture(t); await f.render().send();
  f.render().setCode(['1', '2', '3', '4', '5']);
  f.io.refreshError = new Error('offline'); await f.render().verify();
  assert.equal(f.render().confirmed, true); assert.ok(f.render().error);
  f.io.refreshError = null; await f.render().retryConfirmation();
  await f.render().send(); await f.render().verify();
  assert.equal(f.calls.filter(([name]) => name === 'send').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'verify').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'refresh').length, 2);
});

test('send failure never claims delivery and has a cooldown instead of an automatic retry', async t => {
  const f = otpFixture(t); f.io.sendError = new Error('offline');
  await f.render().send();
  assert.equal(f.render().sent, false); assert.ok(f.render().error);
  await f.render().send(); assert.equal(f.calls.filter(([name]) => name === 'send').length, 1);
});

for (const change of ['logout', 'unmount']) {
  test(`late verification after ${change} cannot confirm or refresh another account`, async t => {
    const f = otpFixture(t); await f.render().send();
    f.render().setCode(['1', '2', '3', '4', '5']);
    const pending = deferred(); f.io.wait = pending.promise;
    const work = f.render().verify();
    if (change === 'logout') f.io.version++; else f.hooks.unmount();
    pending.resolve(); await work;
    assert.equal(f.calls.some(([name]) => name === 'refresh'), false);
    assert.ok(f.calls.some(([name]) => name === 'reset'));
  });
}
