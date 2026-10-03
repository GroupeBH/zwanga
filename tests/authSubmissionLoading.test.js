const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tokens = { accessToken: 'test-access', refreshToken: 'test-refresh' };

function signupFixture(method = 'phone', extra = {}) {
  const hooks = hookHarness(), dialogs = [], calls = [];
  const request = deferred(), storage = deferred(), kyc = deferred(), notification = deferred();
  const io = { readReferral: async () => null, consumeReferral: async () => {}, analytics: async () => {},
    storage: () => storage.promise, notification: () => notification.promise };
  const mutation = provider => () => ({ unwrap: () => { calls.push(provider); return request.promise; } });
  const props = { firstName: 'Test', lastName: 'Example', role: 'passenger', gender: null,
    vehicleType: 'car', vehicleBrand: 'Test', vehicleModel: 'Test', vehicleColor: 'Bleu', vehiclePlate: '0000AA00',
    phone: '+243000000000', pin: '1234', email: '', legacyReferralCode: '', profilePicture: null,
    googleIdToken: method === 'phone' ? null : 'test-id-token', isGooglePhoneVerified: method !== 'phone', socialProvider: method,
    register: mutation('phone'), googleMobile: mutation('google'), appleMobile: mutation('apple'),
    dispatch: () => ({ unwrap: () => { calls.push('storage'); return io.storage(); } }),
    startDiditKyc: () => { calls.push('kyc'); return kyc.promise; },
    showDialog: dialog => dialogs.push(dialog), setStep: () => calls.push('step'),
    router: { replace: () => calls.push('redirect') }, ...extra };
  const { useRegistrationActions } = loader({ react: hooks.react, 'react-native': { Platform: { OS: 'ios' } },
    '../../features/auth/authModel': { ensureAuthNotifeeLoaded() {},
      notifeeInstance: { requestPermission: async () => {}, displayNotification: () => io.notification() },
      getAuthErrorMessage: (_error, fallback) => fallback },
    '@/services/analytics': { trackEvent: () => io.analytics() },
    '@/store/slices/authSlice': { saveTokensAndUpdateState: value => value },
    '@/utils/referralAttribution': { getPendingReferralAttribution: () => io.readReferral(), consumePendingReferralAttribution: () => io.consumeReferral() },
  })('hooks/auth/useRegistrationActions.ts');
  return { hooks, props, calls, dialogs, io, request, storage, kyc, notification,
    render: () => hooks.render(() => useRegistrationActions(props)) };
}

for (const method of ['phone', 'google', 'apple']) {
  test(`${method} signup stays busy through preparation, network, session, notification and pending navigation`, async () => {
    const app = signupFixture(method), referral = deferred();
    app.io.readReferral = () => referral.promise;
    const handler = app.render().handleFinalRegister;
    const task = handler();
    await handler();
    assert.equal(app.render().isRegistrationPending, true);
    assert.equal(app.render().isRegistrationLocked(), true);
    assert.deepEqual(app.calls, []);
    referral.resolve(null); await tick();
    assert.deepEqual(app.calls, [method]);
    await app.render().handleFinalRegister();
    app.request.resolve(tokens); await tick();
    assert.equal(app.render().hasCreatedAccount, true);
    assert.equal(app.render().isRegistrationPending, true);
    assert.deepEqual(app.calls, [method, 'storage']);
    app.storage.resolve(true); await tick();
    assert.equal(app.render().isRegistrationPending, true);
    app.notification.resolve(); await task;
    assert.deepEqual(app.calls, [method, 'storage', 'redirect']);
    assert.equal(app.render().isRegistrationPending, true, 'router.replace is not the end of the visible transition');
    await handler(); await app.render().handleFinalRegister();
    assert.equal(app.calls.filter(call => call === method).length, 1);
    assert.deepEqual(app.dialogs, []);
    app.hooks.unmount();
  });

  test(`${method} signup retries local finalization without creating an accepted account twice`, async () => {
    const app = signupFixture(method);
    app.request.resolve(tokens); app.storage.resolve(false); app.notification.resolve();
    await app.render().handleFinalRegister();
    assert.equal(app.render().isRegistrationPending, false);
    assert.equal(app.render().hasCreatedAccount, true);
    assert.equal(app.render().isRegistrationLocked(), true, 'the accepted identity cannot be edited');
    assert.equal(app.dialogs[0].title, 'Connexion à finaliser');
    assert.equal(app.calls.includes('redirect'), false);
    app.io.storage = async () => true;
    await app.render().handleFinalRegister();
    assert.deepEqual(app.calls, [method, 'storage', 'storage', 'redirect']);
    assert.equal(app.render().isRegistrationPending, true);
    app.hooks.unmount();
  });
}

test('validation and backend rejection release signup for correction/retry', async () => {
  const app = signupFixture('phone', { firstName: '' });
  await app.render().handleFinalRegister();
  assert.equal(app.render().isRegistrationPending, false);
  assert.equal(app.render().isRegistrationLocked(), false);
  app.props.firstName = 'Test';
  app.request.reject(new Error('network unavailable'));
  await app.render().handleFinalRegister();
  assert.equal(app.render().isRegistrationPending, false);
  assert.equal(app.render().hasCreatedAccount, false);
  assert.equal(app.render().isRegistrationLocked(), false);
  app.props.register = () => ({ unwrap: async () => { app.calls.push('phone'); return tokens; } });
  app.storage.resolve(true); app.notification.resolve();
  await app.render().handleFinalRegister();
  assert.equal(app.calls.filter(call => call === 'phone').length, 2);
  assert.equal(app.render().isRegistrationPending, true);
  app.hooks.unmount();
});

test('driver signup stays busy throughout Didit; a KYC failure cannot replay account creation', async () => {
  const app = signupFixture('google', { role: 'driver' });
  app.request.resolve(tokens); app.storage.resolve(true); app.notification.resolve();
  const task = app.render().handleFinalRegister(); await tick();
  assert.deepEqual(app.calls, ['google', 'storage', 'kyc']);
  assert.equal(app.render().isRegistrationPending, true);
  await app.render().handleFinalRegister();
  app.kyc.reject(new Error('SDK unavailable')); await task;
  assert.equal(app.dialogs[0].title, 'Compte créé');
  assert.equal(app.calls.at(-1), 'redirect');
  assert.equal(app.render().isRegistrationPending, true);
  app.hooks.unmount();
});

test('referral consumption, notification and analytics failures do not undo successful signup', async () => {
  const app = signupFixture();
  const fail = async () => { throw new Error('optional service unavailable'); };
  app.io.consumeReferral = fail; app.io.notification = fail; app.io.analytics = fail;
  app.request.resolve(tokens); app.storage.resolve(true);
  await app.render().handleFinalRegister(); await tick();
  assert.deepEqual(app.dialogs, []);
  assert.equal(app.calls.at(-1), 'redirect');
  assert.equal(app.render().isRegistrationPending, true);
  app.hooks.unmount();
});

for (const method of ['google', 'apple']) {
  for (const sessionFails of [false, true]) {
    test(`${method} login stays busy through local session; ${sessionFails ? 'failure allows retry' : 'success stays locked until unmount'}`, async () => {
      const hooks = hookHarness(), session = deferred(), calls = [], dialogs = [], appleLoading = [];
      const props = new Proxy({ phone: '',
        googleMobile: () => ({ unwrap: async () => tokens }), appleMobile: () => ({ unwrap: async () => tokens }),
        confirmSession: () => { calls.push('session'); return session.promise; },
        setIsAppleLoading: value => appleLoading.push(value), showDialog: dialog => dialogs.push(dialog) },
      { get: (target, key) => key in target ? target[key] : String(key).startsWith('set') ? () => {} : undefined });
      const { useSocialAuthActions } = loader({ react: hooks.react,
        './useSocialPhoneVerification': { useSocialPhoneVerification: () => ({}) },
        '@/services/googleAuth': { signInWithGoogle: async () => { calls.push('native'); return { idToken: 'test-id' }; } },
        '@/services/appleAuth': { signInWithApple: async () => { calls.push('native'); return { identityToken: 'test-id' }; } },
        '@/services/analytics': { trackEvent: async () => { throw new Error('analytics unavailable'); } },
      })('hooks/auth/useSocialAuthActions.ts');
      const render = () => hooks.render(() => useSocialAuthActions(props));
      const submit = () => method === 'google' ? render().handleGoogleLogin() : render().handleAppleLogin();
      const task = submit(); await tick();
      await submit();
      assert.deepEqual(calls, ['native', 'session']);
      assert.equal(render().isSocialAuthInFlight(), true);
      if (sessionFails) session.reject(new Error('local persistence unavailable')); else session.resolve();
      await task;
      assert.equal(render().isSocialAuthInFlight(), !sessionFails);
      assert.equal(method === 'google' ? render().isGoogleLoading : appleLoading.at(-1), !sessionFails);
      assert.equal(dialogs.length, sessionFails ? 1 : 0);
      if (sessionFails) props.confirmSession = async () => {};
      await submit();
      assert.equal(calls.filter(call => call === 'native').length, sessionFails ? 2 : 1);
      hooks.unmount();
    });
  }
}

const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Image: 'Image', Platform: { OS: 'android' }, StyleSheet: { create: value => value } };
const uiMocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/components/GenderSelector': { GenderSelector: 'Gender' }, '@/config/env': {},
  '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: { springify: () => ({}) }, FadeOutUp: {} } };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';

test('profile and KYC buttons display busy state; accepted signup locks identity but permits finalization after an error', () => {
  const load = loader(uiMocks);
  const { ProfileStep } = load('components/auth/steps/ProfileStep.tsx');
  const { KycStep } = load('components/auth/steps/KycStep.tsx');
  for (const Component of [ProfileStep, KycStep]) {
    const props = { role: 'driver', isLoading: true, onEditIdentity() {} };
    const tree = Component(props);
    assert.ok(nodes(tree).filter(node => node.type === 'Button').every(node => node.props.disabled));
    assert.ok(nodes(tree).some(node => node.type === 'Spinner'));
    assert.match(text(tree), /Finalisation en cours/);
    assert.equal(nodes(tree).filter(node => node.type === 'Button').at(-1).props.accessibilityState.busy, true);
    const retry = Component({ ...props, isLoading: false, hasCreatedAccount: true });
    const buttons = nodes(retry).filter(node => node.type === 'Button');
    assert.ok(buttons.slice(0, -1).every(node => node.props.disabled));
    assert.equal(buttons.at(-1).props.disabled, false);
    assert.match(text(retry), /Finaliser la connexion/);
    assert.ok(nodes(retry).filter(node => node.type === 'Input').every(node => node.props.editable === false));
  }
});

test('screen uses finalization state for profile/KYC and locks header even after mutation loading ends', () => {
  const componentNames = ['AuthHeader', 'GoogleOtpStep', 'GooglePhoneStep', 'KycStep', 'PhoneStep', 'PinStep', 'ProfileStep', 'ResetPinStep', 'SmsStep', 'VehicleModal'];
  for (const step of ['profile', 'kyc']) {
    const calls = [], registration = { isRegistrationPending: true, hasCreatedAccount: true, isRegistrationLocked: () => true };
    const Screen = loader({ ...uiMocks, 'react-native-safe-area-context': { SafeAreaView: 'View' },
      'expo-router': { Redirect: 'Redirect' },
      '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: () => ({ keyboardVisible: false, scrollRef: { current: null } }) },
      '@/components/auth': { ...Object.fromEntries(componentNames.map(name => [name, name])), authStyles: {} },
      '../hooks/auth/useAuthController': { useAuthController: () => ({
        form: { mode: 'signup', step, role: 'driver', firstName: 'Test', lastName: 'Example', isRegistering: false, isStartingDiditKyc: false },
        navigation: { handleModeChange: () => calls.push('mode'), handlePreviousStep: () => calls.push('back') },
        social: { isGoogleLoading: false, isSocialAuthInFlight: () => false },
        phoneActions: { isPinLoginPending: false, isPinLoginInFlight: () => false }, profileActions: {}, registration,
      }) },
    })('app/auth.tsx').default;
    const tree = nodes(Screen()), header = tree.find(node => node.type === 'AuthHeader');
    assert.equal(header.props.disabled, true);
    assert.equal(tree.find(node => node.type === (step === 'profile' ? 'ProfileStep' : 'KycStep')).props.isLoading, true);
    header.props.onBack(); header.props.onModeChange('login'); assert.deepEqual(calls, []);
    registration.isRegistrationPending = false;
    assert.equal(nodes(Screen()).find(node => node.type === 'AuthHeader').props.disabled, true);
  }
});
