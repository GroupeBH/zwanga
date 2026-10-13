const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(extra = {}) {
  const hooks = hookHarness(), calls = [], dialogs = [];
  const mutate = method => payload => ({ unwrap: async () => {
    calls.push({ method, payload });
    return { accessToken: 'test-access', refreshToken: 'test-refresh' };
  } });
  const props = { firstName: 'Test', lastName: 'Example', role: 'passenger', gender: null,
    phone: '+243000000000', pin: '1234', email: 'cached@example.invalid',
    googleIdToken: null, socialProvider: null, isGooglePhoneVerified: false, appleNonce: null,
    isAppleSignupFlow: false, legacyReferralCode: '', profilePicture: null,
    register: mutate('phone'), appleMobile: mutate('apple'), googleMobile: mutate('google'),
    dispatch: () => ({ unwrap: async () => true }), router: { replace: () => {} },
    restartSocialSignup: () => calls.push({ method: 'restart' }),
    showDialog: value => dialogs.push(value), setStep: () => {}, ...extra };
  const load = loader({ react: hooks.react, 'react-native': { Platform: { OS: 'ios' } },
    '../../features/auth/authModel': { ...loader()('features/auth/authModel.ts'), ensureAuthNotifeeLoaded() {} },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/slices/authSlice': { saveTokensAndUpdateState: value => value },
    '@/utils/referralAttribution': { getPendingReferralAttribution: async () => null, consumePendingReferralAttribution: async () => {} },
  });
  const { useRegistrationActions } = load('hooks/auth/useRegistrationActions.ts');
  return { props, calls, dialogs, hooks, submit: () => hooks.render(() => useRegistrationActions(props)).handleFinalRegister() };
}

test('a retained email is never sent by phone registration', async () => {
  const f = fixture(); await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'phone');
  assert.deepEqual([...f.calls[0].payload.keys()], ['phone', 'pin', 'firstName', 'lastName', 'role']);
  assert.deepEqual(f.dialogs, []); f.hooks.unmount();
});

const apple = { socialProvider: 'apple', googleIdToken: 'test-identity-token',
  appleNonce: 'test-nonce', isGooglePhoneVerified: true, isAppleSignupFlow: true };
test('Apple profile completion uses only the Apple endpoint and forwards nonce, not email or PIN', async () => {
  const f = fixture(apple); await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'apple');
  assert.equal(f.calls[0].payload.nonce, 'test-nonce');
  assert.equal(f.calls[0].payload.firstName, 'Test');
  assert.equal(f.calls[0].payload.email, undefined);
  assert.equal(f.calls[0].payload.pin, undefined);
  assert.deepEqual(f.dialogs, []); f.hooks.unmount();
});

for (const [label, partial] of [
  ['missing identity token', { googleIdToken: null }],
  ['missing provider', { socialProvider: null }],
  ['unfinished phone step', { isGooglePhoneVerified: false }],
  ['missing nonce', { appleNonce: null }],
]) test(`partial Apple signup (${label}) cannot fall back to a phone or Google account`, async () => {
  const f = fixture({ ...apple, ...partial }); await f.submit();
  assert.deepEqual(f.calls, [{ method: 'restart' }]);
  assert.equal(f.dialogs[0].title, 'Connexion à reprendre');
  Object.assign(f.props, apple);
  await f.submit();
  assert.equal(f.calls[1].method, 'apple', 'retry is available after recovery');
  f.hooks.unmount();
});

test('partial Google signup is not silently turned into a phone signup', async () => {
  const f = fixture({ socialProvider: 'google' }); await f.submit();
  assert.deepEqual(f.calls, [{ method: 'restart' }]); f.hooks.unmount();
});

test('an Apple profile can be completed after a missing name without revoking Apple access', async () => {
  const f = fixture({ ...apple, firstName: '', lastName: '' }); await f.submit();
  assert.deepEqual(f.calls, []);
  assert.match(f.dialogs[0].message, /formulaire/);
  assert.doesNotMatch(f.dialogs[0].message, /retir|autre méthode/);
  Object.assign(f.props, { firstName: 'Test', lastName: 'Example' });
  await f.submit(); assert.equal(f.calls[0].method, 'apple'); f.hooks.unmount();
});

test('obsolete email validation is presented in French, including message arrays', () => {
  const { getAuthErrorMessage } = loader()('features/auth/authModel.ts');
  for (const message of ['property email should not exist', ['property email should not exist']]) {
    const result = getAuthErrorMessage({ status: 400, data: { message } }, 'Erreur');
    assert.match(result, /informations ne sont pas acceptées/);
    assert.doesNotMatch(result, /property|should not exist/);
  }
  assert.equal(getAuthErrorMessage({ data: { message: 'PIN incorrect' } }, 'Erreur'), 'Le PIN saisi est incorrect.');
});

test('Apple API serialization drops legacy email and unknown properties before sending', () => {
  const { authApi } = loader({
    './baseApi': { baseApi: { injectEndpoints: ({ endpoints }) => endpoints({ mutation: value => value, query: value => value }) } },
    '../../services/tokenStorage': {}, '../../services/tokenRefresh': {}, '../../services/tokenSession': {},
    '../../store/slices/authSlice': {}, './userApi': {},
  })('store/api/authApi.ts');
  const request = authApi.appleMobile.query({ idToken: 'test-token', nonce: 'test-nonce',
    phone: '+243000000000', email: 'untrusted@example.invalid', isEmailVerified: true });
  assert.equal(request.url, '/auth/apple/mobile');
  assert.deepEqual(request.body, { idToken: 'test-token', nonce: 'test-nonce', phone: '+243000000000' });
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
test('the real auth screen exposes name fields and identity correction for Apple too', () => {
  const names = ['AuthHeader', 'GooglePhoneStep', 'KycStep', 'PhoneStep', 'PinStep', 'ProfileStep', 'ResetPinStep', 'VehicleModal'];
  const steps = [], form = { mode: 'signup', step: 'profile', role: 'driver', isAppleSignupFlow: true,
    googleSignupStep: 'profile', firstName: '', lastName: '', setStep: value => steps.push(value) };
  const Screen = loader({ 'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'View' }, 'expo-router': { Redirect: 'Redirect' },
    '@/components/auth': { ...Object.fromEntries(names.map(name => [name, name])), authStyles: {} },
    '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: () => ({ keyboardVisible: false }) },
    '../hooks/auth/useAuthController': { useAuthController: () => ({ form, draftPersistence: {}, navigation: {},
      social: {}, phoneActions: {}, profileActions: {}, registration: {}, isGoogleSignupActive: true }) },
  })('app/auth.tsx').default;
  const profile = nodes(Screen()).find(node => node.type === 'ProfileStep');
  assert.ok(profile); assert.notEqual(profile.props.showNameFields, false);
  form.step = 'kyc';
  nodes(Screen()).find(node => node.type === 'KycStep').props.onEditIdentity();
  assert.deepEqual(steps, ['profile']);
});

test('retrying Apple without a returned name preserves the completed profile', async () => {
  const hooks = hookHarness(), state = { first: 'Test', last: 'Example' };
  const props = new Proxy({
    setFirstName: value => { state.first = value; }, setLastName: value => { state.last = value; },
    showDialog: () => assert.fail('unexpected error'),
  }, { get: (target, key) => key in target ? target[key] : String(key).startsWith('set') ? () => {} : undefined });
  const { useSocialAuthActions } = loader({ react: hooks.react,
    './useSocialPhoneVerification': { useSocialPhoneVerification: () => ({}) },
    './useGoogleAuthActions': { useGoogleAuthActions: () => ({}) },
    '@/services/appleAuth': { signInWithApple: async () => ({ identityToken: 'test-token', nonce: 'test-nonce', firstName: null, lastName: null, email: null }) },
    '@/services/analytics': { trackEvent: async () => {} },
  })('hooks/auth/useSocialAuthActions.ts');
  await hooks.render(() => useSocialAuthActions(props)).handleAppleSignupStart();
  assert.deepEqual(state, { first: 'Test', last: 'Example' }); hooks.unmount();
});
