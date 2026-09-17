const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('route address reads deduplicate in-flight requests and reuse results after unmount/remount', async () => {
  const calls = [], pending = [];
  const baseApi = createApi({ reducerPath: 'addresses', endpoints: () => ({}), baseQuery: args => {
    calls.push(args);
    return new Promise(resolve => pending.push(resolve));
  } });
  const { googleMapsApi: api } = loader({ './baseApi': { baseApi } })('store/api/googleMapsApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: getDefault => getDefault().concat(api.middleware) });
  const endpoint = api.endpoints.getRouteLocationAddress;
  const args = { lat: -4.38, lng: 15.32, language: 'fr', region: 'cd' };
  const subscriptions = [];
  const subscribe = body => { const request = store.dispatch(endpoint.initiate(body)); subscriptions.push(request); return request; };
  try {
    const first = subscribe(args);
    const second = subscribe({ ...args });
    assert.equal(calls.length, 1, 'trip/request/edit views share the same request');
    assert.deepEqual(calls[0], { url: '/google-maps/reverse-geocode', method: 'POST', body: args });
    first.unsubscribe();
    pending.shift()({ data: { formattedAddress: 'Av. Bakole 1, Kinshasa', ...args } });
    assert.equal((await second.unwrap()).formattedAddress, 'Av. Bakole 1, Kinshasa', 'closing one view does not abort another subscriber');
    second.unsubscribe();
    const reopened = subscribe({ ...args });
    await reopened.unwrap();
    assert.equal(calls.length, 1, 'cached address survives a screen remount');
    const other = subscribe({ ...args, lat: -4.45 });
    assert.equal(calls.length, 2, 'distinct coordinates cannot share an address');
    pending.shift()({ data: { formattedAddress: 'Avenue Matadi', lat: -4.45, lng: 15.32 } });
    assert.equal((await other.unwrap()).formattedAddress, 'Avenue Matadi');
    assert.equal(endpoint.select(args)(store.getState()).data.formattedAddress, 'Av. Bakole 1, Kinshasa');
  } finally {
    for (const subscription of subscriptions) subscription.unsubscribe();
    store.dispatch(api.util.resetApiState());
  }
});

test('an unusable geocoder answer is cached too, avoiding repeated lookups on every render/open', async () => {
  let calls = 0;
  const baseApi = createApi({ reducerPath: 'addresses', endpoints: () => ({}), baseQuery: async () => {
    calls++;
    return { data: { formattedAddress: 'H8XW+6XG', lat: -4.38, lng: 15.32 } };
  } });
  const { googleMapsApi: api } = loader({ './baseApi': { baseApi } })('store/api/googleMapsApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: getDefault => getDefault().concat(api.middleware) });
  try {
    for (let i = 0; i < 10; i++) {
      const request = store.dispatch(api.endpoints.getRouteLocationAddress.initiate({ lat: -4.38, lng: 15.32 }));
      await request.unwrap();
      request.unsubscribe();
    }
    assert.equal(calls, 1);
  } finally { store.dispatch(api.util.resetApiState()); }
});

test('address cache retention is bounded in time and the existing picker mutation is unchanged', () => {
  const builder = { query: config => ({ ...config, kind: 'query' }), mutation: config => ({ ...config, kind: 'mutation' }) };
  const { googleMapsApi: api } = loader({ './baseApi': { baseApi: {
    injectEndpoints: ({ endpoints }) => ({ endpoints: endpoints(builder) }),
  } } })('store/api/googleMapsApi.ts');
  assert.equal(api.endpoints.getRouteLocationAddress.kind, 'query');
  assert.equal(api.endpoints.getRouteLocationAddress.keepUnusedDataFor, 300);
  assert.equal(api.endpoints.getRouteLocationAddress.providesTags, undefined, 'trip/booking invalidations do not refetch addresses');
  assert.equal(api.endpoints.reverseGeocode.kind, 'mutation');
});
