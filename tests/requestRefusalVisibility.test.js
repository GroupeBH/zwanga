const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');

async function fixture(t) {
  const env = { user: 'driver', version: 1, respond: async () => ({ data: { status: 'declined', requestId: 'request' } }) };
  const api = createApi({ reducerPath: 'api', baseQuery: () => env.respond(),
    tagTypes: ['DriverDispatch', 'Notification', 'TripRequest', 'MyTripRequests', 'MyDriverOffers', 'AccountActivity', 'Wallet'],
    endpoints: b => Object.fromEntries(['getAvailableTripRequests', 'getAvailableRequestPage', 'getMyTripRequests']
      .map(name => [name, b.query({ query: () => '/requests' })])),
  });
  const load = loader({ './baseApi': { baseApi: api }, '../baseApi': { baseApi: api },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version } });
  const { driverDispatchApi } = load('store/api/driverDispatchApi.ts');
  const store = configureStore({ reducer: { api: api.reducer, auth: () => ({ user: { id: env.user } }) },
    middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const args = { limit: 20 }, secondArgs = { limit: 20, before: 'cursor' };
  for (const [endpoint, arg, data] of [
    ['getAvailableTripRequests', undefined, [{ id: 'request' }, { id: 'other' }]],
    ['getAvailableRequestPage', args, { data: [{ id: 'request' }, { id: 'other' }], total: 2, nextCursor: 'cursor' }],
    ['getAvailableRequestPage', secondArgs, { data: [{ id: 'last' }], total: 2, nextCursor: null }],
    ['getMyTripRequests', undefined, [{ id: 'request' }]],
  ]) await store.dispatch(api.util.upsertQueryData(endpoint, arg, data));
  const read = (name, arg) => api.endpoints[name].select(arg)(store.getState()).data;
  const refuse = (dispatchOffer = false) => store.dispatch(dispatchOffer
    ? driverDispatchApi.endpoints.respondToDispatchOffer.initiate({ id: 'offer', decision: 'decline' })
    : driverDispatchApi.endpoints.declineNearbyRequest.initiate('request'));
  return { env, store, api, args, secondArgs, read, refuse };
}

for (const dispatchOffer of [false, true]) test(`confirmed refusal removes available cards only (dispatch=${dispatchOffer})`, async t => {
  const f = await fixture(t); await f.refuse(dispatchOffer).unwrap();
  assert.deepEqual(f.read('getAvailableTripRequests'), [{ id: 'other' }]);
  assert.deepEqual(f.read('getAvailableRequestPage', f.args), { data: [{ id: 'other' }], total: 1, nextCursor: 'cursor' });
  assert.deepEqual(f.read('getAvailableRequestPage', f.secondArgs).data, [{ id: 'last' }]);
  assert.deepEqual(f.read('getMyTripRequests'), [{ id: 'request' }], 'passenger-owned requests are preserved');
  await f.refuse(dispatchOffer).unwrap();
  assert.equal(f.read('getAvailableRequestPage', f.args).total, 1, 'retries do not decrement twice');
});

test('failed and previous-session refusals never remove a visible request', async t => {
  const f = await fixture(t);
  f.env.respond = async () => ({ error: { status: 'FETCH_ERROR', error: 'offline' } });
  await assert.rejects(f.refuse().unwrap());
  assert.equal(f.read('getAvailableTripRequests').length, 2);
  let done;
  f.env.respond = () => new Promise(resolve => { done = resolve; });
  const work = f.refuse(); f.env.version++;
  done({ data: {} }); await work.unwrap();
  assert.equal(f.read('getAvailableTripRequests').length, 2);
});

test('only a server-confirmed native refusal skips the request screen; booking flow is preserved', () => {
  const { parseDriverResponseResult, invitationHref } = loader()('features/notifications/driverInvitation.ts');
  const data = { type: 'driver_action_result', kind: 'nearby', id: '00000000-0000-4000-8000-000000000002',
    driverId: '00000000-0000-4000-8000-000000000001', decision: 'decline' };
  assert.equal(invitationHref(parseDriverResponseResult(data)).pathname, '/request-details/[id]');
  assert.equal(invitationHref(parseDriverResponseResult({ ...data, confirmed: true })).pathname, '/(tabs)');
  assert.equal(invitationHref(parseDriverResponseResult({ ...data, confirmed: true, kind: 'booking' })).pathname, '/incoming-driver');
});
