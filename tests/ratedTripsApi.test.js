const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t) {
  const calls = [], env = { result: { data: { userId: 'self', ratedTripIds: ['trip'] } } };
  const api = createApi({ reducerPath: 'reviewTest', tagTypes: ['User', 'Trip', 'Review'],
    baseQuery: async args => {
      calls.push(args);
      if (args.method === 'POST') return env.mutation ?? { data: { id: 'review', raterId: 'self', tripId: 'trip', rating: 1 } };
      return env.result;
    }, endpoints: () => ({}) });
  loader({ './baseApi': { baseApi: api } })('store/api/reviewApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: get => get().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { env, api, store, calls };
}

test('rated-trip read is account-scoped, sends no user identity override, and rechecks after any successful trip rating', async t => {
  const { env, api, store, calls } = fixture(t);
  const args = { userId: 'self', tripIds: ['trip'] };
  await store.dispatch(api.endpoints.getMyRatedTrips.initiate(args));
  assert.deepEqual(calls[0], { url: '/ratings/mine/trips', params: { tripIds: 'trip' } });
  await store.dispatch(api.endpoints.createReview.initiate({ tripId: 'trip', ratedUserId: 'driver', rating: 1 }));
  await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
  assert.equal(calls.filter(c => c.method !== 'POST').length, 2, 'even one star refreshes completion eligibility');
  env.mutation = { error: { status: 503, data: {} } };
  await store.dispatch(api.endpoints.createReview.initiate({ tripId: 'trip', ratedUserId: 'driver', rating: 5 }));
  await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
  assert.equal(calls.filter(c => c.method !== 'POST').length, 2, 'failed submission is not proof of rating');
});

test('mismatched accounts, unrequested trip IDs and malformed responses fail closed', async t => {
  const { env, api, store } = fixture(t);
  for (const data of [null, {}, { userId: 'other', ratedTripIds: ['trip'] },
    { userId: 'self', ratedTripIds: ['unrequested'] }, { userId: 'self', ratedTripIds: [null] },
    { userId: 'self', ratedTripIds: 'trip' }]) {
    env.result = { data };
    const result = await store.dispatch(api.endpoints.getMyRatedTrips.initiate({ userId: 'self', tripIds: ['trip'] }, { forceRefetch: true }));
    assert.equal(result.isError, true); assert.equal(result.error.status, 'CUSTOM_ERROR');
  }
});

test('old/offline backends do not pretend that trip ratings were submitted', async t => {
  const { env, api, store } = fixture(t);
  env.result = { error: { status: 404, data: {} } };
  const result = await store.dispatch(api.endpoints.getMyRatedTrips.initiate({ userId: 'self', tripIds: ['trip'] }));
  assert.equal(result.isError, true); assert.equal(result.currentData, undefined);
});
