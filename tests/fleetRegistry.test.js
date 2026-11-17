const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];

function setup(periodic = false) {
  const h = hookHarness(), calls = [], queries = [];
  let active = true;
  const { default: Screen } = loader({
    react: h.react,
    'expo-router': {router: {push: () => {}}},
    'react-native': { Text: 'Text', View: 'View', TextInput: 'Input', TouchableOpacity: 'Press', ActivityIndicator: 'Loading' },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/fleetRegistryApi': {
      useGetMyFleetAssignmentsQuery: (_a, opts) => {
        queries.push(opts);
        return { data: { items: [{ id: 'assignment-test', status: 'PENDING', terms: 'Conditions à accepter', brand: 'Test', model: 'Test', plate: 'TEST', organizationName: 'Flotte test', ...(periodic ? {periodicAmountMinor:'500000',paymentPeriod:'WEEKLY'} : {}) }] } };
      },
      useGetMyFleetOrganizationsQuery: (_a, opts) => { queries.push(opts); return { data: { items: [] } }; },
      useDecideFleetAssignmentMutation: () => [(payload) => ({ unwrap: async () => { calls.push(payload); } }), { isLoading: false }],
      useCreateFleetOrganizationMutation: () => [(payload) => ({ unwrap: async () => { calls.push(payload); } }), { isLoading: false }],
    },
  })('app/services/fleet.tsx');
  return { render: () => nodes(h.render(() => Screen())), calls, queries,
    blur: () => { active = false; }, close: () => h.unmount() };
}

test('fleet invitation displays immutable conditions and requires consent before accepting', async () => {
  const h = setup();
  let tree = h.render();
  assert.equal(tree.some(n => n.props?.title === 'Accepter le véhicule'), false);
  tree.find(n => n.props?.title === 'Lire les conditions').props.onPress();
  tree = h.render();
  assert.ok(tree.includes('Conditions à accepter'));
  assert.equal(tree.find(n => n.props?.title === 'Accepter le véhicule').props.disabled, true);
  tree.find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  tree = h.render();
  const button = tree.find(n => n.props?.title === 'Accepter le véhicule');
  assert.equal(button.props.disabled, false);
  await Promise.all([button.props.onPress(), button.props.onPress()]);
  assert.deepEqual(h.calls, [{ id: 'assignment-test', accept: true }]);
  h.close();
});

test('driver can refuse without accepting terms, and inactive screen stops reads/actions', async () => {
  const h = setup();
  h.render().find(n => n.props?.title === 'Lire les conditions').props.onPress();
  await h.render().find(n => n.props?.title === 'Refuser').props.onPress();
  assert.deepEqual(h.calls, [{ id: 'assignment-test', accept: false }]);
  h.blur(); h.queries.length = 0;
  const tree = h.render();
  assert.ok(h.queries.every(q => q.skip && !q.pollingInterval));
  assert.equal(tree.find(n => n.props?.title === 'Refuser').props.disabled, true);
  h.close();
});

test('periodic amount is visible before consent and the acknowledgement accompanies acceptance', async () => {
  const h=setup(true);
  assert.ok(h.render().some(n=>typeof n==='string' && /5\s000 FC \/ semaine/.test(n)));
  h.render().find(n=>n.props?.title==='Lire les conditions').props.onPress();
  h.render().find(n=>n.props?.accessibilityRole==='checkbox').props.onPress();
  await h.render().find(n=>n.props?.title==='Accepter le véhicule').props.onPress();
  assert.deepEqual(h.calls,[{id:'assignment-test',accept:true,paymentTermsConfirmed:true}]);h.close();
});

test('fleet API keeps driver identity server-derived and uses actual partner registry endpoints', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: ({ endpoints: make }) => { endpoints = make({ query: x => x, mutation: x => x }); return {}; } } } })('store/api/fleetRegistryApi.ts');
  assert.equal(endpoints.getMyFleetAssignments.query().url, '/partners/fleet-assignments/history');
  const decision = endpoints.decideFleetAssignment.query({ id: 'test/id', accept: true });
  assert.equal(decision.url, '/partners/fleet-assignments/test%2Fid/decide');
  assert.deepEqual(decision.body, { accept: true });
  assert.deepEqual(endpoints.createFleetOrganization.query({ displayName: 'Test' }).body, {
    displayName: 'Test', legalType: 'INDIVIDUAL', partnerTypes: ['FLEET_OWNER'],
  });
});
