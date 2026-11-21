const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { buildServiceCatalogue } = loader()('features/pro-services/serviceCatalogueModel.ts');
const offer = (code, availability = 'open') => ({ code, availability, name: code, description: '', documentOptions: [] });
const codes = entries => entries.map(item => item.code);
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ fontScale: 1 }) };
function ui() {
  const routes = [];
  const components = loader({
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push: route => routes.push(route) } },
    './ServiceLayout': { s: {} },
  })('features/pro-services/ServiceCatalogue.tsx');
  return { ...components, routes };
}

test('main directory has the five named services once; legacy offerings stay available separately', () => {
  const result = buildServiceCatalogue([offer('vehicles'), offer('fleet'), offer('documents'), offer('fleet'), offer('equipment')], 'ready');
  assert.deepEqual(codes(result.primary), ['documents', 'fleet', 'delivery', 'schools', 'health']);
  assert.deepEqual(result.primary.map(item => item.title), ['Obtenir mes documents', 'Gérer ma flotte', 'Zwanga Livraison', 'Transport scolaire', 'Transport santé']);
  assert.deepEqual(codes(result.secondary), ['vehicles', 'equipment']);
  assert.ok(result.secondary.every(item => item.availability === 'open'));
});

test('fleet and document availability follows the server, never a client-side activation', () => {
  for (const availability of ['open', 'coming_soon', 'paused']) {
    const items = [offer('documents', availability), offer('fleet', availability)];
    const result = buildServiceCatalogue(items, 'ready').primary;
    assert.equal(result[0].availability, availability);
    assert.equal(result[1].availability, availability);
    assert.equal(result[1].offering, items[1]);
  }
  for (const [state, expected] of [['loading', 'checking'], ['error', 'unavailable'], ['ready', 'unavailable']]) {
    const result = buildServiceCatalogue([], state);
    assert.ok(result.primary.slice(0, 2).every(item => item.availability === expected && !item.offering));
    assert.equal(result.secondary.length, 0);
  }
});

test('preview services remain coming soon without a backend offering or form route', () => {
  const future = buildServiceCatalogue(['delivery', 'schools', 'health'].map(code => offer(code)), 'ready').primary.slice(2);
  const { UnavailableService } = ui();
  for (const item of future) {
    assert.equal(item.availability, 'coming_soon');
    assert.equal(item.offering, undefined);
    const tree = nodes(UnavailableService({ item }));
    assert.ok(tree.includes('À venir'));
    assert.ok(tree.includes(item.title));
    assert.equal(tree.filter(node => node.props?.onPress).length, 0);
    assert.match(tree[0].props.accessibilityLabel, /À venir/);
  }
});

test('directory renders active rows as actions and other states as descriptive rows', () => {
  const { ServiceDirectory, OpenService, UnavailableService, FleetServiceEntry } = ui();
  const current = { id: 'fixture-dossier', canEdit: false };
  const tree = nodes(ServiceDirectory({ items: [offer('documents'), offer('fleet', 'paused')], state: 'ready', current, checking: true }));
  const open = tree.filter(node => node.type === OpenService);
  assert.equal(open.length, 1);
  assert.equal(open[0].props.current, current);
  assert.equal(open[0].props.checking, true);
  const closed = tree.filter(node => node.type === UnavailableService);
  assert.equal(closed.length, 3);
  assert.equal(tree.filter(node => node.type === FleetServiceEntry).length, 1);
  assert.equal(ServiceDirectory({ items: [], state: 'ready', secondary: true }), null);
});

test('only documents use the current dossier; fleets open account assignments', () => {
  const { ServiceDirectory, FleetServiceEntry, routes } = ui();
  const tree = nodes(ServiceDirectory({ items: [offer('documents'), offer('fleet')], state: 'ready', checking: true, current: { id: 'document-case' } }));
  const fleet = tree.find(node => node.type === FleetServiceEntry);
  nodes(FleetServiceEntry(fleet.props))[0].props.onPress();
  assert.deepEqual(routes, ['/services/fleet']);
});

test('documents open readonly dossiers and disabled actions cannot navigate', () => {
  const { OpenService, routes } = ui();
  const current = { id: 'readonly-case', canEdit: false };
  const tree = nodes(OpenService({ item: offer('documents'), current }));
  assert.ok(tree.includes('Voir mon dossier'));
  tree[0].props.onPress();
  assert.equal(routes.pop(), '/services/readonly-case');
  for (const props of [{ checking: true }, { active: false }, { item: offer('documents', 'paused') }]) {
    const button = nodes(OpenService({ item: offer('documents'), ...props }))[0];
    assert.equal(button.props.disabled, true);
    assert.equal(button.props.accessibilityState.disabled, true);
    button.props.onPress();
  }
  assert.equal(routes.length, 0);
});

test('dashboard preserves tab space and retry, moves cases to a dedicated history entry', () => {
  const hooks = hookHarness();
  let reloads = 0;
  const queries = {
    catalogue: { isError: true, error: { data: { message: 'Connexion indisponible' } }, refetch() { reloads++; } },
    current: { currentData: { request: { id: 'fixture-case', canEdit: true } }, refetch() {} },
    cases: { currentData: { items: [{ id: 'fixture-case' }], nextCursor: 'fixture-page' } },
  };
  const { default: ServicesScreen } = loader({
    '@/store/hooks': { useAppSelector: fn => fn({ zwangaApi: { config: { online: true } } }) },
    '@/store/selectors': { selectUser: () => ({ id: 'fixture-driver', isDriver: true }) },
    '@/store/api/assetCreditApi': { useGetAssetCreditsQuery: () => ({ currentData: { items: [] }, refetch() {} }), useGetAssetCreditQuery: () => ({}) },
    'expo-router': { router: {push() {}} },
    react: hooks.react, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Action', s: {} },
    '@/features/pro-services/ServiceCatalogue': { ServiceDirectory: 'Directory', ServiceCaseLink: 'Case', CreditServiceEntry: 'Credit' },
    '@/features/pro-services/CreditRepaymentsLink': { CreditRepaymentsLink: 'Repayments' },
    '@/store/api/proServicesApi': {
      useGetProOfferingsQuery: () => queries.catalogue,
      useGetCurrentDocumentCaseQuery: () => queries.current,
      useGetMyProCasesQuery: () => queries.cases,
    },
  })('features/pro-services/ServicesScreen.tsx');
  const tree = nodes(hooks.render(() => ServicesScreen({ embedded: true, bottomOverlay: 92 })));
  assert.equal(tree[0].props.embedded, true);
  assert.equal(tree[0].props.bottomOverlay, 92);
  assert.equal(tree[0].props.title, 'Services');
  const main = tree.find(node => typeof node.type === 'function' && node.type.name === 'ServicesDashboard');
  assert.equal(main.props.driver, true);
  assert.equal(main.props.documentsEnabled, true, 'existing dossier is reachable during catalogue failure');
  assert.equal(tree.some(node => node.type === 'Case'), false);
  assert.ok(nodes(tree[0].props.headerActions).find(node => node.props?.accessibilityLabel === 'Historique de mes dossiers'));
  tree.find(node => node.props?.title === 'Recharger les services').props.onPress();
  assert.equal(reloads, 1);
  assert.equal(tree.filter(node => typeof node.type === 'function' && node.type.name === 'ServicesDashboard').length, 1);
  hooks.unmount();
});

test('credit has a single route for equipment and vehicles, and cannot open in background', () => {
  const { CreditServiceEntry, routes } = ui();
  const row = nodes(CreditServiceEntry({}))[0];
  row.props.onPress();
  assert.deepEqual(routes, ['/services/credit']);
  assert.match(row.props.accessibilityLabel, /équipements et véhicules/i);
  const disabled = nodes(CreditServiceEntry({ active: false }))[0];
  assert.equal(disabled.props.disabled, true);
  disabled.props.onPress();
  assert.equal(routes.length, 1);
});

test('documents and enterprise groups partition the directory without financing duplicates', () => {
  const { ServiceDirectory, OpenService, FleetServiceEntry, UnavailableService } = ui();
  const items = [offer('documents'), offer('vehicles'), offer('equipment')];
  const documents = nodes(ServiceDirectory({ items, state: 'ready', group: 'documents' }));
  const business = nodes(ServiceDirectory({ items, state: 'ready', group: 'business' }));
  assert.equal(documents.filter(n => n.type === OpenService).length, 1);
  assert.equal(documents.filter(n => n.type === FleetServiceEntry).length, 0);
  assert.equal(business.filter(n => n.type === FleetServiceEntry).length, 1);
  assert.equal(business.filter(n => n.type === UnavailableService).length, 3);
  assert.equal(business.filter(n => n.type === OpenService).length, 0);
});
