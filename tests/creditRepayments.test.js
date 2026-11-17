const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children)];

function fixture() {
  const hooks = hookHarness(), routes = [], reads = [];
  let active = true, session = 1, retries = 0;
  const state = { auth: { user: { id: 'driver' } }, zwangaApi: { config: { online: true } } };
  const query = { currentData: { items: [] }, refetch: async () => { retries++; return {}; } };
  const load = loader({ react: hooks.react,
    'react-native': { Text: 'Text', View: 'View', TouchableOpacity: 'Press', ActivityIndicator: 'Loading' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push: href => routes.push(href) } },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/store/hooks': { useAppSelector: select => select(state) },
    '@/store/selectors': { selectUser: s => s.auth.user },
    '@/store/api/assetCreditApi': { useGetAssetCreditsQuery: (_arg, options) => { reads.push(options); return query; } },
  });
  const Screen = load('app/services/credit/repayments.tsx').default;
  return { query, state, routes, reads, load, render: () => nodes(hooks.render(Screen)),
    background: () => { active = false; }, logout: () => { session++; state.auth.user = null; },
    retries: () => retries, unmount: hooks.unmount };
}
const item = (id, status, kind = 'phone') => ({ id, status, assetKind: kind, label: id,
  principalMinor: '100000', paidMinor: status === 'settled' ? '100000' : '20000', dueMinor: '0' });

test('repayments start with active contracts, then delivery and offers; closed credits stay collapsible', () => {
  const h = fixture();
  h.query.currentData.items = [item('offer', 'offered'), item('old', 'settled'), item('delivery', 'accepted'), item('vehicle', 'active', 'vehicle')];
  let tree = h.render();
  assert.deepEqual(tree.filter(n => n.props?.testID).map(n => n.props.testID), ['credit-repayment-vehicle', 'credit-repayment-delivery', 'credit-repayment-offer']);
  tree.find(n => n.props?.testID === 'credit-repayment-vehicle').props.onPress();
  assert.deepEqual(h.routes, ['/services/credit/vehicle']);
  tree.find(n => n.props?.title === 'Voir les anciens crédits').props.onPress();
  tree = h.render();
  assert.ok(tree.find(n => n.props?.testID === 'credit-repayment-old'));
  tree.find(n => n.props?.title === 'Masquer les anciens crédits').props.onPress();
  assert.ok(!h.render().find(n => n.props?.testID === 'credit-repayment-old'));
  h.unmount();
});

test('empty state is not shown for loading, unavailable or offline data', () => {
  const h = fixture();
  assert.ok(h.render().includes('Aucun crédit en cours'));
  for (const flag of ['isFetching', 'isError']) {
    h.query[flag] = true; assert.ok(!h.render().includes('Aucun crédit en cours')); h.query[flag] = false;
  }
  h.state.zwangaApi.config.online = false;
  assert.ok(!h.render().includes('Aucun crédit en cours'));
  h.query.currentData = undefined;
  assert.ok(!h.render().includes('Aucun crédit en cours'));
  h.unmount();
});

test('one scoped read, no polling; background, offline and late retry cannot refetch', async () => {
  for (const pause of [h => h.background(), h => { h.state.zwangaApi.config.online = false; }, h => h.logout()]) {
    const h = fixture(); h.query.isError = true;
    const retry = h.render().find(n => n.props?.title === 'Réessayer');
    assert.equal(h.reads.at(-1).pollingInterval, 0);
    await retry.props.onPress(); await new Promise(r => setImmediate(r)); assert.equal(h.retries(), 1);
    pause(h); h.render(); assert.equal(h.reads.at(-1).skip, true);
    await retry.props.onPress(); await new Promise(r => setImmediate(r)); assert.equal(h.retries(), 1);
    h.unmount();
  }
});

test('repayment entry opens management directly, with no catalogue/financial read or mutation', () => {
  const h = fixture(); const { CreditRepaymentsLink } = h.load('features/pro-services/CreditRepaymentsLink.tsx');
  CreditRepaymentsLink({ active: true }).props.onPress();
  CreditRepaymentsLink({ active: false }).props.onPress();
  assert.deepEqual(h.routes, ['/services/credit/repayments']); assert.equal(h.reads.length, 0);
  h.unmount();
});
