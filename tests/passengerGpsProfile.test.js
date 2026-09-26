const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t, platform = 'ios') {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  let stored = null, running = false, task, reads = 0, pauseRead, booking = { status: 'accepted', trip: { status: 'pending' } };
  const starts = [], sent = [], published = [];
  const io = { storage: 0, availability: 0, native: 0 };
  const location = { Accuracy: { High: 4, Balanced: 3 }, ActivityType: { Other: 1, AutomotiveNavigation: 2 },
    PermissionStatus: { GRANTED: 'granted' },
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({ status: 'granted' }), hasServicesEnabledAsync: async () => true,
    hasStartedLocationUpdatesAsync: async () => { io.native++; return running; },
    startLocationUpdatesAsync: async (_name, options) => { starts.push(options); running = true; },
    stopLocationUpdatesAsync: async () => { running = false; },
  };
  const load = loader({
    '@react-native-async-storage/async-storage': { getItem: async () => {
      io.storage++;
      const snapshot = stored, pause = pauseRead; pauseRead = null;
      if (pause) await pause(); return snapshot;
    }, setItem: async (_key, value) => { stored = value; }, removeItem: async () => { stored = null; } },
    'react-native': { Platform: { OS: platform } }, 'expo-location': location,
    'expo-task-manager': { isAvailableAsync: async () => { io.availability++; return true; }, isTaskDefined: () => false, defineTask: (_key, fn) => { task = fn; } },
    './background/passengerTrackingReads': { getBookingSnapshot: async () => { reads++; return { data: booking }; }, getTripSnapshot: async () => ({}) },
    '@/services/tokenRefresh': { hasRecoverableSession: async () => true },
    './rideLocationStream': { publishNativeRideLocation: (...args) => published.push(args) },
    './locationDelivery': { isLocationDeliveryPending: () => false, wasLocationDeliveredRecently: () => false, recordLocationDelivery() {} },
    '@/store': { store: { dispatch: payload => { sent.push(payload); return Object.assign(Promise.resolve({ data: {} }), { reset() {}, abort() {} }); } } },
    '@/store/api/bookingApi': { bookingApi: { endpoints: { updatePassengerLocation: { initiate: payload => payload } } } },
  });
  const module = load('services/passengerBackgroundLocationTask.ts');
  const profile = load('services/background/passengerGpsProfile.ts');
  return { module, profile, starts, sent, published, io, lifecycle: load('services/background/passengerTaskLifecycle.ts'),
    replaceStored: value => { stored = value; },
    loseNativeTask: () => { running = false; },
    reads: () => reads, session: () => stored && JSON.parse(stored),
    pauseNextRead: value => { pauseRead = value; },
    booking: value => { booking = value; }, running: () => running,
    sample: () => task({ data: { locations: [{ timestamp: Date.now(), coords: { latitude: -4.3, longitude: 15.3, accuracy: 5 } }] } }) };
}

for (const field of ['droppedOffAt', 'droppedOffConfirmedAt']) test(`prearmed background task stops on ${field} without a boolean flag`, async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('booking', { tripId: 'trip', waitForActiveTrip: true });
  f.booking({ status: 'accepted', [field]: '2026-09-25', trip: { status: 'ongoing' } });
  await f.sample(); assert.equal(f.running(), false); assert.equal(f.sent.length, 0);
});

for (const platform of ['ios', 'android']) test(`${platform}: waiting GPS is balanced, and a sleeping passenger promotes to precise tracking without a stop`, async t => {
  const f = fixture(t, platform);
  await f.module.startPassengerBackgroundLocationTracking('booking', { tripId: 'trip', waitForActiveTrip: true });
  assert.equal(f.starts[0].accuracy, 3); assert.equal(f.starts[0].pausesUpdatesAutomatically, false);
  assert.equal(f.starts[0].distanceInterval, 0);
  await f.sample(); assert.equal(f.sent.length, 0); assert.equal(f.reads(), 1);
  await f.sample(); assert.equal(f.reads(), 1);
  t.mock.timers.tick(30_000); f.booking({ status: 'accepted', trip: { status: 'ongoing' } });
  await f.sample();
  assert.equal(f.starts.at(-1).accuracy, 4); assert.equal(f.starts.at(-1).deferredUpdatesInterval, 2000);
  assert.equal(f.sent.length, 0, 'never send the last coarse waiting batch for boarding');
  await f.sample(); assert.equal(f.sent.length, 1); assert.equal(f.published.length, 1);
  assert.equal(f.starts.length, 2, 'no native reconfiguration on ordinary active callbacks');
});

test('foreground promotion and terminal bookings retain the existing stop behavior', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('booking', { waitForActiveTrip: true });
  await f.module.startPassengerBackgroundLocationTracking('booking', { waitForActiveTrip: false });
  assert.equal(f.starts.at(-1).accuracy, 4);
  await f.module.stopPassengerBackgroundLocationTracking('booking');
  assert.equal(f.running(), false); assert.equal(f.session(), null);
  await f.module.startPassengerBackgroundLocationTracking('next', { waitForActiveTrip: true });
  f.booking({ status: 'accepted', droppedOff: true, trip: { status: 'ongoing' } });
  await f.sample(); assert.equal(f.running(), false); assert.equal(f.sent.length, 0);
});

test('a late previous-booking profile or stop cannot replace the new session', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('new', { waitForActiveTrip: true });
  assert.equal(await f.profile.applyPassengerGpsProfile({ bookingId: 'old', waitForActiveTrip: false }), false);
  await f.module.stopPassengerBackgroundLocationTracking('old');
  assert.equal(f.session().bookingId, 'new'); assert.equal(f.starts.length, 1); assert.equal(f.running(), true);
});

test('old stop racing a new start cannot erase the new session', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('old');
  let entered, release;
  const read = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  f.pauseNextRead(async () => { entered(); await wait; });
  const stop = f.profile.stopPassengerGpsProfile('old'); await read;
  const session = { bookingId: 'new', waitForActiveTrip: true };
  const start = f.profile.startPassengerGpsProfile(session, f.profile.reservePassengerGpsStart('new'));
  release(); await stop;
  assert.equal(await start, true);
  assert.equal(f.session().bookingId, 'new'); assert.equal(f.running(), true);
  assert.equal(await f.profile.updatePassengerGpsProfile({ bookingId: 'old', waitForActiveTrip: false }), false);
  await f.profile.stopPassengerGpsIfIdle(); assert.equal(f.running(), true);
});

test('late permission completion cannot restart GPS after stop, and queue recovers after errors', async t => {
  const f = fixture(t);
  const session = { bookingId: 'booking', waitForActiveTrip: false };
  const revision = f.profile.reservePassengerGpsStart('booking');
  await f.profile.stopPassengerGpsProfile('booking');
  assert.equal(await f.profile.startPassengerGpsProfile(session, revision), false);
  f.pauseNextRead(async () => { throw new Error('read unavailable'); });
  t.mock.timers.tick(30_000);
  await assert.rejects(f.profile.applyPassengerGpsProfile(session), /read unavailable/);
  assert.equal(await f.module.startPassengerBackgroundLocationTracking('next'), true);
  assert.equal(f.session().bookingId, 'next');
});

test('100 ordinary active callbacks reuse storage and native state, without changing published samples', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('booking');
  const before = { ...f.io };
  for (let i = 0; i < 100; i++) await f.sample();
  assert.deepEqual(f.io, before);
  assert.equal(f.published.length, 100);
  assert.equal(f.starts.length, 1);
  t.mock.timers.tick(30_000);
  await f.sample();
  assert.equal(f.io.storage, before.storage + 1);
  assert.equal(f.io.native, before.native + 1);
  assert.equal(f.io.availability, before.availability + 1);
});

test('native task loss is detected at the health-check interval and immediately at explicit resume', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('booking');
  f.loseNativeTask(); t.mock.timers.tick(30_000);
  await f.profile.applyPassengerGpsProfile({ bookingId: 'booking', waitForActiveTrip: false });
  assert.equal(f.running(), true);
  assert.equal(f.starts.length, 2);
  f.loseNativeTask();
  await f.module.startPassengerBackgroundLocationTracking('booking');
  assert.equal(f.running(), true);
  assert.equal(f.starts.length, 3);
});

test('cache clearing and changes of booking remain immediate, not delayed until cache expiry', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('first');
  await f.module.stopPassengerBackgroundLocationTracking('first');
  assert.equal(await f.lifecycle.getActiveTrackingSession(), null);
  await f.module.startPassengerBackgroundLocationTracking('second');
  await f.module.stopPassengerBackgroundLocationTracking('first');
  assert.equal((await f.lifecycle.getActiveTrackingSession()).bookingId, 'second');
  assert.equal(f.running(), true);
});

test('temporary storage error does not silently stop an active trip; the next callback recovers', async t => {
  const f = fixture(t);
  await f.module.startPassengerBackgroundLocationTracking('booking');
  t.mock.timers.tick(30_000);
  f.pauseNextRead(async () => { throw new Error('storage unavailable'); });
  await f.sample();
  assert.equal(f.running(), true);
  await f.sample();
  assert.equal(f.published.length, 1);
  assert.equal(f.session().bookingId, 'booking');
});

test('cold reads restore legacy sessions, expired caches notice external clearing, and corrupt records stop GPS', async t => {
  const f = fixture(t);
  f.replaceStored('legacy-booking');
  assert.equal((await f.lifecycle.getActiveTrackingSession()).bookingId, 'legacy-booking');
  f.replaceStored(null); t.mock.timers.tick(30_000);
  assert.equal(await f.lifecycle.getActiveTrackingSession(), null);
  await f.module.startPassengerBackgroundLocationTracking('booking');
  f.replaceStored('{corrupt'); t.mock.timers.tick(30_000);
  await f.sample();
  assert.equal(f.running(), false);
  assert.equal(f.published.length, 0);
});
