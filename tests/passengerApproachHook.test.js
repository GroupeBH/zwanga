const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pickup = { latitude: -4.3, longitude: 15.3 };
const sample = (distance, time = Date.now(), tripId = 'trip') => ({ tripId,
  coordinates: [15.3, -4.3 + distance / 111195], updatedAt: new Date(time).toISOString() });

function fixture(t, extra = {}, platform = 'android') {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const hooks = hookHarness(), location = new Set(), progress = new Set();
  const io = { active: true, overlay: null, version: 0, joins: 0, leaves: 0, requests: 0, fallbackEnabled: [], fallback: undefined,
    spoken: [], stops: 0, join: async () => {} };
  const subscribe = set => callback => { set.add(callback); return () => set.delete(callback); };
  const load = loader({ react: hooks.react,
    'expo-device': { isDevice: true }, 'react-native': { Platform: { OS: platform } },
    'expo-speech': { getAvailableVoicesAsync: async () => [{ language: 'fr-FR', identifier: 'french' }],
      isSpeakingAsync: async () => false, stop: async () => { io.stops++; },
      speak: (text, options) => io.spoken.push({ text, options }) },
    './appActivity': { isAppActive: () => io.active },
    './foregroundRideSound': { isForegroundRideSoundReady: () => false, canPlayForegroundRideAudio: async () => false,
      pauseForegroundRideSoundForSpeech: () => () => {} },
    './rideAlertSession': { pendingRideAlerts: () => [] },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.active },
    '@/features/navigation/RideOverlayProvider': { useHasRideOverlay: () => Boolean(io.overlay) },
    '@/hooks/passenger-navigation/useDriverLocationFallback': { useDriverLocationFallback: (_id, enabled) => {
      io.fallbackEnabled.push(enabled); return io.fallback;
    } },
    '@/services/appActivity': { isAppActive: () => io.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/services/trackingSocket': { trackingSocket: {
      subscribeToDriverLocation: subscribe(location), subscribeToBookingAutoProgress: subscribe(progress),
      joinTrip: () => { io.joins++; return io.join(); }, leaveTrip: async () => { io.leaves++; },
      requestDriverLocation: async () => { io.requests++; },
    } },
  });
  const hook = load('hooks/notifications/usePassengerApproachAnnouncement.ts').usePassengerApproachAnnouncement;
  const source = load('services/paymentSpeechSource.ts');
  const props = { userId: 'passenger', trip: { id: 'trip', driverId: 'driver', status: 'ongoing', departure: { lat: -4.3, lng: 15.3 } },
    booking: { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'accepted', passengerOriginCoordinates: pickup },
    isScreenActive: true, ...extra };
  const render = () => hooks.render(() => hook(props));
  const feed = distance => location.forEach(fn => fn(sample(distance)));
  t.after(() => hooks.unmount());
  return { io, props, hooks, location, progress, load, source, render, feed,
    read: () => source.readPaymentSpeech('passenger', io.version),
    advance: (ms = 1000) => t.mock.timers.tick(ms),
  };
}

test('navigation reuses its REST snapshot and existing socket room without opening a second stream', t => {
  const f = fixture(t); f.render();
  assert.equal(f.read().kind, 'approach'); assert.match(f.read().message.text, /conducteur est en route/);
  assert.equal(f.io.joins, 0); assert.equal(f.io.fallbackEnabled.at(-1), false);
  f.props.locationSnapshot = sample(90); f.render();
  f.advance(); f.props.locationSnapshot = sample(85); f.render();
  assert.match(f.read().message.key, /:100$/);
  const current = f.read(); f.render(); assert.equal(f.read(), current, 'render cannot restart the utterance');
  f.advance(15001); assert.equal(f.read(), undefined, 'stale distance disappears even if no new render arrives');
  f.props.locationSnapshot = sample(40); f.render();
  f.advance(); f.props.locationSnapshot = sample(35); f.render(); assert.match(f.read().message.key, /:50$/);
  f.hooks.unmount(); assert.equal(f.read(), undefined); assert.equal(f.location.size, 0); assert.equal(f.progress.size, 0);
});

test('request detail owns one tracking subscription and can use REST during socket failure', async t => {
  const f = fixture(t, { useFallback: true, joinTracking: true });
  f.io.join = async () => { throw Error('offline socket'); }; f.render(); await tick();
  assert.equal(f.io.joins, 1); assert.equal(f.io.fallbackEnabled.at(-1), true);
  f.io.fallback = sample(45); f.render(); f.advance(); f.io.fallback = sample(40); f.render();
  assert.match(f.read().message.key, /:50$/);
  f.props.trip = { ...f.props.trip, availableSeats: 3 }; f.render();
  assert.equal(f.io.joins, 1, 'ordinary refetch does not reconnect');
  f.props.isScreenActive = false; f.render();
  assert.equal(f.read(), undefined); assert.equal(f.io.leaves, 1); assert.equal(f.io.fallbackEnabled.at(-1), false);
});

test('overlay priority silences approach and reveals only the nearest fresh announcement after dismissal', t => {
  const f = fixture(t); f.render(); f.io.overlay = { kind: 'payment' }; f.render();
  assert.equal(f.read(), undefined);
  f.feed(90); f.advance(); f.feed(85); f.advance(); f.feed(40); f.advance(); f.feed(35);
  assert.equal(f.read(), undefined);
  f.io.overlay = null; f.render(); assert.match(f.read().message.key, /:50$/);
  f.io.overlay = {}; f.render(); f.advance(15001); f.io.overlay = null; f.render();
  assert.equal(f.read(), undefined, 'old distances are not spoken after a long modal');
});

test('late socket callbacks cannot speak after background, logout, blur or unmount', async t => {
  const f = fixture(t, { joinTracking: true }); let resolve;
  f.io.join = () => new Promise(done => { resolve = done; }); f.render();
  const saved = [...f.location][0];
  f.io.active = false; saved(sample(8)); assert.equal(f.read().message.key.endsWith(':started'), true);
  f.render(); assert.equal(f.read(), undefined); resolve(); await tick(); assert.equal(f.io.requests, 0);
  f.io.active = true; f.render(); f.io.version++;
  saved(sample(8)); assert.equal(f.read(), undefined);
  f.render(); const fresh = [...f.location][0]; f.props.isScreenActive = false; f.render();
  fresh(sample(8)); assert.equal(f.read(), undefined);
  f.hooks.unmount(); saved(sample(8)); assert.equal(f.read(), undefined);
});

test('boarding event stops all approach announcements before the REST booking refresh', t => {
  const f = fixture(t); f.render();
  for (const event of [{ bookingId: 'other', tripId: 'trip', type: 'pickup_confirmed' },
    { bookingId: 'booking', tripId: 'trip', type: 'driver_near_pickup' }]) {
    f.progress.forEach(fn => fn({ tripId: 'trip', events: [event] }));
    assert.ok(f.read());
  }
  f.progress.forEach(fn => fn({ tripId: 'trip', events: [{ bookingId: 'booking', tripId: 'trip', type: 'pickup_confirmed' }] }));
  assert.equal(f.read(), undefined); f.feed(8); f.advance(); f.feed(7); assert.equal(f.read(), undefined);
  f.props.isScreenActive = false; f.render(); f.props.isScreenActive = true; f.render();
  assert.equal(f.read(), undefined, 'old accepted snapshot cannot resurrect pre-boarding speech');
});

test('no voice for another passenger, picked-up booking, unstarted trip or replaced reservation', t => {
  const f = fixture(t); f.props.userId = 'other'; f.render(); assert.equal(f.location.size, 0);
  f.props.userId = 'passenger'; f.props.trip = { ...f.props.trip, status: 'upcoming' }; f.render(); assert.equal(f.read(), undefined);
  f.props.trip = { ...f.props.trip, status: 'ongoing' }; f.render(); assert.ok(f.read());
  const saved = [...f.location][0]; f.props.booking = { ...f.props.booking, pickedUp: true }; f.render();
  saved(sample(9)); assert.equal(f.read(), undefined);
  f.props.booking = { ...f.props.booking, pickedUp: false, tripId: 'replacement' }; f.render();
  assert.equal(f.read(), undefined); assert.equal(f.location.size, 0);
});

test('changing the driver isolates proximity history and ignores locations from other rides', t => {
  const f = fixture(t); f.render(); f.feed(8); f.advance(); f.feed(7);
  const first = f.read(); assert.match(first.message.key, /:10$/);
  f.props.trip = { ...f.props.trip, driverId: 'replacement' }; f.render();
  assert.match(f.read().message.key, /:started$/); assert.notEqual(f.read().message.key, first.message.key);
  f.location.forEach(fn => fn(sample(8, Date.now(), 'other'))); f.advance();
  f.location.forEach(fn => fn(sample(7, Date.now(), 'other')));
  assert.match(f.read().message.key, /:started$/);
});

for (const platform of ['android', 'ios']) test(`${platform}: real approach hook and shared voice: full approach, focus changes, expiry and boarding without duplicate utterances`, async t => {
  const f = fixture(t, {}, platform), voice = f.load('services/foregroundRideAnnouncement.ts');
  const run = () => voice.reconcileRideAnnouncement('passenger');
  const unsubscribe = f.source.subscribePaymentSpeech(run); t.after(unsubscribe);
  f.render(); await tick();
  assert.equal(f.io.spoken.length, 1); assert.match(f.io.spoken[0].text, /conducteur est en route/);
  const finish = async () => { f.io.spoken.at(-1).options.onDone(); f.advance(2001); run(); await tick(); };
  await finish();
  for (const distance of [95, 45, 8]) {
    f.feed(distance); f.advance(1000); f.feed(distance - 1); run(); await tick();
    assert.match(f.io.spoken.at(-1).text, new RegExp(`${distance > 50 ? 100 : distance > 10 ? 50 : 10} mètres environ`));
    await finish();
  }
  assert.equal(f.io.spoken.length, 4);
  f.props.isScreenActive = false; f.render(); f.advance(2001); f.props.isScreenActive = true; f.render(); await tick();
  assert.equal(f.io.spoken.length, 4, 'return to the same reservation does not repeat distance or startup');
  f.advance(15001); run(); await tick(); assert.equal(f.read(), undefined);
  f.feed(7); run(); await tick(); assert.equal(f.io.spoken.length, 4, 'fresh data at an already spoken band stays silent');
  f.props.booking = { ...f.props.booking, pickedUp: true }; f.render(); f.feed(5); run(); await tick();
  assert.equal(f.io.spoken.length, 4); assert.equal(f.read(), undefined);
});
