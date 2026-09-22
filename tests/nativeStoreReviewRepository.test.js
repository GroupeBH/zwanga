const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { createReviewRepository, reviewStorageKey } = loader()('features/store-review/reviewRepository.ts');
const start = Date.parse('2026-09-22T10:00:00Z');
const event = { role: 'passenger', tripId: 'trip', completedAt: start + 1 };
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; };
function fixture() {
  const values = new Map(), calls = [], writes = [];
  const storage = { async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { writes.push(key); values.set(key, value); } };
  const repository = createReviewRepository(storage, () => start + 1000);
  const native = { async isAvailableAsync() { return true; }, async requestReview() { calls.push('native'); } };
  return { values, calls, storage, repository, native, writes, load: async () => native };
}

test('persist before requesting; concurrent attempts, remounts and duplicate observations never solicit twice', async () => {
  const env = fixture();
  assert.equal(await env.repository.observe('a', start, [event]), true);
  env.native.requestReview = async () => {
    assert.equal(JSON.parse(env.values.get(reviewStorageKey('a'))).attempts.length, 1); env.calls.push('native');
  };
  await Promise.all(Array.from({ length: 25 }, () => env.repository.requestIfDue('a', start, env.load, () => true)));
  assert.equal(env.calls.length, 1);
  const restored = createReviewRepository(env.storage, () => start + 2000);
  assert.equal(await restored.observe('a', start + 1500, [event]), false);
  assert.equal(await restored.requestIfDue('a', start, env.load, () => true), false);
});

test('accounts have separate progress and quotas; no writes on identical idle observations', async () => {
  const env = fixture();
  await env.repository.observe('a', start, [event]);
  const count = env.writes.length;
  for (let i = 0; i < 100; i++) await env.repository.observe('a', start, [event]);
  assert.equal(env.writes.length, count);
  assert.equal(await env.repository.observe('b', start, []), false);
  assert.equal(await env.repository.requestIfDue('b', start, env.load, () => true), false);
  await env.repository.observe('b', start, [event]);
  await env.repository.requestIfDue('b', start, env.load, () => true);
  assert.equal(JSON.parse(env.values.get(reviewStorageKey('a'))).attempts.length, 0);
  assert.equal(JSON.parse(env.values.get(reviewStorageKey('b'))).attempts.length, 1);
});

test('unavailable native module/TestFlight does not consume quota or open an external store', async () => {
  const env = fixture(); await env.repository.observe('a', start, [event]);
  assert.equal(await env.repository.requestIfDue('a', start, async () => null, () => true), false);
  env.native.isAvailableAsync = async () => false;
  assert.equal(await env.repository.requestIfDue('a', start, env.load, () => true), false);
  assert.equal(env.calls.length, 0);
  assert.equal(JSON.parse(env.values.get(reviewStorageKey('a'))).attempts.length, 0);
});

test('blur, background, modal opening and account change during an async native check suppress presentation', async () => {
  const env = fixture(); await env.repository.observe('a', start, [event]);
  const gate = deferred(); let safe = true;
  const pending = env.repository.requestIfDue('a', start, () => gate.promise, () => safe);
  safe = false; gate.resolve(env.native); assert.equal(await pending, false);
  assert.equal(env.calls.length, 0);
  assert.equal(JSON.parse(env.values.get(reviewStorageKey('a'))).attempts.length, 0);
});

test('storage errors/corruption cannot produce untracked requests; SDK failure consumes an attempt without retry loop', async () => {
  const env = fixture(); await env.repository.observe('a', start, [event]);
  env.storage.setItem = async () => { throw Error('disk full'); };
  await assert.rejects(env.repository.requestIfDue('a', start, env.load, () => true));
  assert.equal(env.calls.length, 0);
  env.storage.setItem = async (key, value) => env.values.set(key, value);
  env.native.requestReview = async () => { throw Error('store declined'); };
  await assert.rejects(env.repository.requestIfDue('a', start, env.load, () => true));
  assert.equal(await env.repository.requestIfDue('a', start, env.load, () => true), false);
  env.values.set(reviewStorageKey('a'), '{}');
  await assert.rejects(env.repository.observe('a', start, [event]));
});

test('leaving during quota persistence never opens a late modal; reservation remains conservative', async () => {
  const env = fixture(); await env.repository.observe('a', start, [event]); let safe = true;
  env.storage.setItem = async (key, value) => { env.values.set(key, value); safe = false; };
  assert.equal(await env.repository.requestIfDue('a', start, env.load, () => safe), false);
  assert.equal(env.calls.length, 0);
  assert.equal(JSON.parse(env.values.get(reviewStorageKey('a'))).attempts.length, 1);
});

test('native adapter is inert on web and old binaries; only an actual native module enables expo-store-review', async () => {
  let platform = 'web', native = null, invoked = 0;
  const { loadNativeReview } = loader({ 'react-native': { Platform: { get OS() { return platform; } } },
    'expo-modules-core': { requireOptionalNativeModule: () => native },
    'expo-store-review': { isAvailableAsync: async () => true, requestReview: async () => { invoked++; } },
  })('features/store-review/nativeReview.ts');
  assert.equal(await loadNativeReview(), null);
  platform = 'ios'; assert.equal(await loadNativeReview(), null);
  native = { isAvailableAsync() {} }; assert.equal(await loadNativeReview(), null);
  native.requestReview = () => {}; const sdk = await loadNativeReview(); await sdk.requestReview();
  assert.equal(invoked, 1);
});

test('native adapter shares a single pending call across consumers and releases its lock after failure or success', async () => {
  let settle, calls = 0;
  const native = { isAvailableAsync: async () => true,
    requestReview: () => { calls++; return new Promise((resolve, reject) => { settle = { resolve, reject }; }); } };
  const { loadNativeReview } = loader({ 'react-native': { Platform: { OS: 'ios' } },
    'expo-modules-core': { requireOptionalNativeModule: () => native }, 'expo-store-review': native,
  })('features/store-review/nativeReview.ts');
  const first = await loadNativeReview(), second = await loadNativeReview();
  for (const outcome of ['reject', 'resolve']) {
    const one = first.requestReview(), two = second.requestReview();
    assert.equal(one, two);
    const checked = outcome === 'reject' ? assert.rejects(one) : one;
    settle[outcome](); await checked;
  }
  assert.equal(calls, 2);
});
