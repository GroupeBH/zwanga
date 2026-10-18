const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const value = 'https://invite.example.test/synthetic?referralToken=synthetic-token-1234';
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('')
  : React.isValidElement(tree) ? text(tree.props.children) : typeof tree === 'string' ? tree : '';

function fixture(os = 'android') {
  const hooks = hookHarness(), actions = [];
  const app = { complete: null, fail: false, version: 1 };
  const native = { ActivityIndicator: 'Spinner', View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
    StyleSheet: { create: value => value }, Platform: { OS: os }, useWindowDimensions: () => ({ width: 320, height: 568 }),
    AccessibilityInfo: { isReduceMotionEnabled: async () => true },
    Animated: { View: 'AnimatedView', Value: class { stopAnimation() {} } },
  };
  const { ReferralQrModal } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-qrcode-svg': 'QRCode', '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/services/tokenSession': { getTokenSessionVersion: () => app.version },
    '@/utils/shareReferralLink': { copyReferralLink: async link => { actions.push(['copy', link]); }, shareReferralLink: async link => { actions.push(['link', link]); } },
    '@/utils/shareReferralQr': { shareReferralQr: async (svg, link, current) => {
      actions.push(['qr', svg, link, current]);
      if (app.fail) throw new Error('Internal native error in English');
      return new Promise(resolve => { app.complete = resolve; });
    } },
  })('features/referrals/ReferralQrModal.tsx');
  const props = { state: { phase: 'ready', link: value, code: 'DEMO' }, onClose: () => actions.push(['close']), onRetry: () => actions.push(['retry']) };
  return Object.assign(app, { hooks, props, actions, render: () => hooks.render(() => ReferralQrModal(props)),
    button: (tree, label) => nodes(tree).find(n => n.type === 'Button' && text(n) === label) });
}

test('small-screen QR keeps the exact URL, quiet zone, high contrast and accessible alternatives', () => {
  const app = fixture(), tree = app.render();
  const qr = nodes(tree).find(n => n.type === 'QRCode');
  assert.equal(qr.props.value, value);
  assert.equal(qr.props.backgroundColor, '#FFFFFF');
  assert.equal(qr.props.color, '#000000');
  assert.equal(qr.props.ecl, 'M');
  assert.ok(qr.props.quietZone >= qr.props.size * 4 / 21);
  assert.equal(qr.props.logo, undefined);
  assert.ok(app.button(tree, 'Partager le QR code'));
  assert.ok(app.button(tree, 'Copier le lien d’invitation'));
  assert.ok(nodes(tree).some(n => n.props.accessibilityRole === 'image'));
  nodes(tree).find(n => n.props.accessibilityLabel === 'Fermer le QR code').props.onPress();
  assert.deepEqual(app.actions, [['close']]);
  app.hooks.unmount();
});

test('two taps share once and loading remains locked until the native sheet finishes', async () => {
  const app = fixture(), tree = app.render();
  nodes(tree).find(n => n.type === 'QRCode').props.getRef({ toDataURL() {} });
  const share = app.button(tree, 'Partager le QR code');
  share.props.onPress(); share.props.onPress();
  assert.equal(app.actions.length, 1);
  assert.equal(app.actions[0][2], value);
  assert.equal(app.button(app.render(), 'Préparation…').props.disabled, true);
  app.complete(true); await tick();
  assert.equal(app.button(app.render(), 'Partager le QR code').props.disabled, false);
  app.hooks.unmount();
});

test('native failures show French feedback while copy remains available', async () => {
  const app = fixture(); app.fail = true;
  let tree = app.render();
  nodes(tree).find(n => n.type === 'QRCode').props.getRef({ toDataURL() {} });
  app.button(tree, 'Partager le QR code').props.onPress(); await tick();
  tree = app.render();
  assert.match(text(tree), /Partage indisponible/);
  assert.doesNotMatch(text(tree), /Internal native/);
  app.button(tree, 'Copier le lien d’invitation').props.onPress(); await tick();
  assert.deepEqual(app.actions.at(-1), ['copy', value]);
  assert.match(text(app.render()), /Lien copié/);
  app.hooks.unmount();
});

test('loading/error states cannot export an empty QR, with close and retry still available', () => {
  const app = fixture();
  for (const phase of ['loading', 'error']) {
    app.props.state = { phase };
    const tree = app.render();
    assert.equal(nodes(tree).some(n => n.type === 'QRCode'), false);
    assert.equal(app.button(tree, 'Partager le QR code'), undefined);
    if (phase === 'error') app.button(tree, 'Réessayer').props.onPress();
  }
  assert.deepEqual(app.actions, [['retry']]);
  app.hooks.unmount();
});

test('web uses the existing link share instead of a native-file API', async () => {
  const app = fixture('web');
  app.button(app.render(), 'Partager le lien').props.onPress(); await tick();
  assert.deepEqual(app.actions, [['link', value]]);
  app.hooks.unmount();
});

test('closing the sheet or switching session invalidates a pending image export', async () => {
  for (const boundary of ['close', 'account']) {
    const app = fixture(), tree = app.render();
    nodes(tree).find(n => n.type === 'QRCode').props.getRef({ toDataURL() {} });
    app.button(tree, 'Partager le QR code').props.onPress();
    const stillCurrent = app.actions[0][3];
    assert.equal(stillCurrent(), true);
    if (boundary === 'close') app.hooks.unmount(); else app.version++;
    assert.equal(stillCurrent(), false);
    app.complete(false); await tick(); app.hooks.unmount();
  }
});
