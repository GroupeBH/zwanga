const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Image: 'Image', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', ScrollView: 'Scroll', StyleSheet: { create: x => x } };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const hooks = hookHarness(), routes = [], links = [];
  const state = { focused: true, height: 760, fontScale: 1, failNavigation: false, failLegal: false };
  const { AuthWelcome } = loader({ react: { ...React, ...hooks.react },
    'react-native': { ...native, useWindowDimensions: () => ({ height: state.height, fontScale: state.fontScale }),
      Linking: { openURL: async url => { links.push(url); if (state.failLegal) throw Error('Native error'); } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    '@/assets/images/zwanga-transparent.png': 1,
    'expo-router': { useRouter: () => ({ push: route => { if (state.failNavigation) throw Error('Not ready'); routes.push(route); } }) },
  })('features/auth/AuthWelcome.tsx');
  const render = () => hooks.render(() => AuthWelcome());
  t.after(() => hooks.unmount());
  return { render, state, routes, links };
}

for (const mode of ['signup', 'login']) test(`welcome opens ${mode} directly and synchronously locks double taps until returning`, t => {
  const e = fixture(t); const tree = e.render();
  const buttons = nodes(tree).filter(n => n.type === 'Button' && n.props.accessibilityRole === 'button');
  assert.equal(buttons.length, 2); assert.deepEqual(e.routes, []);
  const first = mode === 'signup' ? 0 : 1;
  buttons[first].props.onPress(); buttons[first].props.onPress(); buttons[1 - first].props.onPress();
  assert.deepEqual(e.routes, [{ pathname: '/auth', params: { mode } }]);
  assert.ok(nodes(e.render()).filter(n => n.type === 'Button' && n.props.accessibilityRole === 'button').every(n => n.props.disabled));
  e.state.focused = false; e.render(); e.state.focused = true; e.render();
  assert.ok(nodes(e.render()).filter(n => n.type === 'Button' && n.props.accessibilityRole === 'button').every(n => !n.props.disabled));
});

test('compact and large-text layouts retain location disclosure, legal access and both account actions', t => {
  const e = fixture(t);
  for (const [height, fontScale] of [[568, 1], [760, 1.6], [760, 1]]) {
    Object.assign(e.state, { height, fontScale }); const tree = e.render(), all = nodes(tree);
    assert.match(text(tree), /même en arrière-plan/); assert.match(text(tree), /accepter ou refuser/);
    assert.match(text(tree), /Créer un compte/); assert.match(text(tree), /Se connecter/);
    assert.equal(all.filter(n => n.type === 'Scroll').length, 1);
    assert.equal(all.find(n => n.type === 'Scroll').props.horizontal, undefined);
    assert.ok(all.some(n => n.props.accessibilityRole === 'link'));
    assert.ok(all.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false && n.props.numberOfLines === undefined));
    assert.ok(!/Suivant|Passer/.test(text(tree)), 'no compulsory slide navigation');
  }
});

test('navigation failures allow a retry and legal-link failures use French feedback', async t => {
  const e = fixture(t); e.state.failNavigation = true;
  nodes(e.render()).find(n => n.type === 'Button').props.onPress();
  assert.match(text(e.render()), /Impossible d’ouvrir cet écran/);
  assert.ok(nodes(e.render()).filter(n => n.type === 'Button').every(n => !n.props.disabled));
  e.state.failLegal = true;
  nodes(e.render()).find(n => n.props.accessibilityRole === 'link').props.onPress(); await tick();
  assert.match(text(e.render()), /Impossible d’ouvrir les informations légales/);
  assert.doesNotMatch(text(e.render()), /Native error/);
});

test('a restored session never renders the auth form, except an already active KYC step', () => {
  const model = { isAuthenticated: true, form: { step: 'phone', mode: 'login' }, navigation: {}, registration: {},
    social: {}, phoneActions: {}, profileActions: {} };
  const Screen = loader({ 'react-native': { ...native, Platform: { OS: 'ios' } },
    'expo-router': { Redirect: 'Redirect' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/config/env': {}, '@/components/auth': { AuthHeader: 'Header', KycStep: 'KYC', VehicleModal: 'Modal', authStyles: {} },
    '../hooks/auth/useAuthKeyboardLayout': { useAuthKeyboardLayout: () => ({ keyboardVisible: false, scrollRef: {} }) },
    '../hooks/auth/useAuthController': { useAuthController: () => ({ draftPersistence: { saveFailed: false }, ...model }) },
  })('app/auth.tsx').default;
  assert.equal(Screen().type, 'Redirect'); assert.equal(Screen().props.href, '/(tabs)');
  model.form.step = 'kyc'; model.form.mode = 'signup'; model.form.role = 'driver';
  assert.equal(Screen().type, 'SafeArea'); assert.ok(nodes(Screen()).some(n => n.type === 'KYC'));
});
