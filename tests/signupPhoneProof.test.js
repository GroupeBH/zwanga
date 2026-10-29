const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { createSignupPhoneProof, SignupPhoneProofError } = loader()('features/auth/signupPhoneProof.ts');
const phone = '+243900000000', token = 'x'.repeat(43);
const result = { valid: true, verificationToken: token, expiresInSeconds: 850 };
const noop = () => {};
function verified() {
  const proof = createSignupPhoneProof(), ticket = proof.begin();
  assert.equal(proof.capture(phone, result, ticket), true);
  proof.finish(ticket);
  return proof;
}

test('phone proof is bound to the verified phone, consumed once, and never serializable', () => {
  const proof = verified();
  assert.equal(JSON.stringify(proof), '{}');
  assert.equal(proof.take(phone), token);
  assert.throws(() => proof.take(phone), SignupPhoneProofError);
  assert.throws(() => verified().take('+243900000001'), SignupPhoneProofError);
});

test('phone proof expires without extending the server deadline by request latency', t => {
  const original = Date.now; let now = 10000;
  Date.now = () => now; t.after(() => { Date.now = original; });
  const proof = createSignupPhoneProof(), ticket = proof.begin();
  now += 3000;
  proof.capture(phone, { ...result, expiresInSeconds: 10 }, ticket); proof.finish(ticket);
  now = 20000;
  assert.throws(() => proof.take(phone), SignupPhoneProofError);
});

test('resend, identity change and cancellation discard proof and ignore late verification', () => {
  for (const invalidate of [p => p.clear(), p => p.setScope('other-phone'), p => { p.clear(); p.begin(); }]) {
    const proof = createSignupPhoneProof(), ticket = proof.begin();
    assert.equal(proof.begin(), null, 'double submit is suppressed');
    invalidate(proof);
    assert.equal(proof.capture(phone, result, ticket), false);
    proof.finish(ticket);
    assert.throws(() => proof.take(phone), SignupPhoneProofError);
  }
  const proof = verified(); proof.begin();
  assert.throws(() => proof.take(phone), SignupPhoneProofError);
});

test('invalid server result or malformed proof never advances verification', () => {
  for (const value of [null, {}, { valid: false }, { ...result, verificationToken: '12345' },
    { ...result, expiresInSeconds: 0 }, { ...result, expiresInSeconds: Infinity }]) {
    const proof = createSignupPhoneProof(), ticket = proof.begin();
    assert.throws(() => proof.capture(phone, value, ticket));
    proof.finish(ticket);
    assert.throws(() => proof.take(phone), SignupPhoneProofError);
  }
});

test('legacy Keccel validation remains usable without fabricating a new backend proof', () => {
  const proof = createSignupPhoneProof(), ticket = proof.begin();
  assert.equal(proof.capture(phone, { valid: true }, ticket), true);
  proof.finish(ticket);
  assert.equal(proof.take(phone), undefined);
});

test('hook discards late responses on number change or unmount; profile renders keep proof', () => {
  const hooks = hookHarness();
  const { useSignupPhoneProof } = loader({ react: hooks.react })('hooks/auth/useSignupPhoneProof.ts');
  let proof = hooks.render(() => useSignupPhoneProof('phone1'));
  let ticket = proof.begin();
  proof = hooks.render(() => useSignupPhoneProof('phone2'));
  assert.equal(proof.capture(phone, result, ticket), false);
  ticket = proof.begin(); proof.capture(phone, result, ticket); proof.finish(ticket);
  proof = hooks.render(() => useSignupPhoneProof('phone2'));
  assert.equal(proof.take(phone), token);
  ticket = proof.begin(); hooks.unmount();
  assert.equal(proof.capture(phone, result, ticket), false);
});

function actionFixture(social) {
  const hooks = hookHarness(), proof = createSignupPhoneProof(), calls = [], dialogs = [];
  const io = { response: result, reset: 0, wait: null };
  const load = loader({
    react: hooks.react, '@/config/env': { isSignupOtpVerificationEnabled: true },
    './usePinResetFlow': { usePinResetFlow: () => ({}) },
    './usePinLogin': { usePinLogin: () => ({ isInFlight: () => false }) },
    '../../features/auth/authModel': { getAuthErrorMessage: error => error.message || 'Erreur' },
  });
  const props = new Proxy({ phone, googlePhone: phone, mode: 'signup', googleIdToken: 'social-token',
    smsCode: ['1','2','3','4','5'], googleOtp: ['1','2','3','4','5'], signupPhoneProof: proof,
    showDialog: dialog => dialogs.push(dialog),
    verifyPhoneOtp: payload => ({ unwrap: async () => { calls.push(['verify', payload]); if (io.wait) await io.wait; return io.response; }, reset: () => io.reset++ }),
    sendPhoneVerificationOtp: payload => ({ unwrap: async () => { calls.push(['send', payload]); if (io.wait) await io.wait; }, reset: () => io.reset++ }),
  }, { get(target, key) { if (key in target) return target[key]; if (String(key).startsWith('set')) return value => calls.push([key, value]); } });
  const render = () => hooks.render(() => social
    ? load('hooks/auth/useSocialPhoneVerification.ts').useSocialPhoneVerification(props)
    : load('hooks/auth/usePhoneAuthActions.ts').usePhoneAuthActions(props));
  const submit = () => social ? render().handleVerifyGoogleOtpAndContinue() : render().handleSmsSubmit();
  return { render, submit, proof, calls, dialogs, io, hooks };
}
for (const social of [false, true]) {
  test((social ? 'social' : 'phone') + ' captures proof, clears OTP digits and removes the RTK mutation result', async () => {
    const app = actionFixture(social);
    await app.submit();
    assert.equal(app.proof.take(phone), token); assert.equal(app.io.reset, 1);
    assert.ok(app.calls.some(([name, value]) => name === 'setStep' && value === (social ? 'profile' : 'pin')));
    assert.ok(app.calls.some(([name, value]) => name === (social ? 'setGoogleOtp' : 'setSmsCode') && value.every(x => x === '')));
    app.hooks.unmount();
  });
  test((social ? 'social' : 'phone') + ' prevents duplicate verification and ignores late cancelled responses', async () => {
    const app = actionFixture(social); let release;
    app.io.wait = new Promise(resolve => { release = resolve; });
    const first = app.submit(); await app.submit();
    assert.equal(app.calls.filter(([name]) => name === 'verify').length, 1);
    app.proof.clear(); release(); await first;
    assert.equal(app.calls.filter(([name]) => name === 'setStep').length, 0);
    assert.equal(app.dialogs.length, 0); assert.equal(app.io.reset, 1);
    app.hooks.unmount();
  });
  test((social ? 'social' : 'phone') + ' does not treat HTTP success with valid=false as verification', async () => {
    const app = actionFixture(social); app.io.response = { valid: false };
    await app.submit();
    assert.equal(app.calls.filter(([name]) => name === 'setStep').length, 0);
    assert.equal(app.dialogs.at(-1).variant, 'danger');
    assert.throws(() => app.proof.take(phone), SignupPhoneProofError);
    app.hooks.unmount();
  });
}

function registrationFixture(method, proof = verified()) {
  const hooks = hookHarness(), requests = [], dialogs = [], steps = [];
  const submit = body => ({ unwrap: async () => { requests.push(body); throw { data: { code: 'PHONE_VERIFICATION_INVALID' } }; } });
  const { useRegistrationActions } = loader({
    react: hooks.react, 'react-native': { Platform: { OS: 'android' } },
    '@/config/env': { isSignupOtpVerificationEnabled: true },
    '../../features/auth/authModel': { getAuthErrorMessage: (_error, fallback) => fallback, ensureAuthNotifeeLoaded: noop },
    '@/services/analytics': { trackEvent: async () => {} }, '@/store/slices/authSlice': { saveTokensAndUpdateState: noop },
    '@/utils/referralAttribution': { getPendingReferralAttribution: async () => null },
  })('hooks/auth/useRegistrationActions.ts');
  const props = { firstName: 'Test', lastName: 'Example', phone, pin: '1234', role: 'passenger', profilePicture: null,
    googleIdToken: method === 'phone' ? null : 'id-token', isGooglePhoneVerified: method !== 'phone', socialProvider: method,
    signupPhoneProof: proof, restartPhoneVerification: () => steps.push('phone'),
    showDialog: dialog => dialogs.push(dialog), register: submit, googleMobile: submit, appleMobile: submit };
  return { hooks, requests, dialogs, steps, submit: () => hooks.render(() => useRegistrationActions(props)).handleFinalRegister() };
}

for (const method of ['phone', 'google', 'apple']) {
  test(method + ' forwards phoneVerificationToken and handles a rejected proof by returning to phone entry', async () => {
    const app = registrationFixture(method);
    await app.submit();
    assert.equal(app.requests.length, 1);
    assert.equal(method === 'phone' ? app.requests[0].get('phoneVerificationToken') : app.requests[0].phoneVerificationToken, token);
    assert.deepEqual(app.steps, ['phone']);
    assert.match(app.dialogs.at(-1).message, /profil est conservé/);
    app.hooks.unmount();
  });
  test(method + ' blocks resumed signup without its in-memory proof before calling registration', async () => {
    const app = registrationFixture(method, createSignupPhoneProof());
    await app.submit();
    assert.equal(app.requests.length, 0); assert.deepEqual(app.steps, ['phone']);
    app.hooks.unmount();
  });
}

test('API Apple whitelist forwards the proof but not client-supplied verification flags', () => {
  const { authApi } = loader({
    './baseApi': { baseApi: { injectEndpoints: ({ endpoints }) => ({ endpoints: endpoints({ mutation: def => def }) }) } },
    './userApi': { userApi: {} }, '../../services/tokenStorage': {}, '../../services/tokenRefresh': {},
    '../../services/tokenSession': {}, '../../store/slices/authSlice': {},
  })('store/api/authApi.ts');
  const body = authApi.endpoints.appleMobile.query({ idToken: 'test', phone, phoneVerificationToken: token, isPhoneVerified: true }).body;
  assert.equal(body.phoneVerificationToken, token);
  assert.equal(body.isPhoneVerified, undefined);
});

test('saved auth drafts exclude phone proof and OTP results', () => {
  const { selectAuthDraftState } = loader({ 'expo-secure-store': {}, '@/utils/jwt': {} })('services/authFlowDraft.ts');
  const draft = selectAuthDraftState({ phone, phoneVerificationToken: token, verificationToken: token, signupPhoneProof: verified(), smsCode: ['1','2','3','4','5'] });
  assert.equal(JSON.stringify(draft).includes(token), false);
  for (const field of ['phoneVerificationToken', 'verificationToken', 'signupPhoneProof', 'smsCode']) assert.equal(field in draft, false);
});
