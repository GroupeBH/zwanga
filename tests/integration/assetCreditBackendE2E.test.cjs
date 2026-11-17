const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi, fetchBaseQuery } = require('@reduxjs/toolkit/query');
const { loader } = require('../helpers/loadTypeScript.cjs');
const { hookHarness } = require('../helpers/hookHarness.cjs');
const { startAssetCreditBackend } = require('../helpers/assetCreditBackendFixture.cjs');
let backend, admin;
const clients = [];
before(async () => { backend = await startAssetCreditBackend(); admin = await backend.actor('super_admin'); }, { timeout: 180000 });
after(async () => { for (const { store, api } of clients) store.dispatch(api.util.resetApiState()); await backend?.close(); });
afterEach(() => assert.equal(backend.blockedConnections(), 0));

function mobile(actor) {
  const api = createApi({ reducerPath: 'creditE2E', tagTypes: ['ProServices', 'Wallet'], endpoints: () => ({}),
    baseQuery: fetchBaseQuery({ baseUrl: backend.baseUrl, prepareHeaders: headers => { headers.set('Authorization', 'Bearer ' + actor.token); return headers; } }),
  });
  loader({ './baseApi': { baseApi: api } })('store/api/assetCreditApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: get => get({ serializableCheck: false, immutableCheck: false }).concat(api.middleware) });
  clients.push({ api, store });
  return { api, store, call: (name, arg) => store.dispatch(api.endpoints[name].initiate(arg, { subscribe: false, forceRefetch: true })).unwrap() };
}
async function raw(actor, route, method = 'GET', body) {
  const response = await fetch(backend.baseUrl + route, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function offer(driver, kind, rate = 500) {
  const result = await raw(admin, '/asset-credits/admin', 'POST', { mutationId: randomUUID(), driverId: driver.id,
    assetKind: kind, label: 'Bien synthétique ' + kind, principalMinor: 100000, repaymentBps: rate,
    terms: 'Contrat synthétique pour recette locale isolée, aucun bien réel ni paiement externe.', validationReference: 'test-only' });
  assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.id;
}
async function accept(client, id) {
  const credit = await client.call('getAssetCredit', id);
  await client.call('decideAssetCredit', { id, accept: true, policyVersion: credit.policyVersion, expectedTotalRepaymentBps: credit.totalRepaymentBps });
}
async function deliver(id) {
  assert.equal((await raw(admin, '/asset-credits/admin/' + id + '/activate', 'POST',
    { assetReference: 'synthetic-' + id, deliveryReference: 'local-test-only' })).status, 201);
}

test('priced offer with fees and minimums crosses real HTTP, mobile consent and repayment without double debt', async () => {
  const driver = await backend.actor(), client = mobile(driver);
  const result = await raw(admin, '/asset-credits/admin', 'POST', { mutationId: randomUUID(), driverId: driver.id,
    assetKind: 'helmet', label: 'Casque synthétique', principalMinor: 110000, cashPriceMinor: 100000, creditFeeMinor: 10000,
    installmentCount: 4, installmentPeriod: 'week', repaymentBps: 750,
    terms: 'Contrat de test avec frais fixes inclus et minimums, remboursement précoce compté sans double paiement.', validationReference: 'local-cost-test' });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const id = result.body.id, quote = await client.call('getAssetCredit', id);
  const { hasValidCostDisclosure } = loader()('features/pro-services/creditCostDisclosure.ts');
  assert.equal(hasValidCostDisclosure(quote), true);
  assert.equal(quote.creditFeeMinor, '10000');
  assert.equal(quote.installments[0].dueAt, null);
  const consent = { id, accept: true, policyVersion: quote.policyVersion, expectedTotalRepaymentBps: quote.totalRepaymentBps };
  await assert.rejects(client.call('decideAssetCredit', consent), e => e.status === 409);
  await client.call('decideAssetCredit', { ...consent, costDisclosureVersion: quote.costDisclosureVersion });
  await deliver(id);
  await client.call('repayAssetCredit', { id, mutationId: randomUUID(), amountMinor: 30000 });
  const after = await client.call('getAssetCredit', id);
  assert.equal(after.installments[0].remainingMinor, 0);
  assert.equal(after.installments[1].remainingMinor, 25000);
  assert.equal(after.paidMinor, '30000');
  assert.equal(after.minimumDueMinor, 0);
  assert.ok(after.installments.every(row => row.dueAt));
  assert.equal(after.installments.reduce((sum, row) => sum + row.remainingMinor, 0), 80000);
});

test('all six products follow mobile endpoints → HTTP/JWT/DTO → PostgreSQL; no debit before delivery', async () => {
  for (const kind of ['phone', 'helmet', 'gps_tracker', 'delivery_equipment', 'equipment', 'vehicle']) {
    const driver = await backend.actor(), client = mobile(driver);
    assert.equal((await client.call('getAssetCreditProducts')).items.find(p => p.kind === kind).enabled, true);
    await client.call('requestAssetCredit', { assetKind: kind, notes: 'Besoin synthétique local' });
    assert.equal((await client.call('getAssetCreditRequests')).items[0].assetKind, kind);
    const id = await offer(driver, kind);
    assert.equal((await client.call('getAssetCredits')).items[0].id, id);
    await assert.rejects(client.call('repayAssetCredit', { id, mutationId: randomUUID(), amountMinor: 10000 }), e => e.status === 409);
    await accept(client, id);
    await assert.rejects(client.call('repayAssetCredit', { id, mutationId: randomUUID(), amountMinor: 10000 }), e => e.status === 409);
    assert.equal(Number((await backend.wallet(driver.id)).balance), 100000);
    await deliver(id);
    const payment = { id, mutationId: randomUUID(), amountMinor: 10000 };
    await Promise.all([client.call('repayAssetCredit', payment), client.call('repayAssetCredit', payment)]);
    await client.call('repayAssetCredit', payment);
    const credit = await client.call('getAssetCredit', id);
    assert.equal(credit.paidMinor, '10000'); assert.equal(credit.entries.length, 1);
    const balance = Number((await backend.wallet(driver.id)).balance);
    assert.ok(balance < 100000);
    await assert.rejects(client.call('repayAssetCredit', { ...payment, amountMinor: 20000 }), e => e.status === 409);
    assert.equal(Number((await backend.wallet(driver.id)).balance), balance);
    await client.call('repayAssetCredit', { id, mutationId: randomUUID(), amountMinor: 90000 });
    assert.equal((await client.call('getAssetCredits')).items[0].status, 'settled');
    assert.equal((await client.call('getAssetCredit', id)).paidMinor, '100000');
  }
});

test('different contract rates add; stale consent is rejected until rereading the cumulative amount', async () => {
  const driver = await backend.actor(), client = mobile(driver);
  const phone = await offer(driver, 'phone', 500), vehicle = await offer(driver, 'vehicle', 1500);
  const stale = await client.call('getAssetCredit', vehicle);
  assert.equal(stale.totalRepaymentBps, 1500);
  await accept(client, phone); await deliver(phone);
  await assert.rejects(client.call('decideAssetCredit', { id: vehicle, accept: true, policyVersion: stale.policyVersion,
    expectedTotalRepaymentBps: stale.totalRepaymentBps }), e => e.status === 409);
  const current = await client.call('getAssetCredit', vehicle);
  assert.equal(current.totalRepaymentBps, 2000); assert.equal(current.commissionBps, 500);
  await accept(client, vehicle); await deliver(vehicle);
  await client.call('repayAssetCredit', { id: phone, mutationId: randomUUID(), amountMinor: 100000 });
  assert.equal((await client.call('getAssetCredit', vehicle)).totalRepaymentBps, 1500);
});

test('authentication, owner isolation, KYC and operator roles reject unauthorized financing', async () => {
  const driver = await backend.actor(), stranger = await backend.actor(), client = mobile(driver);
  const id = await offer(driver, 'phone');
  assert.equal((await raw(null, '/asset-credits/mine')).status, 401);
  assert.equal((await raw(stranger, '/asset-credits/mine/' + id)).status, 404);
  assert.equal((await raw(driver, '/asset-credits/admin')).status, 403);
  await assert.rejects(mobile(stranger).call('repayAssetCredit', { id, mutationId: randomUUID(), amountMinor: 10000 }), e => e.status === 409);
  const unverified = await backend.actor('driver', false), unverifiedId = await offer(unverified, 'helmet');
  await assert.rejects(accept(mobile(unverified), unverifiedId), e => e.status === 409);
  await client.call('decideAssetCredit', { id, accept: false, policyVersion: 'asset-credit-v2' });
  assert.equal((await client.call('getAssetCredit', id)).status, 'declined');
});

test('repayment invalidates subscribed mobile lists and the refreshed balance survives reopening', async () => {
  const driver = await backend.actor(), client = mobile(driver), id = await offer(driver, 'vehicle');
  await accept(client, id); await deliver(id);
  const subscription = client.store.dispatch(client.api.endpoints.getAssetCredits.initiate());
  await subscription.unwrap();
  await client.call('repayAssetCredit', { id, mutationId: randomUUID(), amountMinor: 10000 });
  await Promise.all(client.store.dispatch(client.api.util.getRunningQueriesThunk()));
  const items = client.api.endpoints.getAssetCredits.select()(client.store.getState()).data.items;
  assert.equal(items.find(c => c.id === id).paidMinor, '10000');
  subscription.unsubscribe();
  assert.equal((await mobile(driver).call('getAssetCredit', id)).paidMinor, '10000');
});

test('actual detail screen confirms a chosen amount and safely resumes a committed response lost over the network', async () => {
  const driver = await backend.actor(), client = mobile(driver), id = await offer(driver, 'helmet');
  await accept(client, id); await deliver(id);
  const query = { data: await client.call('getAssetCredit', id) }, disk = new Map(), attempts = [];
  const hooks = hookHarness();
  let lost = true;
  const Screen = loader({ react: hooks.react,
    'react-native': { Text: 'Text', View: 'View', TextInput: 'Input', TouchableOpacity: 'Press', ActivityIndicator: 'Loading' },
    'expo-router': { useLocalSearchParams: () => ({ id }) },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/hooks': { useAppSelector: select => select() },
    '@/store/selectors': { selectUser: () => driver },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@react-native-async-storage/async-storage': { getItem: async key => disk.get(key) ?? null,
      setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } },
    '@/store/api/assetCreditApi': { useGetAssetCreditQuery: () => query,
      useDecideAssetCreditMutation: () => [arg => ({ unwrap: () => client.call('decideAssetCredit', arg) }), {}],
      useRepayAssetCreditMutation: () => [arg => ({ unwrap: async () => {
        attempts.push(arg); assert.equal(disk.size, 1);
        const result = await client.call('repayAssetCredit', arg);
        if (lost) { lost = false; throw { status: 'TIMEOUT_ERROR' }; }
        query.data = await client.call('getAssetCredit', id); return result;
      } }), {}] },
  })('app/services/credit/[id].tsx').default;
  const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const render = () => nodes(hooks.render(Screen));
  const button = title => render().find(n => n.props?.title === title);
  try {
    render(); await new Promise(resolve => setImmediate(resolve));
    render().find(n => n.type === 'Input').props.onChangeText('100');
    await button('Rembourser').props.onPress(); assert.equal(attempts.length, 0, 'No debit without confirmation');
    await button('Confirmer le remboursement').props.onPress();
    assert.equal((await client.call('getAssetCredit', id)).paidMinor, '10000');
    const retry = button('Vérifier ce remboursement'); assert.ok(retry);
    await retry.props.onPress();
    assert.equal(attempts[0].mutationId, attempts[1].mutationId);
    assert.equal(query.data.entries.length, 1); assert.equal(query.data.paidMinor, '10000');
    assert.equal(disk.size, 0); assert.ok(render().includes('Remboursement enregistré.'));
  } finally { hooks.unmount(); }
});
