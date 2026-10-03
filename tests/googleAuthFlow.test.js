const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture() {
  const hooks = hookHarness(), native = deferred(), backend = deferred(), calls = [], dialogs = [];
  const state = { generation: 0, token: null, flow: null, nativeCalls: 0, backendCalls: 0 };
  const props = { attemptInFlight: { current: false },
    confirmSession: async () => {},
    setGoogleFlow: value => { state.flow = value; }, setSocialProvider: () => {},
    setGoogleIdToken: value => { state.token = value; }, setGoogleProfileName: () => {},
    setGoogleFirstName: () => {}, setGoogleLastName: () => {}, setGoogleEmail: () => {},
    googleMobile: () => ({ unwrap: () => { state.backendCalls++; return backend.promise; } }),
    showDialog: dialog => dialogs.push(dialog), onSignupRequired: seed => calls.push(seed),
  };
  const io = { trackEvent: async () => {} };
  const load = loader({ react: hooks.react,
    '@/services/googleAuth': { signInWithGoogle: () => { state.nativeCalls++; return native.promise; } },
    '@/services/analytics': { trackEvent: (...args) => io.trackEvent(...args) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.generation },
  });
  const { useGoogleAuthActions } = load('hooks/auth/useGoogleAuthActions.ts');
  return { hooks, native, backend, calls, dialogs, state, props, io, load,
    render: () => hooks.render(() => useGoogleAuthActions(props)) };
}

test('first press is immediately busy; duplicates during native and backend stages do not replay login', async () => {
  const app = fixture();
  const firstRender = app.render();
  const login = firstRender.handleGoogleLogin();
  await firstRender.handleGoogleLogin();
  await firstRender.handleGoogleSignupStart();
  assert.equal(app.state.nativeCalls, 1);
  assert.equal(app.render().isGoogleLoading, true);
  assert.equal(app.state.backendCalls, 0);
  app.native.resolve({ idToken: 'test-token' });
  await tick();
  assert.equal(app.state.backendCalls, 1);
  assert.equal(app.render().isGoogleLoading, true);
  await app.render().handleGoogleLogin();
  assert.equal(app.state.backendCalls, 1);
  app.backend.resolve({});
  await login;
  assert.equal(app.render().isGoogleLoading, true);
  assert.equal(app.props.attemptInFlight.current, true);
  await app.render().handleGoogleLogin();
  assert.equal(app.state.nativeCalls, 1);
  assert.deepEqual(app.dialogs, []);
  app.hooks.unmount();
});

test('signup reuses Google identity without logging in or submitting registration prematurely', async () => {
  const app = fixture();
  const task = app.render().handleGoogleSignupStart();
  app.native.resolve({ idToken: 'test-token', name: 'Test' });
  await task;
  assert.equal(app.state.flow, 'signup');
  assert.equal(app.state.token, 'test-token');
  assert.equal(app.state.backendCalls, 0);
  assert.equal(app.render().isGoogleLoading, false);
  app.hooks.unmount();
});

test('first-press native busy response is informative and French, with no automatic retry', async () => {
  const app = fixture();
  const task = app.render().handleGoogleLogin();
  app.native.reject({ code: 12502, message: 'Sign-in in progress' });
  await task;
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.dialogs[0].variant, 'info');
  assert.match(app.dialogs[0].message, /Google est encore occupé/);
  assert.equal(app.state.nativeCalls, 1);
  assert.equal(app.state.backendCalls, 0);
  assert.equal(app.state.flow, null);
  assert.equal(app.render().isGoogleLoading, false);
  app.hooks.unmount();
});

test('intentional cancellation silently restores the form and releases the lock', async () => {
  const app = fixture();
  const task = app.render().handleGoogleLogin();
  app.native.reject({ code: '-5', message: 'cancelled' });
  await task;
  assert.equal(app.state.flow, null);
  assert.equal(app.state.token, null);
  assert.deepEqual(app.dialogs, []);
  assert.equal(app.props.attemptInFlight.current, false);
  app.hooks.unmount();
});

test('late native success after unmount or session replacement cannot submit login', async () => {
  for (const change of ['unmount', 'session']) {
    const app = fixture();
    const task = app.render().handleGoogleLogin();
    if (change === 'unmount') app.hooks.unmount(); else app.state.generation++;
    app.native.resolve({ idToken: 'test-token' });
    await task;
    assert.equal(app.state.backendCalls, 0);
    assert.equal(app.state.token, null);
    assert.deepEqual(app.dialogs, []);
    app.hooks.unmount();
  }
});

test('Google cannot start while another social provider owns the attempt', async () => {
  const app = fixture();
  app.props.attemptInFlight.current = true;
  await app.render().handleGoogleLogin();
  assert.equal(app.state.nativeCalls, 0);
  assert.equal(app.state.flow, null);
  app.hooks.unmount();
});

test('backend-required social registration still retains the selected Google identity', async () => {
  const app = fixture();
  const task = app.render().handleGoogleLogin();
  app.native.resolve({ idToken: 'test-token', givenName: 'Test' });
  await tick();
  app.backend.reject({ status: 400, data: { message: 'Première inscription Google : numéro de téléphone requis.' } });
  await task;
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].provider, 'google');
  assert.equal(app.calls[0].idToken, 'test-token');
  assert.deepEqual(app.dialogs, []);
  app.hooks.unmount();
});

test('an analytics failure never turns a confirmed backend login into an error', async () => {
  const app = fixture();
  app.io.trackEvent = async () => { throw new Error('analytics offline'); };
  const task = app.render().handleGoogleLogin();
  app.native.resolve({ idToken: 'test-token' });
  app.backend.resolve({});
  await task;
  await tick();
  assert.deepEqual(app.dialogs, []);
  assert.equal(app.state.token, 'test-token');
  app.hooks.unmount();
});

for (const firstProvider of ['google', 'apple']) {
  test(`${firstProvider} and the other provider share the real social-controller lock`, async () => {
    const hooks = hookHarness(), google = deferred(), apple = deferred(), calls = [];
    const props = new Proxy({ phone: '', googleMobile: () => ({ unwrap: async () => calls.push('google-backend') }),
      confirmSession: async () => {},
      appleMobile: () => ({ unwrap: async () => calls.push('apple-backend') }), showDialog: () => calls.push('dialog') },
    { get: (target, key) => key in target ? target[key] : String(key).startsWith('set') ? () => {} : undefined });
    const { useSocialAuthActions } = loader({ react: hooks.react,
      './useSocialPhoneVerification': { useSocialPhoneVerification: () => ({}) },
      '@/services/googleAuth': { signInWithGoogle: () => { calls.push('google-native'); return google.promise; } },
      '@/services/appleAuth': { signInWithApple: () => { calls.push('apple-native'); return apple.promise; } },
      '@/services/analytics': { trackEvent: async () => {} },
    })('hooks/auth/useSocialAuthActions.ts');
    const render = () => hooks.render(() => useSocialAuthActions(props));
    const handlers = render();
    const first = firstProvider === 'google' ? handlers.handleGoogleLogin() : handlers.handleAppleLogin();
    await (firstProvider === 'google' ? handlers.handleAppleLogin() : handlers.handleGoogleLogin());
    assert.deepEqual(calls, [firstProvider + '-native']);
    assert.equal(render().isSocialAuthInFlight(), true);
    google.resolve({ idToken: 'test-google' });
    apple.resolve({ identityToken: 'test-apple' });
    await first;
    assert.equal(render().isSocialAuthInFlight(), true);
    await (firstProvider === 'google' ? render().handleAppleLogin() : render().handleGoogleLogin());
    assert.deepEqual(calls, [firstProvider + '-native', firstProvider + '-backend']);
    hooks.unmount();
  });
}

const nativeUI = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Image: 'Image', Platform: { OS: 'android' }, StyleSheet: { create: value => value } };
const uiMocks = { 'react-native': nativeUI, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/assets/images/google.png': 1, '@/config/env': { isSignupOtpVerificationEnabled: false },
  '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: { springify: () => ({}) }, FadeOutUp: {} } };
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : []; }
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';

test('Google loading is visible and prevents phone/provider/mode changes', () => {
  const load = loader(uiMocks);
  const { PhoneStep } = load('components/auth/steps/PhoneStep.tsx');
  const tree = PhoneStep({ mode: 'login', phone: '0000000000', isGoogleLoading: true, isLoading: false });
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(button => button.props.disabled));
  assert.match(text(tree), /Connexion en cours/);
  assert.equal(buttons[1].props.accessibilityState.busy, true);
  const { AuthHeader } = load('components/auth/AuthHeader.tsx');
  for (const canGoBack of [true, false]) {
    const header = AuthHeader({ mode: 'login', disabled: true, canGoBack });
    assert.ok(nodes(header).filter(node => node.type === 'Button').every(button => button.props.disabled));
  }
});

test('auth screen binds native Google loading and guards navigation before the next React render', () => {
  let busy = true;
  const calls = [];
  const componentNames = ['AuthHeader', 'GoogleOtpStep', 'GooglePhoneStep', 'KycStep', 'PhoneStep', 'PinStep', 'ProfileStep', 'ResetPinStep', 'SmsStep', 'VehicleModal'];
  const social = { isGoogleLoading: true, isSocialAuthInFlight: () => busy };
  const Screen = loader({ ...uiMocks,
    'expo-router': { Redirect: 'Redirect' },
    '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: () => ({ keyboardVisible: false, scrollRef: { current: null } }) },
    'react-native-safe-area-context': { SafeAreaView: 'View' },
    '@/components/auth': { ...Object.fromEntries(componentNames.map(name => [name, name])), authStyles: {} },
    '../hooks/auth/useAuthController': { useAuthController: () => ({
      form: { mode: 'login', step: 'phone' }, navigation: { handleModeChange: () => calls.push('mode'), handlePreviousStep: () => calls.push('back') },
      showPhoneStep: true, phoneActions: { handlePhoneSubmit: () => calls.push('phone'), isPinLoginInFlight: () => false }, social,
      profileActions: {}, registration: { isRegistrationLocked: () => false },
    }) },
  })('app/auth.tsx').default;
  const tree = nodes(Screen());
  const phone = tree.find(node => node.type === 'PhoneStep');
  const header = tree.find(node => node.type === 'AuthHeader');
  assert.equal(phone.props.isGoogleLoading, true);
  assert.equal(header.props.disabled, true);
  header.props.onModeChange('signup'); header.props.onBack(); phone.props.onSubmit();
  assert.deepEqual(calls, []);
  busy = false;
  header.props.onModeChange('signup'); header.props.onBack(); phone.props.onSubmit();
  assert.deepEqual(calls, ['mode', 'back', 'phone']);
});
