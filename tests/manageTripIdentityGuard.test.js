const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const text = tree => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children).join(' ');

function fixture() {
  const hooks = hookHarness(), queries = [], refreshes = [], routes = [];
  const env = { userId: 'owner', active: true, online: true,
    profile: undefined, kycDocument: undefined, fetching: false, loading: false };
  const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
    ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
  const load = loader({ react: hooks.react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'Safe' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useRouter: () => ({ push: path => routes.push(path), replace: path => routes.push(path) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => env.active },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ kycDocument: env.kycDocument }) },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: env.userId, status: 'active', identityVerified: true } },
      zwangaApi: { config: { online: env.online } } }) },
    '@/store/api/userApi': { useGetProfileSummaryQuery: (_arg, options) => {
      queries.push(options);
      return { currentData: options.skip ? undefined : env.profile, isFetching: env.fetching,
        isLoading: env.loading, refetch: async () => {
          assert.equal(options.skip, false, 'never refetch a skipped query');
          refreshes.push(env.userId); return { data: env.profile };
        } };
    } },
  });
  const { ManageTripIdentityGuard } = load('features/manage-trip/ManageTripIdentityGuard.tsx');
  const child = { type: 'ManageController', props: {} };
  return Object.assign(env, { hooks, load, queries, refreshes, routes, child,
    render: () => hooks.render(() => ManageTripIdentityGuard({ children: child })) });
}

test('missing or loading server identity never becomes a demand to redo KYC', () => {
  const env = fixture();
  let tree = env.render();
  assert.match(text(tree), /Profil indisponible.*Vérifiez Internet.*Réessayer/);
  assert.doesNotMatch(text(tree), /Identité à vérifier|Vérifier mon identité/);
  assert.ok(!nodes(tree).includes(env.child), 'driver controller does not mount before the gate');
  env.fetching = true; env.loading = true; tree = env.render();
  assert.match(text(tree), /Chargement du profil/);
  assert.equal(nodes(tree).find(node => node.type === 'Button').props.disabled, true);
  env.hooks.unmount();
});

test('known unverified and pending server states offer the right action without granting access', () => {
  for (const identity of [null, { status: 'rejected' }, { status: 'pending' }]) {
    const env = fixture(); env.profile = { user: { id: 'owner' }, identity };
    const tree = env.render();
    assert.ok(!nodes(tree).includes(env.child));
    if (identity?.status === 'pending') {
      assert.match(text(tree), /Vérification en cours.*Aucun document à renvoyer/);
      assert.doesNotMatch(text(tree), /Vérifier mon identité/);
    } else {
      assert.match(text(tree), /Identité à vérifier.*Vérifier mon identité/);
      nodes(tree).find(node => node.type === 'Button').props.onPress();
      assert.deepEqual(env.routes, ['/profile']);
    }
    env.hooks.unmount();
  }
});

test('manage uses the same account-bound server profileState as Profile, not stale auth flags', () => {
  const env = fixture();
  env.profile = { user: { id: 'owner' }, identity: null,
    profileState: { version: 1, userId: 'owner', identity: { status: 'approved', rejectionReason: null },
      driver: { status: 'active', nextAction: 'none', canPublish: true, activeVehicleCount: 1, requested: true } } };
  assert.equal(env.render().props.children, env.child);
  env.profile = { ...env.profile, profileState: { ...env.profile.profileState,
    identity: { status: 'rejected', rejectionReason: null } } };
  const tree = env.render();
  assert.ok(!nodes(tree).includes(env.child));
  assert.match(text(tree), /Identité à vérifier/);
  env.hooks.unmount();
});

test('last server approval survives offline display but cannot cross accounts', () => {
  const env = fixture(); env.profile = { user: { id: 'owner' }, identity: { status: 'approved' } };
  assert.equal(env.render().props.children, env.child);
  env.online = false; assert.equal(env.render().props.children, env.child);
  assert.equal(env.queries.at(-1).skip, true);
  env.userId = 'other-owner'; let tree = env.render();
  assert.ok(!nodes(tree).includes(env.child));
  assert.match(text(tree), /Profil indisponible/);
  env.online = true; tree = env.render();
  assert.ok(!nodes(tree).includes(env.child), 'foreign currentData is also rejected');
  env.hooks.unmount();
});

test('an account-bound server KYC approval preserves first offline return, but never overrides a known refusal', () => {
  const env = fixture(); env.online = false;
  env.kycDocument = { userId: 'owner', status: 'approved' };
  assert.equal(env.render().props.children, env.child);
  env.userId = 'other-owner'; assert.ok(!nodes(env.render()).includes(env.child));
  env.userId = 'owner'; env.online = true;
  env.profile = { user: { id: 'owner' }, identity: { status: 'rejected' } };
  assert.ok(!nodes(env.render()).includes(env.child));
  env.profile = undefined; env.kycDocument = { status: 'approved' };
  // The known rejection remains cached, even if a document lacks account identity.
  assert.ok(!nodes(env.render()).includes(env.child)); env.hooks.unmount();
});

test('retry and Home remain usable without a modal and late retries stop after blur or logout', async () => {
  const env = fixture();
  const tree = env.render(), buttons = nodes(tree).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(node => node.props.accessibilityRole === 'button'));
  const retry = buttons[0].props.onPress;
  retry(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(env.refreshes, ['owner']);
  buttons[1].props.onPress(); assert.deepEqual(env.routes, ['/(tabs)']);
  env.active = false; env.render(); retry(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.queries.at(-1).skip, true); assert.equal(env.refreshes.length, 1);
  env.active = true; env.userId = 'other-owner'; env.render(); retry();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(env.refreshes.length, 1);
  env.hooks.unmount(); retry(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.refreshes.length, 1);
});

test('status buttons do not grow vertically and allow large text to increase their minimum height', () => {
  const env = fixture(); const tree = env.render();
  const buttonStyle = nodes(tree).find(node => node.type === 'Button').props.style[0];
  assert.equal(buttonStyle.minHeight, 52);
  assert.equal(buttonStyle.flex, undefined); assert.equal(buttonStyle.flexGrow, undefined);
  assert.equal(buttonStyle.height, undefined); assert.equal(buttonStyle.width, '100%');
  const scroll = nodes(tree).find(node => node.type === 'Scroll');
  assert.equal(scroll.props.contentContainerStyle.flexGrow, 1);
  const { styles } = env.load('features/screen-styles/app/trip/manage/detail/index.ts');
  assert.equal(styles.primaryButton.flex, 1, 'horizontal footer remains unchanged');
  assert.equal(styles.standaloneButton.flex, 0);
  assert.equal(styles.standaloneButton.height, 'auto'); env.hooks.unmount();
});

test('ownership guard stays outside identity guard and driver controller', () => {
  const source = fs.readFileSync('app/trip/manage/[id].tsx', 'utf8');
  assert.match(source, /<DriverTripAccessGuard><ManageTripIdentityGuard><OwnerManageTripScreen/);
  assert.doesNotMatch(source, /if \(!model\.state\.isIdentityVerified\)/);
});
