const test = require('node:test');
const assert = require('node:assert/strict');
const { entryRecoveryHarness } = require('./helpers/entryRecoveryHarness.cjs');
const { ENTRY_LOAD_TIMEOUT_MS } = require('./helpers/loadTypeScript.cjs').loader()('services/entryRecovery.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const now = Date.parse('2026-10-19T08:00:00Z');

test('foreground: cached summary reconciles before the identical fresh summary, without blocking accepted-course entry', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const app = entryRecoveryHarness(t);
  app.produce(); app.enter(); await flush();
  assert.deepEqual(app.reads, ['getMyActivityTrips']);
  t.mock.timers.tick(25);
  app.activity = { ...app.activity, fulfilledTimeStamp: Date.now() };
  app.produce(); app.enter(); await flush(); app.enter(); await flush();
  assert.deepEqual(app.routes, ['/request-details/request']);
  assert.equal(app.reads.filter(name => name === 'getMyActivityTrips').length, 1, 'no redundant list polling');
  app.path = '/request-details/request'; assert.equal(app.enter(), null);
});

test('a refresh completed just before entry mounts remains valid when its revision is revalidated', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const app = entryRecoveryHarness(t);
  app.produce(); await flush();
  t.mock.timers.tick(25);
  app.activity = { ...app.activity, fulfilledTimeStamp: Date.now() };
  app.produce(); app.enter(); await flush(); app.enter(); await flush();
  assert.deepEqual(app.routes, ['/request-details/request']);
});

test('a brief background/foreground resumes once without reloading already reconciled lists', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const app = entryRecoveryHarness(t);
  app.activity.fulfilledTimeStamp = now;
  app.produce(); app.enter(); await flush(); app.enter(); app.enter(); await flush();
  assert.equal(app.routes.length, 1);
  app.path = '/request-details/request'; app.enter(); app.path = '/'; app.enter();
  app.active = false; app.produce(); app.enter();
  assert.equal(app.load('services/activityReadiness.ts').getActivityReadiness(), null);
  t.mock.timers.tick(1000);
  app.active = true; app.produce(); app.enter(); await flush();
  t.mock.timers.tick(25); app.activity = { ...app.activity, fulfilledTimeStamp: Date.now() };
  app.produce(); app.enter(); await flush(); app.enter(); await flush();
  assert.deepEqual(app.routes, ['/request-details/request', '/request-details/request']);
  assert.equal(app.reads.filter(name => name === 'getMyActivityTrips').length, 1, 'unchanged verified lists are retained');
});

test('changed revisions and failed reconciliation cannot certify the old cache, then retry can recover', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const app = entryRecoveryHarness(t);
  app.produce(); await flush();
  t.mock.timers.tick(25);
  app.summary = { ...app.summary, trips: { count: 1, revision: 'b'.repeat(64) } };
  app.activity = { ...app.activity, data: app.summary, currentData: app.summary, fulfilledTimeStamp: Date.now() };
  app.fail = name => name === 'getMyActivityTrips';
  app.produce(); app.enter(); await flush(); app.enter();
  assert.deepEqual(app.routes, []);
  t.mock.timers.tick(ENTRY_LOAD_TIMEOUT_MS);
  assert.equal(app.enter(), null);
  const error = app.banner().props;
  assert.equal(error.failed, true);
  app.fail = undefined; error.onAction(); await flush();
  app.produce(); app.enter(); await flush(); app.enter(); app.enter(); await flush();
  assert.deepEqual(app.routes, ['/request-details/request'], 'retry opens the verified request without a second tap');
});

test('a request-detail failure can be retried with the same revision without another list read', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const app = entryRecoveryHarness(t);
  app.activity.fulfilledTimeStamp = now;
  app.fail = name => name === 'getTripRequestById';
  app.produce(); app.enter(); await flush(); app.enter(); app.enter(); await flush();
  assert.deepEqual(app.routes, []); assert.equal(app.enter(), null); assert.equal(app.banner().props.failed, true);
  t.mock.timers.tick(25); app.fail = undefined; app.banner().props.onAction(); await flush();
  app.produce(); app.enter(); await flush(); app.enter(); await flush();
  assert.deepEqual(app.routes, ['/request-details/request']);
  assert.equal(app.reads.filter(name => name === 'getMyActivityTrips').length, 1);
});

test('passenger waiting-request discovery uses the same receipts, not HTTP response order', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const app = entryRecoveryHarness(t);
  app.profile.data.role = 'passenger';
  app.request = { ...app.request, passengerId: 'driver', selectedDriverId: undefined, tripId: undefined, status: 'pending' };
  app.trips.data = []; app.requests.data = [app.request];
  app.summary.trips.count = 0; app.summary.requests.count = 1;
  app.produce(); await flush(); t.mock.timers.tick(25);
  app.activity = { ...app.activity, fulfilledTimeStamp: Date.now() };
  app.produce(); app.enter(); await flush(); app.enter(); await flush();
  assert.deepEqual(app.routes, ['/request-details/request']);
  assert.equal(app.reads.filter(name => name === 'getMyTripRequests').length, 1);
});
