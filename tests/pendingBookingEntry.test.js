const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { selectPendingBookingEntry, selectBookingEntryAlert, verifyPendingBookingEntry } = loader()('features/navigation/pendingBookingEntry.ts');
const now = Date.parse('2026-10-21T08:00:00Z');
const iso = delta => new Date(now + delta).toISOString();
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const trip = patch => ({ id: 'trip', driverId: 'driver', status: 'upcoming', departureTime: iso(3600000),
  reservationSummary: { pendingBookingIds: ['booking'], acceptedCount: 0 }, ...patch });
const booking = patch => ({ id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'pending', trip: trip(), ...patch });
const target = (id = 'trip', bookingId = 'booking') => ({ pathname: '/trip/manage/[id]', params: { id, bookingId, section: 'passengers' } });
const alert = patch => ({ id: 'booking', key: 'driver-booking-booking', kind: 'booking', recipientId: 'driver',
  data: { tripId: 'trip', type: 'new_booking', passengerId: 'passenger' }, ...patch });
test.beforeEach(t => t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now }));

test('late priority verification cannot navigate or prime data after navigation, account or foreground changes', async t => {
  for (const change of ['path', 'account', 'background', 'session', 'overlay', 'unmount']) {
    const f = fixture(t), gate = deferred(), primed = [];
    f.options.verifyPriority = () => gate.promise;
    f.options.prepareBookingEntry = snapshot => primed.push(snapshot);
    f.render(); await flush();
    if (change === 'path') f.options.path = '/chat/conversation';
    if (change === 'account') f.options.userId = 'other';
    if (change === 'background') f.options.active = false;
    if (change === 'session') f.env.version++;
    if (change === 'overlay') f.options.overlayBusy = true;
    if (change === 'unmount') f.hooks.unmount(); else f.render();
    gate.resolve('/trip/navigate/live'); await flush();
    assert.deepEqual(f.routes, [], change); assert.deepEqual(primed, [], change);
  }
});

test('an alert acknowledged during priority verification cannot open its old reservation', async t => {
  const f = fixture(t), gate = deferred(), primed = [];
  f.options.alerts = [alert()]; f.options.verifyPriority = () => gate.promise;
  f.options.prepareBookingEntry = snapshot => primed.push(snapshot);
  f.render(); await flush();
  f.options.alerts = []; f.render(); gate.resolve(null); await flush();
  assert.deepEqual(f.routes, []); assert.deepEqual(primed, []);
});

test('priority verification failure stays retryable; it cannot fall through to a less important reservation', async t => {
  const f = fixture(t), primed = [];
  f.options.verifyPriority = async () => { throw { status: 503 }; };
  f.options.prepareBookingEntry = snapshot => primed.push(snapshot);
  f.render(); await flush();
  assert.equal(f.render().failed, true); assert.deepEqual(f.routes, []); assert.deepEqual(primed, []);
  f.options.verifyPriority = async () => null;
  f.render().retry(); f.render(); await flush();
  assert.deepEqual(f.routes, [target()]); assert.equal(primed.length, 1);
});

function fixture(t) {
  const hooks = hookHarness(), routes = [], reads = [], env = { version: 0 };
  const options = { userId: 'driver', driver: true, active: true, online: true, ready: true, profileReady: true,
    path: '/', overlayBusy: false, ridePending: false, hasOngoingRide: false, alerts: [],
    trips: { data: [trip()], isSuccess: true, fulfilledTimeStamp: now },
    requests: { data: [], isSuccess: true, fulfilledTimeStamp: now },
    activity: { data: { userId: 'driver', hasLiveActivity: true, trips: { count: 1 }, requests: { count: 0 } },
      isSuccess: true, startedTimeStamp: now, fulfilledTimeStamp: now },
    readBooking: async id => { reads.push(['booking', id]); return booking({ id }); },
    readTrip: async id => { reads.push(['trip', id]); return trip({ id }); },
    readRequest: async id => { reads.push(['request', id]); return { id, status: 'pending', passengerId: 'passenger', departureDateMax: iso(3600000) }; },
    readDispatch: async () => { throw new Error('Booking must precede dispatch'); },
    replace: path => routes.push(path), refresh: async () => {},
  };
  const { useRequestEntryResume } = loader({ react: hooks.react, '@/services/tokenSession': { getTokenSessionVersion: () => env.version } })
    ('hooks/navigation/useRequestEntryResume.ts');
  t.after(() => hooks.unmount());
  return { options, routes, reads, env, hooks, render: () => hooks.render(() => useRequestEntryResume({ ...options })) };
}

test('shared trips select the nearest pending departure without a push or passenger profile, never mutate the cache', () => {
  const trips = [trip({ id: 'later', departureTime: iso(7200000) }), trip()];
  const before = JSON.stringify(trips);
  assert.deepEqual(selectPendingBookingEntry(trips, 'driver', new Set()), { id: 'booking', tripId: 'trip', key: 'booking:booking' });
  assert.equal(JSON.stringify(trips), before);
  assert.equal(selectPendingBookingEntry(trips, 'driver', new Set(['booking:booking'])), undefined);
});

test('terminal, expired, started, foreign trips and answered reservations are not candidates', () => {
  for (const patch of [{ status: 'ongoing' }, { status: 'cancelled' }, { status: 'completed' }, { isExpired: true },
    { startedAt: iso(-1) }, { driverId: 'other' }, { driver: { id: 'other' } },
    { reservationSummary: { pendingBookingIds: [], acceptedCount: 2 } }]) {
    assert.equal(selectPendingBookingEntry([trip(patch)], 'driver', new Set()), undefined);
  }
  assert.ok(selectPendingBookingEntry([trip({ departureTime: iso(-3600000) })], 'driver', new Set()), 'a delay alone is not server expiration');
});

test('legacy passenger summaries work, but explicit empty pending IDs override stale passenger data', () => {
  const passengers = [{ id: 'passenger', bookingId: 'legacy', bookingStatus: 'pending' }];
  assert.equal(selectPendingBookingEntry([trip({ reservationSummary: undefined, passengers })], 'driver', new Set()).id, 'legacy');
  assert.equal(selectPendingBookingEntry([trip({ reservationSummary: { pendingBookingIds: [], acceptedCount: 0 }, passengers })], 'driver', new Set()), undefined);
});

test('only unexpired driver-owned booking alerts are eligible', () => {
  for (const patch of [{ recipientId: 'other' }, { kind: 'response' }, { expiresAt: iso(-1) }, { expiresAt: 'invalid' },
    { data: { type: 'new_booking', passengerId: 'driver' } }]) {
    assert.equal(selectBookingEntryAlert([alert(patch)], 'driver', new Set()), undefined);
  }
  assert.equal(selectBookingEntryAlert([alert()], 'driver', new Set(['booking:booking'])), undefined);
});

test('verification rejects stale status, mismatching IDs, finished passengers, self bookings and foreign ownership', async () => {
  const candidate = selectPendingBookingEntry([trip()], 'driver', new Set());
  for (const patch of [{ id: 'other' }, { tripId: 'other' }, { status: 'accepted' }, { status: 'rejected' },
    { status: 'cancelled' }, { passengerId: 'driver' }, { droppedOff: true },
    { trip: trip({ id: 'other' }) }, { trip: trip({ driverId: 'other' }) }, { trip: trip({ driver: { id: 'other' } }) },
    { trip: trip({ status: 'completed' }) }, { trip: trip({ isExpired: true }) }]) {
    assert.equal(await verifyPendingBookingEntry(candidate, 'driver', async () => booking(patch), async () => { throw new Error('unnecessary read'); }), null);
  }
});

test('missing embedded trip uses one authenticated fallback; an ongoing trip opens navigation', async () => {
  const candidate = selectPendingBookingEntry([trip()], 'driver', new Set()), reads = [];
  assert.deepEqual(await verifyPendingBookingEntry(candidate, 'driver', async () => booking({ trip: undefined }), async id => {
    reads.push(id); return trip();
  }), target());
  assert.deepEqual(reads, ['trip']);
  assert.equal(await verifyPendingBookingEntry(candidate, 'driver', async () => booking({ trip: trip({ status: 'ongoing' }) }), async () => null), '/trip/navigate/trip');
});

test('entry opens the reservation directly, once per visit, without any request or mutation', async t => {
  const f = fixture(t); f.render(); await flush(); assert.deepEqual(f.routes, [target()]);
  assert.deepEqual(f.reads, [['booking', 'booking']]);
  f.options.path = '/trip/manage/trip'; assert.equal(f.render().pending, false);
  f.options.path = '/'; f.render(); await flush(); assert.equal(f.routes.length, 1, 'manual Home remains usable');
  f.options.active = false; f.render(); f.options.active = true; f.render(); await flush();
  assert.equal(f.routes.length, 2, 'a new foreground checks unhandled reservations again');
});

test('reservation entry waits for the role, ongoing ride decision and reconciled trip list', async t => {
  for (const patch of [{ ridePending: true }, { hasOngoingRide: true }, { profileReady: false }, { driver: false },
    { online: false }, { active: false }, { ready: false }, { overlayBusy: true }, { path: '/booking/navigate/live' },
    { path: '/chat/one' }, { path: '/publish' }, { path: '/wallet' }]) {
    const f = fixture(t); Object.assign(f.options, patch); f.render(); await flush(); assert.deepEqual(f.reads, []);
  }
  const f = fixture(t); f.options.trips.fulfilledTimeStamp = now - 1;
  f.render(); await flush(); assert.deepEqual(f.reads, []);
  f.options.trips.fulfilledTimeStamp = now; f.render(); await flush(); assert.deepEqual(f.routes, [target()]);
});

test('a booking push can restore after empty discovery, without waiting for passenger requests', async t => {
  const f = fixture(t); f.options.activity.data.hasLiveActivity = false;
  f.options.trips.data = []; f.render(); assert.equal(f.render().pending, false);
  f.options.alerts = [alert()]; f.options.requests = { isSuccess: false };
  f.render(); await flush(); assert.deepEqual(f.routes, [target()]);
});

test('pending reservations precede nearby requests, dispatch and unstarted accepted courses', async t => {
  const f = fixture(t);
  f.options.alerts = [{ key: 'nearby', id: 'order', kind: 'nearby', recipientId: 'driver' }];
  f.options.pendingDispatchId = 'offer';
  f.options.trips.data.push(trip({ id: 'accepted', tripRequestId: 'order', reservationSummary: undefined }));
  f.render(); await flush(); assert.deepEqual(f.routes, [target()]); assert.deepEqual(f.reads, [['booking', 'booking']]);
});

test('an incoming booking preempts a slow nearby request read without allowing its late redirect', async t => {
  const f = fixture(t), wait = deferred(); f.options.trips.data = []; f.options.activity.data.trips.count = 0;
  f.options.alerts = [{ key: 'nearby', id: 'order', kind: 'nearby', recipientId: 'driver' }];
  let signal; f.options.readRequest = (_id, value) => { signal = value; return wait.promise; };
  f.render(); f.options.alerts = [alert(), ...f.options.alerts]; f.render(); await flush();
  assert.equal(signal.aborted, true); assert.deepEqual(f.routes, [target()]);
  wait.resolve({ id: 'order', passengerId: 'passenger', status: 'pending', departureDateMax: iso(3600000) });
  await flush(); assert.deepEqual(f.routes, [target()]);
});

test('a new nearby alert cannot preempt booking verification while trip discovery refreshes', async t => {
  const f = fixture(t), wait = deferred(); let signal;
  f.options.readBooking = (_id, value) => { signal = value; return wait.promise; };
  f.render(); f.options.trips.isFetching = true;
  f.options.alerts = [{ key: 'nearby', id: 'order', kind: 'nearby', recipientId: 'driver' }];
  f.render(); await flush(); assert.equal(signal.aborted, false); assert.deepEqual(f.reads, []);
  f.options.trips.isFetching = false; f.render(); wait.resolve(booking()); await flush();
  assert.deepEqual(f.routes, [target()]);
});

test('a booking already handled is skipped and the next pending reservation is verified once', async t => {
  const f = fixture(t); f.options.trips.data[0].reservationSummary.pendingBookingIds.push('next');
  f.options.readBooking = async id => { f.reads.push(id); return booking({ id, status: id === 'booking' ? 'accepted' : 'pending' }); };
  f.render(); await flush(); f.render(); await flush(); f.render();
  assert.deepEqual(f.reads, ['booking', 'next']); assert.deepEqual(f.routes, [target('trip', 'next')]);
});

test('cancelled or acknowledged reservations during verification do not redirect', async t => {
  for (const pushed of [false, true]) {
    const f = fixture(t), wait = deferred(); if (pushed) f.options.alerts = [alert()];
    f.options.readBooking = () => wait.promise; f.render();
    f.options.alerts = []; f.options.trips.data[0].reservationSummary.pendingBookingIds = [];
    f.render(); wait.resolve(booking()); await flush(); f.render(); assert.deepEqual(f.routes, []);
  }
});

test('late reads never route after account/session change, unmount, background, overlay, navigation or ongoing ride', async t => {
  for (const change of ['account', 'session', 'unmount', 'background', 'path', 'overlay', 'ride']) {
    const f = fixture(t), wait = deferred(); f.options.readBooking = () => wait.promise; f.render();
    if (change === 'account') f.options.userId = 'other';
    if (change === 'session') f.env.version++;
    if (change === 'unmount') f.hooks.unmount();
    if (change === 'background') f.options.active = false;
    if (change === 'path') f.options.path = '/messages';
    if (change === 'overlay') f.options.overlayBusy = true;
    if (change === 'ride') f.options.hasOngoingRide = true;
    if (change !== 'unmount') f.render(); wait.resolve(booking()); await flush(); assert.deepEqual(f.routes, [], change);
  }
});

test('deleted bookings settle without loops; temporary failures require explicit retry', async t => {
  for (const status of [403, 404, 410, 503]) {
    const f = fixture(t); f.options.readBooking = async () => { f.reads.push('attempt'); throw { status }; };
    f.render(); await flush(); f.render(); f.render(); await flush(); assert.deepEqual(f.reads, ['attempt']);
    assert.equal(f.render().failed, status === 503);
    if (status === 503) {
      f.options.readBooking = async () => booking(); f.render().retry(); f.render(); await flush(); assert.deepEqual(f.routes, [target()]);
    } else assert.equal(f.render().pending, false);
  }
});

test('no new trip fetches after the entry has settled; a live alert may still open untouched Home', async t => {
  const f = fixture(t); f.options.trips.data = []; f.options.activity.data.trips.count = 0; f.render();
  assert.equal(f.render().pending, false);
  f.options.trips.data = [trip()]; f.options.activity.data.trips.count = 1; f.render(); await flush(); assert.deepEqual(f.reads, []);
  f.options.alerts = [alert()]; f.render(); await flush(); assert.deepEqual(f.routes, [target()]);
});
