const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture() {
  const disk = new Map(), intent = new Map();
  const io = { deleteFails: false, intentFails: false };
  const restart = () => loader({
    'expo-constants': { expoConfig: {} },
    'expo-secure-store': {
      getItemAsync: async key => disk.get(key) ?? null,
      setItemAsync: async (key, value) => { disk.set(key, value); },
      deleteItemAsync: async key => { if (io.deleteFails) throw Error('locked'); disk.delete(key); },
    },
    '@react-native-async-storage/async-storage': {
      getItem: async key => intent.get(key) ?? null,
      setItem: async (key, value) => { if (io.intentFails) throw Error('unavailable'); intent.set(key, value); },
      removeItem: async key => { intent.delete(key); },
    },
  })('services/tokenStorage.ts');
  return { disk, intent, io, restart };
}

test('failed SecureStore deletion cannot restore the old account after a process restart', async () => {
  const f = fixture(), first = f.restart();
  await first.storeTokens('old-access', 'old-refresh');
  f.io.deleteFails = true;
  assert.equal(await first.clearTokens(), true);
  assert.equal(f.disk.size, 2);
  assert.deepEqual(await f.restart().getTokens(), { accessToken: null, refreshToken: null });
  assert.equal(f.intent.size, 1);
  f.io.deleteFails = false;
  assert.deepEqual(await f.restart().getTokens(), { accessToken: null, refreshToken: null });
  assert.equal(f.disk.size, 0); assert.equal(f.intent.size, 0);
});

test('a complete explicit login supersedes the logout marker, unlike a background refresh', async () => {
  const f = fixture(), first = f.restart();
  await first.storeTokens('old', 'old'); f.io.deleteFails = true; await first.clearTokens();
  const next = f.restart();
  assert.equal(await next.storeTokens('late', 'late', 0), false);
  assert.equal(await next.storeTokens('new', 'new'), true);
  assert.deepEqual(await f.restart().getTokens(), { accessToken: 'new', refreshToken: 'new' });
});

test('total storage failure is reported instead of claiming durable logout', async () => {
  const f = fixture(), first = f.restart(); await first.storeTokens('a', 'b');
  f.io.deleteFails = true; f.io.intentFails = true;
  await assert.rejects(first.clearTokens(), /stockage indisponible/);
  assert.deepEqual(await first.getTokens(), { accessToken: null, refreshToken: null });
});
