const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, options = {}) {
  const calls = [], refreshes = [];
  const user = { type: 'User', id: 'CURRENT' }, identity = { type: 'KycStatus', id: 'CURRENT' };
  const baseApi = createApi({ reducerPath: 'identityTest', tagTypes: ['User', 'KycStatus'],
    baseQuery: async args => {
      calls.push(typeof args === 'string' ? args : args.url);
      return options.failReads && typeof args === 'string' ? { error: { status: 503 } } : { data: {} };
    }, endpoints: () => ({}) });
  const { userApi: api } = loader({ './baseApi': { baseApi },
    './user/getProfileSummary.endpoints': { buildGetProfileSummaryEndpoints: b => ({
      getCurrentUser: b.query({ query: () => '/users/me', providesTags: [user] }),
      getKycStatus: b.query({ query: () => '/users/kyc/status', providesTags: [identity] }),
    }) },
    './user/deleteFavoriteLocation.endpoints': { buildDeleteFavoriteLocationEndpoints: () => ({}) },
    './user/identityContracts': { currentUserTag: user, kycStatusTag: identity, mapDiditKycSyncResponse: value => value },
    '../../services/tokenStorage': { getRefreshToken: async () => options.token ? 'synthetic' : null },
    '../../services/tokenRefresh': { refreshAccessToken: async () => {
      refreshes.push(calls.length);
      if (options.refreshError) throw new Error('refresh unavailable');
      return 'synthetic-refreshed';
    } },
  })('store/api/userApi.ts');
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: get => get().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const subscriptions = () => {
    const selectors = store.dispatch(api.internalActions.internal_getRTKQSubscriptions());
    return ['getCurrentUser(undefined)', 'getKycStatus(undefined)'].map(key => selectors.getSubscriptionCount(key));
  };
  const sync = async (endpoint = 'syncDiditKycSession') => {
    const request = store.dispatch(api.endpoints[endpoint].initiate({}));
    await request.unwrap(); request.reset(); await flush(); await flush();
  };
  return { api, store, calls, refreshes, subscriptions, sync };
}

for (const endpoint of ['uploadKyc', 'syncDiditKycSession']) {
  test(`${endpoint}: repeated success without a screen leaves no imperative subscribers`, async t => {
    const f = fixture(t);
    for (let i = 0; i < 10; i++) await f.sync(endpoint);
    assert.deepEqual(f.subscriptions(), [0, 0]);
    assert.equal(f.calls.filter(url => url === '/users/me').length, 10);
    assert.equal(f.calls.filter(url => url === '/users/kyc/status').length, 10);
  });
}

test('mounted identity/profile consumers retain their subscriptions with one refresh per sync', async t => {
  const f = fixture(t, { token: true });
  const handles = [f.api.endpoints.getCurrentUser, f.api.endpoints.getKycStatus].map(endpoint => f.store.dispatch(endpoint.initiate()));
  await Promise.all(handles);
  await f.sync();
  assert.deepEqual(f.subscriptions(), [1, 1]);
  assert.equal(f.calls.filter(url => url === '/users/me').length, 2);
  assert.equal(f.calls.filter(url => url === '/users/kyc/status').length, 2);
  assert.equal(f.refreshes.length, 1);
  for (const handle of handles) handle.unsubscribe();
  assert.deepEqual(f.subscriptions(), [0, 0]);
});

test('token refresh failure still reloads identity and failed reads do not leak subscriptions', async t => {
  const f = fixture(t, { token: true, refreshError: true, failReads: true });
  await f.sync();
  assert.deepEqual(f.subscriptions(), [0, 0]);
  assert.deepEqual(f.calls, ['/users/kyc/didit/sync', '/users/kyc/status', '/users/me']);
  assert.equal(f.refreshes.length, 1);
});
