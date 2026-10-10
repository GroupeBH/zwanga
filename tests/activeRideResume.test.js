const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const trip = (overrides = {}) => ({ id: 'trip', driverId: 'driver', status: 'ongoing', ...overrides });
const booking = (overrides = {}) => ({ id: 'booking', passengerId: 'passenger', tripId: 'trip', status: 'accepted', trip: trip(), ...overrides });
const policy = loader()('features/navigation/activeRideResume.ts');

function fixture(t, overrides = {}) {
  const hooks = hookHarness(), calls = [], reads = [];
  let version = 0;
  const options = { userId: 'driver', active: true, online: true, ready: true, path: '/', overlayBusy: false,
    trips: { data: [trip()], isSuccess: true, fulfilledTimeStamp: 1 }, bookings: { data: [], isSuccess: true, fulfilledTimeStamp: 1 },
    readTrip: async id => { reads.push(['trip', id]); return trip(); },
    readBooking: async id => { reads.push(['booking', id]); return booking(); },
    replace: path => calls.push(path), ...overrides };
  const { useActiveRideResume } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
  })('hooks/navigation/useActiveRideResume.ts');
  t.after(() => hooks.unmount());
  return { options, calls, reads, hooks, render: () => hooks.render(() => useActiveRideResume({ ...options })),
    logout: () => { version++; } };
}

test('driver entry verifies the server, resumes once, and a voluntary Home return stays on Home', async t => {
  const app = fixture(t); app.render(); app.render(); await flush();
  assert.deepEqual(app.reads, [['trip', 'trip']]); assert.deepEqual(app.calls, ['/trip/navigate/trip']);
  app.options.path = '/trip/navigate/trip'; app.render(); app.options.path = '/'; app.render();
  app.options.trips = { ...app.options.trips, fulfilledTimeStamp: 2 }; app.render(); await flush();
  assert.equal(app.calls.length, 1); assert.equal(app.reads.length, 1);
  app.options.active = false; app.render(); app.options.active = true; app.render(); await flush();
  assert.equal(app.calls.length, 2, 'a later actual foreground entry may resume again');
});

test('a driver account travelling as passenger opens booking guidance, not driver guidance', async t => {
  const app = fixture(t, { userId: 'passenger', bookings: { data: [booking()], isSuccess: true },
    trips: { data: [trip({ id: 'older-trip', driverId: 'passenger' })], isSuccess: true } });
  app.render(); await flush(); assert.deepEqual(app.calls, ['/booking/navigate/booking']);
  assert.deepEqual(app.reads, [['booking', 'booking']]);
});

test('cold discovery waits for shared activity data without new list polls', async t => {
  const app = fixture(t, { trips: { isSuccess: false }, bookings: { isSuccess: false } });
  app.render(); await flush(); assert.deepEqual(app.reads, []);
  app.options.trips = { data: [trip()], isSuccess: true, fulfilledTimeStamp: Date.now() };
  app.render(); await flush(); assert.deepEqual(app.calls, ['/trip/navigate/trip']);
});

test('an entry with fresh empty activity does not redirect later during normal app use', async t => {
  const app = fixture(t, { trips: { data: [], isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 },
    bookings: { data: [], isSuccess: true, fulfilledTimeStamp: Date.now() + 1000 } });
  app.render(); app.options.trips = { data: [trip()], isSuccess: true, fulfilledTimeStamp: Date.now() + 2000 };
  app.render(); await flush(); assert.deepEqual(app.reads, []);
});

for (const status of ['upcoming', 'completed', 'cancelled']) test(`server ${status} overrides stale ongoing cache`, async t => {
  const app = fixture(t, { readTrip: async () => trip({ status }) });
  app.render(); await flush(); assert.deepEqual(app.calls, []);
});

test('completed, cancelled, dropped-off, unaccepted and foreign bookings cannot resume', async () => {
  for (const patch of [{ status: 'completed' }, { status: 'cancelled' }, { status: 'pending' }, { status: 'no_show' },
    { droppedOff: true }, { droppedOffConfirmedByPassenger: true }, { passengerId: 'other' },
    { tripId: 'other' }, { trip: trip({ status: 'completed' }) }, { trip: trip({ driverId: 'passenger' }) }]) {
    const candidate = { role: 'passenger', tripId: 'trip', bookingId: 'booking' };
    assert.equal(await policy.verifyRideToResume(candidate, 'passenger', { booking: async () => booking(patch) }), null);
  }
  assert.equal(await policy.verifyRideToResume({ role: 'driver', tripId: 'trip' }, 'driver', {
    trip: async () => trip({ driverId: 'another' }),
  }), null);
});

for (const change of ['background', 'logout', 'account', 'unmount', 'path']) test(`late verification after ${change} cannot redirect`, async t => {
  const request = deferred(), app = fixture(t, { readTrip: () => request.promise });
  app.render();
  if (change === 'background') app.options.active = false;
  if (change === 'logout') app.logout();
  if (change === 'account') app.options.userId = 'another';
  if (change === 'path') app.options.path = '/wallet';
  if (change === 'unmount') app.hooks.unmount(); else app.render();
  request.resolve(trip()); await flush(); assert.deepEqual(app.calls, []);
});

test('offline/native dismissal defers verification; transient errors do not cause render-driven retry storms', async t => {
  const app = fixture(t, { online: false }); app.render(); await flush(); assert.deepEqual(app.reads, []);
  app.options.online = true; app.options.overlayBusy = true; app.render(); await flush(); assert.deepEqual(app.reads, []);
  let attempts = 0;
  app.options.readTrip = async () => { attempts++; throw Error('network'); };
  app.options.overlayBusy = false; app.render(); await flush();
  for (let i = 0; i < 30; i++) { app.render(); await flush(); }
  assert.equal(attempts, 1); assert.deepEqual(app.calls, []);
  app.options.online = false; app.render(); app.options.online = true;
  app.options.readTrip = async () => trip(); app.render(); await flush();
  assert.deepEqual(app.calls, ['/trip/navigate/trip']);
});

test('a modal opening during verification delays navigation until its dismissal and a fresh check', async t => {
  const request = deferred(), app = fixture(t, { readTrip: () => request.promise });
  app.render(); app.options.overlayBusy = true; app.render(); request.resolve(trip()); await flush();
  assert.deepEqual(app.calls, []);
  app.options.overlayBusy = false; app.options.readTrip = async () => trip(); app.render(); await flush();
  assert.deepEqual(app.calls, ['/trip/navigate/trip']);
});

test('auth, payment, chat, SOS, forms, notification actions and existing guidance retain control', async t => {
  for (const path of ['/auth', '/auth-entry', '/booking/payment', '/chat/thread', '/rate/booking', '/security',
    '/publish', '/request/index', '/incoming-driver', '/trip/navigate/trip', '/booking/navigate/booking']) {
    const app = fixture(t, { path }); app.render(); await flush(); assert.deepEqual(app.reads, [], path);
    app.options.path = '/'; app.render(); await flush(); assert.deepEqual(app.calls, [], path);
  }
});
