const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join(' ') : React.isValidElement(value) ? text(value.props.children) : typeof value === 'string' ? value : '';
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

function fixture(t, os = 'android') {
  const hooks = hookHarness(), calls = [], links = [];
  const flow = { code: ['', '', '', '', ''], sent: false, confirmed: false, busy: false, error: '', cooldown: 0,
    setCode: code => { flow.code = code; }, ...Object.fromEntries(['send', 'verify', 'retryConfirmation'].map(name => [name, async () => calls.push(name)])) };
  const io = { mailFails: false, logout: async () => {} };
  const components = loader({ react: hooks.react,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native': { ActivityIndicator: 'Spinner', KeyboardAvoidingView: 'Avoider', ScrollView: 'Scroll',
      Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View', StyleSheet: { create: value => value },
      Platform: { OS: os }, Linking: { openURL: async url => { links.push(url); if (io.mailFails) throw Error('No mail app'); } } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    './OtpCodeInput': { OtpCodeInput: 'Otp' },
    '@/hooks/auth/useAccountPhoneOtp': { useAccountPhoneOtp: () => flow },
    '@/components/support/supportData': { DEFAULT_SUPPORT_EMAIL: 'help@example.invalid' },
  })('components/auth/AccountPhoneVerification.tsx');
  const form = () => hooks.render(() => components.AccountPhoneVerification({ phone: '+243000000000', refreshProfile: async () => {} }));
  const shell = () => hooks.render(() => components.PhoneVerificationShell({ children: React.createElement('Form'), onLogout: () => io.logout() }));
  t.after(() => hooks.unmount());
  return { flow, io, calls, links, form, shell };
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && text(node).trim() === label);

test('verification starts with one clear reason, the account phone and one explicit SMS action', async t => {
  const f = fixture(t), tree = f.form();
  assert.match(text(tree), /Pour protéger votre compte/);
  assert.match(text(tree), /\+243000000000/);
  assert.ok(text(tree).split(/\s+/).length < 35, 'no wall of text before sending');
  assert.equal(nodes(tree).filter(node => node.type === 'Button').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'Otp').length, 0);
  assert.deepEqual(f.calls, [], 'opening the modal must not send SMS');
  button(tree, 'Recevoir le code').props.onPress(); await Promise.resolve();
  assert.deepEqual(f.calls, ['send']);
});

test('code entry, busy and cooldown states keep the existing OTP guards and expose the right action', t => {
  const f = fixture(t); f.flow.sent = true; f.flow.cooldown = 25;
  let tree = f.form();
  assert.match(text(tree), /Entrez le code SMS/);
  assert.equal(button(tree, 'Confirmer le code').props.disabled, true);
  assert.equal(button(tree, 'Renvoyer dans 25 s').props.disabled, true);
  const otp = nodes(tree).find(node => node.type === 'Otp');
  otp.props.onChange(['1', '2', '3', '4', '5']); tree = f.form();
  assert.equal(button(tree, 'Confirmer le code').props.disabled, false);
  button(tree, 'Confirmer le code').props.onPress();
  assert.deepEqual(f.calls, ['verify']);
  f.flow.busy = true; tree = f.form();
  assert.equal(button(tree, 'Vérification…').props.accessibilityState.busy, true);
  assert.equal(nodes(tree).find(node => node.type === 'Otp').props.disabled, true);
  f.flow.busy = false; f.flow.cooldown = 0;
  button(f.form(), 'Renvoyer le code').props.onPress(); assert.deepEqual(f.calls, ['verify', 'send']);
});

test('network failure preserves retry feedback; a verified code retries profile confirmation only', t => {
  const f = fixture(t); f.flow.cooldown = 30; f.flow.error = 'Connexion indisponible';
  let tree = f.form();
  assert.equal(button(tree, 'Réessayer dans 30 s').props.disabled, true);
  assert.equal(nodes(tree).find(node => node.props.accessibilityRole === 'alert').props.children, f.flow.error);
  f.flow.sent = true; f.flow.confirmed = true; tree = f.form();
  assert.match(text(tree), /Code validé/);
  assert.equal(nodes(tree).filter(node => node.type === 'Otp').length, 0);
  button(tree, 'Continuer').props.onPress(); assert.deepEqual(f.calls, ['retryConfirmation']);
});

for (const os of ['android', 'ios']) test(`${os}: compact panel scrolls for keyboard/large text and keeps help optional`, async t => {
  const f = fixture(t, os); let tree = f.shell();
  const scroll = nodes(tree).find(node => node.type === 'Scroll');
  const avoider = nodes(tree).find(node => node.type === 'Avoider');
  const panel = nodes(tree).find(node => node.props.accessibilityViewIsModal);
  assert.equal(avoider.props.behavior, os === 'ios' ? 'padding' : 'height');
  assert.equal(flatten(scroll.props.contentContainerStyle).justifyContent, 'center');
  assert.notEqual(scroll.props.scrollEnabled, false);
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(flatten(panel.props.style).maxWidth, 440);
  assert.equal(flatten(panel.props.style).height, undefined, 'content determines height, not a full-screen block');
  assert.equal(flatten(panel.props.style).flex, undefined);
  assert.doesNotMatch(text(tree), /SMS non reçu/);
  assert.deepEqual(f.links, []);
  button(tree, 'Besoin d’aide ?').props.onPress(); tree = f.shell();
  assert.equal(button(tree, 'Besoin d’aide ?').props.accessibilityState.expanded, true);
  assert.match(text(tree), /SMS non reçu ou numéro inaccessible/);
  f.io.mailFails = true;
  nodes(tree).find(node => node.props.accessibilityRole === 'link').props.onPress();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(f.links, ['mailto:help@example.invalid']);
  assert.match(text(f.shell()), /Écrivez à help@example.invalid/);
});

test('logout remains available and cannot be submitted twice while pending', async t => {
  const f = fixture(t); let finish, count = 0;
  f.io.logout = () => { count++; return new Promise(resolve => { finish = resolve; }); };
  const oldButton = button(f.shell(), 'Se déconnecter');
  oldButton.props.onPress(); oldButton.props.onPress();
  assert.equal(count, 1);
  assert.equal(button(f.shell(), 'Déconnexion…').props.disabled, true);
  finish(); await Promise.resolve(); await Promise.resolve();
  assert.equal(button(f.shell(), 'Se déconnecter').props.disabled, false);
});
