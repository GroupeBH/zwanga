const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('modern wallet contract is advertised without changing auth or request payload', async () => {
  const requests = [];
  const load = loader({
    '@reduxjs/toolkit/query/react': {
      createApi: options => options,
      fetchBaseQuery: () => async request => { requests.push(request); return { data: {} }; },
    },
    '../../config/env': { API_BASE_URL: 'https://example.invalid/api/v1' },
    '../../constants/network': { DEFAULT_API_TIMEOUT_MS: 15000 },
    '../../services/tokenRefresh': { refreshAccessToken: async () => null },
    '../../services/tokenStorage': { getTokens: async () => ({ accessToken: 'synthetic', refreshToken: null }) },
    '../../services/tokenSession': { getTokenSessionVersion: () => 1 },
    '../../utils/jwt': { isTokenExpired: () => false },
  });
  const { baseQueryWithReauth } = load('store/api/baseApi.ts');
  await baseQueryWithReauth({ url: '/wallet/me', headers: { 'x-existing': 'kept' } }, { signal: new AbortController().signal }, {});
  assert.equal(requests[0].headers.get('x-zwanga-finance-contract'), '2');
  assert.equal(requests[0].headers.get('authorization'), 'Bearer synthetic');
  assert.equal(requests[0].headers.get('x-existing'), 'kept');
  assert.equal(requests[0].url, '/wallet/me');
});
