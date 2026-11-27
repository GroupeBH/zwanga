const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi, fetchBaseQuery } = require('@reduxjs/toolkit/query');
const { loader } = require('../helpers/loadTypeScript.cjs');
const { hookHarness } = require('../helpers/hookHarness.cjs');
const { startCommerceBackend } = require('../helpers/commerceBackendFixture.cjs');
let backend, admin, stockCounter = 0;
const clients = [];
before(async () => { backend = await startCommerceBackend(); admin = client(backend.admin, true); }, { timeout: 180000 });
after(async () => { for (const c of clients) c.store.dispatch(c.api.util.resetApiState()); await backend?.close(); });
afterEach(() => assert.equal(backend.blockedConnections(), 0, 'No external provider connection'));
function client(actor, administrative = false) {
  const api = createApi({ reducerPath: 'commerceE2E', tagTypes: ['Wallet'], endpoints: () => ({}),
    baseQuery: fetchBaseQuery({ baseUrl: backend.baseUrl, prepareHeaders: headers => { headers.set('Authorization', 'Bearer ' + actor.token); return headers; } }) });
  if (administrative) {
    const load = loader({ '../api/baseApi': { baseApi: api } });
    load('../zwanga-admin/lib/features/assetCredits/commerceApi.ts');
    load('../zwanga-admin/lib/features/assetCredits/proCreditApi.ts');
  } else loader({ './baseApi': { baseApi: api } })('store/api/commerceApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: get => get({ serializableCheck: false, immutableCheck: false }).concat(api.middleware) });
  const result = { actor, api, store, call: (name, arg) => store.dispatch(api.endpoints[name].initiate(arg, { subscribe: false, forceRefetch: true })).unwrap() };
  clients.push(result); return result;
}
async function raw(actor, route, method = 'GET', body) {
  const r = await fetch(backend.baseUrl + route, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
const terms = { version: 'commerce-v1', acquisitionMinor: '60000', expensesMinor: '0', marginMinor: '40000', minimumMarginMinor: '10000', depositMinor: '10000', plans: [{ id: 'three-months', period: 'month', count: 3 }, { id: 'six-weeks', period: 'week', count: 6 }] };
async function product(kind = 'phone', override = {}) {
  const category = (await admin.call('adminCommerceCategories')).items.find(c => c.kind === kind);
  const created = await admin.call('createCommerceProduct', { mutationId: randomUUID(), kind, code: `test-${randomUUID()}`, name: 'Produit de recette', description: 'Produit fictif pour recette locale seulement', brand: 'Test', model: 'Test',
    supplierId: backend.partyId, sellerId: backend.partyId, creditorId: backend.partyId, policyId: backend.policyId, financingModel: 'ZWANGA_DIRECT', currency: 'CDF', priceMinor: '100000', feeMinor: '0', vehicleTypes: [], requiredEvidence: [], processingDays: 1 });
  await admin.call('configureCommerceProduct', { id: created.id, mutationId: randomUUID(), revision: 1, categoryId: category.id, commerce: { ...terms, ...override } });
  await admin.call('enableCommerceProduct', { id: created.id, enabled: true });
  return { ...created, categoryId: category.id };
}
async function originate(p, mode = 'credit', withDocument = false) {
  const actor = await backend.actor(), mobile = client(actor);
  const quote = await mobile.call('commerceQuote', { id: p.id, mode, ...(mode === 'credit' ? { planId: 'three-months' } : {}) });
  const document = withDocument ? await backend.documentCase(actor.id) : {};
  const applied = await mobile.call('commerceApply', { mutationId: randomUUID(), productId: p.id, mode, planId: quote.planId ?? undefined, quoteHash: quote.quoteHash,
    depositMinor: quote.depositMinor, installments: quote.installments, period: quote.period, notes: 'Préférence de recette', evidence: [], ...document });
  const offered = await admin.call('reviewProApplication', { id: applied.id, mutationId: randomUUID(), approve: true, reason: 'Validation synthétique locale' });
  const detail = await mobile.call('commerceContract', offered.id);
  await mobile.call('commerceAccept', { id: offered.id, mutationId: randomUUID(), consent: true, termsHash: detail.termsHash, ...(mode === 'credit' ? { mandateUntil: new Date(Date.now() + 400 * 86400000).toISOString() } : {}) });
  return { id: offered.id, actor, mobile, productId: p.id, quote, document: withDocument };
}
async function deliveryBody(l) {
  const body = { mutationId: randomUUID(), proofId: await backend.proof() };
  if (l.document) body.issuedAt = new Date().toISOString();
  else { const stock = await raw(backend.admin, '/zwanga-pro/admin/stock', 'POST', { mutationId: randomUUID(), productId: l.productId, inventoryReference: `TEST-${randomUUID().toUpperCase()}`, serial: randomUUID(), imei: '900000000' + String(++stockCounter).padStart(6, '0') }); assert.equal(stock.status, 201, JSON.stringify(stock.body)); body.stockId = stock.body.id; }
  return body;
}
async function activate(l, body) {
  const delivered = await raw(backend.admin, `/zwanga-pro/admin/contracts/${l.id}/deliver`, 'POST', body ?? await deliveryBody(l));
  assert.equal(delivered.status, 201, JSON.stringify(delivered.body));
  await admin.call('activateProContract', { id: l.id, mutationId: randomUUID() });
}
const nodes = t => t == null || typeof t === 'boolean' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children), ...nodes(t.props?.footer)];

test('real admin form callbacks create the public product through admin API and real backend', async () => {
  const hooks = hookHarness(); const notices = []; let closed = false;
  const config = await admin.call('commerceConfiguration'), categories = await admin.call('adminCommerceCategories');
  const mutation = name => [arg => ({ unwrap: () => admin.call(name, arg) })];
  const Screen = loader({ react: hooks.react, '../../terrain-agents/Dialog': { default: 'Dialog' },
    '../../styles/page.module.css': {}, './catalogue.module.css': {},
    '@/lib/features/assetCredits/assetCreditModel': loader()('../zwanga-admin/lib/features/assetCredits/assetCreditModel.ts'),
    '@/lib/features/assetCredits/cataloguePricing': loader()('../zwanga-admin/lib/features/assetCredits/cataloguePricing.ts'),
    '@/app/components/ui/Feedback': { confirmAction: async () => true, notify: message => notices.push(message) },
    '@/lib/utils/apiErrors': { getApiErrorMessage: e => JSON.stringify(e) },
    '@/lib/features/assetCredits/commerceApi': {
      useCommerceConfigurationQuery: () => ({ currentData: config }), useAdminCommerceCategoriesQuery: () => ({ currentData: categories }),
      useCreateCommerceProductMutation: () => mutation('createCommerceProduct'), useConfigureCommerceProductMutation: () => mutation('configureCommerceProduct'), useEnableCommerceProductMutation: () => mutation('enableCommerceProduct'), useSaveCommerceCategoryMutation: () => mutation('saveCommerceCategory'),
    },
  })('../zwanga-admin/app/(admin)/zwanga-pro/catalogue/ProductEditor.tsx').default;
  const render = () => nodes(hooks.render(() => Screen({ product: null, onClose: () => { closed = true; } })));
  const field = (label, value) => {
    const wrapper = render().find(n => label.test(n.props?.label ?? ''));
    assert.ok(wrapper, String(label));
    const input = nodes(wrapper.props.children).find(n => ['input', 'select', 'textarea'].includes(n.type));
    if (input) input.props.onChange({ target: { value } }); else wrapper.props.onChange(value);
  };
  field(/^Nom affich/, 'Téléphone créé par interface'); field(/^Description$/, 'Fiche de test créée par le vrai formulaire admin');
  field(/^Marque$/, 'Test'); field(/^Modèle$/, 'Test');
  field(/^Coût/, '600'); field(/^Frais/, '0'); field(/^Gain souhait/, '400'); field(/^Gain minimum/, '100'); field(/^Acompte/, '100');
  field(/^Catégorie/, categories.items.find(c => c.kind === 'phone').id);
  field(/^Fournisseur$/, backend.partyId); field(/^Vendeur$/, backend.partyId); field(/^Financeur$/, backend.partyId);
  field(/^Conditions du contrat$/, backend.policyId);
  const code = `test-ui-${randomUUID()}`;
  field(/^Code produit$/, code);
  await render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(closed, true, render().filter(n => typeof n === 'string').join(' '));
  assert.match(notices.join(' '), /Produit créé/); hooks.unmount();
  const p = (await admin.call('adminCommerceProducts')).items.find(p => p.name === 'Téléphone créé par interface');
  assert.ok(p); assert.equal(p.enabled, false); assert.equal(p.commerce.acquisitionMinor, '60000');
  await admin.call('enableCommerceProduct', { id: p.id, enabled: true });
  const visible = await raw(null, `/zwanga-pro/commerce/products/${p.id}`);
  assert.equal(visible.status, 200); assert.equal(visible.body.prices.cashTotalMinor, '80000');
  assert.doesNotMatch(JSON.stringify(visible.body), /acquisitionMinor|marginMinor|creditorId/);
});

test('cash product: mobile choice, admin approval, one debit, mandatory payment before handover, then settled', async () => {
  const l = await originate(await product(), 'cash'), body = await deliveryBody(l);
  assert.equal((await raw(backend.admin, `/zwanga-pro/admin/contracts/${l.id}/deliver`, 'POST', body)).status, 409);
  const payment = { id: l.id, mutationId: randomUUID(), purpose: 'repayment', amountMinor: l.quote.totalMinor };
  const before = Number(await backend.wallet(l.actor.id));
  await Promise.all([l.mobile.call('commercePay', payment), l.mobile.call('commercePay', payment)]);
  const after = Number(await backend.wallet(l.actor.id)); assert.equal(before - after, 80);
  await activate(l, body);
  const detail = await l.mobile.call('commerceContract', l.id);
  assert.equal(detail.status, 'settled'); assert.equal(detail.remainingMinor, '0'); assert.equal(detail.paidMinor, '80000'); assert.equal(detail.mandateUntil, null);
  await assert.rejects(l.mobile.call('commerceSettlement', l.id), e => e.status === 409);
});

test('credit: daily partial payments, stale quote rejection, 10 percent discount, admin and mobile reconciliation', async () => {
  const l = await originate(await product());
  await l.mobile.call('commercePay', { id: l.id, mutationId: randomUUID(), purpose: 'deposit', amountMinor: '10000' }); await activate(l);
  const before = await l.mobile.call('commerceSettlement', l.id);
  await l.mobile.call('commercePay', { id: l.id, mutationId: randomUUID(), purpose: 'repayment', amountMinor: '1000' });
  await assert.rejects(l.mobile.call('commerceSettle', { id: l.id, mutationId: randomUUID(), quoteHash: before.quoteHash }), e => e.status === 409);
  const quote = await l.mobile.call('commerceSettlement', l.id);
  assert.equal(quote.amountMinor, '80100'); assert.equal(quote.discountMinor, '8900');
  const body = { id: l.id, mutationId: randomUUID(), quoteHash: quote.quoteHash };
  await l.mobile.call('commerceSettle', body); await l.mobile.call('commerceSettle', body);
  const mobile = await l.mobile.call('commerceContract', l.id), dashboard = await admin.call('getProContract', l.id);
  for (const key of Object.keys(mobile)) assert.deepEqual(mobile[key], dashboard[key], key);
  for (const key of ['driverId', 'debtor', 'overdueDays', 'overdueMinor']) assert.equal(Object.hasOwn(mobile, key), false, key);
  assert.equal(mobile.paidMinor, '81100'); assert.equal(mobile.discountMinor, '8900'); assert.equal(mobile.remainingMinor, '0');
  assert.deepEqual((await admin.call('getProOverview')).reconciliation.mismatches, []);
});

test('document: zero deposit requires first installment, daily payments count toward same schedule', async () => {
  const l = await originate(await product('document', { depositMinor: '0' }), 'credit', true), body = await deliveryBody(l);
  assert.equal((await raw(backend.admin, `/zwanga-pro/admin/contracts/${l.id}/deliver`, 'POST', body)).status, 409);
  await l.mobile.call('commercePay', { id: l.id, mutationId: randomUUID(), purpose: 'repayment', amountMinor: l.quote.beforeDeliveryMinor });
  await activate(l, body);
  const detail = await l.mobile.call('commerceContract', l.id);
  assert.equal(detail.installments[0].remainingMinor, '0'); assert.equal(detail.deliveryState, 'delivered');
});

test('changing paid-period formula preserves balance/history and rejects stale mutation or unpaid boundary', async () => {
  const l = await originate(await product());
  await l.mobile.call('commercePay', { id: l.id, mutationId: randomUUID(), purpose: 'deposit', amountMinor: '10000' }); await activate(l);
  await assert.rejects(l.mobile.call('commercePlans', l.id), e => e.status === 409);
  await backend.paidPeriod(l.id);
  await assert.rejects(l.mobile.call('commercePlans', l.id), e => e.status === 409);
  await l.mobile.call('commercePay', { id: l.id, mutationId: randomUUID(), purpose: 'repayment', amountMinor: '30000' });
  const options = await l.mobile.call('commercePlans', l.id);
  const body = { id: l.id, mutationId: randomUUID(), expectedVersion: options.version, expectedRemainingMinor: options.remainingMinor, planId: 'six-weeks' };
  await l.mobile.call('commerceChangePlan', body); await l.mobile.call('commerceChangePlan', body);
  await assert.rejects(l.mobile.call('commerceChangePlan', { ...body, mutationId: randomUUID() }), e => e.status === 409);
  const current = await l.mobile.call('commerceContract', l.id); assert.equal(current.remainingMinor, '60000'); assert.equal(current.installments.length, 6);
});

test('JWT, role, ownership, KYC and real-activity eligibility stay enforced on the new routes', async () => {
  const p = await product(), l = await originate(p), stranger = client(await backend.actor()), noKyc = client(await backend.actor('driver', false));
  assert.equal((await raw(null, '/zwanga-pro/mine')).status, 401);
  assert.equal((await raw(l.actor, '/zwanga-pro/commerce/admin/categories')).status, 403);
  await assert.rejects(stranger.call('commerceContract', l.id), e => e.status === 404);
  await assert.rejects(stranger.call('commerceSettlement', l.id), e => e.status === 404);
  const quote = await noKyc.call('commerceQuote', { id: p.id, mode: 'cash' });
  const body = { mutationId: randomUUID(), productId: p.id, mode: 'cash', quoteHash: quote.quoteHash, depositMinor: '0', installments: 1, period: 'month', evidence: [], notes: '' };
  await assert.rejects(noKyc.call('commerceApply', body), e => e.status === 409);
  const vehicle = await product('vehicle'), vquote = await stranger.call('commerceQuote', { id: vehicle.id, mode: 'credit', planId: 'three-months' });
  await assert.rejects(stranger.call('commerceApply', { ...body, mutationId: randomUUID(), productId: vehicle.id, mode: 'credit', planId: 'three-months', quoteHash: vquote.quoteHash, depositMinor: vquote.depositMinor, installments: 3 }), e => e.status === 409);
});

test('actual mobile payment screen retries a lost committed response without a second charge', async () => {
  const l = await originate(await product());
  await l.mobile.call('commercePay', { id: l.id, mutationId: randomUUID(), purpose: 'deposit', amountMinor: '10000' }); await activate(l);
  const hooks = hookHarness(), attempts = [], query = { currentData: await l.mobile.call('commerceContract', l.id), refetch() {} };
  let lost = true, pending;
  const mutation = name => [arg => ({ unwrap: () => { pending = (async () => {
    const result = await l.mobile.call(name, arg); attempts.push(arg);
    if (lost) { lost = false; throw { status: 'TIMEOUT_ERROR' }; } return result;
  })(); return pending; } })];
  const Screen = loader({ react: hooks.react,
    'react-native': { ActivityIndicator: 'Loading', ScrollView: 'Scroll', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Press', View: 'View' },
    './ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true }, '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/hooks/wallet/useWalletScreenScope': { useWalletScreenScope: () => () => () => true }, '@/store/hooks': { useAppSelector: () => l.actor }, '@/store/selectors': { selectUser: () => l.actor },
    '@/store/api/commerceApi': { useCommerceContractQuery: () => query, useCommerceAcceptMutation: () => mutation('commerceAccept'), useCommercePayMutation: () => mutation('commercePay'),
      useCommerceSettleMutation: () => mutation('commerceSettle'), useCommerceChangePlanMutation: () => mutation('commerceChangePlan'), useLazyCommerceSettlementQuery: () => [() => {}], useLazyCommercePlansQuery: () => [() => {}, {}] },
  })('features/pro-services/CommerceContractScreen.tsx').CommerceContractScreen;
  const render = () => nodes(hooks.render(() => Screen({ id: l.id })));
  const button = title => render().find(n => n.type === 'Button' && n.props.title === title);
  render().find(n => n.type === 'Input').props.onChangeText('25'); button('Vérifier ce paiement').props.onPress();
  const confirm = button('Confirmer'); confirm.props.onPress(); confirm.props.onPress();
  await pending.catch(() => {}); await new Promise(r => setImmediate(r));
  assert.equal(attempts.length, 1);
  const balance = await backend.wallet(l.actor.id);
  button('Confirmer').props.onPress(); await pending; await new Promise(r => setImmediate(r));
  assert.equal(attempts.length, 2); assert.equal(attempts[0].mutationId, attempts[1].mutationId);
  assert.equal(await backend.wallet(l.actor.id), balance);
  assert.equal((await l.mobile.call('commerceContract', l.id)).paidMinor, '2500');
  assert.match(render().filter(n => typeof n === 'string').join(' '), /Opération confirmée/);
});

test('actual product screen sends the selected quote and comment to the admin without debiting', async () => {
  const p = await product(), actor = await backend.actor(), mobile = client(actor), hooks = hookHarness();
  const detail = await mobile.call('commerceProduct', p.id), quote = await mobile.call('commerceQuote', { id: p.id, mode: 'cash' });
  const before = await backend.wallet(actor.id); let applied;
  const Screen = loader({ react: hooks.react, 'expo-router': { router: {} }, 'expo-image-picker': {},
    'react-native': { ActivityIndicator: 'Loading', Image: 'Image', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Press', View: 'View' },
    './ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} }, '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) }, '@/hooks/wallet/useWalletScreenScope': { useWalletScreenScope: () => () => () => true },
    '@/store/hooks': { useAppSelector: () => actor }, '@/store/selectors': { selectUser: () => actor },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: () => ({}) }, '@/store/api/proServicesApi': { useGetMyProCasesQuery: () => ({}) },
    '@/store/api/commerceApi': { useCommerceProductQuery: () => ({ currentData: detail }), useCommerceQuoteQuery: () => ({ currentData: quote }),
      useCommerceApplyMutation: () => [arg => ({ unwrap: async () => { applied = await mobile.call('commerceApply', arg); return applied; } }), {}], useCommerceUploadMutation: () => [() => {}, {}] },
  })('features/pro-services/CommerceProductScreen.tsx').CommerceProductScreen;
  const render = () => nodes(hooks.render(() => Screen({ id: p.id })));
  const button = title => render().find(n => n.type === 'Button' && n.props.title === title);
  render().find(n => n.type === 'Input').props.onChangeText('Préférence transmise depuis la fiche');
  await button('Vérifier mon choix').props.onPress(); assert.equal(applied, undefined);
  await button('Envoyer mon dossier').props.onPress(); assert.ok(applied?.id);
  assert.equal(await backend.wallet(actor.id), before);
  const adminDetail = await admin.call('getProApplication', applied.id);
  assert.equal(adminDetail.notes, 'Préférence transmise depuis la fiche');
  assert.equal(adminDetail.proApplication.snapshot.purchase.totalMinor, '80000');
  assert.equal(adminDetail.proApplication.snapshot.purchase.mode, 'cash');
});

test('public website consumes the real catalogue and renders the same prices without private costs', async () => {
  const p = await product(), original = process.env.NEXT_PUBLIC_API_PUBLIC_URL;
  process.env.NEXT_PUBLIC_API_PUBLIC_URL = backend.baseUrl;
  try {
    const commerce = loader()('../zwanga-web/lib/commerce.ts');
    const fetched = await commerce.publicCommerce(`products/${p.id}`);
    assert.equal(fetched.prices.cashTotalMinor, '80000');
    assert.doesNotMatch(JSON.stringify(fetched), /acquisitionMinor|marginMinor|creditorId/);
    const Page = loader({ 'next/link': 'Link', 'next/navigation': { notFound() { throw Error('Missing product'); } }, '@/lib/commerce': commerce, '../catalogue.module.css': {} })('../zwanga-web/app/equipements/[id]/page.tsx').default;
    const tree = nodes(await Page({ params: Promise.resolve({ id: p.id }) }));
    const text = tree.filter(n => typeof n === 'string').join(' ');
    assert.match(text, /800 FC/); assert.match(text, /Payer à crédit/);
    assert.ok(tree.find(n => n.type === 'a' && n.props.href === `zwanga://services/catalogue/${p.id}`));
  } finally { if (original === undefined) delete process.env.NEXT_PUBLIC_API_PUBLIC_URL; else process.env.NEXT_PUBLIC_API_PUBLIC_URL = original; }
});
