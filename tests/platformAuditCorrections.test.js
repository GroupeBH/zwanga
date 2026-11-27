const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = x => x == null || typeof x === 'boolean' ? [] : Array.isArray(x) ? x.flatMap(nodes)
  : [x, ...nodes(x.props?.children)];
const flush = () => new Promise(resolve => setImmediate(resolve));

test('overdue pickup warning keeps its explanation instead of becoming a date validation error', () => {
  const { getApiErrorMessage } = loader()('utils/errorHelpers.ts');
  const message = "L'heure maximale souhaitée est dépassée et le conducteur ne vous a pas encore pris en charge. Vous pouvez attendre ou choisir un autre conducteur. Nous vous conseillons aussi d'ajuster la date et l'heure de la commande.";
  assert.equal(getApiErrorMessage({ message }, 'Erreur'), message);
  assert.match(getApiErrorMessage({ message: 'departure date must not be in the past' }, 'Erreur'), /date et une heure/);
});

function quoteFixture() {
  const hooks = hookHarness(), calls = []; let id = 'case-a', active = true, finish, reject, busy = false;
  const item = { id, status: 'quoted', canAccept: true, canCancel: true, serviceCode: 'documents',
    application: { fullName: 'Fixture', documents: [] }, documents: [], ledger: [],
    quote: { version: 1, totalMinor: 10000, depositMinor: 0, currency: 'CDF',
      validUntil: '2099-01-01', installments: [], retainedDocuments: [], terms: { text: 'Fixture' } } };
  const result = { currentData: item, isFetching: false, isLoading: false, isError: false, refetch() {} };
  const mutation = kind => arg => { calls.push({ kind, arg }); return { unwrap: () => new Promise((resolve, fail) => { finish = resolve; reject = fail; }) }; };
  const Screen = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Loader' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useLocalSearchParams: () => ({ id }), router: { push() {} } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'ServiceButton', s: {} },
    '@/store/api/proServicesApi': { useGetProCaseQuery: () => result, useGetProOfferingsQuery: () => ({}),
      useAcceptProQuoteMutation: () => [mutation('accept'), { isLoading: busy }],
      useCancelProCaseMutation: () => [mutation('cancel'), { isLoading: false }] },
  })('app/services/[id].tsx').default;
  const render = () => nodes(hooks.render(Screen));
  const consent = () => { render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress(); };
  const accept = () => render().find(n => n.props?.title === 'Accepter ce devis');
  return { hooks, calls, result, render, consent, accept, finish: () => finish?.({ id }),
    fail: () => reject({ data: { message: 'Erreur temporaire de test' } }), setBusy: value => { busy = value; },
    setId: value => { id = value; }, setActive: value => { active = value; } };
}

test('quote mutation failure remains visible during loading and can be retried', async () => {
  const f = quoteFixture(); f.consent(); const first = f.accept().props.onPress();
  f.setBusy(true); f.render(); f.fail(); await first;
  assert.ok(f.render().some(n => n === 'Erreur temporaire de test'));
  f.setBusy(false); const retry = f.accept().props.onPress();
  assert.equal(f.calls.length, 2); f.finish(); await retry; f.hooks.unmount();
});

test('quote acceptance is synchronous single-flight and cannot replay a completed version from stale UI', async () => {
  const f = quoteFixture(); f.consent(); const button = f.accept();
  const first = button.props.onPress(); await button.props.onPress();
  assert.equal(f.calls.length, 1); f.finish(); await first;
  await button.props.onPress(); assert.equal(f.calls.length, 1); f.hooks.unmount();
});

for (const state of ['isError', 'isFetching', 'isLoading', 'inactive', 'foreign', 'unmounted']) {
  test(`quote action rejects ${state} even if an old button callback is invoked`, async () => {
    const f = quoteFixture(); f.consent(); const oldButton = f.accept();
    if (state === 'inactive') f.setActive(false);
    else if (state === 'foreign') f.setId('case-b');
    else if (state === 'unmounted') f.hooks.unmount();
    else f.result[state] = true;
    if (state !== 'unmounted') {
      const button = f.accept(); assert.equal(button.props.disabled, true);
    }
    await oldButton.props.onPress(); assert.equal(f.calls.length, 0);
    if (state !== 'unmounted') f.hooks.unmount();
  });
}

test('quote requires renewed consent after a new version', async () => {
  const f = quoteFixture(); f.consent(); const previous = f.accept();
  f.result.currentData = { ...f.result.currentData, quote: { ...f.result.currentData.quote, version: 2 } };
  f.render(); assert.equal(f.accept().props.disabled, true);
  await previous.props.onPress(); assert.equal(f.calls.length, 0); f.hooks.unmount();
});

test('GPS failure backoff and in-flight lease cannot block or release the next ride', () => {
  const { createLocationSendGate } = loader()('services/background/locationSendGate.ts');
  const gate = createLocationSendGate(); const old = gate.acquire('ride-a', 100, 4000);
  old.record(100, 30000); old.release(); assert.equal(gate.acquire('ride-a', 200, 4000), null);
  const next = gate.acquire('ride-b', 200, 4000); assert.ok(next);
  old.record(500, 30000); old.release(); assert.equal(old.isCurrent(), false);
  assert.equal(gate.acquire('ride-b', 500, 4000), null, 'old finally cannot release current in-flight');
  next.record(500); next.release(); assert.equal(gate.acquire('ride-b', 4499, 4000), null);
  assert.ok(gate.acquire('ride-b', 4500, 4000));
});

test('GPS stop/restart invalidates old lease even for the same ride, with scoped stop', () => {
  const { createLocationSendGate } = loader()('services/background/locationSendGate.ts');
  const gate = createLocationSendGate(); const old = gate.acquire('ride', 0, 4000);
  gate.reset('other'); assert.equal(old.isCurrent(), true);
  gate.reset('ride'); const next = gate.acquire('ride', 1, 4000); assert.ok(next);
  old.record(10000, 30000); old.release(); assert.equal(next.isCurrent(), true);
  assert.equal(gate.acquire('ride', 50000, 4000), null);
  gate.reset(); assert.equal(next.isCurrent(), false);
});

test('credit mutation revalidates credit subscriptions but not document or fleet queries', async t => {
  const { createApi } = require('@reduxjs/toolkit/query'); const { configureStore } = require('@reduxjs/toolkit');
  const calls = [];
  const baseApi = createApi({ reducerPath: 'audit', tagTypes: ['ProServices', 'Wallet'],
    baseQuery: async arg => { const url = typeof arg === 'string' ? arg : arg.url; calls.push(url); return { data: { items: [] } }; }, endpoints: () => ({}) });
  const load = loader({ './baseApi': { baseApi } });
  load('store/api/assetCreditApi.ts'); load('store/api/proServicesApi.ts'); load('store/api/fleetApplicationsApi.ts');
  const store = configureStore({ reducer: { [baseApi.reducerPath]: baseApi.reducer }, middleware: get => get().concat(baseApi.middleware) });
  t.after(() => store.dispatch(baseApi.util.resetApiState()));
  await store.dispatch(baseApi.endpoints.getAssetCredits.initiate());
  await store.dispatch(baseApi.endpoints.getMyProCases.initiate());
  await store.dispatch(baseApi.endpoints.getMyFleetApplications.initiate({}));
  const before = [...calls];
  await store.dispatch(baseApi.endpoints.repayAssetCredit.initiate({ id: 'credit', mutationId: 'once', amountMinor: 100 }));
  await flush();
  assert.equal(calls.filter(url => url === '/asset-credits/mine').length, 2);
  assert.equal(calls.filter(url => url === '/pro-services/mine').length, 1);
  for (const url of before.filter(url => url.includes('fleet'))) assert.equal(calls.filter(x => x === url).length, 1);
});
