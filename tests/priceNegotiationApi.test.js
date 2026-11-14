const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');

for (const [endpoint, stage, suffix] of [
  ['negotiateRequestPrice', 'passenger_counter', 'passenger-price'],
  ['negotiateRequestPrice', 'driver_final', 'final-price'],
  ['acceptPassengerPrice', undefined, 'accept-passenger-price'],
]) test(`negotiation API uses the authenticated ${suffix} route and maps the immutable revision`, async t => {
  const calls = [];
  const server = { id: 'request', passenger: { id: 'passenger' }, numberOfSeats: 2, status: 'offers_received',
    driverOffers: [{ id: 'next', previousOfferId: 'previous', negotiationStage: stage ?? 'passenger_counter',
      driver: { id: 'driver', firstName: 'Test' }, status: 'pending', pricePerSeat: '2700.00' }] };
  const api = createApi({ reducerPath: 'testApi', baseQuery: async args => { calls.push(args); return { data: server }; },
    tagTypes: ['TripRequest', 'MyTripRequests', 'MyDriverOffers', 'AccountActivity', 'Notification'], endpoints: () => ({}) });
  const { priceNegotiationApi } = loader({ './baseApi': { baseApi: api } })('store/api/priceNegotiationApi.ts');
  const store = configureStore({ reducer: { testApi: api.reducer }, middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const result = await store.dispatch(priceNegotiationApi.endpoints[endpoint].initiate({ requestId: 'request', offerId: 'previous',
    ...(stage ? { stage, pricePerSeat: 2700 } : {}) })).unwrap();
  assert.deepEqual(calls, [{ url: `/trip-requests/request/offers/previous/${suffix}`, method: 'POST', timeout: 15000,
    ...(stage ? { body: { pricePerSeat: 2700 } } : {}) }]);
  assert.equal(result.id, 'request');
  assert.equal(result.offers[0].id, 'next');
  assert.equal(result.offers[0].previousOfferId, 'previous');
  assert.equal(result.offers[0].negotiationStage, stage ?? 'passenger_counter');
  assert.equal(result.offers[0].pricePerSeat, 2700);
});

test('alternative-driver information uses a bounded read without exposing caller-supplied identity', async t => {
  const calls = [], data = { requestId: 'request', offerId: 'offer', radiusKm: 5, recent: 1, older: 0, truncated: false, generatedAt: new Date().toISOString() };
  const api = createApi({ reducerPath: 'testApi', baseQuery: async args => { calls.push(args); return { data }; }, endpoints: () => ({}) });
  const { priceNegotiationApi } = loader({ './baseApi': { baseApi: api } })('store/api/priceNegotiationApi.ts');
  const store = configureStore({ reducer: { testApi: api.reducer }, middleware: defaults => defaults().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const result = await store.dispatch(priceNegotiationApi.endpoints.getPriceAlternatives.initiate({ requestId: 'request', offerId: 'offer' })).unwrap();
  assert.deepEqual(calls, [{ url: '/trip-requests/request/offers/offer/alternatives', timeout: 10000 }]);
  assert.deepEqual(result, data);
});
