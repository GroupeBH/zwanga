const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const now = Date.parse('2026-10-19T08:00:00Z');
const at = time => `2026-10-19T${time}:00Z`;
const acceptedTrip = patch => ({ id: 'ride', driverId: 'driver', tripRequestId: 'order', status: 'upcoming', departureTime: at('10:00'), ...patch });
const acceptedRequest = patch => ({ id: 'order', passengerId: 'passenger', selectedDriverId: 'driver', tripId: 'ride',
  status: 'driver_selected', departureDateMin: at('10:00'), departureDateMax: at('11:00'), ...patch });
const publication = () => acceptedTrip({ id: 'published', tripRequestId: null, departureTime: at('09:00') });

function fixture(t) {
  const hooks = hookHarness(), routes = [], reads = [], env = { version: 0 };
  const options = { userId: 'driver', driver: true, active: true, online: true, ready: true, profileReady: true,
    path: '/', overlayBusy: false, ridePending: false, hasOngoingRide: false,
    requests: { data: [], isSuccess: true, fulfilledTimeStamp: now + 1000 },
    trips: { data: [acceptedTrip()], isSuccess: true, fulfilledTimeStamp: now + 1000 },
    activity: { data: { userId: 'driver', hasLiveActivity: true, trips: { count: 1, revision: 'trips-v1' }, requests: { count: 0 } },
      isSuccess: true, fulfilledTimeStamp: now + 1000 }, alerts: [],
    readTrip: async id => { reads.push(['trip', id]); return acceptedTrip(); },
    readRequest: async id => { reads.push(['request', id]); return acceptedRequest(); },
    readDispatch: async () => { throw new Error('Accepted course must precede new dispatch offers'); },
    replace: path => routes.push(path), refresh: async () => {},
  };
  const useEntry = loader({ react: hooks.react, '@/services/tokenSession': { getTokenSessionVersion: () => env.version } })
    ('hooks/navigation/useRequestEntryResume.ts').useRequestEntryResume;
  t.after(() => hooks.unmount());
  return { options, routes, reads, env, render: () => hooks.render(() => useEntry({ ...options })) };
}
const clock = t => t.mock.timers.enable({ apis: ['Date'], now });
const reconciled = f => { f.options.reconciled = { userId: 'driver', reads: { trips: {
  revision: f.options.activity.data.trips.revision, fulfilledTimeStamp: f.options.trips.fulfilledTimeStamp,
} } }; };

test('accepted same-day course is verified and opened once per foreground without starting it', async t => {
  clock(t); const f = fixture(t);
  assert.equal(f.render().pending, true); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
  assert.deepEqual(f.reads, [['trip', 'ride'], ['request', 'order']]);
  assert.equal(f.render().pending, true, 'cover Home until detail is mounted');
  f.options.path = '/request-details/order'; assert.equal(f.render().pending, false);
  f.options.path = '/'; f.render(); await flush(); assert.equal(f.routes.length, 1, 'voluntary Home remains usable');
  f.options.active = false; f.render(); f.options.active = true; f.render(); await flush();
  assert.equal(f.routes.length, 2, 'new foreground resumes the confirmed request');
});

test('fresh earlier publication prevents the accepted request from replacing Home', async t => {
  clock(t); const f = fixture(t); f.options.trips.data.push(publication());
  f.render(); await flush(); f.render();
  assert.deepEqual(f.routes, []); assert.equal(f.render().pending, false);
});

test('a ringing nearby/dispatch request precedes an accepted but unstarted course and own waiting requests', async t => {
  clock(t);
  for (const kind of ['nearby', 'dispatch']) {
    const f = fixture(t); f.options.alerts = [{ key: 'incoming', id: 'new', kind, recipientId: 'driver', expiresAt: at('09:00') }];
    f.options.activity.data.requests.count = 1;
    f.options.requests.data = [{ id: 'own', passengerId: 'driver', status: 'pending', departureDateMax: at('11:00') }];
    f.options.readRequest = async id => { f.reads.push(['request', id]); return { id, passengerId: 'passenger', status: 'pending', departureDateMax: at('11:00') }; };
    f.options.readDispatch = async id => { f.reads.push(['dispatch', id]); return { id, driverId: 'driver', actionable: true, serverNow: at('08:00'), expiresAt: at('09:00') }; };
    f.render(); await flush(); assert.deepEqual(f.routes, kind === 'nearby' ? ['/request-details/new']
      : [{ pathname: '/incoming-driver', params: { id: 'new', kind: 'dispatch', driverId: 'driver' } }]);
    assert.deepEqual(f.reads, [[kind === 'nearby' ? 'request' : 'dispatch', 'new']], 'no unrelated accepted-trip read before the response');
  }
});

test('wait for fresh driver publications, even if the passenger-only requests list is already empty', async t => {
  clock(t); const f = fixture(t);
  f.options.trips.fulfilledTimeStamp = now;
  assert.equal(f.render().pending, true); await flush(); assert.deepEqual(f.reads, []);
  f.options.trips.fulfilledTimeStamp = now + 1001; f.options.trips.isFetching = true;
  f.render(); await flush(); assert.deepEqual(f.reads, []);
  f.options.trips.isFetching = false; f.render(); await flush(); assert.deepEqual(f.routes, ['/request-details/order']);
});

test('fresh empty trip summary overrides stale accepted data without trapping the loader', async t => {
  clock(t); const f = fixture(t); f.options.activity.data.trips.count = 0;
  f.render(); await flush(); assert.deepEqual(f.reads, []); assert.equal(f.render().pending, false);
});

test('new accepted activity after settled Home does not force an unexpected redirect', async t => {
  clock(t); const f = fixture(t); f.options.trips.data = []; f.options.activity.data.trips.count = 0;
  f.render(); assert.equal(f.render().pending, false);
  f.options.activity.data.trips.count = 1; f.options.trips.data = [acceptedTrip()];
  f.render(); await flush(); assert.deepEqual(f.reads, []); assert.deepEqual(f.routes, []);
});

test('server trip changes invalidate entry; a newly ongoing trip opens driver navigation', async t => {
  clock(t);
  for (const patch of [{ status: 'cancelled' }, { status: 'completed' }, { driverId: 'other' },
    { id: 'other' }, { tripRequestId: 'other' }, { startedAt: at('08:00') }, { status: 'ongoing' }]) {
    const f = fixture(t); f.options.readTrip = async () => acceptedTrip(patch);
    f.render(); await flush(); f.render();
    assert.deepEqual(f.routes, patch.status === 'ongoing' ? ['/trip/navigate/ride'] : [], JSON.stringify(patch));
    assert.deepEqual(f.reads, [], 'no request read after trip validation fails or navigation takes over');
  }
});

test('request cancelled, reassigned, detached or expired after discovery never becomes the main screen', async t => {
  clock(t);
  for (const patch of [{ status: 'cancelled' }, { status: 'expired' }, { selectedDriverId: 'another' },
    { tripId: 'another' }, { departureDateMax: at('06:00') }]) {
    const f = fixture(t); f.options.readRequest = async () => acceptedRequest(patch);
    f.render(); await flush(); f.render(); assert.deepEqual(f.routes, []); assert.equal(f.render().pending, false);
  }
});

test('publication arriving while request verification is pending is considered before routing', async t => {
  clock(t); const f = fixture(t), wait = deferred(); f.options.readRequest = () => wait.promise;
  f.render(); await flush(); f.options.trips = { ...f.options.trips, data: [acceptedTrip(), publication()] }; f.render();
  wait.resolve(acceptedRequest()); await flush(); f.render(); assert.deepEqual(f.routes, []); assert.equal(f.render().pending, false);
});

test('refreshing publications mid-verification waits for reconciliation and does not reuse a stale absence', async t => {
  clock(t); const f = fixture(t), wait = deferred(); f.options.readRequest = () => wait.promise;
  f.render(); await flush(); f.options.trips.isFetching = true; f.render();
  wait.resolve(acceptedRequest()); await flush(); f.render(); assert.deepEqual(f.routes, []);
  f.options.trips.isFetching = false; f.options.trips.data.push(publication()); f.render(); await flush(); f.render();
  assert.deepEqual(f.routes, []); assert.equal(f.render().pending, false);
});

test('an unchanged summary revision does not demand a list refetch that the shared coordinator intentionally skips', async t => {
  clock(t); const f = fixture(t), wait = deferred(); f.options.readRequest = () => wait.promise;
  f.render(); await flush();
  reconciled(f);
  f.options.activity.fulfilledTimeStamp = now + 2000; f.render();
  wait.resolve(acceptedRequest()); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
});

test('a changed trip revision requires reconciliation even after a previously fresh list', async t => {
  clock(t); const f = fixture(t), wait = deferred(); f.options.readRequest = () => wait.promise;
  f.render(); await flush();
  reconciled(f);
  f.options.activity.fulfilledTimeStamp = now + 2000;
  f.options.activity.data.trips.revision = 'trips-v2'; f.render();
  wait.resolve(acceptedRequest()); await flush(); f.render(); assert.deepEqual(f.routes, []);
  f.options.trips = { ...f.options.trips, data: [acceptedTrip(), publication()], fulfilledTimeStamp: now + 2001 };
  f.render(); await flush(); f.render(); assert.deepEqual(f.routes, []); assert.equal(f.render().pending, false);
});

test('accepted entry never overrides ongoing discovery, overlays, role loading, offline or an explicit screen', async t => {
  clock(t);
  for (const patch of [{ ridePending: true }, { hasOngoingRide: true }, { profileReady: false }, { overlayBusy: true },
    { online: false }, { active: false }, { ready: false }, { driver: false }, { path: '/chat/one' }, { path: '/request-details/other' }]) {
    const f = fixture(t); Object.assign(f.options, patch); f.render(); await flush();
    assert.deepEqual(f.reads, [], JSON.stringify(patch)); assert.deepEqual(f.routes, []);
  }
});

test('late accepted detail cannot redirect after account/session/background/path/overlay/ongoing changes', async t => {
  clock(t);
  for (const change of ['account', 'session', 'background', 'path', 'overlay', 'ride', 'role', 'empty']) {
    const f = fixture(t), wait = deferred(); f.options.readRequest = () => wait.promise;
    f.render(); await flush();
    if (change === 'account') f.options.userId = 'other';
    if (change === 'session') f.env.version++;
    if (change === 'background') f.options.active = false;
    if (change === 'path') f.options.path = '/messages';
    if (change === 'overlay') f.options.overlayBusy = true;
    if (change === 'ride') f.options.hasOngoingRide = true;
    if (change === 'role') f.options.driver = false;
    if (change === 'empty') f.options.activity.data.hasLiveActivity = false;
    f.render(); wait.resolve(acceptedRequest()); await flush(); assert.deepEqual(f.routes, [], change);
  }
});

test('deleted first accepted trip is skipped once and the next eligible request is checked', async t => {
  clock(t); const f = fixture(t); let calls = 0;
  f.options.trips.data.push(acceptedTrip({ id: 'second', tripRequestId: 'second-order', departureTime: at('11:00') }));
  f.options.readTrip = async id => { calls++; if (id === 'ride') throw { status: 404 }; return f.options.trips.data[1]; };
  f.options.readRequest = async () => acceptedRequest({ id: 'second-order', tripId: 'second' });
  f.render(); await flush(); f.render(); await flush(); f.render();
  assert.deepEqual(f.routes, ['/request-details/second-order']); assert.equal(calls, 2);
});

test('accepted trip network failure offers explicit retry without fetching on every render', async t => {
  clock(t); const f = fixture(t); let calls = 0;
  f.options.readTrip = async () => { calls++; throw { status: 503 }; };
  f.render(); await flush(); assert.equal(f.render().failed, true); f.render(); await flush(); assert.equal(calls, 1);
  reconciled(f);
  f.options.refresh = async () => { f.options.activity.fulfilledTimeStamp = now + 2000; };
  f.options.readTrip = async () => acceptedTrip(); f.render().retry(); f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/order']);
});
