const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
function setup() {
  const h = hookHarness(), calls = [], queries = [], confirmations = [];
  let active = true, fail = false;
  const mine = { items: [{ id: 'application', organizationId: 'org', organizationName: 'Flotte test', status: 'PENDING', message: 'Ma candidature' }], page: 1, limit: 20, total: 21 };
  const directory = { items: [{ id: 'org', displayName: 'Flotte test' }], page: 1, limit: 20, total: 21 };
  const mutation = kind => body => ({ unwrap: async () => { calls.push({ kind, body }); if (fail) throw { data: { message: 'Indisponible' } }; return { id: 'application', status: 'PENDING' }; } });
  const { default: Screen } = loader({
    react: h.react,
    'react-native': { Text: 'Text', View: 'View', TextInput: 'Input', ActivityIndicator: 'Loading', Alert: { alert: (...args) => confirmations.push(args) } },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/fleetApplicationsApi': {
      useGetFleetDirectoryQuery: (args, opts) => { queries.push({ type: 'directory', args, opts }); return { currentData: directory }; },
      useGetMyFleetApplicationsQuery: (args, opts) => { queries.push({ type: 'mine', args, opts }); return { currentData: mine }; },
      useApplyToFleetMutation: () => [mutation('apply'), { isLoading: false }],
      useWithdrawFleetApplicationMutation: () => [mutation('withdraw'), { isLoading: false }],
    },
  })('app/services/fleet-applications.tsx');
  return { render: () => nodes(h.render(() => Screen())), calls, queries, confirmations, mine,
    blur: () => { active = false; }, fail: () => { fail = true; }, close: () => h.unmount() };
}
const button = (tree, title) => tree.find(n => n.props?.title === title);
test('candidate submits a trimmed presentation once, without driver identity in payload', async () => {
  const h = setup(); button(h.render(), 'Postuler').props.onPress();
  assert.equal(button(h.render(), 'Envoyer ma candidature').props.disabled, true);
  h.render().find(n => n.props?.accessibilityLabel === 'Message de candidature').props.onChangeText('  Je souhaite rejoindre la flotte.  ');
  const submit = button(h.render(), 'Envoyer ma candidature');
  assert.equal(submit.props.disabled, false);
  await Promise.all([submit.props.onPress(), submit.props.onPress()]);
  assert.deepEqual(h.calls, [{ kind: 'apply', body: { organizationId: 'org', message: 'Je souhaite rejoindre la flotte.' } }]);
  assert.equal(button(h.render(), 'Envoyer ma candidature'), undefined); h.close();
});
test('failed send keeps the draft for retry', async () => {
  const h = setup(); button(h.render(), 'Postuler').props.onPress();
  h.render().find(n => n.props?.accessibilityLabel === 'Message de candidature').props.onChangeText('Message conservé après erreur');
  h.fail(); await button(h.render(), 'Envoyer ma candidature').props.onPress();
  assert.equal(h.render().find(n => n.props?.accessibilityLabel === 'Message de candidature').props.value, 'Message conservé après erreur');
  assert.ok(h.render().includes('Indisponible')); h.close();
});
test('withdrawal requires confirmation and cannot execute after screen becomes inactive', async () => {
  const h = setup(); button(h.render(), 'Retirer ma candidature').props.onPress();
  assert.equal(h.calls.length, 0);
  h.blur(); h.queries.length = 0; h.render();
  await h.confirmations[0][2][1].onPress();
  assert.equal(h.calls.length, 0); assert.ok(h.queries.every(q => q.opts.skip)); h.close();
});
test('only pending applications offer withdrawal; accepted state explains remaining verification', () => {
  const h = setup(); h.mine.items[0].status = 'ACCEPTED';
  const tree = h.render(); assert.equal(button(tree, 'Retirer ma candidature'), undefined);
  assert.ok(tree.some(n => typeof n === 'string' && n.includes('devront être vérifiés'))); h.close();
});
test('both lists use server pagination and search resets the fleet page', () => {
  const h = setup(); button(h.render(), 'Flottes suivantes').props.onPress(); h.render();
  assert.equal(h.queries.filter(q => q.type === 'directory').at(-1).args.page, 2);
  h.render().find(n => n.props?.accessibilityLabel === 'Rechercher une flotte').props.onChangeText(' Gombe ');
  button(h.render(), 'Rechercher').props.onPress(); h.render();
  assert.deepEqual(h.queries.filter(q => q.type === 'directory').at(-1).args, { page: 1, search: 'Gombe' });
  button(h.render(), 'Candidatures suivantes').props.onPress(); h.render();
  assert.equal(h.queries.filter(q => q.type === 'mine').at(-1).args.page, 2); h.close();
});
test('API routes use authenticated identity, encoded IDs and shared invalidation', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: ({ endpoints: make }) => { endpoints = make({ query: x => x, mutation: x => x }); return {}; } } } })('store/api/fleetApplicationsApi.ts');
  assert.deepEqual(endpoints.applyToFleet.query({ organizationId: 'o/r', message: 'Ma présentation' }), { url: '/partners/fleets/o%2Fr/applications', method: 'POST', body: { message: 'Ma présentation' } });
  assert.deepEqual(endpoints.withdrawFleetApplication.query({ id: 'a/b' }), { url: '/partners/fleet-applications/a%2Fb/withdraw', method: 'POST', body: {} });
  assert.deepEqual(endpoints.getMyFleetApplications.query({ page: 2 }), { url: '/partners/fleet-applications/mine', params: { page: 2, limit: 20 } });
  assert.deepEqual(endpoints.applyToFleet.invalidatesTags, [{ type: 'ProServices', id: 'FLEET' }]);
});
