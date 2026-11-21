const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = t => t == null || typeof t === 'boolean' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children)];
const load = loader({ 'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: x => x } }, '@expo/vector-icons': { Ionicons: 'Icon' } });
const { ServicesDashboard } = load('features/pro-services/ServicesDashboard.tsx');
const { creditNextInstallment, serviceMatches, creditDashboard } = load('features/pro-services/servicesDashboardModel.ts');
const basic = { driver: true, documentsEnabled: true, documentAction: 'Préparer mon dossier', enabled: true, search: '', creditsReady: true, credits: [], onDocuments() {}, onCredits() {}, onBuy() {}, onFleet() {}, onCredit() {} };
test('new driver dashboard has one document entry, two service tiles and descriptive upcoming services', () => {
  const tree = nodes(ServicesDashboard(basic));
  assert.ok(tree.find(n => n.props?.testID === 'services-onboarding'));
  assert.equal(tree.filter(n => n.props?.testID?.startsWith('pro-service-')).length, 2);
  assert.equal(tree.find(n => n.props?.testID === 'services-coming-soon').props.accessibilityRole, undefined);
  assert.equal(tree.some(n => typeof n === 'string' && /2 sur 3|expire le|25 000/.test(n)), false);
});
test('passengers retain documents, credit and fleet access without driver-onboarding prompt', () => {
  const tree = nodes(ServicesDashboard({ ...basic, driver: false }));
  assert.equal(tree.some(n => n.props?.testID === 'services-onboarding'), false);
  assert.ok(tree.find(n => n.props?.testID === 'pro-service-documents'));
});
test('active credit displays actual pending installment and pay navigates, never debits', () => {
  const calls = [];
  const credit = { id: 'test-credit', label: 'Téléphone test', status: 'active', principalMinor: '100000', paidMinor: '25000',
    installments: [{ ordinal: 1, remainingMinor: 0, dueAt: '2026-11-01' }, { ordinal: 2, remainingMinor: 25000, dueAt: '2026-12-01' }] };
  const tree = nodes(ServicesDashboard({ ...basic, credits: [credit], creditDetail: credit, onCredit: id => calls.push(id) }));
  assert.ok(tree.includes('À traiter')); assert.ok(tree.includes('250 FC'));
  const pay = tree.find(n => n.type === 'Button' && nodes(n).includes('Payer'));
  pay.props.onPress(); assert.deepEqual(calls, ['test-credit']);
  assert.equal(creditNextInstallment({ ...credit, status: 'offered' }), undefined);
  assert.equal(creditDashboard([credit]).remaining, 75000);
});
test('search tolerates accents and inactive controls cannot route', () => {
  assert.equal(serviceMatches('credit', 'Acheter à crédit'), true);
  let routes = 0;
  const tree = nodes(ServicesDashboard({ ...basic, enabled: false, documentsEnabled: false, search: 'flotte', onFleet: () => routes++ }));
  const buttons = tree.filter(n => n.type === 'Button');
  assert.equal(buttons.length, 1); buttons[0].props.onPress(); assert.equal(routes, 0);
});

test('all schedules participate: earliest unpaid date wins over a new offer without detail calls', () => {
  const now = Date.parse('2026-11-18');
  const base = { status: 'active', principalMinor: '100000', paidMinor: '25000' };
  const future = { ...base, id: 'future', installments: [{ ordinal: 1, remainingMinor: 1000, dueAt: '2027-01-01' }] };
  const overdue = { ...base, id: 'overdue', label: 'Urgent', installments: [
    { ordinal: 2, remainingMinor: 30000, dueAt: '2026-12-01' },
    { ordinal: 1, remainingMinor: 20000, dueAt: '2026-11-01' }] };
  const offered = { ...base, id: 'offer', status: 'offered' };
  for (const items of [[offered, future, overdue], [overdue, offered, future]]) {
    assert.equal(creditDashboard(items, now).focus.id, 'overdue');
    assert.equal(creditNextInstallment(overdue).ordinal, 1);
    const tree = nodes(ServicesDashboard({ ...basic, credits: items }));
    assert.ok(tree.includes('200 FC')); assert.ok(tree.includes('Urgent'));
  }
  assert.equal(creditDashboard([future, offered], now).focus.id, 'offer');
  const summary = { ...overdue, installments: undefined, installmentCount: 2, nextInstallment: overdue.installments[1] };
  assert.equal(creditDashboard([offered, future, summary], now).focus.id, 'overdue');
  assert.ok(nodes(ServicesDashboard({ ...basic, credits: [offered, future, summary] })).includes('200 FC'));
  assert.equal(creditDashboard([{ ...base, id: 'old-server' }, offered], now).focus.id, 'old-server');
  assert.equal(creditDashboard([]).focus, undefined);
});

test('moved dossier history preserves pagination, refresh and suspended reads', () => {
  const hooks = hookHarness(), reads = [];
  let enabled = true, refreshed = 0;
  const page = { currentData: { items: [{ id: 'case-test' }], nextCursor: 'next-test' }, refetch: () => refreshed++ };
  const Screen = loader({ react: hooks.react,
    'react-native': { Text: 'Text', ActivityIndicator: 'Loading' },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/features/pro-services/ServiceCatalogue': { ServiceCaseLink: 'Case' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => enabled },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => enabled },
    '@/store/api/proServicesApi': { useGetMyProCasesQuery: (cursor, options) => { reads.push({ cursor, ...options }); return page; } },
  })('app/services/history.tsx').default;
  const render = () => nodes(hooks.render(Screen));
  const button = title => render().find(n => n.props?.title === title);
  assert.ok(render().some(n => n.type === 'Case' && n.props.item.id === 'case-test'));
  button('Dossiers suivants').props.onPress(); render(); assert.equal(reads.at(-1).cursor, 'next-test');
  button('Revenir aux plus récents').props.onPress(); render(); assert.equal(reads.at(-1).cursor, undefined);
  button('Actualiser mes dossiers').props.onPress(); assert.equal(refreshed, 1);
  enabled = false;
  button('Actualiser mes dossiers').props.onPress(); assert.equal(refreshed, 1); assert.equal(reads.at(-1).skip, true);
  hooks.unmount();
});
