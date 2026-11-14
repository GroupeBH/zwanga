const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const noop = () => {};
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', Image: 'Image',
  ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
const animation = { springify: noop, duration: noop };
function loadUI(os = 'android', enabled = true) {
  return loader({ 'react-native': { ...native, Platform: { OS: os } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/assets/images/google.png': 1,
    '@/components/GenderSelector': { GenderSelector: 'Gender' },
    '@/config/env': { isSignupOtpVerificationEnabled: enabled },
    '@/utils/reanimated': { default: { View: 'View' }, FadeInDown: animation, FadeOutUp: animation, FadeIn: animation, FadeOut: animation },
  });
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : React.isValidElement(tree) ? text(tree.props.children) : '';
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

for (const os of ['android', 'ios']) {
  test(`${os}: phone entry keeps one field, clear OTP action, social alternatives and pending locks`, () => {
    for (const enabled of [true, false]) {
      const { PhoneStep } = loadUI(os, enabled)('components/auth/steps/PhoneStep.tsx');
      const calls = [];
      const props = { mode: 'signup', phone: '+243000000000', isAppleAvailable: true, isLoading: false,
        onSubmit: () => calls.push('phone'), onGoogleAuth: () => calls.push('google'), onAppleAuth: () => calls.push('apple') };
      const tree = PhoneStep(props), all = nodes(tree);
      assert.equal(all.filter(n => n.type === 'Input').length, 1);
      assert.equal(flatten(tree.props.style).flex, 0);
      assert.doesNotMatch(text(tree), /mobilité simplifiée|Bon retour/);
      assert.match(text(tree), /Conditions d'Utilisation/);
      assert.equal(text(tree).includes('Recevoir le code'), enabled);
      const buttons = all.filter(n => n.type === 'Button');
      assert.equal(buttons.length, os === 'ios' ? 3 : 2);
      for (const button of buttons) {
        assert.ok(flatten(button.props.style).minHeight >= 48);
        assert.equal(flatten(button.props.style).height, 'auto');
        button.props.onPress();
      }
      assert.deepEqual(calls, os === 'ios' ? ['phone', 'google', 'apple'] : ['phone', 'google']);
      for (const busy of [{ isLoading: true }, { isGoogleLoading: true }, { isAppleLoading: true }]) {
        const pending = nodes(PhoneStep({ ...props, ...busy }));
        assert.equal(pending.find(n => n.type === 'Input').props.editable, false);
        assert.ok(pending.filter(n => n.type === 'Button').every(n => n.props.disabled));
      }
      assert.doesNotMatch(text(PhoneStep({ ...props, mode: 'login' })), /Recevoir le code/);
    }
  });
}

test('social phone entry prevents editing/cancelling during SMS submission', () => {
  const { GooglePhoneStep } = loadUI()('components/auth/steps/GooglePhoneStep.tsx');
  const calls = [];
  const props = { phone: '+243000000000', onSubmit: () => calls.push('send'), onCancel: () => calls.push('cancel') };
  for (const provider of ['google', 'apple']) {
    const tree = GooglePhoneStep({ ...props, provider, isLoading: true });
    assert.match(text(tree), provider === 'apple' ? /Apple/ : /Google/);
    assert.ok(nodes(tree).filter(n => n.type === 'Button').every(n => n.props.disabled));
    assert.equal(nodes(tree).find(n => n.type === 'Input').props.editable, false);
  }
  nodes(GooglePhoneStep(props)).filter(n => n.type === 'Button').forEach(n => n.props.onPress());
  assert.deepEqual(calls, ['send', 'cancel']);
});

test('profile tells passenger and driver what happens next without a false last-step promise', () => {
  const { ProfileStep } = loadUI()('components/auth/steps/ProfileStep.tsx');
  for (const role of ['driver', 'passenger']) {
    const tree = ProfileStep({ role });
    assert.doesNotMatch(text(tree), /DERNIÈRE ÉTAPE/);
    assert.match(text(tree), role === 'driver' ? /Continuer vers la vérification/ : /Créer mon compte/);
    assert.equal(text(tree).includes('Votre véhicule'), role === 'driver');
    assert.equal(nodes(tree).filter(n => n.type === 'Input').length, 2, 'legal names remain editable');
    assert.ok(nodes(tree).some(n => n.type?.name === 'SignupAnnouncementsCheckbox'));
  }
});

test('KYC remains explicit and actionable without promotional benefit panels', () => {
  const { KycStep } = loadUI()('components/auth/steps/KycStep.tsx');
  const calls = [];
  const tree = KycStep({ firstName: 'Test', lastName: 'Example', onFinish: () => calls.push('kyc'), onEditIdentity: () => calls.push('edit') });
  assert.match(text(tree), /pièce d’identité.*Didit/);
  assert.match(text(tree), /Test.*Example/);
  assert.doesNotMatch(text(tree), /rapide et guidé|confiance des membres/);
  assert.match(text(tree), /Vérifier mon identité/);
  const heading = nodes(tree).find(n => n.type?.name === 'AuthCodeHeading');
  assert.match(heading.props.subtitle, /Obligatoire/);
  nodes(tree).filter(n => n.type === 'Button').forEach(n => n.props.onPress());
  assert.deepEqual(calls, ['edit', 'kyc']);
});
