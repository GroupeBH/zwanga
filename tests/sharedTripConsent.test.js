const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
function fixture(t, isOwner = true) {
  const hooks = hookHarness(), dialogs = [], calls = [], refreshes = [];
  const offer = { id: 'offer', existingTripId: 'trip', pricePerSeat: 1000, driver: { firstName: 'Test' }, status: 'pending' };
  const props = { requestId: 'request', isOwner, readsEnabled: true, seats: 2, hasPendingOffer: false,
    context: { hasOngoingTrip: true, trip: { id: 'trip', pricePerSeat: 1000, availableSeats: 2 } }, refresh: () => refreshes.push(true) };
  const invoke = type => payload => ({ unwrap: async () => { calls.push([type, payload]); return {}; } });
  const { SharedTripPanel } = loader({ react: { ...React, ...hooks.react },
    'react-native': { Text: 'Text', View: 'View', TouchableOpacity: 'Button', StyleSheet: { create: x => x } },
    '@/hooks/useDisplayReads': { displayReadOptions: (enabled, interval) => ({ skip: !enabled, interval }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '@/store/api/sharedTripApi': {
      useSharedTripOffersQuery: (_id, options) => ({ currentData: options.skip ? undefined : [offer] }),
      useProposeSharedTripMutation: () => [invoke('propose'), {}], useDecideSharedTripMutation: () => [invoke('decide'), {}],
    },
  })('features/request-detail/SharedTripPanel.tsx');
  t.after(() => hooks.unmount());
  return { props, calls, dialogs, refreshes, render: () => hooks.render(() => SharedTripPanel(props)) };
}
test('viewing a shared offer never consents; explicit confirmation discloses sharing and exact total', async t => {
  const f = fixture(t), tree = f.render();
  elements(tree).find(e => e.type === 'Button' && words(e).includes('Voir et accepter')).props.onPress();
  assert.equal(f.calls.length, 0);
  assert.match(f.dialogs[0].message, /déjà en trajet/);
  assert.match(f.dialogs[0].message, /2000 FC/);
  assert.match(f.dialogs[0].message, /arrêts supplémentaires/);
  f.dialogs[0].actions[1].onPress(); await flush();
  assert.deepEqual(f.calls, [['decide', { requestId: 'request', offerId: 'offer', accept: true }]]);
});
test('refusing a shared offer does not cancel the request', async t => {
  const f = fixture(t);
  elements(f.render()).find(e => e.type === 'Button' && words(e) === 'Refuser').props.onPress(); await flush();
  assert.deepEqual(f.calls, [['decide', { requestId: 'request', offerId: 'offer', accept: false }]]);
});
test('driver proposes only after confirmation and waits for the passenger without creating a separate ride', async t => {
  const f = fixture(t, false);
  let acknowledged = 0; f.props.onProposed = () => { acknowledged++; };
  elements(f.render()).find(e => e.type === 'Button').props.onPress();
  assert.equal(f.calls.length, 0);
  assert.equal(acknowledged, 0);
  f.dialogs[0].actions[1].onPress(); await flush();
  assert.deepEqual(f.calls, [['propose', { requestId: 'request', tripId: 'trip' }]]);
  assert.equal(acknowledged, 1);
  f.props.hasPendingOffer = true;
  const tree = f.render(); assert.equal(elements(tree).filter(e => e.type === 'Button').length, 0);
  assert.match(words(tree), /Attendez l’accord/);
});
test('unavailable trip has no proposal action', t => {
  const f = fixture(t, false); f.props.context.trip = null; f.props.context.reason = 'Plus de place';
  const tree = f.render(); assert.equal(elements(tree).filter(e => e.type === 'Button').length, 0);
  assert.match(words(tree), /Plus de place/);
});
test('shared API uses dedicated consent endpoint; decline never sends consent', () => {
  let endpoints;
  loader({ '@/constants/network': { CRITICAL_MUTATION_TIMEOUT_MS: 15000 },
    './baseApi': { baseApi: { injectEndpoints: options => { endpoints = options.endpoints({ query: x => x, mutation: x => x }); return {}; } } },
  })('store/api/sharedTripApi.ts');
  const payload = { requestId: 'r', offerId: 'o', accept: true };
  assert.deepEqual(endpoints.decideSharedTrip.query(payload).body, { consent: true });
  assert.equal(endpoints.decideSharedTrip.query(payload).url, '/trip-requests/r/shared-offers/o/accept');
  assert.equal(endpoints.decideSharedTrip.query({ ...payload, accept: false }).body, undefined);
  assert.deepEqual(endpoints.sharedTripOffers.transformResponse([{ id: 'normal' }, { id: 'shared', existingTripId: 't', status: 'pending' },
    { id: 'old', existingTripId: 't', status: 'accepted' }]).map(o => o.id), ['shared']);
});
