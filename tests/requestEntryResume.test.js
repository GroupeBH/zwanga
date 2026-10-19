const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { ENTRY_LOAD_TIMEOUT_MS } = loader()('services/entryRecovery.ts');
test.beforeEach(t => t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-19T08:00:00Z') }));
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const iso = delta => new Date(Date.now() + delta).toISOString();
const request = (id = 'order', passengerId = 'user') => ({ id, passengerId, status: 'pending',
  departureDateMax: iso(3600000), createdAt: iso(-10000), departure: { address: 'Départ' }, arrival: { address: 'Arrivée' } });

function fixture(t) {
  const hooks = hookHarness(), routes = [], reads = [];
  const env = { version: 0 };
  const options = { userId: 'user', active: true, online: true, ready: true, path: '/', overlayBusy: false,
    ridePending: false, hasOngoingRide: false, driver: false, profileReady: true,
    requests: { data: [request()], isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    trips: { data: [], isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    activity: { data: { userId: 'user', hasLiveActivity: true, requests: { count: 1 } }, isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    alerts: [], readRequest: async id => { reads.push(id); return request(id); },
    readTrip: async () => { throw new Error('No accepted trip in this fixture'); },
    readDispatch: async id => { reads.push(id); return { id, driverId: 'user', actionable: true, serverNow: iso(0), expiresAt: iso(30000) }; },
    replace: path => routes.push(path), refresh: async () => {},
  };
  const useEntry = loader({ react: hooks.react, '@/services/tokenSession': { getTokenSessionVersion: () => env.version } })
    ('hooks/navigation/useRequestEntryResume.ts').useRequestEntryResume;
  t.after(() => hooks.unmount());
  return { options, routes, reads, env, hooks, render: () => hooks.render(() => useEntry({ ...options })) };
}

test('passenger entry verifies and opens its own pending order once, even with a driver account', async t => {
  const f = fixture(t); f.options.driver = true;
  assert.equal(f.render().pending, true); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
  assert.equal(f.render().pending, true, 'cover until destination is mounted');
  f.options.path = '/request-details/order'; assert.equal(f.render().pending, false);
  f.options.path = '/'; f.render(); await flush(); assert.equal(f.routes.length, 1, 'Home exit is not trapped');
  f.options.active = false; f.render(); f.options.active = true; f.render(); await flush(); assert.equal(f.routes.length, 2);
});

test('the most recently created active order wins; foreign, expired and assigned orders do not', async t => {
  const f = fixture(t);
  f.options.requests.data = [request('old'), { ...request('new'), createdAt: iso(-1) }, request('foreign', 'other'),
    { ...request('cancelled'), status: 'cancelled' }, { ...request('expired'), departureDateMax: iso(-86400000) },
    { ...request('assigned'), selectedDriverId: 'driver' }];
  f.render(); await flush(); assert.deepEqual(f.reads, ['new']); assert.deepEqual(f.routes, ['/request-details/new']);
});

test('ongoing ride discovery, role resolution, overlays, offline and startup block request verification', async t => {
  for (const patch of [{ ridePending: true }, { hasOngoingRide: true }, { profileReady: false }, { overlayBusy: true },
    { online: false }, { ready: false }, { active: false }, { userId: undefined }, { path: '/auth/login' }]) {
    const f = fixture(t); Object.assign(f.options, patch); f.render(); await flush();
    assert.deepEqual(f.reads, [], JSON.stringify(patch)); assert.deepEqual(f.routes, []);
  }
});

test('explicit navigation, forms, conversations and payment are never replaced', async t => {
  for (const path of ['/trip/navigate/ride', '/booking/navigate/booking', '/request-details/other', '/incoming-driver', '/chat/one', '/request/index', '/payment']) {
    const f = fixture(t); f.options.path = path; f.render(); await flush(); assert.deepEqual(f.routes, []);
  }
});

test('a late native alert restored on Home is opened after an empty account discovery', async t => {
  const f = fixture(t); f.options.driver = true;
  f.options.activity.data.hasLiveActivity = false; f.options.activity.data.requests.count = 0;
  f.render(); assert.equal(f.render().pending, false);
  f.options.alerts = [{ key: 'nearby-a', kind: 'nearby', id: 'nearby', recipientId: 'user' }];
  f.options.readRequest = async id => request(id, 'passenger');
  f.render(); await flush(); assert.deepEqual(f.routes, ['/request-details/nearby']);
});

test('immediate dispatch verifies the attributed offer and preserves its authenticated response endpoint', async t => {
  const f = fixture(t); f.options.driver = true;
  f.options.alerts = [{ key: 'dispatch-a', kind: 'dispatch', id: 'offer', recipientId: 'user', expiresAt: iso(30000) }];
  f.render(); await flush(); assert.deepEqual(f.reads, ['offer']);
  assert.deepEqual(f.routes, [{ pathname: '/incoming-driver', params: { id: 'offer', kind: 'dispatch', driverId: 'user' } }]);
});

test('foreign, expired, passenger-only and already answered alerts cannot force a driver screen', async t => {
  for (const alert of [{ kind: 'nearby', recipientId: 'other' }, { kind: 'nearby', expiresAt: iso(-1) }, { kind: 'response' }, { kind: 'booking' }]) {
    const f = fixture(t); f.options.driver = true;
    f.options.alerts = [{ key: 'alert', id: 'alert-id', recipientId: 'user', ...alert }];
    f.render(); await flush(); assert.deepEqual(f.routes, ['/request-details/order']);
  }
  const f = fixture(t); f.options.alerts = [{ key: 'alert', id: 'alert-id', kind: 'nearby', recipientId: 'user' }];
  f.render(); await flush(); assert.deepEqual(f.routes, ['/request-details/order'], 'a passenger role cannot take an incoming driver offer');
});

test('changed, deleted and taken requests are discarded without opening an invalid detail or retrying in a loop', async t => {
  for (const response of [{ ...request(), status: 'cancelled' }, request('order', 'another'), { ...request(), tripId: 'taken' }, '404']) {
    const f = fixture(t); let count = 0;
    f.options.readRequest = async () => { count++; if (response === '404') throw { status: 404 }; return response; };
    f.render(); await flush(); f.render(); f.render(); await flush();
    assert.deepEqual(f.routes, []); assert.equal(count, 1); assert.equal(f.render().pending, false);
  }
});

test('late detail results cannot redirect after background, account change, logout, overlay or deliberate navigation', async t => {
  for (const change of ['background', 'account', 'session', 'path', 'overlay', 'ride']) {
    const f = fixture(t), wait = deferred(); f.options.readRequest = () => wait.promise;
    f.render();
    if (change === 'background') f.options.active = false;
    if (change === 'account') f.options.userId = 'other';
    if (change === 'session') f.env.version++;
    if (change === 'path') f.options.path = '/messages';
    if (change === 'overlay') f.options.overlayBusy = true;
    if (change === 'ride') f.options.ridePending = true;
    f.render(); wait.resolve(request()); await flush(); assert.deepEqual(f.routes, [], change);
  }
});

test('an acknowledgement while verifying cancels alert routing without trapping the loader', async t => {
  const f = fixture(t), wait = deferred(); f.options.driver = true;
  f.options.requests.data = []; f.options.activity.data.requests.count = 0;
  f.options.alerts = [{ key: 'nearby', id: 'nearby', recipientId: 'user', kind: 'nearby' }];
  f.options.readRequest = () => wait.promise; f.render(); f.options.alerts = []; f.render();
  wait.resolve(request('nearby', 'passenger')); await flush(); f.render();
  assert.equal(f.render().pending, false); assert.deepEqual(f.routes, []);
});

test('network failure exposes retry without automatic mutation or repeated requests', async t => {
  const f = fixture(t); let calls = 0;
  f.options.readRequest = async () => { calls++; throw { status: 503 }; };
  f.render(); await flush(); assert.equal(f.render().failed, true); f.render(); await flush(); assert.equal(calls, 1);
  f.options.readRequest = async id => request(id); f.render().retry(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
});

test('slow discovery has a bounded loader and a usable explicit Home exit', t => {
  const f = fixture(t); f.options.requests = { isSuccess: false }; f.options.activity = { isSuccess: false };
  f.render(); t.mock.timers.tick(ENTRY_LOAD_TIMEOUT_MS + 1); assert.equal(f.render().failed, true);
  f.render().dismiss(); assert.equal(f.render().pending, false); assert.deepEqual(f.reads, []);
});

test('a thrown route replacement is reported immediately and Retry can open the request', async t => {
  const f = fixture(t); let fail = true;
  f.options.replace = path => { if (fail) throw new Error('router unavailable'); f.routes.push(path); };
  f.render(); await flush(); assert.equal(f.render().failed, true);
  f.render(); await flush(); assert.equal(f.reads.length, 1, 'no render retry loop');
  fail = false; f.render().retry(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
});

test('a stalled route replacement no longer disables Retry', async t => {
  const f = fixture(t); f.render(); await flush(); f.render();
  t.mock.timers.tick(ENTRY_LOAD_TIMEOUT_MS); assert.equal(f.render().failed, true);
  f.render().retry(); f.render(); await flush(); assert.equal(f.routes.length, 2);
  f.options.path = '/request-details/order'; assert.equal(f.render().pending, false);
});

test('timeout aborts the old attempt; Retry verifies again and ignores its late result', async t => {
  const f = fixture(t), old = deferred(); let calls = 0, signal;
  f.options.readRequest = (_id, attemptSignal) => { calls++; if (calls === 1) { signal = attemptSignal; return old.promise; } return Promise.resolve(request()); };
  f.render(); t.mock.timers.tick(8001); assert.equal(f.render().failed, false, 'a valid HTTP read has not timed out at eight seconds');
  t.mock.timers.tick(ENTRY_LOAD_TIMEOUT_MS - 8001); assert.equal(f.render().failed, true); assert.equal(signal.aborted, true);
  f.render().retry(); f.render(); await flush(); assert.equal(calls, 2);
  old.resolve(request()); await flush(); assert.deepEqual(f.routes, ['/request-details/order']);
});

test('status-only dispatch goes through the same priority, server and route guards, without a push', async t => {
  for (const patch of [{ ridePending: true }, { hasOngoingRide: true }, { overlayBusy: true }, { ready: false },
    { profileReady: false }, { online: false }, { path: '/payment' }]) {
    const f = fixture(t); Object.assign(f.options, { driver: true, pendingDispatchId: 'offer' }, patch);
    f.render(); await flush(); assert.deepEqual(f.routes, []); assert.deepEqual(f.reads, []);
  }
  const f = fixture(t); f.options.driver = true; f.options.pendingDispatchId = 'offer';
  f.render(); await flush(); assert.deepEqual(f.reads, ['offer']);
  assert.equal(f.routes[0].pathname, '/incoming-driver'); assert.deepEqual(f.options.alerts, []);
});

test('a cancelled, foreign or removed status offer cannot open the driver screen', async t => {
  for (const patch of [{ driverId: 'foreign' }, { actionable: false }, { expiresAt: iso(-1000) }]) {
    const f = fixture(t); Object.assign(f.options, { driver: true, pendingDispatchId: 'offer' });
    f.options.readDispatch = async () => ({ id: 'offer', driverId: 'user', actionable: true, expiresAt: iso(30000), serverNow: iso(0), ...patch });
    f.render(); await flush(); assert.deepEqual(f.routes, []);
  }
  const f = fixture(t), wait = deferred(); Object.assign(f.options, { driver: true, pendingDispatchId: 'offer', readDispatch: () => wait.promise });
  f.render(); f.options.pendingDispatchId = null; f.render();
  wait.resolve({ id: 'offer', driverId: 'user', actionable: true, expiresAt: iso(30000), serverNow: iso(0) });
  await flush(); assert.deepEqual(f.routes, []);
});
