const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');

const noop = () => {};
const animation = { springify: noop, duration: noop };
function uiLoader(enabled = true, os = 'android') {
  return loader({
    'react-native': {
      View: 'View', Text: 'Text', TextInput: 'TextInput', Image: 'Image',
      TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator',
      KeyboardAvoidingView: 'View', ScrollView: 'ScrollView',
      Platform: { OS: os }, StyleSheet: { create: value => value },
    },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { default: { View: 'View' }, FadeIn: animation, FadeOut: animation, FadeInDown: animation, FadeOutUp: animation },
    '@/components/forms/FormLayout': { FormModal: 'Modal' },
    '@/config/env': { isSignupOtpVerificationEnabled: enabled },
    '@/assets/images/google.png': 1,
  });
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props.children)];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (!React.isValidElement(tree)) return '';
  return text(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props.children);
}
const buttons = tree => nodes(tree).filter(node => node.type === 'TouchableOpacity');

test('notice prioritizes WhatsApp via Didit, includes SMS fallback and does not truncate text', () => {
  const { OtpDeliveryNotice } = uiLoader()('components/auth/OtpDeliveryNotice.tsx');
  for (const beforeSend of [true, false]) {
    const tree = OtpDeliveryNotice({ beforeSend });
    assert.match(text(tree), /WhatsApp via Didit/);
    assert.match(text(tree), /SMS/);
    assert.match(text(tree), beforeSend ? /en priorité/ : /revenez saisir le code ici/);
    assert.equal(buttons(tree).length, 0); // No external navigation or automatic resend.
    for (const node of nodes(tree).filter(node => node.type === 'Text')) {
      assert.equal(node.props.numberOfLines, undefined);
      assert.notEqual(node.props.allowFontScaling, false);
    }
  }
});

test('before-send guidance appears only when signup really requests OTP, for phone and social signup', () => {
  for (const enabled of [true, false]) {
    const load = uiLoader(enabled);
    const { PhoneStep } = load('components/auth/steps/PhoneStep.tsx');
    const { GooglePhoneStep } = load('components/auth/steps/GooglePhoneStep.tsx');
    const props = { phone: '', mode: 'signup', isLoading: false, onSubmit: noop };
    for (const tree of [PhoneStep(props), GooglePhoneStep(props)]) {
      assert.equal(text(tree).includes('WhatsApp via Didit'), enabled);
      assert.equal(buttons(tree)[0].props.disabled, true);
    }
    assert.doesNotMatch(text(PhoneStep({ ...props, mode: 'login' })), /WhatsApp|Didit/);
  }
});

for (const os of ['android', 'ios']) {
  for (const name of ['SmsStep', 'GoogleOtpStep', 'ResetPinStep']) {
    test(`${name} (${os}) keeps digit count, paste, autofill and resend while guiding toward WhatsApp`, () => {
      const Screen = uiLoader(true, os)(`components/auth/steps/${name}.tsx`)[name];
      const size = name === 'ResetPinStep' ? 6 : 5;
      let code = Array(size).fill(''), resends = 0, focused = null;
      const refs = { current: Array.from({ length: size }, (_, index) => ({ focus: () => { focused = index; } })) };
      const onChange = value => { code = value; };
      const resend = () => { resends++; };
      const render = (extra = {}) => Screen({
        mode: 'signup', phone: '+243000000000', resetPinStep: 'otp',
        smsCode: code, otp: code, otpCode: code, newPin: '', newPinConfirm: '',
        smsInputRefs: refs, otpRefs: refs, otpInputRefs: refs,
        onSmsCodeChange: onChange, onOtpChange: onChange,
        onSubmit: noop, onVerify: noop, onVerifyOtp: noop,
        onResend: resend, onResendOtp: resend,
        isVerifying: false, isLoading: false, isResending: false, ...extra,
      });
      let tree = render();
      assert.match(text(tree), /WhatsApp via Didit/);
      assert.match(text(tree), /SMS/);
      assert.match(text(tree), /\+243000000000/);
      assert.match(text(tree), new RegExp(`${size} chiffres`));
      assert.doesNotMatch(text(tree), /chiffres reçus par SMS/);
      const inputs = nodes(tree).filter(node => node.type === 'TextInput');
      assert.equal(inputs.length, size);
      assert.equal(buttons(tree)[0].props.disabled, true);
      for (const input of inputs) {
        assert.equal(input.props.maxLength, size);
        assert.equal(input.props.autoComplete, os === 'android' ? 'sms-otp' : 'one-time-code');
      }
      inputs[0].props.onChangeText('1 2-3x456');
      assert.equal(code.join(''), '123456'.slice(0, size));
      assert.equal(focused, size - 1);
      tree = render();
      assert.equal(buttons(tree)[0].props.disabled, false);
      const resendButton = buttons(tree).find(node => /Renvoyer/.test(text(node)));
      resendButton.props.onPress();
      assert.equal(resends, 1);
      assert.equal(buttons(render({ isResending: true }))[1].props.disabled, true);
    });
  }
}

test('profile PIN recovery names WhatsApp and Didit, without claiming delivery before success', () => {
  const { ProfilePinModal } = uiLoader()('components/profile/ProfilePinModal.tsx');
  const props = {
    pinModalVisible: true, currentUser: { phone: '+243000000000' },
    oldPin: '', newPin: '', newPinConfirm: '', otpCode: Array(6).fill(''),
    otpInputRefs: { current: [] }, isSendingOtp: true,
  };
  assert.match(text(ProfilePinModal({ ...props, pinStep: 'oldPin' })), /WhatsApp via Didit/);
  const tree = ProfilePinModal({ ...props, pinStep: 'otp' });
  assert.match(text(tree), /WhatsApp via Didit/);
  assert.match(text(tree), /SMS/);
  assert.match(text(tree), /6 chiffres/);
  assert.doesNotMatch(text(tree), /a été envoyé/);
  assert.equal(nodes(tree).filter(node => node.type === 'TextInput').length, 6);
  const actions = buttons(tree).slice(1); // Modal close is always available.
  assert.ok(actions.every(node => node.props.disabled));
  assert.doesNotMatch(text(ProfilePinModal({ ...props, pinStep: 'newPin' })), /WhatsApp|Didit/);
});

test('login explains forgotten-PIN delivery; normal PIN creation does not promise an OTP', () => {
  const { PinStep } = uiLoader()('components/auth/steps/PinStep.tsx');
  const props = { pin: '', pinConfirm: '', pinInputRef: { current: null }, onForgotPin: noop };
  assert.match(text(PinStep({ ...props, mode: 'login' })), /WhatsApp via Didit/);
  assert.doesNotMatch(text(PinStep({ ...props, mode: 'signup' })), /WhatsApp|Didit/);
  const { ResetPinStep } = uiLoader()('components/auth/steps/ResetPinStep.tsx');
  assert.doesNotMatch(text(ResetPinStep({ resetPinStep: 'newPin', otpCode: [], newPin: '', newPinConfirm: '' })), /WhatsApp|Didit/);
});

function authActions(enabled = true) {
  const calls = [], dialogs = [];
  const load = loader({
    '@/config/env': { isSignupOtpVerificationEnabled: enabled },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/slices/authSlice': { saveTokensAndUpdateState: noop },
    './usePinResetFlow': { usePinResetFlow: () => ({ isBusy: false }) },
  });
  const props = {
    phone: '+243000000000', googlePhone: '+243000000000', mode: 'signup',
    setPhone: noop, setGooglePhone: noop, setIsSendingOtp: noop,
    setIsSendingGoogleOtp: noop, setGoogleOtp: noop, setIsGooglePhoneVerified: noop,
    setStep: value => calls.push(['step', value]),
    setGoogleSignupStep: value => calls.push(['socialStep', value]),
    showDialog: value => dialogs.push(value),
    sendPhoneVerificationOtp: payload => ({ unwrap: async () => { calls.push(['send', payload]); } }),
  };
  return { load, props, calls, dialogs };
}

test('phone send and resend use WhatsApp guidance without promising a new code or renewed expiry', async () => {
  const app = authActions();
  const { usePhoneAuthActions } = app.load('hooks/auth/usePhoneAuthActions.ts');
  const actions = usePhoneAuthActions(app.props);
  await actions.handlePhoneSubmit();
  await actions.handlePhoneSubmit();
  assert.deepEqual(app.calls.filter(call => call[0] === 'send'), Array(2).fill(['send', { phone: app.props.phone, context: 'registration' }]));
  for (const dialog of app.dialogs) {
    assert.equal(dialog.variant, 'success');
    assert.match(dialog.message, /WhatsApp/);
    assert.match(dialog.message, /Didit/);
    assert.match(dialog.message, /SMS/);
    assert.doesNotMatch(dialog.message, /nouveau|minutes/);
  }
});

test('social resend guides to WhatsApp and preserves provider throttling errors', async () => {
  const app = authActions();
  const { useSocialPhoneVerification } = app.load('hooks/auth/useSocialPhoneVerification.ts');
  await useSocialPhoneVerification(app.props).handleSendGoogleOtp();
  assert.deepEqual(app.calls.at(-1), ['socialStep', 'otp']);
  await useSocialPhoneVerification(app.props).handleResendGoogleOtp();
  assert.match(app.dialogs.at(-1).message, /WhatsApp.*Didit.*SMS/);
  assert.doesNotMatch(app.dialogs.at(-1).message, /nouveau/);
  app.props.sendPhoneVerificationOtp = () => ({ unwrap: async () => { throw { status: 429, data: { message: 'Trop de tentatives OTP, réessayez plus tard' } }; } });
  await useSocialPhoneVerification(app.props).handleResendGoogleOtp();
  assert.equal(app.dialogs.at(-1).variant, 'danger');
  assert.match(app.dialogs.at(-1).message, /Trop de tentatives/);
});

test('disabled signup OTP does not send a code or announce WhatsApp delivery', async () => {
  const app = authActions(false);
  await app.load('hooks/auth/usePhoneAuthActions.ts').usePhoneAuthActions(app.props).handlePhoneSubmit();
  await app.load('hooks/auth/useSocialPhoneVerification.ts').useSocialPhoneVerification(app.props).handleSendGoogleOtp();
  assert.equal(app.calls.filter(call => call[0] === 'send').length, 0);
  assert.equal(app.dialogs.length, 0);
});

test('Didit send failures are not mislabeled as an incorrect OTP, in auth and profile', () => {
  const load = loader();
  const { getApiErrorMessage } = load('utils/errorHelpers.ts');
  const { getAuthErrorMessage } = load('features/auth/authModel.ts');
  const cases = [
    [429, 'Trop de tentatives OTP, réessayez plus tard', /Trop de tentatives/],
    [429, 'Envoi OTP temporairement refusé', /Trop de tentatives/],
    [503, 'Service OTP temporairement indisponible', /service rencontre un problème/],
    [502, 'Réponse invalide du service OTP', /service rencontre un problème/],
    [400, 'Une autre vérification OTP est déjà en cours pour ce numéro', /déjà en cours/],
    [400, 'Code OTP invalide ou expiré', /code de vérification est invalide ou expiré/],
    [400, 'Invalid one-time password', /code de vérification est invalide ou expiré/],
  ];
  for (const present of [getApiErrorMessage, getAuthErrorMessage]) {
    for (const [status, message, expected] of cases) {
      assert.match(present({ status, data: { message } }, 'Erreur'), expected);
      assert.match(present({ data: { statusCode: status, message: [message] } }, 'Erreur'), expected);
    }
    assert.equal(present({ status: 400, data: { message: 'PIN incorrect' } }, 'Erreur'), 'Le PIN saisi est incorrect.');
  }
});
