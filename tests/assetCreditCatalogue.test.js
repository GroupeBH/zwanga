const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];

function fixture() {
  const hooks = hookHarness(), sends = [], queries = [];
  const state = { auth: { user: { id: 'driver' } }, zwangaApi: { config: { online: true } } };
  let active = true, session = 1, send = async () => ({});
  const products = { currentData: { canRequest: true, items: ['phone', 'helmet', 'gps_tracker', 'delivery_equipment', 'equipment', 'vehicle']
    .map(kind => ({ kind, enabled: kind !== 'vehicle' })) }, isError: false };
  const requests = { currentData: { items: [] }, isError: false };
  const credits = { currentData: { items: [] } };
  const query = value => (_arg, options) => { queries.push(options); return value; };
  const { default: Screen } = loader({
    react: hooks.react,
    'react-native': { ActivityIndicator: 'Loading', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Press', View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push() {} } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectUser: s => s.auth.user },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/store/api/assetCreditApi': {
      useGetAssetCreditProductsQuery: query(products), useGetAssetCreditsQuery: query(credits), useGetAssetCreditRequestsQuery: query(requests),
      useRequestAssetCreditMutation: () => [dto => ({ unwrap: async () => { sends.push(dto); return send(dto); } }), { isLoading: false }],
    },
  })('app/services/credit/index.tsx');
  const render = () => nodes(hooks.render(Screen));
  const choose = label => render().find(n => n.props?.accessibilityLabel === label).props.onPress();
  const submit = () => render().find(n => n.props?.title === 'Envoyer mon choix');
  render();
  return { products, requests, credits, state, sends, queries, render, choose, submit,
    changeSession: () => { session++; state.auth.user = { id: 'other' }; render(); },
    background: () => { active = false; }, defer: fn => { send = fn; }, unmount: () => hooks.unmount() };
}

test('equipment selection sends the chosen kind, never creates consent or a debit', async () => {
  for (const [label, kind] of [['Téléphone', 'phone'], ['Casque', 'helmet'], ['Traceur GPS', 'gps_tracker'],
    ['Matériel de livraison', 'delivery_equipment'], ['Autre équipement', 'equipment']]) {
    const h = fixture();
    assert.equal(h.render().filter(n => n.props?.accessibilityRole === 'radio').length, 6);
    h.choose(label);
    if (kind === 'equipment') {
      assert.equal(h.submit().props.disabled, true);
      h.render().find(n => n.type === 'Input').props.onChangeText('  Sac de travail  ');
    }
    assert.equal(h.submit().props.disabled, false);
    await h.submit().props.onPress();
    assert.deepEqual(h.sends, [{ assetKind: kind, notes: kind === 'equipment' ? 'Sac de travail' : '' }]);
    assert.equal(h.submit(), undefined);
    h.unmount();
  }
});

test('vehicles use the same request flow only when the server opens that product', async () => {
  const h = fixture();
  const row = h.render().find(n => n.props?.accessibilityLabel === 'Véhicule');
  assert.equal(row.props.disabled, true);
  row.props.onPress();
  assert.equal(h.submit(), undefined);
  h.products.currentData.items.find(p => p.kind === 'vehicle').enabled = true;
  h.choose('Véhicule');
  assert.match(h.render().find(n => n.type === 'Input').props.placeholder, /Voiture, moto/);
  await h.submit().props.onPress();
  assert.deepEqual(h.sends, [{ assetKind: 'vehicle', notes: '' }]);
  h.unmount();
});

test('repayment disclosure uses backend policy, not an invented per-product percentage', () => {
  const h = fixture();
  h.products.currentData.policyText = 'Conditions du contrat fournies par le serveur.';
  assert.equal(h.render().includes(h.products.currentData.policyText), false);
  h.render().find(n => n.props?.accessibilityState?.expanded === false).props.onPress();
  const tree = h.render();
  assert.ok(tree.includes(h.products.currentData.policyText));
  assert.ok(tree.some(n => typeof n === 'string' && n.includes('Recharger seul ne rembourse pas le crédit')));
  assert.equal(tree.some(n => typeof n === 'string' && n.includes('5 %')), false);
  h.unmount();
});

test('paused products, missing catalogue, non-driver and pending same-kind requests cannot submit', async () => {
  for (const change of [h => { h.products.currentData.items.find(p => p.kind === 'helmet').enabled = false; },
    h => { h.products.currentData = undefined; }, h => { h.products.isError = true; },
    h => { h.products.currentData.canRequest = false; }, h => { h.requests.isError = true; },
    h => { h.requests.currentData = undefined; }, h => { h.credits.currentData = undefined; }, h => { h.credits.isError = true; },
    h => { h.requests.currentData.items.push({ assetKind: 'helmet', status: 'submitted' }); }]) {
    const h = fixture(); h.choose('Casque'); change(h);
    assert.equal(h.submit().props.disabled, true);
    await h.submit().props.onPress(); assert.equal(h.sends.length, 0);
    h.unmount();
  }
  const h = fixture();
  h.requests.currentData.items.push({ assetKind: 'phone', status: 'submitted' });
  h.choose('Casque'); assert.equal(h.submit().props.disabled, false);
  await h.submit().props.onPress(); assert.equal(h.sends[0].assetKind, 'helmet'); h.unmount();
});

test('selecting equipment with an existing priced offer opens its terms instead of sending another request', () => {
  const h = fixture();
  h.credits.currentData.items.push({ id: 'quote', assetKind: 'helmet', status: 'offered', principalMinor: '500000', paidMinor: '0', label: 'Casque test' });
  h.choose('Casque');
  assert.equal(h.submit(), undefined);
  assert.ok(h.render().some(n => n.props?.title === 'Voir mon offre et le contrat'));
  assert.ok(h.render().some(n => typeof n.type === 'function' && n.type.name === 'SelectedCreditOffer' && n.props.id === 'quote'));
  assert.equal(h.sends.length, 0);
  h.unmount();
});

test('double taps send once and old session responses do not overwrite the new screen', async () => {
  const h = fixture(); let release;
  h.defer(() => new Promise(resolve => { release = resolve; }));
  h.choose('Traceur GPS'); const button = h.submit();
  const work = button.props.onPress(); await button.props.onPress(); assert.equal(h.sends.length, 1);
  h.changeSession(); release({}); await work;
  assert.equal(h.submit(), undefined);
  assert.equal(h.render().some(n => typeof n === 'string' && n.includes('Votre choix est envoyé')), false);
  h.unmount();
});

test('reads pause offline and in background and stale submit closures are inert', async () => {
  for (const transition of [h => h.background(), h => { h.state.zwangaApi.config.online = false; }]) {
    const h = fixture(); h.choose('Casque'); const old = h.submit(); transition(h); h.queries.length = 0; h.render();
    assert.ok(h.queries.every(q => q.skip === true));
    assert.equal(h.submit().props.disabled, true);
    await old.props.onPress(); assert.equal(h.sends.length, 0); h.unmount();
  }
});
