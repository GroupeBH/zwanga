const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const fs = require('node:fs');

test('production builds and absent URL configuration resolve to the current AWS API', t => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  });
  const awsApi = 'https://compute-api.zwanga-app.com/api/v1';
  const loadEnv = extra => loader({ 'expo-constants': { expoConfig: { extra } } })('config/env.ts').API_BASE_URL;
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.production.env.EXPO_PUBLIC_API_URL, awsApi);
  assert.equal(loadEnv({}), awsApi);
  assert.equal(loadEnv({ EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000/api/v1' }), 'http://127.0.0.1:3000/api/v1');
});

test('Apple request whitelist excludes client email and private identity flags while preserving signup fields', () => {
  const { authApi } = loader({
    './baseApi': { baseApi: { injectEndpoints: ({ endpoints }) => ({ endpoints: endpoints({ mutation: definition => definition }) }) } },
    './userApi': { userApi: {} }, '../../services/tokenStorage': {}, '../../services/tokenRefresh': {},
    '../../services/tokenSession': {}, '../../store/slices/authSlice': {},
  })('store/api/authApi.ts');
  const required = { idToken: 'test-token', nonce: 'test-nonce', phone: '+243000000000', firstName: 'Test', lastName: 'Example',
    role: 'driver', vehicle: { type: 'car', brand: 'Test', model: 'Test', color: 'Bleu', licensePlate: '0000AA00' },
    referralCode: 'ZWTEST001' };
  const request = authApi.endpoints.appleMobile.query({ ...required, email: 'untrusted@example.invalid',
    appleId: 'forged-id', isEmailVerified: true, unexpected: true });
  assert.equal(request.url, '/auth/apple/mobile'); assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, required);
  assert.deepEqual(authApi.endpoints.appleMobile.query({ idToken: 'test-token', nonce: 'test-nonce' }).body,
    { idToken: 'test-token', nonce: 'test-nonce' }, 'existing-account login does not require signup fields');
});

function appleFixture() {
  const io = { cached: null, user: 'test-apple-account', fullName: null, email: null };
  const service = loader({
    'react-native': { Platform: { OS: 'ios' } },
    'expo-crypto': { randomUUID: () => 'test-nonce' },
    'expo-secure-store': { getItemAsync: async () => io.cached, setItemAsync: async (_key, value) => { io.cached = value; } },
    'expo-apple-authentication': { isAvailableAsync: async () => true,
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      signInAsync: async () => ({ identityToken: 'test-id-token', user: io.user, fullName: io.fullName, email: io.email }) },
  })('services/appleAuth.ts');
  return { io, service };
}

test('Apple missing name/email does not abort native authentication after reinstall', async () => {
  const { service } = appleFixture();
  const result = await service.signInWithApple();
  assert.equal(result.identityToken, 'test-id-token'); assert.equal(result.nonce, 'test-nonce');
  assert.equal(result.firstName, null); assert.equal(result.lastName, null); assert.equal(result.email, null);
});

test('Apple profile cache restores names only for the same Apple account', async () => {
  const { io, service } = appleFixture();
  io.fullName = { givenName: '  Test ', middleName: ' Person ', familyName: ' Example ' };
  io.email = 'relay@example.invalid';
  await service.signInWithApple();
  io.fullName = null; io.email = null;
  const restored = await service.signInWithApple();
  assert.equal(restored.firstName, 'Test Person'); assert.equal(restored.lastName, 'Example');
  io.user = 'another-test-apple-account';
  const other = await service.signInWithApple();
  assert.equal(other.firstName, null); assert.equal(other.lastName, null); assert.equal(other.email, null);
});
