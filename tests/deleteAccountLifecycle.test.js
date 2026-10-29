const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');

for (const mode of ['network', 'storage', 'success']) test(`account deletion lifecycle handles ${mode} without detached rejection`, async () => {
  let storageCalls = 0;
  const { buildGetProfileSummaryEndpoints } = loader({
    '@react-native-async-storage/async-storage': { removeItem: async () => {
      storageCalls++;
      if (mode === 'storage') throw Error('synthetic storage failure');
    } },
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
  })('store/api/user/getProfileSummary.endpoints.ts');
  const api = createApi({ reducerPath: 'testAccount',
    tagTypes: ['User', 'KycStatus', 'Vehicle', 'FavoriteLocations'],
    baseQuery: async () => mode === 'network' ? { error: { status: 'FETCH_ERROR', error: 'synthetic offline' } }
      : { data: { message: 'synthetic success' } },
    endpoints: buildGetProfileSummaryEndpoints });
  const store = configureStore({ reducer: { testAccount: api.reducer }, middleware: get => get().concat(api.middleware) });
  try {
    const request = store.dispatch(api.endpoints.deleteAccount.initiate());
    if (mode === 'network') await assert.rejects(request.unwrap());
    else assert.equal((await request.unwrap()).message, 'synthetic success', 'storage cleanup must not turn server success into failure');
    // An unhandled lifecycle rejection fails node:test even if unwrap was caught.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(storageCalls, mode === 'network' ? 0 : 1);
  } finally { store.dispatch(api.util.resetApiState()); }
});
