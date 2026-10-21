const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const tripId = '00000000-0000-4000-8000-000000000003';
const otherId = '00000000-0000-4000-8000-000000000004';
const tick = () => new Promise(resolve => setImmediate(resolve));
const booking = () => ({ type: 'new_booking', actionProtocol: 'driver-v1', bookingId: id, driverId: userId,
  ringUntil: new Date(Date.now() + 30000).toISOString() });
const response = () => ({ type: 'booking_response', bookingId: id, tripId, passengerId: userId,
  status: 'rejected', ringAlert: 'booking-response-v1', ringUntil: new Date(Date.now() + 30000).toISOString() });

test('self invitations cannot enter sound or speech sessions, but responses to own orders still do', () => {
  const load = loader(), session = load('services/rideAlertSession.ts');
  const { parseRideAlert } = load('features/notifications/rideAlert.ts');
  session.setRideAlertScreen(userId, '/');
  for (const data of [{ ...booking(), passengerId: userId },
    { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', driverId: userId, passengerId: userId, tripRequestId: id },
    { ...booking(), type: 'driver_dispatch_offer', offerId: id, passengerId: userId, expiresAt: new Date(Date.now() + 30000).toISOString() }]) {
    assert.equal(parseRideAlert(data), null);
    session.rememberRideAlert({ key: data.type, id, kind: 'nearby', recipientId: userId, data });
  }
  assert.deepEqual(session.pendingRideAlerts(userId), []);
  const accepted = parseRideAlert({ type: 'trip_request_accepted', tripRequestId: id, passengerId: userId,
    driverId: otherId, ringAlert: 'request-accepted-v1', ringUntil: new Date(Date.now() + 30000).toISOString() });
  session.rememberRideAlert(accepted); session.rememberRideAlert(parseRideAlert(response()));
  assert.equal(session.pendingRideAlerts(userId).length, 2);
});

test('Home and booking consultation preserve the driver alert; a matching decision stops it once', () => {
  const load = loader(); const session = load('services/rideAlertSession.ts');
  const { parseRideAlert } = load('features/notifications/rideAlert.ts');
  const alert = parseRideAlert(booking());
  session.setRideAlertScreen(userId, '/(tabs)'); session.rememberRideAlert(alert);
  session.setRideAlertScreen(userId, `/trip/manage/${tripId}`);
  assert.equal(session.pendingRideAlerts(userId).length, 1);
  session.acknowledgeRideAlerts(a => a.kind === 'booking' && a.id === id);
  session.rememberRideAlert(alert);
  assert.equal(session.pendingRideAlerts(userId).length, 0, 'duplicate cannot re-ring after answering');
});

test('passenger response stops only on the matching trip/request/booking, including a driver riding as passenger', () => {
  const load = loader(); const { parseRideAlert, isRideResponseOpen } = load('features/notifications/rideAlert.ts');
  const session = load('services/rideAlertSession.ts'); const alert = parseRideAlert(response());
  for (const path of ['/home', '/bookings', `/trip/manage/${tripId}`, `/trip/${otherId}`, `/trip/${tripId}-suffix`]) {
    assert.equal(isRideResponseOpen(alert, path), false);
  }
  assert.equal(isRideResponseOpen(alert, `/booking/navigate/${id}`), true);
  session.setRideAlertScreen(userId, '/home'); session.rememberRideAlert(alert);
  assert.equal(session.pendingRideAlerts(userId).length, 1);
  session.setRideAlertScreen(userId, `/trip/${tripId}`);
  assert.equal(session.pendingRideAlerts(userId).length, 0);
  session.rememberRideAlert(alert); assert.equal(session.pendingRideAlerts(userId).length, 0);
  const accepted = parseRideAlert({ type: 'trip_request_accepted', tripRequestId: id, passengerId: userId, ringAlert: 'request-accepted-v1' });
  assert.equal(isRideResponseOpen(accepted, `/request-details/${id}`), true);
  assert.equal(parseRideAlert({ ...response(), passengerId: undefined }), null);
});

test('expired and foreign alerts are silent; a session change clears pending audio and acknowledgements', () => {
  let version = 0;
  const load = loader({ './tokenSession': { getTokenSessionVersion: () => version } });
  const session = load('services/rideAlertSession.ts'); const { parseRideAlert } = load('features/notifications/rideAlert.ts');
  session.setRideAlertScreen(userId, '/home');
  for (const data of [{ ...booking(), ringUntil: new Date(0).toISOString() }, { ...booking(), ringUntil: 'invalid' }, { ...booking(), driverId: otherId },
    { ...booking(), expiresAt: new Date(0).toISOString() }]) session.rememberRideAlert(parseRideAlert(data));
  assert.equal(session.pendingRideAlerts(userId).length, 0);
  session.rememberRideAlert(parseRideAlert(booking())); assert.equal(session.pendingRideAlerts(userId).length, 1);
  version++; assert.equal(session.pendingRideAlerts(userId).length, 0);
});

test('foreground booking continues beyond the initial push window, while a dispatch expires at its business deadline', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const load = loader(); const session = load('services/rideAlertSession.ts'); const { parseRideAlert } = load('features/notifications/rideAlert.ts');
  session.rememberRideAlert(parseRideAlert(booking()));
  session.rememberRideAlert(parseRideAlert({ ...booking(), type: 'driver_dispatch_offer', offerId: otherId,
    expiresAt: new Date(Date.now() + 5000).toISOString() }));
  t.mock.timers.tick(31000);
  assert.deepEqual(session.pendingRideAlerts(userId).map(a => a.kind), ['booking']);
});

function audioFixture(platform = 'android') {
  const io = { active: true, permitted: true, sound: true, mode: true, blocked: false, plays: 0, removes: 0, vibration: 0,
    modeReady: async () => {}, settings: async () => ({ authorizationStatus: io.permitted ? 1 : 0, ios: { sound: io.sound ? 1 : 0 } }) };
  const player = { play() { io.plays++; }, pause() {}, remove() { io.removes++; } };
  const load = loader({
    'react-native': { Platform: { OS: platform }, NativeModules: { ZwangaDriverAlerts: { canPlayForegroundRingtone: async () => io.mode } },
      Vibration: { vibrate() { io.vibration++; }, cancel() { io.vibration--; } } },
    '@notifee/react-native': { getNotificationSettings: () => io.settings(), getChannel: async () => ({ sound: io.sound ? 'driver_ring' : undefined, importance: 4, blocked: io.blocked }) },
    './driverAlertChannel': { getDriverAlertChannel: async () => 'zwanga-ride-ring-v4' },
    './appActivity': { isAppActive: () => io.active },
    'expo-audio': { setAudioModeAsync: () => io.modeReady(), createAudioPlayer: () => player },
    '../assets/sounds/driver_ring.wav': 1,
  });
  return { io, player, ...load('services/foregroundRideSound.ts') };
}

test('one lazy audio player loops the bundled sound and releases audio/vibration on acknowledgement', async () => {
  const f = audioFixture(); assert.equal(f.io.plays, 0);
  await Promise.all([f.startForegroundRideSound(), f.startForegroundRideSound()]);
  assert.equal(f.io.plays, 1); assert.equal(f.player.loop, true); assert.equal(f.player.volume, 1);
  f.stopForegroundRideSound(); f.stopForegroundRideSound();
  assert.equal(f.io.removes, 1); assert.equal(f.io.vibration, 0);
});

test('permissions, channel mute, silent/DND and inactive app prevent foreground audio', async () => {
  for (const field of ['active', 'permitted', 'sound', 'mode', 'blocked']) {
    const f = audioFixture(); f.io[field] = field === 'blocked';
    await f.startForegroundRideSound(); assert.equal(f.io.plays, 0, field);
  }
  const ios = audioFixture('ios'); ios.io.sound = false;
  await ios.startForegroundRideSound(); assert.equal(ios.io.plays, 0);
});

test('acknowledgement during async audio initialization cannot start a late ringtone', async () => {
  const f = audioFixture(); let release;
  f.io.modeReady = () => new Promise(resolve => { release = resolve; });
  const running = f.startForegroundRideSound(); await tick();
  f.stopForegroundRideSound(); release(); await running;
  assert.equal(f.io.plays, 0);
});

test('voice ownership covers a replacement player but cannot resurrect removed audio in background', async () => {
  const f = audioFixture(); await f.startForegroundRideSound();
  const resume = f.pauseForegroundRideSoundForSpeech(); resume(); assert.equal(f.io.plays, 2);
  const staleResume = f.pauseForegroundRideSoundForSpeech(); f.stopForegroundRideSound();
  await f.startForegroundRideSound(); const before = f.io.plays; staleResume();
  assert.equal(f.io.plays, before + 1, 'replacement waits for the still-active voice to finish');
  f.io.active = false; const inactiveResume = f.pauseForegroundRideSoundForSpeech(); inactiveResume();
  assert.equal(f.isForegroundRideSoundReady(), false);
  assert.equal(f.io.plays, before + 1);
  f.stopForegroundRideSound();
});

test('a transient audio initialization error retries with backoff, at most three times per episode', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = audioFixture(); let calls = 0;
  f.io.settings = async () => { calls++; throw Error('temporary'); };
  await f.startForegroundRideSound(); await f.startForegroundRideSound(); assert.equal(calls, 1);
  t.mock.timers.tick(5001); await f.startForegroundRideSound(); assert.equal(calls, 2);
  t.mock.timers.tick(15001); await f.startForegroundRideSound(); assert.equal(calls, 3);
  t.mock.timers.tick(60000); await f.startForegroundRideSound(); assert.equal(calls, 3);
  f.stopForegroundRideSound();
  f.io.settings = async () => ({ authorizationStatus: 1 });
  await f.startForegroundRideSound(); assert.equal(f.io.plays, 1); f.stopForegroundRideSound();
});

test('new Android bridge owns notification-volume playback without initializing a media player', async () => {
  const calls = []; const native = { startForegroundSound: async (...args) => { calls.push(['start', ...args]); return true; },
    pauseForegroundSound: (...args) => calls.push(['pause', ...args]), stopForegroundSound: token => calls.push(['stop', token]),
    canPlayForegroundRingtone: async () => true };
  const load = loader({ 'react-native': { Platform: { OS: 'android' }, NativeModules: { ZwangaDriverAlerts: native }, Vibration: { vibrate() { assert.fail('native owns vibration'); }, cancel() {} } },
    '@notifee/react-native': { getNotificationSettings: async () => ({ authorizationStatus: 1 }), getChannel: async () => ({ sound: 'driver_ring', importance: 4 }) },
    './driverAlertChannel': { getDriverAlertChannel: async () => 'zwanga-ride-ring-v4' }, './appActivity': { isAppActive: () => true },
    'expo-audio': { createAudioPlayer: () => assert.fail('no media stream on new Android') } });
  const sound = load('services/foregroundRideSound.ts');
  const focus = load('services/rideAudioFocus.ts');
  const finish = focus.holdRideAudio(); await sound.startForegroundRideSound();
  assert.equal(calls[0][3], true, 'native player starts paused while voice owns audio');
  finish(); assert.equal(calls.at(-1)[2], false);
  sound.stopForegroundRideSound(); assert.equal(calls.at(-1)[0], 'stop');
});

test('an entry voice pauses a ringtone still initializing, without starting it underneath the sentence', async () => {
  const f = audioFixture(); let release;
  f.io.modeReady = () => new Promise(resolve => { release = resolve; });
  const starting = f.startForegroundRideSound(); await tick();
  const resume = f.pauseForegroundRideSoundForSpeech();
  release(); await starting; assert.equal(f.io.plays, 0);
  resume(); assert.equal(f.io.plays, 1);
  resume(); assert.equal(f.io.plays, 1, 'completion is idempotent');
  f.stopForegroundRideSound();
});

test('coordinator keeps ringing on Home and stops on the passenger trip, with cleanup on background', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hooks = hookHarness(); const io = { path: '/home', plays: 0, stops: 0, receive: null, state: null, episodes: [] };
  const app = { currentState: 'active', addEventListener: (_event, fn) => { io.state = fn; return { remove() {} }; } };
  const load = loader({ react: hooks.react, 'expo-router': { usePathname: () => io.path },
    'react-native': { Platform: { OS: 'ios' }, AppState: app },
    'expo-notifications': { getPresentedNotificationsAsync: async () => [], addNotificationReceivedListener: fn => { io.receive = fn; return { remove() {} }; } },
    '@notifee/react-native': { getDisplayedNotifications: async () => [] },
    '@/services/foregroundRideSound': { startForegroundRideSound: async key => { io.plays++; io.episodes.push(key); }, stopForegroundRideSound: () => { io.stops++; } },
    '@/services/foregroundRideAnnouncement': { reconcileRideAnnouncement() {}, stopRideAnnouncement() {}, clearRideAnnouncementSession() {} },
    '@/services/driverNotifications': { displayDriverInvitation: async () => {} },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
  });
  const { useRideRinging } = load('hooks/notifications/useRideRinging.ts');
  const render = () => hooks.render(() => useRideRinging(userId));
  render(); await tick();
  io.receive({ request: { content: { data: response() } } });
  assert.ok(io.plays > 0);
  assert.ok(io.episodes.every(key => key === load('features/notifications/rideAlert.ts').parseRideAlert(response()).key));
  io.path = `/trip/${otherId}`; render();
  assert.equal(load('services/rideAlertSession.ts').pendingRideAlerts(userId).length, 1);
  io.path = `/booking/navigate/${id}`; render();
  assert.equal(load('services/rideAlertSession.ts').pendingRideAlerts(userId).length, 0);
  const before = io.stops; app.currentState = 'background'; io.state('background'); assert.ok(io.stops > before);
  hooks.unmount();
});

test('successful decisions from all entry screens acknowledge only the matching alert; failed mutations do not', async () => {
  const calls = [];
  const { rideAlertAcknowledgement } = loader({ '@/services/driverNotifications': {
    dismissDriverDecision: async (...args) => calls.push(args),
    dismissResolvedDriverBookings: async (user, ids) => ids.forEach(id => calls.push([user, 'booking', id])),
  } })('store/middleware/rideAlertAcknowledgement.ts');
  const handle = rideAlertAcknowledgement({ getState: () => ({ auth: { user: { id: userId } } }) })(value => value);
  for (const [endpointName, originalArgs, kind] of [
    ['acceptBooking', id, 'booking'], ['rejectBooking', { id }, 'booking'], ['respondToBookingInvitation', { id }, 'booking'],
    ['updateBookingStatus', { id, status: 'rejected' }, 'booking'], ['respondToDispatchOffer', { id }, 'dispatch'],
    ['acceptTripRequest', { tripRequestId: id }, 'nearby'], ['createDriverOffer', { tripRequestId: id }, 'nearby'],
  ]) {
    handle({ type: 'api/executeMutation/fulfilled', meta: { arg: { endpointName, originalArgs } } });
    await tick(); assert.deepEqual(calls.at(-1), [userId, kind, id]);
  }
  const count = calls.length;
  handle({ type: 'api/executeMutation/rejected', meta: { arg: { endpointName: 'acceptBooking', originalArgs: id } } });
  handle({ type: 'api/executeMutation/fulfilled', meta: { arg: { endpointName: 'updateBookingStatus', originalArgs: { id, status: 'completed' } } } });
  await tick(); assert.equal(calls.length, count);
  handle({ type: 'api/executeQuery/fulfilled', payload: [{ id, status: 'cancelled' }, { id: otherId, status: 'pending' }],
    meta: { arg: { endpointName: 'getTripBookings', originalArgs: tripId } } });
  await tick(); assert.equal(calls.length, count + 1); assert.deepEqual(calls.at(-1), [userId, 'booking', id]);
});

test('opening a passenger trip cancels only its matching native/remote alert, keeping other rides and chat', async () => {
  const cancelled = [];
  const data = response();
  const cards = [{ id: 'matching', data }, { id: 'other-trip', data: { ...data, tripId: otherId } },
    { id: 'other-account', data: { ...data, passengerId: otherId } }, { id: 'chat', data: { type: 'message' } }];
  const { dismissOpenedRideResponses } = loader({
    '@notifee/react-native': { getDisplayedNotifications: async () => cards.map(card => ({ id: card.id, notification: card })),
      cancelNotification: async id => cancelled.push(`native:${id}`) },
    'expo-notifications': { getPresentedNotificationsAsync: async () => cards.map(card => ({ request: { identifier: card.id, content: card } })),
      dismissNotificationAsync: async id => cancelled.push(`remote:${id}`) },
  })('services/passengerRideAlerts.ts');
  await dismissOpenedRideResponses(userId, '/home'); assert.deepEqual(cancelled, []);
  await dismissOpenedRideResponses(userId, `/trip/${tripId}`);
  assert.deepEqual(cancelled, ['native:matching', 'remote:matching']);
});
