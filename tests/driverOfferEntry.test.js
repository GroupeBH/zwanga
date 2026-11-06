const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const now = Date.parse('2026-11-06T10:00:00Z');
const future = '2026-11-06T14:00:00Z';
const offer = (id = 'latest', patch = {}) => ({ id, tripRequestId: `request-${id}`, driverId: 'driver', status: 'pending',
  createdAt: '2026-11-06T09:55:00Z', tripRequest: { id: `request-${id}`, passenger: { id: 'passenger' },
    status: 'offers_received', departureDateMax: future }, ...patch });
const detail = item => ({ id: item.tripRequestId, passengerId: 'passenger', status: 'offers_received',
  departureDateMax: future, offers: [item] });

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const h = hookHarness(), routes = [], reads = [], env = { offers: [offer()], version: 1 };
  const options = { userId: 'driver', driver: true, profileReady: true, active: true, online: true, ready: true,
    path: '/', overlayBusy: false, ridePending: false, hasOngoingRide: false,
    requests: { data: [], isSuccess: true, fulfilledTimeStamp: now + 1 },
    trips: { data: [], isSuccess: true, fulfilledTimeStamp: now + 1 }, alerts: [],
    activity: { isSuccess: true, fulfilledTimeStamp: now + 1, startedTimeStamp: now + 1,
      data: { userId: 'driver', hasLiveActivity: false, trips: { count: 0 }, requests: { count: 0 } } },
    readOffers: async () => { reads.push('offers'); return env.offers; },
    readRequest: async id => { reads.push(id); return detail(env.offers.find(item => item.tripRequestId === id)); },
    replace: route => routes.push(route), refresh: async () => {},
  };
  const useEntry = loader({ react: h.react, '@/services/tokenSession': { getTokenSessionVersion: () => env.version } })
    ('hooks/navigation/useRequestEntryResume.ts').useRequestEntryResume;
  t.after(() => h.unmount());
  return { options, routes, reads, env, render: () => h.render(() => useEntry({ ...options })) };
}

test('return opens the REQUEST of the latest pending offer, not a separate proposal screen', async t => {
  const f = fixture(t);
  f.env.offers = [offer('old', { createdAt: '2026-11-06T09:00:00Z' }), offer()];
  f.render(); await flush(); f.render();
  assert.deepEqual(f.routes, ['/request-details/request-latest']);
  assert.deepEqual(f.reads, ['offers', 'request-latest']);
  f.options.path = f.routes[0]; f.render(); f.options.path = '/'; f.render(); await flush();
  assert.equal(f.routes.length, 1, 'a deliberate Home return is not trapped');
  f.options.active = false; f.render(); f.options.active = true; f.render(); await flush();
  assert.equal(f.routes.length, 2, 'next foreground checks again');
});

test('withdrawn, refused, expired, foreign or malformed offers do not reopen a request', async t => {
  const f = fixture(t);
  f.env.offers = [offer('withdrawn', { status: 'cancelled' }), offer('refused', { status: 'rejected' }),
    offer('foreign', { driverId: 'another' }), offer('malformed', { tripRequestId: 'wrong' }),
    offer('expired', { tripRequest: { id: 'request-expired', status: 'offers_received', departureDateMax: '2026-11-05T10:00:00Z' } })];
  f.render(); await flush(); f.render(); assert.equal(f.render().pending, false);
  assert.deepEqual(f.routes, []); assert.deepEqual(f.reads, ['offers']);
  for (let i = 0; i < 5; i++) f.render(); await flush(); assert.deepEqual(f.reads, ['offers'], 'no render/poll loop');
});

test('accepted price without a created trip still opens the same request on driver return', async t => {
  const f = fixture(t), accepted = offer('latest', { status: 'accepted' });
  accepted.tripRequest.status = 'driver_selected'; f.env.offers = [accepted];
  f.options.readRequest = async () => ({ ...detail(accepted), status: 'driver_selected', selectedDriverId: 'driver' });
  f.render(); await flush();
  assert.deepEqual(f.routes, ['/request-details/request-latest']);
});

test('acceptance arriving during pending-offer discovery uses the fresh request state', async t => {
  const f = fixture(t);
  f.options.readRequest = async () => ({ ...detail(offer()), status: 'driver_selected', selectedDriverId: 'driver',
    offers: [offer('latest', { status: 'accepted' })] });
  f.render(); await flush(); assert.deepEqual(f.routes, ['/request-details/request-latest']);
});

test('accepted offers selected for another driver cannot reopen a request', async t => {
  const f = fixture(t), accepted = offer('latest', { status: 'accepted' });
  accepted.tripRequest.status = 'driver_selected'; f.env.offers = [accepted];
  f.options.readRequest = async () => ({ ...detail(accepted), status: 'driver_selected', selectedDriverId: 'another' });
  f.render(); await flush(); assert.deepEqual(f.routes, []);
});

test('detail revalidation rejects an offer withdrawn or assigned elsewhere after list discovery', async t => {
  const f = fixture(t);
  f.options.readRequest = async () => ({ ...detail(offer()), status: 'driver_selected', selectedDriverId: 'another', tripId: 'trip' });
  f.render(); await flush(); f.render(); assert.equal(f.render().pending, false); assert.deepEqual(f.routes, []);
});

for (const patch of [{ hasOngoingRide: true }, { ridePending: true }, { path: '/request-create' },
  { overlayBusy: true }, { driver: false }, { online: false }, { active: false }]) {
  test(`driver offer recovery does not read or route when ${JSON.stringify(patch)}`, async t => {
    const f = fixture(t); Object.assign(f.options, patch);
    f.render(); await flush(); assert.deepEqual(f.reads, []); assert.deepEqual(f.routes, []);
  });
}

test('late offer discovery cannot override deliberate navigation or a changed session', async t => {
  const f = fixture(t), wait = deferred(); f.options.readOffers = () => wait.promise;
  f.render(); f.options.path = '/chat/conversation'; f.env.version++; f.render();
  wait.resolve([offer()]); await flush();
  assert.deepEqual(f.reads, []); assert.deepEqual(f.routes, []);
});

test('a newly ongoing ride wins at handoff after the offer detail is verified', async t => {
  const f = fixture(t); f.options.verifyPriority = async () => '/trip/navigate/active';
  f.render(); await flush(); assert.deepEqual(f.routes, ['/trip/navigate/active']);
});

test('a ringing request interrupts slow offer recovery without navigating its stale result', async t => {
  const f = fixture(t), wait = deferred(); f.options.readOffers = () => wait.promise;
  f.render(); f.options.alerts = [{ id: 'incoming', key: 'incoming', kind: 'nearby', recipientId: 'driver', expiresAt: future }];
  f.options.readRequest = async id => ({ id, passengerId: 'passenger', status: 'pending', departureDateMax: future });
  f.render(); await flush(); wait.resolve([offer()]); await flush();
  assert.deepEqual(f.routes, ['/request-details/incoming']);
});

test('failure is retryable, and empty recovery releases Home without repeated reads', async t => {
  const f = fixture(t); f.options.readOffers = async () => { throw { status: 503 }; };
  f.render(); await flush(); assert.equal(f.render().failed, true);
  f.options.readOffers = async () => []; f.render().retry(); f.render(); await flush(); f.render();
  assert.equal(f.render().pending, false); assert.deepEqual(f.routes, []);
});
