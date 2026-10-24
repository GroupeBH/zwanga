const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const driverId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const payload = (type = 'trip_request_nearby') => ({ type, driverId, tripRequestId: requestId,
  bookingId: requestId, actionProtocol: 'driver-v1', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
  ringUntil: new Date(Date.now() + 30000).toISOString() });

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const hooks = hookHarness(), states = new Set(), foreground = new Set();
  const io = { state: 'background', routes: [], links: [], players: [], decisions: [], nativeReads: 0,
    presented: [], readPresented: null, speech: false };
  let background;
  const router = { navigate: value => io.routes.push(value) };
  const notifee = {
    onBackgroundEvent: fn => { background = fn; },
    onForegroundEvent: fn => { foreground.add(fn); return () => foreground.delete(fn); },
    getDisplayedNotifications: async () => { io.nativeReads++; throw Error('unused Android restoration'); },
    getNotificationSettings: async () => ({ authorizationStatus: 1, ios: { sound: 1 } }),
  };
  const load = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'ios' }, NativeModules: {}, Vibration: { vibrate() {}, cancel() {} },
      Linking: { openURL: async url => io.links.push(url) },
      AppState: { get currentState() { return io.state; }, addEventListener: (_type, fn) => {
        states.add(fn); return { remove: () => states.delete(fn) };
      } } },
    '@notifee/react-native': { __esModule: true, default: notifee, EventType: { PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 } },
    'expo-notifications': {
      getPresentedNotificationsAsync: () => io.readPresented ? io.readPresented() : Promise.resolve(io.presented),
      dismissNotificationAsync: async () => {},
      addNotificationReceivedListener: () => ({ remove() {} }),
      addNotificationResponseReceivedListener: () => ({ remove() {} }),
      getLastNotificationResponseAsync: async () => null,
    },
    'expo-router': { useRouter: () => router, usePathname: () => '/request-details/' + requestId },
    './useRideRealtime': { useRideRealtime() {} },
    '@/services/iosFirebaseMessaging': { subscribeIosFirebaseMessages: () => () => {} },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {}, displayDriverInvitation: async () => {} },
    './driverNotificationResponse': { respondToDriverNotification: async () => io.decisions.push('decision') },
    '@/services/driverNotificationResponse': { respondToDriverNotification: async () => io.decisions.push('decision') },
    './ongoingTripNotification': { ONGOING_TRIP_NOTIFICATION_ID: 'ongoing' },
    './nearbyNotificationAction': { isNearbyNotificationAction: () => false },
    '@/services/nearbyNotificationAction': { isNearbyNotificationAction: () => false },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
    '@/services/foregroundRideAnnouncement': { reconcileRideAnnouncement() {}, stopRideAnnouncement() {},
      clearRideAnnouncementSession() {}, silenceRestoredRideAnnouncement() {} },
    '@/services/rideEntryAnnouncement': { beginRideSpeechEntry() {}, clearRideSpeechEntry() {},
      hasPendingRideSpeechEntry: () => false, subscribeRideSpeechEntry: () => () => {} },
    'expo-audio': { setAudioModeAsync: async () => {}, createAudioPlayer: () => {
      const player = { isLoaded: true, playing: false, removed: false, plays: 0,
        play() { this.playing = true; this.plays++; }, pause() { this.playing = false; },
        remove() { this.removed = true; this.playing = false; } };
      io.players.push(player); return player;
    } },
    '../assets/sounds/driver_ring.wav': 1,
  });
  load('services/notifeeBackgroundHandler.ts');
  const useNotifications = load('hooks/notifications/useDriverNotifications.ts').useDriverNotifications;
  const useRinging = load('hooks/notifications/useRideRinging.ts').useRideRinging;
  const session = load('services/rideAlertSession.ts');
  const sound = load('services/foregroundRideSound.ts');
  t.after(() => { hooks.unmount(); sound.stopForegroundRideSound(); });
  return { io, session, sound,
    render: () => hooks.render(() => { useNotifications(driverId, true); useRinging(driverId); }),
    press: data => background({ type: 1, detail: { notification: { data }, pressAction: { id: 'default' } } }),
    state: value => { io.state = value; for (const listener of states) listener(value); },
    remember: data => session.rememberRideAlert(load('features/notifications/rideAlert.ts').parseRideAlert(data)),
  };
}

for (const type of ['trip_request_nearby', 'new_booking']) test(`iOS lock-screen ${type} tap survives a removed card and resumes without answering`, async t => {
  const f = fixture(t);
  await f.press(payload(type));
  assert.equal(f.io.players.length, 0, 'no foreground audio while locked');
  f.state('active'); f.render(); await tick();
  assert.equal(f.io.nativeReads, 0, 'iOS restoration does not depend on the Android handoff provider');
  assert.equal(f.io.players.length, 1); assert.equal(f.io.players[0].playing, true);
  assert.equal(f.io.routes.length, 1); assert.deepEqual(f.io.decisions, []);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
  f.session.acknowledgeRideAlerts(a => a.id === requestId);
  assert.equal(f.io.players[0].removed, true);
  f.state('inactive'); f.state('active'); await tick();
  assert.equal(f.io.players.length, 1, 'unlock never replays an answered alert');
});

test('iOS resumes a known alert immediately after inactive even if notification enumeration is stuck', async t => {
  const f = fixture(t); f.state('active'); f.render(); await tick(); f.remember(payload()); await tick();
  assert.equal(f.io.players.length, 1);
  f.state('inactive'); assert.equal(f.io.players[0].removed, true);
  let finish; f.io.readPresented = () => new Promise(resolve => { finish = resolve; });
  f.state('active'); await tick();
  assert.equal(f.io.players.length, 2); assert.equal(f.io.players[1].playing, true);
  finish([]); await tick();
});

test('iOS unlock without tapping restores a still-fresh remote card without Notifee enumeration', async t => {
  const f = fixture(t);
  f.io.presented = [{ request: { identifier: 'remote', content: { data: payload() } } }];
  f.state('active'); f.render(); await tick();
  assert.equal(f.io.players.length, 1); assert.equal(f.io.players[0].playing, true);
  assert.equal(f.io.nativeReads, 0); assert.deepEqual(f.io.decisions, []);
});

test('an expired lock-screen tap may open details but never starts a stale ringtone', async t => {
  const f = fixture(t);
  await f.press({ ...payload(), ringUntil: new Date(Date.now() - 1).toISOString() });
  f.state('active'); f.render(); await tick();
  assert.equal(f.io.players.length, 0); assert.equal(f.io.routes.length, 1);
});

test('iOS interrupted playback is detected and recovered with bounded retries, without another push', async t => {
  const f = fixture(t); f.state('active');
  await f.sound.startForegroundRideSound('episode');
  f.io.players[0].playing = false;
  t.mock.timers.tick(5000); await f.sound.startForegroundRideSound('episode');
  assert.equal(f.io.players[0].removed, true);
  await f.sound.startForegroundRideSound('episode'); assert.equal(f.io.players.length, 1);
  t.mock.timers.tick(5000); await f.sound.startForegroundRideSound('episode');
  assert.equal(f.io.players.length, 2); assert.equal(f.io.players[1].playing, true);
  const resume = f.sound.pauseForegroundRideSoundForSpeech();
  t.mock.timers.tick(5000); await f.sound.startForegroundRideSound('episode');
  assert.equal(f.io.players.length, 2, 'speech pause is not a playback failure'); resume();
  assert.equal(f.io.players[1].playing, true);
  f.state('background'); t.mock.timers.tick(5000); await f.sound.startForegroundRideSound('episode');
  assert.equal(f.io.players.length, 2, 'no restart in background');
});
