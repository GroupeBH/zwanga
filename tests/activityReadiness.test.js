const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('receipts notify on actual changes, never on identical snapshots, and clear on disposal', () => {
  const service = loader()('services/activityReadiness.ts');
  let notifications = 0;
  const unsubscribe = service.subscribeActivityReadiness(() => notifications++);
  const owner = service.beginActivityReadiness('user');
  owner.record('trips', 'revision', 100);
  const saved = service.getActivityReadiness();
  for (let i = 0; i < 100; i++) owner.record('trips', 'revision', 100);
  assert.equal(notifications, 2); assert.equal(service.getActivityReadiness(), saved);
  owner.record('bookings', 'revision', undefined); assert.equal(notifications, 2);
  owner.dispose(); assert.equal(service.getActivityReadiness(), null); assert.equal(notifications, 3);
  unsubscribe();
});

test('late previous-account or foreground owners cannot overwrite or clear the current receipts', () => {
  const service = loader()('services/activityReadiness.ts');
  const old = service.beginActivityReadiness('old'); old.record('trips', 'old-revision', 100);
  const current = service.beginActivityReadiness('current'); current.record('trips', 'new-revision', 200);
  old.record('trips', 'old-revision', 300); old.dispose();
  assert.deepEqual(service.getActivityReadiness(), { userId: 'current', reads: { trips: { revision: 'new-revision', fulfilledTimeStamp: 200 } } });
  current.dispose(); current.record('trips', 'new-revision', 400); assert.equal(service.getActivityReadiness(), null);
});

test('a foreground can reuse receipts only within the same account and token session', () => {
  let version = 0;
  const service = loader({ '@/services/tokenSession': { getTokenSessionVersion: () => version } })('services/activityReadiness.ts');
  const first = service.beginActivityReadiness('a'); first.record('trips', 'revision', 100); first.dispose();
  assert.equal(service.getActivityReadiness(), null, 'not exposed while suspended');
  const resumed = service.beginActivityReadiness('a');
  assert.equal(service.getActivityReadiness().reads.trips.fulfilledTimeStamp, 100);
  version++; assert.equal(service.getActivityReadiness(), null, 'even a live old owner cannot expose another session receipts');
  resumed.dispose();
  const newSession = service.beginActivityReadiness('a'); assert.deepEqual(service.getActivityReadiness().reads, {});
  newSession.record('trips', 'revision', 200); newSession.dispose();
  const other = service.beginActivityReadiness('b'); assert.deepEqual(service.getActivityReadiness().reads, {});
  other.dispose();
});

test('an unchanged verified revision skips list reload, but a changed or failed cache does not', async () => {
  const { createActivityReconciliation } = loader()('features/activity/activityReconciliation.ts');
  const reads = []; let failed = false;
  const cache = createActivityReconciliation({ hasCachedItems: () => true,
    hasFailedRead: key => key === 'trips' && failed,
    hasAppliedRevision: (_key, revision) => revision === 'same', load: async key => { reads.push(key); } });
  const snapshot = { trips: { count: 1, revision: 'same' }, bookings: { count: 1, revision: 'same' }, requests: { count: 1, revision: 'same' } };
  await cache.apply(snapshot); assert.deepEqual(reads, []);
  failed = true; await cache.apply(snapshot); assert.deepEqual(reads, ['trips']);
  failed = false; await cache.apply({ ...snapshot, bookings: { count: 2, revision: 'new' } });
  assert.deepEqual(reads, ['trips', 'bookings']); cache.dispose();
});

test('only a matching account, revision and exact fulfilled cache timestamp certify a pre-summary list', () => {
  const { isEntryActivityListReady } = loader()('features/navigation/entryActivityReadiness.ts');
  const read = { data: [{ id: 'ride' }], isSuccess: true, fulfilledTimeStamp: 100 };
  const summary = { userId: 'user', trips: { count: 1, revision: 'v1' } };
  const reconciled = { userId: 'user', reads: { trips: { revision: 'v1', fulfilledTimeStamp: 100 } } };
  const options = { userId: 'user', since: 200, summaryTime: 300, summary, reconciled };
  assert.equal(isEntryActivityListReady('trips', read, options), true);
  for (const patch of [{ reconciled: null }, { userId: 'other' }, { summary: undefined },
    { summary: { ...summary, trips: { count: 1, revision: 'v2' } } },
    { reconciled: { ...reconciled, userId: 'other' } }]) {
    assert.equal(isEntryActivityListReady('trips', read, { ...options, ...patch }), false);
  }
  for (const patch of [{ isError: true }, { isSuccess: false }, { isFetching: true }, { data: undefined },
    { fulfilledTimeStamp: 99 }, { fulfilledTimeStamp: 101 }]) {
    assert.equal(isEntryActivityListReady('trips', { ...read, ...patch }, options), false);
  }
  assert.equal(isEntryActivityListReady('trips', { ...read, fulfilledTimeStamp: 301 }, { ...options, reconciled: null }), true);
});

test('reconciliation emits a receipt only after successful completion, never for failure or disposed work', async () => {
  const { createActivityReconciliation } = loader()('features/activity/activityReconciliation.ts');
  const receipts = []; let fail = true, resolve;
  const snapshot = { trips: { count: 1, revision: 'v1' }, bookings: { count: 0, revision: 'empty' }, requests: { count: 0, revision: 'empty' } };
  const cache = createActivityReconciliation({ hasCachedItems: () => false,
    onApplied: (...args) => receipts.push(args), load: async () => { if (fail) throw Error('offline'); } });
  await cache.apply(snapshot);
  assert.equal(receipts.some(([key]) => key === 'trips'), false);
  fail = false; await cache.apply(snapshot); assert.deepEqual(receipts.at(-1), ['trips', 'v1']);
  const stalled = createActivityReconciliation({ hasCachedItems: () => false,
    onApplied: (...args) => receipts.push(args), load: () => new Promise(done => { resolve = done; }) });
  const pending = stalled.apply(snapshot); await new Promise(done => setImmediate(done));
  const count = receipts.length; stalled.dispose(); resolve(); await pending;
  assert.equal(receipts.length, count); cache.dispose();
});
