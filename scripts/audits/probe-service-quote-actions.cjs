// Observational reproduction, NOT a passing regression gate. No HTTP or database.
const { loader } = require('../../tests/helpers/loadTypeScript.cjs');
const { hookHarness } = require('../../tests/helpers/hookHarness.cjs');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
async function probe(readFailed) {
  const hooks = hookHarness();
  const calls = [];
  const item = { id: 'synthetic-case', status: 'quoted', serviceCode: 'documents', canAccept: true,
    application: { fullName: 'Synthetic', documents: [] }, documents: [], ledger: [],
    quote: { version: 1, description: 'Synthetic', totalMinor: 10000, depositMinor: 0,
      currency: 'CDF', validUntil: '2099-01-01', installments: [], retainedDocuments: [],
      terms: { version: 'test', text: 'Synthetic only' } } };
  const Screen = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Loader' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useLocalSearchParams: () => ({ id: item.id }), router: { push() {} } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'ServiceButton', s: {} },
    '@/store/api/proServicesApi': {
      useGetProCaseQuery: () => ({ currentData: item, isError: readFailed, error: readFailed ? { status: 403 } : undefined }),
      useGetProOfferingsQuery: () => ({}),
      useAcceptProQuoteMutation: () => [arg => { calls.push(arg); return { unwrap: async () => ({ id: item.id }) }; }, { isLoading: false }],
      useCancelProCaseMutation: () => [() => ({ unwrap: async () => ({}) }), { isLoading: false }],
    },
  })('app/services/[id].tsx').default;
  let tree = nodes(hooks.render(Screen));
  tree.find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  tree = nodes(hooks.render(Screen));
  const button = tree.find(n => n.props?.title === 'Accepter ce devis');
  if (!button?.props.disabled) await Promise.all([button.props.onPress(), button.props.onPress()]);
  hooks.unmount();
  return { readFailed, acceptDisabled: button?.props.disabled ?? null, invocationsBeforeRerender: calls.length };
}
Promise.all([probe(false), probe(true)]).then(results => console.log(JSON.stringify({
  scope: 'Actual component with deterministic hooks; mocked mutation; no debit', results,
}, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
