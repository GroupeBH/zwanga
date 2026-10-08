const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { isAuthPhoneValid, authPhoneCopy } = loader()('features/auth/authPhone.ts');
const noop = () => {};
const validPhones = [
  '+32 2 000 00 00', '0032 2 000 00 00', '+352260000', '00352260000',
  '+6834000', '+47 4000 0000', '+3546000000', '+33 (6) 00-00-00-00',
  '+1 (202) 555-0100', '+2250100000000', '+390600000000', '+123456789012345',
  '0900000000', '900000000', '+243900000000', '243900000000', ' 09 00 00 00 00 ',
];
const invalidPhones = [
  '', ' ', '+', '00', '++3220000000', '+003220000000', '+03220000000',
  '0003220000000', '+123456', '+1234567890123456', '1234567890123456',
  '+32foo20000000', 'abcdefghij', '+32 20000000 ext 1', '01234567890123',
];

test('international input accepts short/long foreign numbers, separators and existing RDC formats', () => {
  for (const phone of validPhones) assert.equal(isAuthPhoneValid(phone), true, phone);
  for (const phone of invalidPhones) assert.equal(isAuthPhoneValid(phone), false, phone);
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree)
  ? [tree, ...nodes(tree.props.children)] : [];
const animation = { springify: noop, duration: noop };
const loadUI = loader({
  'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
    ActivityIndicator: 'Spinner', Image: 'Image', Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { default: { View: 'View' }, FadeIn: animation, FadeOut: animation, FadeInDown: animation, FadeOutUp: animation },
  '@/config/env': { isSignupOtpVerificationEnabled: true }, '@/assets/images/google.png': 1,
});

test('phone and Google/Apple inputs agree with submit validation and retain loading protection', () => {
  const { PhoneStep } = loadUI('components/auth/steps/PhoneStep.tsx');
  const { GooglePhoneStep } = loadUI('components/auth/steps/GooglePhoneStep.tsx');
  for (const [Component, mode, provider] of [
    [PhoneStep, 'signup'], [PhoneStep, 'login'], [GooglePhoneStep, 'signup', 'google'], [GooglePhoneStep, 'signup', 'apple'],
  ]) {
    for (const phone of [...validPhones, ...invalidPhones]) {
      const props = { phone, mode, provider, isLoading: false, isGoogleLoading: false, onSubmit: noop };
      const tree = nodes(Component(props));
      const input = tree.find(node => node.type === 'Input');
      assert.equal(input.props.value, phone, 'no country is imposed while typing/pasting');
      assert.equal(input.props.autoComplete, 'tel');
      assert.equal(input.props.accessibilityHint, authPhoneCopy.hint);
      assert.ok(tree.some(node => node.type === 'Text' && node.props.children === authPhoneCopy.hint));
      assert.equal(tree.find(node => node.type === 'Button').props.disabled, !isAuthPhoneValid(phone), phone);
      assert.equal(nodes(Component({ ...props, isLoading: true })).find(node => node.type === 'Button').props.disabled, true);
    }
  }
});

function authFixture(phone, { social = false, otpEnabled = true, mode = 'signup' } = {}) {
  const requests = [], verifications = [], dialogs = [];
  const state = { phone, googlePhone: phone, step: 'phone', googleSignupStep: 'phone', isGooglePhoneVerified: false };
  const props = new Proxy({ ...state, mode, googleIdToken: 'test-id', googleOtp: ['1', '2', '3', '4', '5'], smsCode: ['1', '2', '3', '4', '5'],
    showDialog: value => dialogs.push(value),
    sendPhoneVerificationOtp: payload => ({ unwrap: async () => { requests.push(payload); } }),
    verifyPhoneOtp: payload => ({ unwrap: async () => { verifications.push(payload); } }),
  }, { get(target, key) {
    if (key in state) return state[key];
    if (key in target) return target[key];
    if (String(key).startsWith('set')) return value => {
      const name = key[3].toLowerCase() + key.slice(4); state[name] = value;
    };
    return undefined;
  } });
  const load = loader({
    '@/config/env': { isSignupOtpVerificationEnabled: otpEnabled },
    './usePinResetFlow': { usePinResetFlow: () => ({ isBusy: false }) },
    './usePinLogin': { usePinLogin: () => ({ isInFlight: () => false }) },
  });
  const render = social
    ? () => load('hooks/auth/useSocialPhoneVerification.ts').useSocialPhoneVerification(props)
    : () => load('hooks/auth/usePhoneAuthActions.ts').usePhoneAuthActions(props);
  return { state, requests, verifications, dialogs, render,
    submit: () => social ? render().handleSendGoogleOtp() : render().handlePhoneSubmit() };
}

for (const social of [false, true]) {
  test(`${social ? 'social' : 'phone'} signup keeps the exact entered identifier through OTP and profile`, async () => {
    for (const input of ['  +352260000  ', '+32 2 000 00 00', '00352260000', '0900000000']) {
      const app = authFixture(input, { social });
      await app.submit();
      const phone = input.trim();
      assert.deepEqual(app.requests, [{ phone, context: 'registration' }]);
      if (social) {
        assert.equal(app.state.googleSignupStep, 'otp');
        await app.render().handleResendGoogleOtp();
        assert.deepEqual(app.requests[1], { phone, context: 'registration' });
        await app.render().handleVerifyGoogleOtpAndContinue();
        assert.equal(app.state.isGooglePhoneVerified, true);
      } else {
        assert.equal(app.state.step, 'sms');
        await app.render().handleSmsSubmit();
      }
      assert.deepEqual(app.verifications, [{ phone, otp: '12345' }]);
      assert.equal(app.state.phone, phone);
      assert.equal(app.state.step, social ? 'profile' : 'pin');
    }
  });

  test(`${social ? 'social' : 'phone'} signup respects the existing OTP feature flag`, async () => {
    const app = authFixture('+352260000', { social, otpEnabled: false });
    await app.submit();
    assert.equal(app.state.step, social ? 'profile' : 'pin');
    assert.deepEqual(app.requests, []);
  });

  test(`${social ? 'social' : 'phone'} signup blocks malformed phones before sending or advancing`, async () => {
    for (const phone of invalidPhones) {
      const app = authFixture(phone, { social });
      await app.submit();
      assert.deepEqual(app.requests, []);
      assert.equal(app.dialogs[0].message, authPhoneCopy.invalid);
      assert.equal(app.state.step, 'phone');
    }
  });
}

test('login allows short foreign numbers without OTP and without rewriting legacy account identifiers', async () => {
  for (const phone of ['+352260000', '+6834000', '0900000000', '+32 2 000 00 00']) {
    const app = authFixture(phone, { mode: 'login' });
    await app.submit();
    assert.equal(app.state.step, 'pin');
    assert.equal(app.state.phone, phone);
    assert.deepEqual(app.requests, []);
  }
});
