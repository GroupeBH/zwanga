const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { commerceAmount, commerceMoney } = loader()('features/pro-services/commerceModel.ts');
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];
function fixture(contract = false) {
  const hooks = hookHarness(), calls = [], paths = [];
  let active = true, session = 1, send = async () => ({ id: 'done' });
  const state = { auth: { user: { id: 'test-driver' } } };
  const prices = { cashTotalMinor: '80000', creditTotalMinor: '100000', cashSavingMinor: '20000', depositMinor: '10000', plans: [{ id: 'monthly', count: 3, period: 'month' }] };
  const product = { currentData: { id: 'product', name: 'Téléphone test', description: 'Modèle de test', kind: 'phone', prices,
    details: { requiredEvidence: [], vehicleTypes: [], processingDays: 1 }, terms: 'Contrat de test', repayment: { netIncomeBps: 500, fixedPerTripMinor: '0', commissionShareBps: 0 } } };
  const credit = { currentData: { id: 'credit', label: 'Téléphone test', status: 'active', paidMinor: '10000', principalMinor: '90000', remainingMinor: '80000',
    depositMinor: '10000', depositPaidMinor: '10000', deliveryState: 'delivered', termsHash: 'a'.repeat(64), installments: [],
    snapshot: { purchase: { mode: 'credit', period: 'month', installments: 3, totalMinor: '100000', beforeDeliveryMinor: '10000' }, product: product.currentData, policy: { terms: 'Conditions test', rules: { netIncomeBps: 500, fixedPerTripMinor: '0' } } } }, refetch() {} };
  const quote = { refetch() {}, isError: false, isFetching: false };
  const mutation = kind => [body => ({ unwrap: async () => { calls.push({ kind, body }); return send(body); } }), { isLoading: false }];
  const load = loader({
    react: hooks.react,
    'react-native': { ActivityIndicator: 'Loading', ScrollView: 'Scroll', Image: 'Image', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Press', View: 'View' },
    'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled: true }) },
    'expo-router': { router: { push: p => paths.push(p), replace: p => paths.push(p) } },
    './ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: v => v, displayReadOptions: v => ({ skip: !v }) },
    '@/store/hooks': { useAppSelector: fn => fn(state) }, '@/store/selectors': { selectUser: s => s.auth.user },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: () => ({ currentData: [] }) },
    '@/store/api/proServicesApi': { useGetMyProCasesQuery: () => ({ currentData: { items: [] } }) },
    '@/store/api/commerceApi': {
      useCommerceProductQuery: () => product,
      useCommerceQuoteQuery: args => ({ ...quote, currentData: { ...prices, mode: args.mode, planId: args.mode === 'credit' ? args.planId : null, quoteHash: args.mode,
        totalMinor: args.mode === 'cash' ? '80000' : '100000', depositMinor: args.mode === 'cash' ? '0' : '10000', principalMinor: args.mode === 'cash' ? '80000' : '90000',
        beforeDeliveryMinor: args.mode === 'cash' ? '80000' : '10000', installments: args.mode === 'cash' ? 1 : 3, period: 'month', installmentAmountsMinor: ['30000', '30000', '30000'] } }),
      useCommerceApplyMutation: () => mutation('apply'), useCommerceUploadMutation: () => mutation('upload'),
      useCommerceContractQuery: () => credit, useCommerceAcceptMutation: () => mutation('accept'), useCommercePayMutation: () => mutation('pay'),
      useCommerceSettleMutation: () => mutation('settle'), useCommerceChangePlanMutation: () => mutation('plan'),
      useLazyCommerceSettlementQuery: () => [() => ({ unwrap: async () => ({ quoteHash: 'settlement', amountMinor: '72000', remainingMinor: '80000', discountMinor: '8000' }) })],
      useLazyCommercePlansQuery: () => [() => ({ unwrap: async () => ({ plans: [] }) }), {}],
    },
  });
  const Screen = contract ? load('features/pro-services/CommerceContractScreen.tsx').CommerceContractScreen : load('features/pro-services/CommerceProductScreen.tsx').CommerceProductScreen;
  const render = () => nodes(hooks.render(() => Screen({ id: contract ? 'credit' : 'product' })));
  const button = title => render().find(n => n.type === 'Button' && n.props.title === title);
  const text = () => render().filter(n => n.type === 'Text').flatMap(n => nodes(n.props.children)).filter(n => typeof n === 'string').join(' ');
  return { render, button, text, calls, product, credit, quote, setSend: fn => { send = fn; },
    background: () => { active = false; render(); }, resume: () => { active = true; render(); },
    accountChange: () => { session++; state.auth.user = { id: 'other' }; render(); } };
}

test('CDF inputs preserve wallet precision and reject negatives, exponents and overprecision', () => {
  assert.equal(commerceAmount('250,5'), '25050');
  assert.equal(commerceAmount('00025'), '2500');
  for (const input of ['0', '-1', '1e3', '12.12', 'abc', '10000000001']) assert.equal(commerceAmount(input), null);
  assert.match(commerceMoney('25000'), /250.*FC/);
});
test('choosing a product never charges and requires an explicit summary before sending', async () => {
  const h = fixture();
  assert.equal(h.calls.length, 0);
  await h.button('Vérifier mon choix').props.onPress();
  assert.equal(h.calls.length, 0);
  await h.button('Envoyer mon dossier').props.onPress();
  assert.equal(h.calls[0].kind, 'apply');
  assert.equal(h.calls[0].body.mode, 'cash');
  assert.equal(h.calls[0].body.depositMinor, '0');
  assert.match(h.text(), /Aucun débit maintenant/);
});
test('sending is blocked on outdated quotes and missing required evidence', () => {
  const h = fixture(); h.quote.isFetching = true;
  assert.equal(h.button('Vérifier mon choix').props.disabled, true);
  h.quote.isFetching = false; h.product.currentData.details.requiredEvidence = ['garantie'];
  assert.equal(h.button('Vérifier mon choix').props.disabled, true);
});
test('daily repayment has a second explicit confirmation and sends a single debit on double tap', async () => {
  const h = fixture(true);
  h.render().find(n => n.type === 'Input').props.onChangeText('25');
  h.button('Vérifier ce paiement').props.onPress();
  assert.equal(h.calls.length, 0);
  let resolve; h.setSend(() => new Promise(r => { resolve = r; }));
  const confirm = h.button('Confirmer');
  const pending = confirm.props.onPress(); confirm.props.onPress();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.amountMinor, '2500');
  resolve({}); await pending; await new Promise(r => setImmediate(r));
  assert.equal(h.calls.length, 1);
});
test('a retry reuses the payment mutation ID after a connection failure', async () => {
  const h = fixture(true); h.setSend(async () => { throw Error('network'); });
  h.render().find(n => n.type === 'Input').props.onChangeText('50'); h.button('Vérifier ce paiement').props.onPress();
  h.button('Confirmer').props.onPress(); await new Promise(r => setImmediate(r));
  h.button('Confirmer').props.onPress(); await new Promise(r => setImmediate(r));
  assert.equal(h.calls.length, 2); assert.equal(h.calls[0].body.mutationId, h.calls[1].body.mutationId);
});
test('contract consent is not prechecked and cannot accept without reading agreement', () => {
  const h = fixture(true); h.credit.currentData.status = 'offered';
  assert.equal(h.button('Accepter ce contrat').props.disabled, true);
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  assert.equal(h.button('Accepter ce contrat').props.disabled, false);
  h.button('Accepter ce contrat').props.onPress(); assert.equal(h.calls.length, 0);
});
test('early settlement displays the server discount and still waits for confirmation', async () => {
  const h = fixture(true); h.button('Voir mon prix pour tout solder').props.onPress(); await new Promise(r => setImmediate(r));
  assert.match(h.text(), /720.*800/); assert.equal(h.calls.length, 0);
  h.button('Confirmer').props.onPress(); await new Promise(r => setImmediate(r));
  assert.equal(h.calls[0].kind, 'settle'); assert.equal(h.calls[0].body.quoteHash, 'settlement');
});
test('offscreen and changed-account replies do not display a payment success', async () => {
  const h = fixture(true); let resolve; h.setSend(() => new Promise(r => { resolve = r; }));
  h.render().find(n => n.type === 'Input').props.onChangeText('20'); h.button('Vérifier ce paiement').props.onPress();
  h.button('Confirmer').props.onPress(); h.accountChange(); resolve({}); await new Promise(r => setImmediate(r));
  assert.doesNotMatch(h.text(), /Opération confirmée/);
  h.background(); assert.equal(h.button('Vérifier ce paiement').props.disabled, true);
});
