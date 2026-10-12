const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nativeMocks = require('./helpers/walletTopUpNativeMocks.cjs');
const input = { userId: 'synthetic-user', amount: 50, method: 'mobile_money', phone: '+243800000000' };

test('simultaneous taps and a process restart reuse the durable key before any POST', async () => {
  const mocks = nativeMocks();
  const service = loader(mocks)('services/walletTopUpIntent.ts');
  const [a, b] = await Promise.all([service.prepareWalletTopUpIntent(input), service.prepareWalletTopUpIntent(input)]);
  assert.equal(a.idempotencyKey, b.idempotencyKey);
  const restarted = loader(mocks)('services/walletTopUpIntent.ts');
  assert.equal((await restarted.prepareWalletTopUpIntent(input)).idempotencyKey, a.idempotencyKey);
});

test('changing amount or phone cannot silently replace an unresolved payment', async () => {
  const service = loader(nativeMocks())('services/walletTopUpIntent.ts');
  await service.prepareWalletTopUpIntent(input);
  await assert.rejects(service.prepareWalletTopUpIntent({ ...input, amount: 100 }), /confirmation/);
  await assert.rejects(service.prepareWalletTopUpIntent({ ...input, phone: '+243800000001' }), /confirmation/);
});

test('accounts and booking complements have separate retry keys', async () => {
  const service = loader(nativeMocks())('services/walletTopUpIntent.ts');
  const intents = await Promise.all([input, { ...input, userId: 'other' }, { ...input, scope: 'booking' }].map(service.prepareWalletTopUpIntent));
  assert.equal(new Set(intents.map(x => x.idempotencyKey)).size, 3);
});

test('disk failure fails closed and corrupt pending intents are never discarded', async () => {
  const mocks = nativeMocks(), storage = mocks['@react-native-async-storage/async-storage'];
  storage.setItem = async () => { throw Error('disk unavailable'); };
  const service = loader(mocks)('services/walletTopUpIntent.ts');
  await assert.rejects(service.prepareWalletTopUpIntent(input), /disk unavailable/);
  storage.getItem = async () => '{}';
  await assert.rejects(service.prepareWalletTopUpIntent(input), /restaurée/);
});

test('only a matching server-confirmed payment clears the intent; stale completion cannot clear a newer attempt', async () => {
  const service = loader(nativeMocks())('services/walletTopUpIntent.ts');
  const old = await service.prepareWalletTopUpIntent(input);
  await service.rememberWalletTopUpReference(old, 'ref-old');
  await service.clearWalletTopUpIntent(input.userId, undefined, 'other-ref');
  assert.ok(await service.readWalletTopUpIntent(input.userId));
  await service.clearWalletTopUpIntent(input.userId, undefined, 'ref-old');
  const next = await service.prepareWalletTopUpIntent(input);
  assert.notEqual(next.idempotencyKey, old.idempotencyKey);
  await service.rememberWalletTopUpReference(old, 'ref-old');
  await service.clearWalletTopUpIntent(input.userId, undefined, 'ref-old');
  assert.equal((await service.readWalletTopUpIntent(input.userId)).idempotencyKey, next.idempotencyKey);
});
