const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Image: 'Image', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', ScrollView: 'Scroll', StyleSheet: { create: x => x } };
const tick = () => new Promise(resolve => setImmediate(resolve));
const accountButtons = tree => nodes(tree).filter(n => ['auth-welcome-signup', 'auth-welcome-login'].includes(n.props.testID));

function fixture(t) {
  const hooks = hookHarness(), routes = [], links = [];
  const state = { focused: true, width: 390, height: 844, fontScale: 1, failNavigation: false, failLegal: false };
  const { AuthWelcome } = loader({ react: { ...React, ...hooks.react },
    '@/components/UpdateAnnouncementsChoice': { UpdateAnnouncementsChoice: 'AnnouncementsChoice' },
    '@/components/GuestUpdateNotice': { GuestUpdateNotice: 'GuestUpdateNotice' },
    'react-native': { ...native, useWindowDimensions: () => ({ width: state.width, height: state.height, fontScale: state.fontScale }),
      Linking: { openURL: async url => { links.push(url); if (state.failLegal) throw Error('Native error'); } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
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
  const buttons = accountButtons(tree);
  assert.equal(buttons.length, 2); assert.deepEqual(e.routes, []);
  const first = mode === 'signup' ? 0 : 1;
  buttons[first].props.onPress(); buttons[first].props.onPress(); buttons[1 - first].props.onPress();
  assert.deepEqual(e.routes, [{ pathname: '/auth', params: { mode } }]);
  assert.ok(accountButtons(e.render()).every(n => n.props.disabled));
  assert.equal(accountButtons(e.render())[first].props.accessibilityState.busy, true);
  assert.ok(accountButtons(e.render())[first].props.accessibilityLabel);
  e.state.focused = false; e.render(); e.state.focused = true; e.render();
  assert.ok(accountButtons(e.render()).every(n => !n.props.disabled));
});

test('compact and large-text layouts keep all benefits, disclosure access and account actions inside one scroll', t => {
  const e = fixture(t);
  for (const [width, height, fontScale] of [[320, 568, 1], [390, 844, 1.6], [390, 844, 1], [844, 390, 1], [768, 1024, 1]]) {
    Object.assign(e.state, { width, height, fontScale }); const tree = e.render(), all = nodes(tree);
    assert.match(text(tree), /contrôle de votre localisation/);
    for (const benefit of ['Trajets près de vous', 'Profils vérifiés', 'Électronique, jetons ou cash', 'Messagerie intégrée']) assert.ok(text(tree).includes(benefit));
    assert.match(text(tree), /Créer un compte/); assert.match(text(tree), /Se connecter/);
    assert.equal(all.filter(n => n.type === 'Scroll').length, 1);
    assert.equal(all.find(n => n.type === 'Scroll').props.horizontal, undefined);
    assert.equal(accountButtons(all.find(n => n.type === 'Scroll')).length, 2, 'actions remain reachable by scrolling with large fonts');
    const benefits = all.find(n => n.props.testID === 'auth-welcome-benefits');
    assert.equal(benefits.props.children.length, 4);
    assert.equal(Boolean(benefits.props.children[0].props.style[1]), width < 350 || fontScale > 1.2);
    assert.ok(all.some(n => n.props.accessibilityRole === 'link'));
    assert.ok(all.filter(n => n.type === 'Text').every(n => n.props.allowFontScaling !== false && n.props.numberOfLines === undefined));
    assert.ok(!/Suivant|Passer/.test(text(tree)), 'no compulsory slide navigation');
  }
});

test('location explanation expands inline without asking permissions or navigating', t => {
  const e = fixture(t);
  const location = tree => nodes(tree).find(n => n.props.testID === 'auth-welcome-location');
  assert.equal(location(e.render()).props.accessibilityState.expanded, false);
  location(e.render()).props.onPress();
  const expanded = e.render();
  assert.equal(location(expanded).props.accessibilityState.expanded, true);
  assert.match(text(expanded), /même en arrière-plan/);
  assert.match(text(expanded), /conducteurs disponibles/);
  assert.match(text(expanded), /accepter ou refuser/);
  assert.match(text(expanded), /désactiver le suivi en veille/);
  assert.doesNotMatch(text(expanded), /n’est partagée que pendant/);
  assert.deepEqual(e.routes, []); assert.deepEqual(e.links, []);
  location(expanded).props.onPress();
  assert.equal(location(e.render()).props.accessibilityState.expanded, false);
});

test('welcome hero stays a non-interactive, bounded illustration with one accessible description', () => {
  const { AuthWelcomeHero } = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    '@/assets/images/zwanga-transparent.png': 1,
  })('features/auth/AuthWelcomeHero.tsx');
  for (const width of [280, 390, 768]) {
    const tree = AuthWelcomeHero({ width, height: 210, topInset: 24 });
    assert.equal(tree.props.accessibilityRole, 'image');
    assert.match(tree.props.accessibilityLabel, /Illustration/);
    assert.ok(nodes(tree).some(n => n.props.pointerEvents === 'none' && n.props.importantForAccessibility === 'no-hide-descendants'));
    assert.ok(nodes(tree).some(n => n.type === 'Image' && n.props.source === 1));
    const scene = nodes(tree).find(n => Array.isArray(n.props.style) && n.props.style[1]?.transform);
    const scale = scene.props.style[1].transform[0].scale;
    assert.ok(scale * 390 <= width && scale * 318 <= 210);
    assert.ok(nodes(tree).every(n => !n.props.onPress), 'illustration cannot open a fake booking');
  }
});

test('welcome action and text colors retain at least 4.5:1 contrast', () => {
  const { WELCOME_COLORS: c } = loader({ 'react-native': native })('features/auth/authWelcomeStyles.ts');
  const luminance = hex => hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
  for (const [foreground, background] of [[c.white, c.orange], [c.orangeText, c.white], [c.ink, c.surface], [c.muted, c.white]]) {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5, `${foreground} on ${background}`);
  }
});

test('unfocused welcome cannot navigate and legal access keeps the existing destination', async t => {
  const e = fixture(t); e.state.focused = false;
  accountButtons(e.render())[0].props.onPress(); assert.deepEqual(e.routes, []);
  nodes(e.render()).find(n => n.props.accessibilityRole === 'link').props.onPress(); await tick();
  assert.deepEqual(e.links, ['https://zwanga-admin.onrender.com/']);
});

test('navigation failures allow a retry and legal-link failures use French feedback', async t => {
  const e = fixture(t); e.state.failNavigation = true;
  accountButtons(e.render())[0].props.onPress();
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
