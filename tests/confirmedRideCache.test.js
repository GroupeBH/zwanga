const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

function setup(t) {
  let session = 1, complete;
  const baseApi = createApi({
    reducerPath: 'zwangaApi',
    tagTypes: ['TripRequest', 'MyTripRequests', 'DriverOffer', 'MyDriverOffers', 'Trip', 'MyTrips', 'Booking', 'RecurringTrip'],
    baseQuery: arg => arg.method === 'POST' || arg.method === 'PUT'
      ? new Promise(resolve => { complete = resolve; })
      : new Promise(() => {}), // slow refetch must not keep the old card after a successful mutation
    endpoints: () => ({}),
  });
  const identity = value => value;
  const load = loader({
    './baseApi': { baseApi },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    './tripApi': { mapServerTripToClient: identity },
    './tripMapper': { mapServerTripToClient: identity, mapServerRecurringTripToClient: identity },
    './trip/tripMapper': { mapServerTripToClient: identity },
    './activityTripMapper': { mapActivityTrip: identity },
    './trip-request/requestMapper': { mapServerTripRequestToClient: identity },
  });
  load('store/api/tripApi.ts');
  load('store/api/tripRequestApi.ts');
  const store = configureStore({ reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: defaults => defaults().concat(baseApi.middleware) });
  t.after(() => store.dispatch(baseApi.util.resetApiState()));
  return {
    api: baseApi, store,
    changeSession: () => { session++; },
    complete: result => complete(result),
    put: async (name, data, arg) => {
      await store.dispatch(baseApi.util.upsertQueryData(name, arg, data));
      store.dispatch(baseApi.endpoints[name].initiate(arg));
    },
    read: (name, arg) => baseApi.endpoints[name].select(arg)(store.getState()).data,
  };
}

test('acceptance removes only the confirmed request while refetch is pending', async t => {
  const ctx = setup(t);
  const first = { id: 'a', status: 'pending' }, other = { id: 'b', status: 'pending' };
  await ctx.put('getAvailableTripRequests', [first, other]);
  await ctx.put('getTripRequestById', first, 'a');
  await ctx.put('getMyTripRequests', [first]);
  const action = ctx.store.dispatch(ctx.api.endpoints.acceptTripRequest.initiate({ tripRequestId: 'a', payload: {} }));
  assert.deepEqual(ctx.read('getAvailableTripRequests'), [first, other]);
  const accepted = { ...first, status: 'driver_selected', tripId: 'trip' };
  ctx.complete({ data: { trip: { id: 'trip' }, tripRequest: accepted } });
  await action.unwrap();
  assert.deepEqual(ctx.read('getAvailableTripRequests'), [other]);
  assert.deepEqual(ctx.read('getTripRequestById', 'a'), accepted);
  assert.deepEqual(ctx.read('getMyTripRequests'), [accepted]);
});

for (const outcome of ['failure', 'new-session']) {
  test(`acceptance ${outcome} never hides a request locally`, async t => {
    const ctx = setup(t), pending = { id: 'a', status: 'pending' };
    await ctx.put('getAvailableTripRequests', [pending]);
    const action = ctx.store.dispatch(ctx.api.endpoints.acceptTripRequest.initiate({ tripRequestId: 'a', payload: {} }));
    if (outcome === 'new-session') ctx.changeSession();
    ctx.complete(outcome === 'failure' ? { error: { status: 500 } }
      : { data: { trip: { id: 'trip' }, tripRequest: { ...pending, status: 'driver_selected' } } });
    await action;
    assert.deepEqual(ctx.read('getAvailableTripRequests'), [pending]);
  });
}

for (const outcome of ['success', 'failure', 'new-session']) {
  test(`start ${outcome}: server state controls all Home trip caches`, async t => {
    const ctx = setup(t), trip = { id: 'trip', status: 'upcoming' };
    await ctx.put('getTripById', trip, 'trip');
    await ctx.put('getMyTrips', [trip]);
    await ctx.put('getMyActivityTrips', [{ ...trip, paymentNotices: ['preserve'], reviewCompletion: null }]);
    const action = ctx.store.dispatch(ctx.api.endpoints.startTrip.initiate('trip'));
    assert.equal(ctx.read('getTripById', 'trip').status, 'upcoming');
    if (outcome === 'new-session') ctx.changeSession();
    ctx.complete(outcome === 'failure' ? { error: { status: 500 } } : { data: { ...trip, status: 'ongoing' } });
    await action;
    const expected = outcome === 'success' ? 'ongoing' : 'upcoming';
    assert.equal(ctx.read('getTripById', 'trip').status, expected);
    assert.equal(ctx.read('getMyTrips')[0].status, expected);
    assert.equal(ctx.read('getMyActivityTrips')[0].status, expected);
    assert.deepEqual(ctx.read('getMyActivityTrips')[0].paymentNotices, ['preserve']);
  });
}
