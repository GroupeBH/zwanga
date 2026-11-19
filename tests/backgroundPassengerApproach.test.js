const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const io = { active: false, version: 1, user: 'p', calls: [], spoken: [], session: { bookingId: 'b', tripId: 't' },
    booking: { id: 'b', tripId: 't', passengerId: 'p', status: 'accepted' },
    trip: { id: 't', driverId: 'd', status: 'ongoing', departure: { lat: -4.3, lng: 15.3 } } };
  const load = loader({
    'react-native': { AppState: { get currentState() { return io.active ? 'active' : 'background'; } } },
    '../tokenSession': { getTokenSessionVersion: () => io.version },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '../tokenStorage': { getAccessToken: async () => 'test-not-a-token' },
    '@/utils/jwt': { getUserIdFromToken: () => io.user },
    '../rideAudioDiagnostics': { boundedRideAudio: promise => promise },
    './passengerTaskLifecycle': { getActiveTrackingSession: async () => io.session },
    './passengerTrackingReads': {
      getBookingSnapshot: async (...args) => { io.calls.push(['booking', ...args]); await io.onRead?.(); return io.bookingError ? { error: {} } : { data: io.booking }; },
      getTripSnapshot: async (...args) => { io.calls.push(['trip', ...args]); return io.tripError ? { error: {} } : { data: io.trip }; },
    },
    '../foregroundRideAnnouncement': { announceBackgroundApproach: async (user, message, valid) => {
      if (valid()) io.spoken.push({ user, ...message });
    } },
  });
  const run = load('services/background/passengerApproachWakeup.ts').checkBackgroundPassengerApproach;
  return { io, run: () => run({ bookingId: 'b', tripId: 't', waitForActiveTrip: false }),
    advance: (ms = 5000) => t.mock.timers.tick(ms),
    fix: distance => { io.trip.currentLocation = { coordinates: [15.3, -4.3 + distance / 111195] }; io.trip.lastLocationUpdateAt = new Date().toISOString(); } };
}

test('GPS wakeup reads live server state with deadlines, throttles and confirms proximity using two fixes', async t => {
  const f = fixture(t); f.fix(90); await f.run();
  assert.match(f.io.spoken[0].key, /:started$/);
  assert.deepEqual(f.io.calls, [['booking', 'b', 3000, false], ['trip', 't', 3000, false]]);
  await f.run(); assert.equal(f.io.calls.length, 2);
  f.advance(); f.fix(85); await f.run(); assert.match(f.io.spoken.at(-1).key, /:100$/);
  f.advance(); f.fix(40); await f.run(); f.advance(); f.fix(35); await f.run();
  assert.match(f.io.spoken.at(-1).key, /:50$/);
  f.advance(); f.fix(9); await f.run(); f.advance(); f.fix(8); await f.run();
  assert.match(f.io.spoken.at(-1).key, /:10$/);
  const spoken = f.io.spoken.length; f.advance(20000); await f.run();
  assert.equal(f.io.spoken.length, spoken, 'stale driver position is silent');
});

for (const condition of ['foreground', 'no-user', 'other-passenger', 'picked-up', 'confirmed', 'pickedUpConfirmedAt', 'droppedOffAt', 'droppedOffConfirmedAt', 'cancelled', 'completed', 'other-trip', 'stopped-tracking', 'offline']) {
  test(`background approach stays silent: ${condition}`, async t => {
    const f = fixture(t);
    if (condition === 'foreground') f.io.active = true;
    if (condition === 'no-user') f.io.user = null;
    if (condition === 'other-passenger') f.io.booking.passengerId = 'other';
    if (condition === 'picked-up') f.io.booking.pickedUpAt = new Date().toISOString();
    if (condition === 'confirmed') f.io.booking.pickedUpConfirmedByPassenger = true;
    if (['pickedUpConfirmedAt', 'droppedOffAt', 'droppedOffConfirmedAt'].includes(condition)) f.io.booking[condition] = new Date().toISOString();
    if (condition === 'cancelled') f.io.booking.status = 'cancelled';
    if (condition === 'completed') f.io.trip.status = 'completed';
    if (condition === 'other-trip') f.io.booking.tripId = 'other';
    if (condition === 'stopped-tracking') f.io.session = null;
    if (condition === 'offline') f.io.tripError = true;
    await f.run(); assert.equal(f.io.spoken.length, 0);
  });
}

test('late response, logout, return to foreground and concurrent wakeups cannot produce stale speech', async t => {
  const f = fixture(t); let release;
  f.io.onRead = () => new Promise(resolve => { release = resolve; });
  const flight = f.run(); await new Promise(resolve => setImmediate(resolve));
  await f.run(); assert.equal(f.io.calls.length, 1);
  f.io.version++; release(); await flight; assert.equal(f.io.spoken.length, 0);
  f.io.onRead = async () => { f.io.active = true; };
  await f.run(); assert.equal(f.io.spoken.length, 0);
  f.io.active = false; f.advance(); f.io.onRead = async () => f.advance(13000);
  await f.run(); assert.equal(f.io.spoken.length, 0);
});
