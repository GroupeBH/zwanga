/* global Buffer */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const KEY = 'zwanga.session-pair.v2';
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const jwt = (sub, extra = {}) => `x.${Buffer.from(JSON.stringify({ sub, exp: expiresAt, ...extra })).toString('base64url')}.x`;
function fixture() {
  const disk = new Map(), intent = new Map();
  const io = { failWrite: false, failDelete: false };
  const restart = () => loader({
    'expo-constants': { expoConfig: {} },
    'expo-secure-store': {
      getItemAsync: async key => disk.get(key) ?? null,
      setItemAsync: async (key, value) => { if (io.failWrite) throw Error('locked'); disk.set(key, value); },
      deleteItemAsync: async key => { if (io.failDelete) throw Error('locked'); disk.delete(key); },
    },
    '@react-native-async-storage/async-storage': {
      getItem: async key => intent.get(key) ?? null,
      setItem: async (key, value) => { intent.set(key, value); }, removeItem: async key => { intent.delete(key); },
    },
  })('services/tokenStorage.ts');
  return { disk, io, restart };
}

test('failed replacement preserves the complete previous pair across process restart', async () => {
  const f = fixture(), first = f.restart();
  await first.storeTokens(jwt('a'), jwt('a'));
  f.io.failWrite = true;
  await assert.rejects(first.storeTokens(jwt('b'), jwt('b')));
  assert.deepEqual(await f.restart().getTokens(), { accessToken: jwt('a'), refreshToken: jwt('a') });
});

test('legacy migration commits once and an interrupted cleanup cannot resurrect legacy credentials', async () => {
  const f = fixture(); f.disk.set('zwanga_accessToken', jwt('a')); f.disk.set('zwanga_refreshToken', jwt('a'));
  assert.equal((await f.restart().getTokens()).accessToken, jwt('a'));
  f.io.failDelete = true;
  await f.restart().storeTokens(jwt('b'), jwt('b'));
  assert.equal((await f.restart().getTokens()).accessToken, jwt('b'));
  await f.restart().clearTokens();
  assert.equal((await f.restart().getTokens()).accessToken, null);
  f.io.failDelete = false;
  assert.equal((await f.restart().getTokens()).accessToken, null);
  assert.equal(f.disk.size, 0);
});

test('invalid envelope never falls back to an older identity', async () => {
  const f = fixture(); f.disk.set('zwanga_accessToken', jwt('a')); f.disk.set('zwanga_refreshToken', jwt('a'));
  for (const value of ['{broken', '{"version":3}', '{"version":2,"accessToken":4,"refreshToken":null}']) {
    f.disk.set(KEY, value);
    await assert.rejects(f.restart().getTokens({ throwOnError: true }), /illisible/);
  }
});

test('paired tokens must identify the same account, including legacy userId payloads', () => {
  const policy = loader()('features/auth/sessionPolicy.ts');
  assert.equal(policy.hasRecoverableAuthSession(jwt('a'), jwt('b')), false);
  assert.equal(policy.hasUsableNewAuthSession(jwt('a'), jwt(undefined)), false);
  assert.equal(policy.hasUsableNewAuthSession(jwt('a'), jwt('a')), true);
  assert.equal(policy.hasRecoverableAuthSession(jwt(undefined, { userId: 'a' }), jwt('a')), true);
  assert.equal(policy.hasRecoverableAuthSession(jwt('a', { exp: 1 }), jwt('a')), true, 'offline recovery preserved');
});
