const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validateApiConfig } = require('../scripts/validate-api-config.cjs');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('release API validation rejects missing, old, local, insecure or credential-bearing URLs without logging values', () => {
  for (const value of ['', 'bad', 'http://example.test/api/v1', 'https://localhost/api/v1',
    'https://192.168.1.2/api/v1', 'https://zwanga-api.onrender.com/api/v1',
    'https://secret@example.test/api/v1', 'https://example.test/api/v1?key=secret', 'https://example.test']) {
    assert.throws(() => validateApiConfig({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: value }),
      error => error.message.includes('EXPO_PUBLIC_API_URL') && !error.message.includes('secret'));
  }
  assert.doesNotThrow(() => validateApiConfig({ EXPO_PUBLIC_ENV: 'production', EXPO_PUBLIC_API_URL: 'https://example.test/api/v1' }));
  assert.doesNotThrow(() => validateApiConfig({ EAS_BUILD_PROFILE: 'dev-device' }));
});

test('release workflow gates both native platforms on all tests and TypeScript', () => {
  const workflow = fs.readFileSync('.eas/workflows/create-production-builds.yml', 'utf8');
  assert.equal(workflow.match(/needs: \[validate\]/g).length, 2);
  assert.match(workflow, /run: npm run check:release/);
  const scripts = require('../package.json').scripts;
  assert.match(scripts['check:release'], /tsc --noEmit.*test:all/);
  assert.match(scripts['eas-build-pre-install'], /validate-api-config/);
});

test('Home-only budgets never enter server payloads and do not change search or mutation timeouts', () => {
  const { buildGetTripsEndpoints } = loader()('store/api/trip/getTrips.endpoints.ts');
  const endpoints = buildGetTripsEndpoints({ query: x => x, mutation: x => x });
  const args = { minSeats: 1, limit: 50 };
  assert.deepEqual(endpoints.getTrips.query({ ...args, discovery: true }), { url: '/trips', params: args, timeout: 8000 });
  assert.deepEqual(endpoints.getTrips.query(args), { url: '/trips', params: args });
  assert.deepEqual(endpoints.getTripsByCoordinates.query({ ...args, discovery: true }),
    { url: '/trips/search/coordinates', method: 'POST', body: args, timeout: 8000 });
  assert.equal(endpoints.createTrip.query(args).timeout, 60000);
});
