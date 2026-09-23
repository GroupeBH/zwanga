const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(t, platform = 'ios') {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  let stored = null, running = false, task, reads = 0, pauseRead, booking = { status: 'accepted', trip: { status: 'pending' } };
  const starts = [], sent = [], published = [];
  const location = { Accuracy: { High: 4, Balanced: 3 }, ActivityType: { Other: 1, AutomotiveNavigation: 2 },
    PermissionStatus: { GRANTED: 'granted' },
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({ status: 'granted' }), hasServicesEnabledAsync: async () => true,
    hasStartedLocationUpdatesAsync: async () => running,
    startLocationUpdatesAsync: async (_name, options) => { starts.push(options); running = true; },
    stopLocationUpdatesAsync: async () => { running = false; },
  };
  const load = loader({
    '@react-native-async-storage/async-storage': { getItem: async () => {
      const snapshot = stored, pause = pauseRead; pauseRead = null;
      if (pause) await pause(); return snapshot;
    }, setItem: async (_key, value) => { stored = value; }, removeItem: async () => { stored = null; } },
    'react-native': { Platform: { OS: platform } }, 'expo-location': location,
    'expo-task-manager': { isAvailableAsync: async () => true, isTaskDefined: () => false, defineTask: (_key, fn) => { task = fn; } },
    './background/passengerTrackingReads': { getBookingSnapshot: async () => { reads++; return { data: booking }; }, getTripSnapshot: async () => ({}) },
    '@/services/tokenRefresh': { getValidAccessToken: async () => 'test-token' },
    './rideLocationStream': { publishNativeRideLocation: (...args) => published.push(args) },
    './locationDelivery': { isLocationDeliveryPending: () => false, wasLocationDeliveredRecently: () => false, recordLocationDelivery() {} },
    '@/store': { store: { dispatch: payload => { sent.push(payload); return Object.assign(Promise.resolve({ data: {} }), { reset() {}, abort() {} }); } } },
    '@/store/api/bookingApi': { bookingApi: { endpoints: { updatePassengerLocation: { initiate: payload => payload } } } },
  });
  const module = load('services/passengerBackgroundLocationTask.ts');
  const profile = load('services/background/passengerGpsProfile.ts');
  return { module, profile, starts, sent, published, reads: () => reads, session: () => stored && JSON.parse(stored),
    pauseNextRead: value => { pauseRead = value; },
    booking: value => { booking = value; }, running: () => running,
    sample: () => task({ data: { locations: [{ timestamp: Date.now(), coords: { latitude: -4.3, longitude: 15.3, accuracy: 5 } }] } }) };
}

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
  await f.profile.applyPassengerGpsProfile(session);
  assert.equal(await f.module.startPassengerBackgroundLocationTracking('next'), true);
  assert.equal(f.session().bookingId, 'next');
});
