const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture(extra = {}) {
  const hooks = hookHarness(), calls = [], dialogs = [], loginGate = deferred(), storageGate = deferred();
  const state = { generation: 0, focuses: 0, saved: 0, analytics: 0 };
  const props = { mode: 'login', step: 'pin', phone: '+243000000000', pin: '', pinConfirm: '',
    login: payload => ({ unwrap: () => { calls.push(payload); return loginGate.promise; } }),
    dispatch: () => { state.generation++; return { unwrap: () => { state.saved++; return storageGate.promise; } }; },
    showDialog: value => dialogs.push(value), pinInputRef: { current: null }, pinConfirmInputRef: { current: { focus() {} } },
    focusAfterInteractions: () => { state.focuses++; }, ...extra,
  };
  props.setPin = value => { props.pin = value; };
  props.setPinConfirm = value => { props.pinConfirm = value; };
  props.setStep = value => { props.step = value; };
  const { usePhoneAuthActions } = loader({ react: hooks.react,
    '@/config/env': { isSignupOtpVerificationEnabled: false },
    './usePinResetFlow': { usePinResetFlow: () => ({ isBusy: false }) },
    '@/store/slices/authSlice': { saveTokensAndUpdateState: payload => payload },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.generation },
    '@/services/analytics': { trackEvent: async () => { state.analytics++; if (state.analyticsError) throw new Error('analytics unavailable'); } },
  })('hooks/auth/usePhoneAuthActions.ts');
  return { hooks, props, state, calls, dialogs, loginGate, storageGate,
    render: () => hooks.render(() => usePhoneAuthActions(props)),
    finish: async () => { loginGate.resolve({ accessToken: 'test-access', refreshToken: 'test-refresh' }); storageGate.resolve(true); await tick(); },
  };
}

test('fourth digit starts login with the new PIN even before React updates the previous state', async () => {
  const app = fixture();
  const handlers = app.render();
  for (const value of ['0', '01', '012']) handlers.handlePinChange(value);
  assert.deepEqual(app.calls, []);
  handlers.handlePinChange('0123');
  assert.deepEqual(app.calls, [{ phone: app.props.phone, pin: '0123' }]);
  assert.equal(app.render().isPinLoginPending, true);
  await app.finish();
  assert.equal(app.render().isPinLoginPending, true, 'busy until the auth screen is replaced');
  assert.equal(app.render().isPinLoginInFlight(), true);
  assert.equal(app.state.saved, 1);
  app.hooks.unmount();
});

test('pasting/sanitizing four digits starts login once', async () => {
  const app = fixture();
  app.render().handlePinChange('1a2b3c45');
  assert.equal(app.props.pin, '1234');
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].pin, '1234');
  await app.finish();
  app.hooks.unmount();
});

test('auto-submit and button/repeated input share a lock through login AND session persistence', async () => {
  const app = fixture();
  const handlers = app.render();
  handlers.handlePinChange('1234');
  handlers.handlePinChange('1234');
  handlers.handlePinChange('5678');
  await handlers.handlePinSubmit();
  await handlers.handleForgotPin();
  assert.equal(app.props.pin, '1234');
  assert.equal(app.calls.length, 1);
  assert.deepEqual(app.dialogs, []);
  app.loginGate.resolve({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  await tick();
  assert.equal(app.render().isPinLoginPending, true);
  assert.equal(app.state.saved, 1);
  await app.render().handlePinSubmit();
  assert.equal(app.calls.length, 1);
  app.storageGate.resolve(true);
  await tick();
  await app.render().handlePinSubmit();
  assert.equal(app.calls.length, 1, 'no second login while successful navigation is completing');
  assert.equal(app.render().isPinLoginPending, true);
  app.hooks.unmount();
});

test('no automatic login on render, returning to PIN, signup or PIN reset', async () => {
  for (const extra of [{ pin: '1234' }, { mode: 'signup' }, { step: 'resetPin' }, { step: 'phone' }]) {
    const app = fixture(extra);
    app.render(); app.render();
    assert.deepEqual(app.calls, []);
    if (!extra.pin) app.render().handlePinChange('1234');
    assert.deepEqual(app.calls, []);
    app.hooks.unmount();
  }
  const app = fixture({ mode: 'signup' });
  app.render().handlePinChange('1234');
  app.render().handlePinConfirmChange('1234');
  assert.equal(app.props.step, 'pin');
  await app.render().handlePinSubmit();
  assert.equal(app.props.step, 'profile');
  assert.deepEqual(app.calls, []);
  app.hooks.unmount();
});

test('a rejected password is cleared with inline feedback, no modal/focus race and no automatic replay', async () => {
  const app = fixture();
  app.render().handlePinChange('1234');
  app.loginGate.reject({ status: 401, data: { message: 'Invalid PIN' } });
  await tick();
  assert.equal(app.props.pin, '');
  assert.equal(app.state.focuses, 0, 'the editable field owns retry focus after React commits');
  assert.deepEqual(app.dialogs, []);
  assert.match(app.render().pinLoginError, /Mot de passe incorrect/);
  assert.equal(app.state.saved, 0);
  for (let i = 0; i < 5; i++) app.render();
  assert.equal(app.calls.length, 1);
  app.props.login = payload => ({ unwrap: async () => { app.calls.push(payload); return { accessToken: 'test-access', refreshToken: 'test-refresh' }; } });
  app.storageGate.resolve(true);
  app.render().handlePinChange('5678');
  assert.equal(app.render().pinLoginError, null);
  await tick();
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].pin, '5678');
  app.hooks.unmount();
});

test('a transport failure or refused local session does not cause automatic retry', async () => {
  for (const storageFailure of [false, true]) {
    const app = fixture();
    app.render().handlePinChange('1234');
    if (storageFailure) {
      app.loginGate.resolve({ accessToken: 'test-access', refreshToken: 'test-refresh' });
      app.storageGate.resolve(false);
    } else app.loginGate.reject({ status: 'FETCH_ERROR' });
    await tick();
    assert.equal(app.props.pin, '');
    assert.equal(app.dialogs.length, 0);
    assert.ok(app.render().pinLoginError);
    assert.equal(app.render().isPinLoginPending, false);
    assert.equal(app.calls.length, 1);
    app.hooks.unmount();
  }
});

test('manual login is still available for a complete PIN and incomplete input remains blocked', async () => {
  const app = fixture({ pin: '123' });
  await app.render().handlePinSubmit();
  assert.equal(app.calls.length, 0);
  assert.equal(app.dialogs[0].title, 'Mot de passe incomplet');
  app.props.pin = '1234';
  const task = app.render().handlePinSubmit();
  await app.finish();
  await task;
  assert.equal(app.calls.length, 1);
  app.hooks.unmount();
});

test('late failures/successes do not update a closed or changed PIN screen', async () => {
  for (const change of ['unmount', 'phone', 'session']) {
    const app = fixture();
    app.render().handlePinChange('1234');
    if (change === 'unmount') app.hooks.unmount();
    if (change === 'phone') { app.props.phone = '+243000000001'; app.render(); }
    if (change === 'session') app.state.generation++;
    await app.finish();
    assert.equal(app.state.saved, 0);
    assert.deepEqual(app.dialogs, []);
    app.hooks.unmount();
  }
});

test('analytics failure does not erase the PIN or replay a confirmed login', async () => {
  const app = fixture();
  app.state.analyticsError = true;
  app.render().handlePinChange('1234');
  await app.finish();
  assert.equal(app.props.pin, '1234');
  assert.deepEqual(app.dialogs, []);
  assert.equal(app.state.analytics, 1);
  app.hooks.unmount();
});

test('a failed secure write in the login generation remains visible, not masked as an obsolete session', async () => {
  const app = fixture(); app.render().handlePinChange('1234');
  app.loginGate.resolve({ accessToken: 'test-access', refreshToken: 'test-refresh' }); await tick();
  assert.equal(app.state.generation, 1);
  app.storageGate.reject(new Error('Stockage sécurisé indisponible. Réessayez.')); await tick();
  assert.match(app.render().pinLoginError, /Stockage sécurisé indisponible/);
  assert.equal(app.render().isPinLoginPending, false); assert.deepEqual(app.dialogs, []);
  app.hooks.unmount();
});

test('logout while session persistence awaits never refocuses, reports an error or confirms the old login', async () => {
  const app = fixture(); app.render().handlePinChange('1234');
  app.loginGate.resolve({ accessToken: 'test-access', refreshToken: 'test-refresh' }); await tick();
  app.state.generation++; app.storageGate.resolve(false); await tick();
  assert.equal(app.render().pinLoginError, null); assert.equal(app.state.analytics, 0);
  assert.equal(app.state.focuses, 0); app.hooks.unmount();
});

test('changing phone hides the previous error immediately and typing clears it without retrying', async () => {
  const app = fixture(); app.render().handlePinChange('1234'); app.loginGate.reject({ status: 401 }); await tick();
  assert.ok(app.render().pinLoginError);
  app.render().handlePinChange('1'); assert.equal(app.render().pinLoginError, null);
  assert.equal(app.calls.length, 1);
  app.props.phone = '+243000000001'; assert.equal(app.render().pinLoginError, null);
  app.hooks.unmount();
});

const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Platform: { OS: 'android' }, StyleSheet: { create: value => value } };
const uiMocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' }, '@/config/env': {},
  '../PasswordCodeInput': { PasswordCodeInput: props => React.createElement('Input', { editable: !props.disabled }) },
  '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: { springify: () => ({}) }, FadeOutUp: {} } };
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? typeof tree.type === 'function' ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props.children)] : []; }
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props.children) : '';

test('PIN UI explains automatic login and locks inputs/recovery while submitting, without changing signup copy', () => {
  const { PinStep } = loader(uiMocks)('components/auth/steps/PinStep.tsx');
  const tree = PinStep({ mode: 'login', pin: '1234', isLoading: true, onForgotPin() {} });
  assert.match(text(tree), /connexion démarre au dernier chiffre/);
  assert.doesNotMatch(text(tree), /\bPIN\b/);
  assert.match(text(tree), /Connexion en cours/);
  assert.ok(nodes(tree).filter(node => node.type === 'Input').every(node => node.props.editable === false));
  assert.ok(nodes(tree).filter(node => node.type === 'Button').every(node => node.props.disabled));
  const signup = PinStep({ mode: 'signup', pin: '', pinConfirm: '', isLoading: false });
  assert.doesNotMatch(text(signup), /connexion démarre/);
  assert.match(text(signup), /Continuer/);
});

test('inline login errors, recovery and change-number action stay visible without showing the password', () => {
  const { PinStep } = loader(uiMocks)('components/auth/steps/PinStep.tsx');
  const calls = [];
  const tree = PinStep({ mode: 'login', pin: '', phone: '+243000000000', isLoading: false,
    error: 'Mot de passe incorrect. Réessayez.', onForgotPin() {}, onChangePhone: () => calls.push('phone') });
  assert.match(text(tree), /Mot de passe incorrect/); assert.match(text(tree), /Mot de passe oublié/);
  assert.equal(nodes(tree).find(n => n.props.accessibilityRole === 'alert').props.accessibilityLiveRegion, 'polite');
  nodes(tree).find(n => n.type === 'Button' && text(n) === 'Changer de numéro').props.onPress();
  assert.deepEqual(calls, ['phone']);
});

test('auth screen keeps PIN loading and header locked through session persistence', () => {
  let busy = true;
  const calls = [];
  const componentNames = ['AuthHeader', 'GoogleOtpStep', 'GooglePhoneStep', 'KycStep', 'PhoneStep', 'PinStep', 'ProfileStep', 'ResetPinStep', 'SmsStep', 'VehicleModal'];
  const Screen = loader({ ...uiMocks, 'react-native-safe-area-context': { SafeAreaView: 'View' },
    'expo-router': { Redirect: 'Redirect' },
    '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: () => ({ keyboardVisible: false, scrollRef: { current: null } }) },
    '@/components/auth': { ...Object.fromEntries(componentNames.map(name => [name, name])), authStyles: {} },
    '../hooks/auth/useAuthController': { useAuthController: () => ({ draftPersistence: { saveFailed: false },
      form: { mode: 'login', step: 'pin', isLoggingIn: false },
      navigation: { handleModeChange: () => calls.push('mode'), handlePreviousStep: () => calls.push('back') },
      social: { isGoogleLoading: false, isSocialAuthInFlight: () => false },
      phoneActions: { isPinLoginPending: true, isPinLoginInFlight: () => busy }, profileActions: {}, registration: { isRegistrationLocked: () => false },
    }) },
  })('app/auth.tsx').default;
  const tree = nodes(Screen());
  assert.equal(tree.find(node => node.type === 'PinStep').props.isLoading, true);
  const header = tree.find(node => node.type === 'AuthHeader');
  assert.equal(header.props.disabled, true);
  header.props.onModeChange('signup'); header.props.onBack();
  assert.deepEqual(calls, []);
  busy = false;
  header.props.onBack();
  assert.deepEqual(calls, ['back']);
});
