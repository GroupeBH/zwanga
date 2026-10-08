const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  KeyboardAvoidingView: 'Avoider', ScrollView: 'Scroll', StyleSheet: { create: value => value } };
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];

for (const os of ['android', 'ios']) {
  test(`${os}: observes current keyboard, scrolls on transitions only, and removes listeners`, () => {
    const hooks = hookHarness(), listeners = new Map(), scrolls = [];
    let visible = true;
    const Keyboard = { isVisible: () => visible, addListener: (name, callback) => {
      listeners.set(name, callback); return { remove: () => listeners.delete(name) };
    } };
    const { useAuthKeyboardLayout } = loader({ react: hooks.react, 'react-native': { Keyboard, Platform: { OS: os } } })('hooks/auth/useAuthKeyboardLayout.ts');
    const render = (enabled = true, step = 'resetPin:otp') => hooks.render(() => useAuthKeyboardLayout(enabled, step));
    assert.equal(render(false).keyboardVisible, false);
    assert.equal(listeners.size, 0);
    const initial = render();
    initial.scrollRef.current = { scrollTo: value => scrolls.push(value) };
    assert.equal(render().keyboardVisible, true, 'entering a step with the keyboard already open');
    assert.equal(scrolls.length, 1);
    render(); render();
    assert.equal(scrolls.length, 1, 'typing/renders must not reset user scrolling');
    assert.deepEqual([...listeners.keys()], os === 'ios' ? ['keyboardWillShow', 'keyboardWillHide'] : ['keyboardDidShow', 'keyboardDidHide']);
    visible = false;
    listeners.get(os === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide')();
    assert.equal(render().keyboardVisible, false);
    render(true, 'resetPin:newPin');
    assert.equal(scrolls.length, 3, 'hide and new stage reset the old scroll offset');
    listeners.get(os === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow')();
    assert.equal(render(true, 'resetPin:newPin').keyboardVisible, true);
    assert.equal(render(false).keyboardVisible, false);
    assert.equal(listeners.size, 0);
    render();
    assert.equal(render().keyboardVisible, false, 'reentry refreshes native keyboard state');
    assert.ok(scrolls.every(value => value.y === 0 && value.animated === false));
    hooks.unmount();
    assert.equal(listeners.size, 0);
  });

  for (const form of [{ mode: 'login', step: 'pin' }, { mode: 'login', step: 'resetPin', resetPinStep: 'otp' }, { mode: 'login', step: 'resetPin', resetPinStep: 'newPin' }, { mode: 'signup', step: 'pin' }, { mode: 'login', step: 'phone' }]) {
    test(`${os}: viewport policy for ${form.mode}/${form.step}/${form.resetPinStep ?? ''}`, () => {
      let keyboardVisible = true, enabled, key;
      const ref = { current: null };
      const components = ['AuthHeader', 'PinStep', 'ResetPinStep', 'VehicleModal'];
      const Screen = loader({ 'react-native': { ...native, Platform: { OS: os } },
        'expo-router': { Redirect: 'Redirect' },
        'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@/config/env': {},
        '@/components/auth': { ...Object.fromEntries(components.map(name => [name, name])), authStyles: {} },
        '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: (active, stage) => {
          enabled = active; key = stage; return { scrollRef: ref, keyboardVisible: active && keyboardVisible };
        } },
        '../hooks/auth/useAuthController': { useAuthController: () => ({ draftPersistence: { saveFailed: false }, form, canGoBack: false,
          social: {}, phoneActions: {}, registration: {}, profileActions: {}, navigation: {} }) },
      })('app/auth.tsx').default;
      const compact = form.step === 'resetPin' || (form.step === 'pin' && form.mode === 'login');
      const tree = nodes(Screen()), header = tree.find(n => n.type === 'AuthHeader'), scroll = tree.find(n => n.type === 'Scroll');
      assert.equal(enabled, compact);
      assert.equal(key, `${form.step}:${form.resetPinStep}`);
      assert.equal(header.props.canGoBack, compact, 'recovery has a back button instead of mode tabs');
      assert.equal(header.props.compact, compact);
      const avoider = tree.find(n => n.type === 'Avoider');
      assert.equal(avoider.props.enabled, os === 'ios' || !compact, 'only native resize owns keyboard avoidance on Android code steps');
      assert.equal(avoider.props.keyboardVerticalOffset, compact || os === 'ios' ? 0 : 20);
      assert.equal(flatten(avoider.props.style).minHeight, 0);
      assert.equal(scroll.props.ref, ref);
      assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, false);
      assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
      assert.notEqual(scroll.props.scrollEnabled, false, 'short landscape and large fonts retain a scrolling fallback');
      assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
      assert.equal(tree[0].props.edges.includes('bottom'), !compact);
      keyboardVisible = false;
      assert.equal(nodes(Screen())[0].props.edges.includes('bottom'), true);
    });
  }
}

function loadUI() {
  return loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../OtpCodeInput': { OtpCodeInput: 'OtpInput' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'View' }, FadeInDown: { springify() {} }, FadeOutUp: {} },
  });
}

test('the recovery back button cannot leave while OTP/PIN requests are pending', () => {
  const calls = [];
  const phoneActions = { isResettingPin: true, isPinLoginInFlight: () => false };
  const Screen = loader({ 'react-native': { ...native, Platform: { OS: 'android' } },
    'expo-router': { Redirect: 'Redirect' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@/config/env': {},
    '@/components/auth': { AuthHeader: 'Header', ResetPinStep: 'Reset', VehicleModal: 'Modal', authStyles: {} },
    '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: () => ({ scrollRef: { current: null }, keyboardVisible: true }) },
    '../hooks/auth/useAuthController': { useAuthController: () => ({ draftPersistence: { saveFailed: false }, form: { mode: 'login', step: 'resetPin' }, phoneActions,
      navigation: { handlePreviousStep: () => calls.push('back'), handleModeChange: () => calls.push('mode') },
      social: { isSocialAuthInFlight: () => false }, registration: { isRegistrationLocked: () => false }, profileActions: {} }) },
  })('app/auth.tsx').default;
  let header = nodes(Screen()).find(n => n.type === 'Header');
  assert.equal(header.props.disabled, true);
  header.props.onBack(); header.props.onModeChange('signup');
  assert.deepEqual(calls, []);
  phoneActions.isResettingPin = false;
  header = nodes(Screen()).find(n => n.type === 'Header');
  header.props.onBack();
  assert.deepEqual(calls, ['back']);
});
const resetProps = { phone: '+243000000000', otpCode: Array(6).fill('1'), newPin: '1234', newPinConfirm: '1234',
  onVerifyOtp() {}, onResendOtp() {}, isLoading: false, isResending: false, keyboardVisible: true };

test('reset OTP groups actions and puts paste beside the label without removing delivery guidance', () => {
  const load = loadUI(), { ResetPinStep } = load('components/auth/steps/ResetPinStep.tsx');
  const tree = ResetPinStep({ ...resetProps, resetPinStep: 'otp' }), all = nodes(tree);
  const otp = all.find(n => n.type === 'OtpInput');
  assert.equal(otp.props.compact, true);
  assert.equal(otp.props.label, 'Code à 6 chiffres');
  assert.equal(flatten(otp.props.inputStyle).minHeight, 48);
  assert.equal(flatten(otp.props.inputStyle).flex, 1, 'six cases fit a narrow viewport');
  assert.equal(flatten(otp.props.containerStyle).marginVertical, 0);
  const actions = all.find(n => flatten(n.props.style).flexWrap === 'wrap');
  assert.equal(nodes(actions).filter(n => n.type === 'Button').length, 2);
  assert.ok(nodes(actions).filter(n => n.type === 'Button').every(n => flatten(n.props.style).minHeight >= 44));
  const notice = all.find(n => typeof n.type === 'function' && n.type.name === 'OtpDeliveryNotice');
  assert.equal(notice.props.compact, true);
  for (const state of [{ isLoading: true }, { isResending: true }]) {
    const busy = nodes(ResetPinStep({ ...resetProps, resetPinStep: 'otp', ...state }));
    assert.ok(busy.filter(n => n.type === 'Button').every(n => n.props.disabled));
    assert.equal(busy.find(n => n.type === 'OtpInput').props.disabled, true);
  }
});

test('new PIN fields share a wrapping row, stay labeled and keep secure entry/busy locks', () => {
  const { ResetPinStep } = loadUI()('components/auth/steps/ResetPinStep.tsx');
  for (const isLoading of [false, true]) {
    const all = nodes(ResetPinStep({ ...resetProps, resetPinStep: 'newPin', isLoading }));
    const fields = all.find(n => flatten(n.props.style).flexWrap === 'wrap');
    const inputs = nodes(fields).filter(n => n.type === 'Input');
    assert.equal(inputs.length, 2);
    for (const input of inputs) {
      assert.equal(input.props.secureTextEntry, true);
      assert.equal(input.props.maxLength, 4);
      assert.equal(input.props.editable, !isLoading);
      assert.match(input.props.accessibilityLabel, /code PIN à 4 chiffres/);
      assert.equal(flatten(input.props.style).height, 'auto');
    }
    assert.equal(all.find(n => n.type === 'Button').props.disabled, isLoading);
  }
});

test('keyboard heading removes illustration only; text scaling and wrapping remain enabled', () => {
  const { AuthCodeHeading } = loadUI()('components/auth/AuthCodeHeading.tsx');
  for (const keyboardVisible of [false, true]) {
    const all = nodes(AuthCodeHeading({ title: 'Réinitialiser le PIN', subtitle: 'Numéro à vérifier', icon: 'key-outline', keyboardVisible }));
    assert.equal(all.some(n => n.type === 'Icon'), !keyboardVisible);
    for (const text of all.filter(n => n.type === 'Text')) {
      assert.notEqual(text.props.allowFontScaling, false);
      assert.equal(text.props.numberOfLines, undefined);
    }
  }
});

test('login PIN uses compact boxes/actions without changing signup layout', () => {
  const { PinStep } = loadUI()('components/auth/steps/PinStep.tsx');
  const login = nodes(PinStep({ mode: 'login', pin: '', pinConfirm: '', onForgotPin() {}, isLoading: false, keyboardVisible: true }));
  assert.equal(flatten(login[0].props.style).flex, 0);
  const actions = login.find(n => flatten(n.props.style).flexWrap === 'wrap');
  assert.equal(nodes(actions).filter(n => n.type === 'Button').length, 2);
  const signup = nodes(PinStep({ mode: 'signup', pin: '', pinConfirm: '', isLoading: false }));
  assert.equal(signup.some(n => typeof n.type === 'function' && n.type.name === 'AuthCodeHeading'), false);
  assert.equal(signup.filter(n => n.type === 'Input').length, 2);
});
