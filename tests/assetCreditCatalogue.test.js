const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];

function fixture(kind = 'phone', catalogue = false) {
  const hooks = hookHarness(), sends = [], queries = [], paths = [];
  const state = { auth: { user: { id: 'driver' } }, zwangaApi: { config: { online: true } } };
  let active = true, session = 1, send = async () => ({}), fontScale = 1;
  const products = { currentData: { canRequest: true, items: ['phone', 'helmet', 'gps_tracker', 'delivery_equipment', 'equipment', 'vehicle']
    .map(kind => ({ kind, enabled: kind !== 'vehicle' })) }, isError: false };
  const requests = { currentData: { items: [] }, isError: false };
  const credits = { currentData: { items: [] } };
  const query = value => (_arg, options) => { queries.push(options); return value; };
  const load = loader({
    react: hooks.react,
    'react-native': { ActivityIndicator: 'Loading', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Press', View: 'View',
      useWindowDimensions: () => ({ width: 320, height: 568, fontScale }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push: p => paths.push(p), canGoBack: () => true, back: () => paths.push('back'), replace: p => paths.push(p) } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectUser: s => s.auth.user },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/store/api/assetCreditApi': {
      useGetAssetCreditProductsQuery: query(products), useGetAssetCreditsQuery: query(credits), useGetAssetCreditRequestsQuery: query(requests),
      useRequestAssetCreditMutation: () => [dto => ({ unwrap: async () => { sends.push(dto); return send(dto); } }), { isLoading: false }],
    },
  });
  const Screen = catalogue ? load('app/services/credit/index.tsx').default : load('features/pro-services/CreditProductScreen.tsx').CreditProductScreen;
  const render = () => nodes(hooks.render(() => Screen({ kind })));
  const submit = () => render().find(n => n.props?.title === 'Envoyer mon choix');
  render();
  return { products, requests, credits, state, sends, queries, paths, render, submit,
    changeSession: () => { session++; state.auth.user = { id: 'other' }; render(); },
    background: () => { active = false; }, defer: fn => { send = fn; }, unmount: () => hooks.unmount(),
    largeText: () => { fontScale = 2; } };
}

test('large text gives the product name the whole width without shrinking the font', () => {
  const h = fixture(); h.largeText();
  const views = h.render().filter(n => n.type === 'View');
  assert.ok(views.some(n => n.props.style?.some?.(s => s?.flexDirection === 'column')));
  assert.ok(views.some(n => n.props.style?.some?.(s => s?.width === '100%')));
  h.unmount();
});

test('all catalogue rows open a readable equipment detail, including upcoming and unavailable products', () => {
  const h = fixture('phone', true);
  for (const [label, kind] of [['Téléphone', 'phone'], ['Casque', 'helmet'], ['Traceur GPS', 'gps_tracker'],
    ['Matériel de livraison', 'delivery_equipment'], ['Autre équipement', 'equipment'], ['Véhicule', 'vehicle']]) {
    const row = h.render().find(n => n.props?.accessibilityLabel === label);
    assert.equal(row.props.accessibilityRole, 'button');
    assert.equal(row.props.disabled, false);
    row.props.onPress();
    assert.equal(h.paths.at(-1), '/services/credit/product/' + kind);
  }
  assert.equal(h.submit(), undefined);
  assert.equal(h.sends.length, 0);
  h.background(); h.render().find(n => n.props?.accessibilityLabel === 'Téléphone').props.onPress();
  assert.equal(h.paths.length, 6); h.unmount();
});

test('phone detail explains the category before sending a comment without consent or debit', async () => {
  const h = fixture();
  assert.ok(h.render().some(n => typeof n === 'string' && n.includes('Cette fiche présente une catégorie')));
  assert.ok(h.render().some(n => typeof n === 'string' && n.includes('Marque, modèle')));
  assert.equal(h.sends.length, 0);
  h.render().find(n => n.type === 'Input').props.onChangeText('  Mon commentaire  ');
  assert.equal(h.submit().props.disabled, false);
  await h.submit().props.onPress();
  assert.deepEqual(h.sends, [{ assetKind: 'phone', notes: 'Mon commentaire' }]);
  assert.equal(h.submit(), undefined);
  h.render().find(n => n.props?.title === 'Retour aux équipements').props.onPress();
  assert.equal(h.paths.at(-1), 'back'); h.unmount();
});

test('upcoming equipment has descriptive detail but no request button even when old catalogue enabled it', () => {
  for (const kind of ['helmet', 'gps_tracker', 'delivery_equipment', 'equipment']) {
    const h = fixture(kind);
    assert.equal(h.submit(), undefined);
    assert.equal(h.render().some(n => n.type === 'Input'), false);
    assert.ok(h.render().some(n => typeof n === 'string' && n.includes('service est à venir')));
    assert.equal(h.sends.length, 0); h.unmount();
  }
});

test('vehicle detail enforces server eligibility and uses vehicle-specific repayment wording', async () => {
  const h = fixture('vehicle'), p = h.products.currentData.items.find(p => p.kind === 'vehicle');
  assert.equal(h.submit().props.disabled, true);
  p.enabled = true;
  assert.equal(h.submit().props.disabled, true, 'missing eligibility does not open intake');
  p.eligibility = { eligible: true };
  assert.equal(h.submit().props.disabled, false);
  assert.ok(h.render().some(n => typeof n === 'string' && n.includes('9 mois')));
  assert.match(h.render().find(n => n.type === 'Input').props.placeholder, /Voiture, moto/);
  const explanation = h.render().find(n => typeof n.type === 'function' && n.type.name === 'CreditHowItWorks');
  const copy = nodes(explanation.type(explanation.props)).filter(n => typeof n === 'string').join(' ');
  assert.match(copy, /rembourser.*le bien/); assert.doesNotMatch(copy, /remise du téléphone/);
  await h.submit().props.onPress();
  assert.deepEqual(h.sends, [{ assetKind: 'vehicle', notes: '' }]); h.unmount();
});

test('without a quote the detail never invents a price, model or per-product repayment percentage', () => {
  const h = fixture();
  const tree = h.render(), copy = tree.filter(n => typeof n === 'string').join(' ');
  assert.match(copy, /prix.*frais.*mensualités.*pourcentage/);
  assert.match(copy, /ne crée aucun crédit ni prélèvement/);
  assert.doesNotMatch(copy, /5 %|10 %|Samsung|iPhone|\d+ FC/);
  const explanation = tree.find(n => typeof n.type === 'function' && n.type.name === 'CreditHowItWorks');
  assert.ok(nodes(explanation.type()).some(n => typeof n === 'string' && n.includes('Recharger seul ne rembourse pas le crédit')));
  h.unmount();
});

test('paused products, errors, missing reads, non-drivers and pending dossiers cannot submit', async () => {
  for (const change of [h => { h.products.currentData.items.find(p => p.kind === 'phone').enabled = false; },
    h => { h.products.currentData.items.find(p => p.kind === 'phone').comingSoon = true; },
    h => { h.products.currentData = undefined; }, h => { h.products.isError = true; },
    h => { h.products.currentData.canRequest = false; }, h => { h.requests.isError = true; },
    h => { h.requests.currentData = undefined; }, h => { h.credits.currentData = undefined; }, h => { h.credits.isError = true; },
    h => { h.requests.currentData.items.push({ assetKind: 'phone', status: 'submitted' }); }]) {
    const h = fixture(); change(h);
    const button = h.submit();
    if (button) { assert.equal(button.props.disabled, true); await button.props.onPress(); }
    assert.equal(h.sends.length, 0); h.unmount();
  }
  const h = fixture(); h.requests.currentData.items.push({ assetKind: 'helmet', status: 'submitted' });
  assert.equal(h.submit().props.disabled, false); h.unmount();
});

test('existing personalized offer exposes its terms and keeps legacy equipment contracts reachable', () => {
  const h = fixture('helmet');
  h.credits.currentData.items.push({ id: 'quote', assetKind: 'helmet', status: 'offered', principalMinor: '500000', paidMinor: '0', label: 'Casque test' });
  assert.equal(h.submit(), undefined);
  assert.ok(h.render().includes('Casque test'));
  assert.ok(h.render().some(n => typeof n.type === 'function' && n.type.name === 'SelectedCreditOffer' && n.props.id === 'quote'));
  h.render().find(n => n.props?.title === 'Voir mon offre et le contrat').props.onPress();
  assert.equal(h.paths.at(-1), '/services/credit/quote');
  assert.equal(h.sends.length, 0); h.unmount();
});

test('double taps send once and old-session replies do not show success', async () => {
  const h = fixture(); let release;
  h.defer(() => new Promise(resolve => { release = resolve; }));
  const button = h.submit(), work = button.props.onPress(); await button.props.onPress();
  assert.equal(h.sends.length, 1);
  h.changeSession(); release({}); await work;
  assert.equal(h.render().some(n => typeof n === 'string' && n.includes('Votre choix est envoyé')), false);
  h.unmount();
});

test('inactive or offline screens pause reads and old submit closures are inert', async () => {
  for (const transition of [h => h.background(), h => { h.state.zwangaApi.config.online = false; }]) {
    const h = fixture(), old = h.submit(); transition(h); h.queries.length = 0; h.render();
    assert.ok(h.queries.every(q => q.skip === true)); assert.equal(h.submit().props.disabled, true);
    await old.props.onPress(); assert.equal(h.sends.length, 0); h.unmount();
  }
});

test('route rejects unknown categories and keys the product by account and category', () => {
  const hooks = hookHarness(); let kind = 'phone', id = 'first';
  const { default: Route } = loader({
    react: hooks.react, 'react-native': { Text: 'Text' },
    'expo-router': { useLocalSearchParams: () => ({ kind }) },
    '@/store/hooks': { useAppSelector: () => ({ id }) }, '@/store/selectors': { selectUser: () => ({ id }) },
    '@/features/pro-services/CreditProductScreen': { CreditProductScreen: 'Product' },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', s: {} },
  })('app/services/credit/product/[kind].tsx');
  let tree = hooks.render(Route); assert.equal(tree.props.kind, 'phone'); const firstKey = tree.key;
  id = 'other'; tree = hooks.render(Route); assert.notEqual(tree.key, firstKey);
  kind = 'helmet'; tree = hooks.render(Route); assert.equal(tree.props.kind, 'helmet');
  kind = 'unknown'; assert.equal(hooks.render(Route).type, 'Layout');
  kind = ['phone', 'helmet']; assert.equal(hooks.render(Route).type, 'Layout'); hooks.unmount();
});
