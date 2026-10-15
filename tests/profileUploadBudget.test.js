const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('profile update gets a finite upload budget while profile reads keep their default', () => {
  const load = loader({
    './identityContracts': { currentUserTag: 'current-user' },
    './profileMapper': {}, './syncAccountRole': { syncAccountRole() {} },
    '@react-native-async-storage/async-storage': {},
  });
  const { buildGetProfileSummaryEndpoints } = load('store/api/user/getProfileSummary.endpoints.ts');
  const { CRITICAL_MUTATION_TIMEOUT_MS, DEFAULT_API_TIMEOUT_MS } = load('constants/network.ts');
  const endpoints = buildGetProfileSummaryEndpoints({ query: definition => definition, mutation: definition => definition });
  const body = new FormData();
  const request = endpoints.updateUser.query(body);
  assert.deepEqual(request, { url: '/users/me', method: 'PUT', body, timeout: 60_000 });
  assert.equal(request.timeout, CRITICAL_MUTATION_TIMEOUT_MS);
  assert.ok(request.timeout > DEFAULT_API_TIMEOUT_MS);
  assert.equal(endpoints.getCurrentUser.query(), '/users/me');
  assert.equal(endpoints.getProfileSummary.query(), '/users/me');
  assert.ok(endpoints.updateUser.invalidatesTags(undefined).length, 'reconcile the profile after an ambiguous failure');
});
