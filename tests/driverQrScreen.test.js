const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const id = '11111111-1111-4111-8111-111111111111';
const link = `https://api.example.test/api/v1/public/drivers/${id}/card`;
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : typeof tree === 'string' ? tree : '';

function fixture(os = 'android') {
  const hooks = hookHarness(), actions = [];
  const query = { currentData: { id, firstName: 'Conducteur', lastName: 'Démo',
    credits: [{ assetKind: 'phone', status: 'active', dueMinor: 987654321 }, { assetKind: 'vehicle', status: 'settled' }] },
    isError: false, isFetching: false, refetch: () => { actions.push(['retry']); } };
  const state = { version: 1, finish: null, fail: false };
  const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', RefreshControl: 'Refresh',
    StyleSheet: { create: value => value }, Platform: { OS: os }, useWindowDimensions: () => ({ width: 320, height: 568 }),
    Linking: { openURL: async url => { actions.push(['preview', url]); } }, Share: { share: async data => { actions.push(['link', data.message]); } } };
  const load = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    'react-native-qrcode-svg': 'QR', '@/config/env': { API_BASE_URL: 'https://api.example.test/api/v1' },
    '@/store/api/publicDriverApi': { useGetPublicDriverCardQuery: (arg, options) => { state.options = options; state.id = arg; return query; } },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    'expo-clipboard': { setStringAsync: async value => { actions.push(['copy', value]); } },
    '@/utils/shareDriverQr': { shareDriverQr: async (svg, url, current) => {
      actions.push(['qr', url, current]);
      if (state.fail) throw new Error('private-native-error');
      return new Promise(resolve => { state.finish = resolve; });
    } },
  });
  const { DriverQrContent } = load('features/driver-qr/DriverQrContent.tsx');
  return Object.assign(state, { hooks, actions, query, render: () => hooks.render(() => DriverQrContent({ driverId: id })),
    button: (tree, label) => nodes(tree).find(n => n.type === 'Button' && text(n) === label) });
}

for (const os of ['android', 'ios']) test(`${os}: readable QR and public-only credit status in a scrollable screen`, () => {
  const app = fixture(os), tree = app.render();
  const qr = nodes(tree).find(n => n.type === 'QR');
  assert.equal(qr.props.value, link);
  assert.equal(qr.props.backgroundColor, '#FFFFFF');
  assert.equal(qr.props.color, '#000000');
  assert.ok(qr.props.quietZone >= 32);
  assert.ok(qr.props.size + 2 * qr.props.quietZone <= 320 - 48);
  assert.match(text(tree), /TéléphoneEn coursVéhiculeSoldé/);
  assert.doesNotMatch(text(tree), /987654321/);
  assert.ok(app.options.refetchOnMountOrArgChange);
  assert.ok(nodes(tree).some(n => n.props.accessibilityRole === 'image'));
  assert.ok(app.button(tree, 'Voir ma fiche publique'));
  app.hooks.unmount();
});

test('loading, failure and another account snapshot never display a stale driver QR', () => {
  const app = fixture();
  for (const changes of [{ isFetching: true }, { isError: true }, { currentData: { id: 'another-account' } }]) {
    const initial = { ...app.query }; Object.assign(app.query, changes);
    assert.equal(nodes(app.render()).some(n => n.type === 'QR'), false);
    Object.assign(app.query, initial);
  }
  app.query.isError = true;
  app.button(app.render(), 'Réessayer').props.onPress();
  assert.deepEqual(app.actions, [['retry']]);
  app.hooks.unmount();
});

test('double sharing is locked and an account change/unmount invalidates an export', async () => {
  for (const boundary of ['account', 'unmount']) {
    const app = fixture(), tree = app.render();
    nodes(tree).find(n => n.type === 'QR').props.getRef({ toDataURL() {} });
    const share = app.button(tree, 'Partager mon QR');
    share.props.onPress(); share.props.onPress();
    assert.equal(app.actions.length, 1);
    assert.equal(app.actions[0][1], link);
    assert.equal(app.actions[0][2](), true);
    assert.equal(app.button(app.render(), 'Patientez…').props.disabled, true);
    if (boundary === 'account') app.version++; else app.hooks.unmount();
    assert.equal(app.actions[0][2](), false);
    app.finish(false); await tick(); app.hooks.unmount();
  }
});

test('native share failure stays recoverable, and QR generation error defers state updates', async () => {
  const app = fixture(); app.fail = true;
  let tree = app.render(); const qr = nodes(tree).find(n => n.type === 'QR');
  qr.props.getRef({ toDataURL() {} });
  app.button(tree, 'Partager mon QR').props.onPress(); await tick();
  assert.match(text(app.render()), /Partage indisponible/);
  assert.doesNotMatch(text(app.render()), /private-native-error/);
  qr.props.onError();
  assert.ok(nodes(app.render()).some(n => n.type === 'QR'));
  await tick(); tree = app.render();
  assert.equal(nodes(tree).some(n => n.type === 'QR'), false);
  assert.ok(app.button(tree, 'Partager le lien'));
  app.button(tree, 'Voir ma fiche publique').props.onPress(); await tick();
  assert.deepEqual(app.actions.at(-1), ['preview', link]);
  app.hooks.unmount();
});

test('web shares the public URL instead of opening native file modules', async () => {
  const app = fixture('web'); app.button(app.render(), 'Partager le lien').props.onPress(); await tick();
  assert.deepEqual(app.actions, [['link', `Ma fiche conducteur Zwanga : ${link}`]]);
  app.hooks.unmount();
});

for (const os of ['android', 'ios']) test(`${os}: QR shortcut is driver-only in the profile header, without a duplicate menu entry`, () => {
  const routes = [];
  const load = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
      Platform: { OS: os }, StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, './ProfileStoreReviewButton': { ProfileStoreReviewButton: 'Review' },
    './ProfileDriverAvailabilityEntry': { ProfileDriverAvailabilityEntry: 'Availability' },
  });
  const { ProfileMenu } = load('components/profile/ProfileMenu.tsx');
  const { ProfileHeader } = load('components/profile/ProfileHeader.tsx');
  const { getProfileStatus } = load('features/profile/profileStatusModel.ts');
  const router = { push: route => routes.push(route) };
  for (const role of ['driver', 'both', 'passenger']) {
    // The server role, not legacy flags or KYC, still controls access.
    const profile = getProfileStatus({ user: { id, role, isDriver: role === 'passenger' } }, id);
    const tree = ProfileHeader({ ...profile, router });
    const headerTop = tree.props.children[0];
    const qrButtons = nodes(headerTop).filter(n => n.props.accessibilityLabel === 'Mon QR conducteur');
    assert.equal(qrButtons.length, role === 'passenger' ? 0 : 1);
    if (qrButtons.length) {
      const button = qrButtons[0];
      assert.equal(button.props.accessibilityRole, 'button');
      assert.equal(text(button), 'Mon QR');
      assert.ok(nodes(button).some(n => n.type === 'Icon' && n.props.name === 'qr-code-outline'));
      assert.ok(button.props.style.minHeight >= 44);
      button.props.onPress();
      assert.equal(routes.at(-1), '/driver-qr', 'public driver QR, not the referral QR');
    }
    nodes(headerTop).find(n => n.props.accessibilityLabel === 'Ouvrir les paramètres').props.onPress();
    assert.equal(routes.at(-1), '/settings');
    const menu = ProfileMenu({ isDriver: profile.isDriver, router, menuItems: [] });
    assert.equal(nodes(menu).some(n => n.props.accessibilityLabel === 'Mon QR conducteur'), false);
  }
});
