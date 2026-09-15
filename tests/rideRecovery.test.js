const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { createRideOutbox } = loader()('features/ride-recovery/rideOutboxEngine.ts');
const { rideRetry, rideEntryMessage, isNearRideStop } = loader()('features/ride-recovery/rideRecoveryModel.ts');

const input = { bookingId: 'booking', tripId: 'trip', stage: 'pickup', decision: 'confirm' };
const snapshot = status => ({ bookingId: 'booking', tripId: 'trip', actor: 'passenger', pickup: { status }, dropoff: { status: 'none' } });
function harness(overrides = {}) {
  const disk = new Map();
  const published = [];
  const sent = [];
  let now = Date.parse('2026-09-14T10:00:00Z');
  let user = 'a';
  let counter = 0;
  const deps = {
    storage: { async getItem(key) { return disk.get(key) ?? null; }, async setItem(key, value) { disk.set(key, value); } },
    userId: () => user,
    publish: (userId, entries) => published.push({ userId, entries }),
    send: async event => { sent.push(event); return snapshot('awaiting_other'); },
    read: async () => snapshot('confirmed'),
    uuid: () => `event-${++counter}`,
    now: () => now,
    ...overrides,
  };
  return { deps, disk, published, sent, create: () => createRideOutbox(deps), advance: ms => { now += ms; }, user: id => { user = id; } };
}

test('save is durable before any send; simultaneous taps keep the same event ID', async () => {
  const h = harness(); const outbox = h.create();
  const [first, second] = await Promise.all([outbox.enqueue(input), outbox.enqueue(input)]);
  assert.equal(first.eventId, second.eventId);
  assert.equal(h.sent.length, 0);
  assert.equal(JSON.parse([...h.disk.values()][0]).length, 1);
  await outbox.flush();
  assert.equal(h.sent[0].eventId, first.eventId);
  assert.equal(h.published.at(-1).entries[0].state, 'received');
});

test('a disk failure does not acknowledge or send a confirmation', async () => {
  const h = harness({ storage: { async getItem() { return null; }, async setItem() { throw Error('disk full'); } } });
  const outbox = h.create();
  await assert.rejects(outbox.enqueue(input));
  assert.equal(h.published.length, 0); assert.equal(h.sent.length, 0);
});

test('lost HTTP response retries the SAME receipt after a process restart and backoff', async () => {
  let calls = 0; const ids = [];
  const h = harness({ send: async event => { ids.push(event.eventId); if (++calls === 1) throw { status: 'TIMEOUT_ERROR' }; return snapshot('confirmed'); } });
  await h.create().enqueue(input);
  await h.create().flush();
  const restored = h.create(); await restored.hydrate(); await restored.flush();
  assert.equal(calls, 1);
  h.advance(120_000); await restored.flush();
  assert.deepEqual(ids, ['event-1', 'event-1']);
  assert.equal(h.published.at(-1).entries[0].state, 'confirmed');
});

test('server receipt is not a final confirmation and subsequent reconciliation only reads', async () => {
  const h = harness(); const box = h.create(); await box.enqueue(input); await box.flush();
  assert.equal(h.published.at(-1).entries[0].state, 'received');
  h.advance(60_000); await box.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.published.at(-1).entries[0].state, 'confirmed');
});

test('arrival waiting for pickup is retried, but conflicts are not blindly retried', () => {
  assert.equal(rideRetry({ status: 409, data: { code: 'RIDE_PICKUP_REQUIRED' } }, 0, 1).state, 'queued');
  assert.equal(rideRetry({ status: 409, data: { code: 'RIDE_STATE_CHANGED' } }, 0, 1).state, 'blocked');
  assert.equal(rideRetry({ status: 403 }, 0, 1).state, 'blocked');
  assert.equal(rideRetry({ status: 503 }, 20, 1).nextAttemptAt, 120001);
  assert.equal(rideRetry({ status: 429 }, 0, 1).state, 'queued');
});

test('an account change stops the batch and never publishes the old account response to the new one', async () => {
  const h = harness();
  let finish;
  h.deps.send = () => new Promise(resolve => { finish = resolve; });
  const box = h.create(); await box.enqueue(input); await box.enqueue({ ...input, bookingId: 'other' });
  const flushing = box.flush();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  h.user('b'); const count = h.published.length;
  finish(snapshot('awaiting_other')); await flushing;
  assert.equal(h.published.length, count);
  await box.hydrate(); assert.deepEqual(h.published.at(-1), { userId: 'b', entries: [] });
  h.user('a'); await box.hydrate(); assert.equal(h.published.at(-1).entries.length, 2);
});

test('foreground worker stops when the app is paused; enqueuing still works offline', async () => {
  const h = harness({ canSend: () => false }); const box = h.create();
  await box.enqueue(input); await box.flush(); assert.equal(h.sent.length, 0);
  h.deps.canSend = () => true; await box.flush(); assert.equal(h.sent.length, 1);
});

test('opposite decisions cannot silently overwrite an already saved declaration', async () => {
  const h = harness(); const box = h.create(); await box.enqueue(input);
  await assert.rejects(box.enqueue({ ...input, decision: 'reject' }), /déjà enregistrée/);
  assert.equal(JSON.parse([...h.disk.values()][0])[0].decision, 'confirm');
});

test('a crash with a sending entry is recoverable without changing the event ID', async () => {
  const h = harness(); await h.create().enqueue(input);
  const key = [...h.disk.keys()][0]; const entries = JSON.parse(h.disk.get(key)); entries[0].state = 'sending'; h.disk.set(key, JSON.stringify(entries));
  const box = h.create(); await box.hydrate(); await box.flush(); assert.equal(h.sent[0].eventId, 'event-1');
});

test('corrupt storage is not silently erased', async () => {
  const h = harness(); h.disk.set('@zwanga/ride-outbox/v1/a', '{broken');
  await assert.rejects(h.create().enqueue(input));
  assert.equal(h.disk.get('@zwanga/ride-outbox/v1/a'), '{broken');
});

test('late declarations stop automatic retries and remain available for support', async () => {
  const h = harness(); const box = h.create(); await box.enqueue(input); h.advance(73 * 60 * 60_000);
  await box.flush(); assert.equal(h.sent.length, 0); assert.equal(h.published.at(-1).entries[0].state, 'blocked');
});

test('stale, inaccurate or distant GPS never suggests a local confirmation', () => {
  const target = { latitude: -4.32, longitude: 15.31 };
  assert.equal(isNearRideStop({ ...target, recordedAt: 100_000, accuracy: 20 }, target, 101_000), true);
  assert.equal(isNearRideStop({ ...target, recordedAt: 1, accuracy: 20 }, target, 101_000), false);
  assert.equal(isNearRideStop({ ...target, recordedAt: 100_000, accuracy: 200 }, target, 101_000), false);
  assert.equal(isNearRideStop({ ...target, recordedAt: 100_000 }, target, 101_000), false);
  assert.equal(isNearRideStop({ latitude: 0, longitude: 0, recordedAt: 100_000 }, target, 101_000), false);
  assert.match(rideEntryMessage({ state: 'received' }), /attente de l’autre/);
});

test('a delayed disk lock cannot assign an old tap to the next logged-in account', async () => {
  const h = harness(); const box = h.create();
  const action = box.enqueue(input); h.user('b');
  await assert.rejects(action, /compte a changé/);
  assert.equal(h.disk.size, 0);
});

test('unknown English error bodies are never used as user-facing messages', () => {
  assert.doesNotMatch(rideRetry({ status: 500, data: { message: 'aborted server error' } }, 1, 0).message, /aborted|server error/);
  assert.match(rideRetry({ status: 409, data: { code: 'RIDE_EVENT_TIME', message: 'Bad timestamp' } }, 1, 0).message, /heure du téléphone/);
});

test('the queue evicts confirmed history, never untransmitted declarations', async () => {
  const h = harness(); const box = h.create(); await box.enqueue(input);
  const key = [...h.disk.keys()][0]; const first = JSON.parse(h.disk.get(key))[0];
  h.disk.set(key, JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ ...first, eventId: `id-${index}`, bookingId: `booking-${index}`, state: index === 0 ? 'confirmed' : 'queued' }))));
  await box.enqueue({ ...input, bookingId: 'new' });
  const saved = JSON.parse(h.disk.get(key)); assert.equal(saved.length, 100);
  assert.equal(saved.some(entry => entry.eventId === 'id-0'), false);
  assert.equal(saved.filter(entry => entry.state === 'queued').length, 100);
  await assert.rejects(box.enqueue({ ...input, bookingId: 'overflow' }), /Trop de confirmations/);
});

test('offline snapshots strip live positions, isolate accounts and bound retention', async () => {
  const disk = new Map();
  const storage = { async getItem(key) { return disk.get(key) ?? null; }, async setItem(key, value) { disk.set(key, value); } };
  const { loadRideSnapshot, saveRideSnapshot } = loader({ '@react-native-async-storage/async-storage': storage })('features/ride-recovery/offlineRideSnapshots.ts');
  await saveRideSnapshot('a', 'trip', { id: 'trip', currentLocation: [1, 2], lastLocationUpdateAt: 'now', departure: 'A' });
  const saved = await loadRideSnapshot('a', 'trip');
  assert.equal(saved.currentLocation, null); assert.equal(saved.departure, 'A');
  assert.equal(await loadRideSnapshot('b', 'trip'), undefined);
  for (let i = 0; i < 10; i++) await saveRideSnapshot('a', `trip-${i}`, { id: i });
  assert.equal(Object.keys(JSON.parse([...disk.values()][0])).length, 6);
});
