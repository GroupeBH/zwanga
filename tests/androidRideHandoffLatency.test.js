const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const noop = () => {};
const driverId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const cardId = `driver-nearby-${requestId}`;
const quietChannel = 'driver-bookings-active-v1';

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const hooks = hookHarness(), listeners = new Set();
  const data = { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
    driverId, tripRequestId: requestId, ringUntil: new Date(Date.now() + 5000).toISOString() };
  const io = { version: 0, sound: [], displayed: [], cancelled: [], channels: [], checks: [], timeline: [], player: null };
  const app = { currentState: 'active', addEventListener: (_event, callback) => {
    listeners.add(callback); return { remove: () => listeners.delete(callback) };
  } };
  const load = loader({
    react: hooks.react, 'expo-router': { usePathname: () => '/' },
    '@react-native-async-storage/async-storage': {},
    './tokenStorage': { getTokens: async () => ({ refreshToken: 'test-session' }) },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    '@/utils/jwt': { isTokenExpired: () => false, getUserIdFromToken: () => driverId },
    'react-native': { Platform: { OS: 'android' }, AppState: app, NativeModules: { ZwangaDriverAlerts: {
      ensureBundledChannel: async () => io.channelId ?? 'zwanga-ride-ring-v4',
      canLightUpAlertScreen: async () => { io.checks.push('wake'); return io.wakeWait ?? true; },
      wakeDisplayedAlert: async id => { io.timeline.push(`wake:${id}`); return 'requested'; },
      canPresentFullScreen: async () => { io.checks.push('fullscreen'); return io.fullScreenWait ?? true; },
      canPlayForegroundRingtone: async () => true,
      startForegroundSound: async (token, _channel, paused) => {
        io.timeline.push('sound'); io.sound.push(token); io.player = { token, playing: !paused }; return true;
      },
      pauseForegroundSound: (token, paused) => { if (io.player?.token === token) io.player.playing = !paused; },
      stopForegroundSound: token => { if (io.player?.token === token) io.player = null; },
      getForegroundSoundState: async token => io.player?.token !== token ? 'stopped' : io.player.playing ? 'playing' : 'paused',
    } } },
    '@notifee/react-native': { __esModule: true, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 },
      AndroidStyle: { BIGTEXT: 'BIGTEXT' }, default: {
        getNotificationSettings: async () => ({ authorizationStatus: 1 }),
        getChannel: async () => ({ sound: 'driver_ring', importance: 4 }),
        createChannel: async channel => { io.channels.push(channel.id); if (channel.id === quietChannel) await io.channelWait; },
        cancelNotification: async id => { io.cancelled.push(id); if (id.startsWith('driver-')) await io.cancelWait; io.timeline.push(`cancel:${id}`); },
        displayNotification: async card => {
          io.displayed.push(card); if (card.android.channelId === quietChannel) await io.displayWait;
          io.timeline.push(`display:${card.id}`);
        },
        getDisplayedNotifications: async () => {
          if (io.nativeRead) return io.nativeRead();
          return io.cardsGone ? [] : [{ id: cardId, notification: { data, android: { channelId: 'zwanga-ride-ring-v4' } } }];
        },
      } },
    'expo-notifications': {
      getPresentedNotificationsAsync: async () => io.cardsGone ? [] : [{ request: { identifier: cardId, content: { data } } }],
      dismissNotificationAsync: async id => { io.cancelled.push(id); },
      addNotificationReceivedListener: () => ({ remove: noop }),
    },
    '@/services/foregroundRideAnnouncement': { clearRideAnnouncementSession: noop, reconcileRideAnnouncement: noop,
      silenceRestoredRideAnnouncement: noop, stopRideAnnouncement: noop },
    '@/services/rideEntryAnnouncement': { beginRideSpeechEntry: noop, clearRideSpeechEntry: noop, hasPendingRideSpeechEntry: () => false,
      subscribeRideSpeechEntry: () => noop },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
  });
  const session = load('services/rideAlertSession.ts');
  const service = load('services/driverNotifications.ts');
  const background = load('services/backgroundRideRinging.ts');
  const ring = load('hooks/notifications/useRideRinging.ts').useRideRinging;
  t.after(() => hooks.unmount());
  return { io, data, session, service, background, app,
    mount: () => hooks.render(() => ring(driverId)),
    state: value => { app.currentState = value; listeners.forEach(listener => listener(value)); } };
}

for (const slow of ['channelWait', 'displayWait']) test(`fresh Android restoration waits for an identifiable card during a slow ${slow}`, async t => {
  const f = fixture(t), wait = deferred(); f.io[slow] = wait.promise;
  f.mount(); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 1, 'a delayed card must not lose the fresh event');
  assert.deepEqual(f.io.sound, [], 'never begin an anonymous app ringtone');
  assert.equal(f.io.cancelled.filter(id => id === cardId).length, slow === 'channelWait' ? 0 : 1,
    'retain the original OS card until the quiet channel is ready');
  t.mock.timers.tick(6000); await tick(); wait.resolve(); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1, 'the fresh handoff survives its sound deadline');
  assert.ok(f.io.timeline.indexOf('sound') > f.io.timeline.indexOf(`display:${cardId}`), 'publish before app audio');
  assert.ok(f.io.timeline.indexOf(`cancel:${cardId}`) < f.io.timeline.indexOf('sound'), 'stop OS audio first');
  assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].android.channelId, quietChannel);
  assert.equal(f.io.displayed[0].android.autoCancel, false);
  f.session.acknowledgeRideAlerts(a => a.key === cardId);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
});

test('two notification providers cannot start app audio while OS cancellation is pending', async t => {
  const f = fixture(t), wait = deferred(); f.io.cancelWait = wait.promise;
  f.mount(); await tick(); assert.deepEqual(f.io.sound, []);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  wait.resolve(); await tick(); assert.ok(f.io.sound.length > 0);
  assert.equal(f.io.displayed.length, 1);
});

test('a failed cancellation does not start a second player and remains retryable', async t => {
  const f = fixture(t), wait = deferred(); f.io.cancelWait = wait.promise;
  const rejected = assert.rejects(f.service.displayDriverInvitation(f.data), /RIDE_AUDIO_TIMEOUT/);
  await tick(); t.mock.timers.tick(8001); await rejected;
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  assert.equal(f.io.displayed.length, 0);
  wait.resolve(); f.io.cancelWait = undefined;
  const next = { ...f.data, tripRequestId: '00000000-0000-4000-8000-000000000003', ringUntil: new Date(Date.now() + 5000).toISOString() };
  await f.service.displayDriverInvitation(next); assert.equal(f.io.displayed.length, 1);
});

for (const transition of ['account', 'decision']) test(`${transition} during cancellation cannot revive audio or the card`, async t => {
  const f = fixture(t), wait = deferred(); f.io.cancelWait = wait.promise;
  const work = f.service.displayDriverInvitation(f.data); await tick();
  let decision;
  if (transition === 'account') f.io.version++;
  else decision = f.service.dismissDriverInvitation({ kind: 'nearby', id: requestId, driverId });
  wait.resolve(); await work; await decision;
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  assert.equal(f.io.displayed.length, 0);
});

test('sleep during card setup hands off once, then allows a quiet card on the next entry', async t => {
  const f = fixture(t), wait = deferred(); f.io.channelWait = wait.promise;
  const work = f.service.displayDriverInvitation(f.data); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  f.state('background');
  await f.background.reconcileBackgroundRideRinging(driverId);
  wait.resolve(); await work;
  assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].id, cardId);
  assert.equal(f.io.displayed[0].data.ringUntil, f.data.ringUntil, 'do not renew the original sound deadline');
  f.state('active'); await f.background.reconcileBackgroundRideRinging(driverId);
  t.mock.timers.tick(3000); // Respect the existing bounded handoff retry interval.
  await f.service.displayDriverInvitation(f.data);
  assert.equal(f.io.displayed.at(-1).id, cardId);
  assert.equal(f.io.displayed.at(-1).android.channelId, quietChannel);
});

test('a failed replacement card never starts anonymous audio and the staged event can retry', async t => {
  const f = fixture(t), wait = deferred(); f.io.displayWait = wait.promise;
  const work = assert.rejects(f.service.displayDriverInvitation(f.data), /card unavailable/);
  await tick(); wait.reject(Error('card unavailable')); await work;
  assert.deepEqual(f.io.sound, []);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 1);
  f.io.displayWait = undefined; t.mock.timers.tick(3000);
  await f.service.displayDriverInvitation(f.data);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
});

test('a completed native channel needs no legacy creation; wake and fullscreen checks run concurrently', async t => {
  const f = fixture(t), wake = deferred(), fullscreen = deferred(); f.state('background');
  f.io.wakeWait = wake.promise; f.io.fullScreenWait = fullscreen.promise;
  const work = f.service.displayDriverInvitation(f.data); await tick();
  assert.deepEqual(f.io.channels, []);
  assert.deepEqual(f.io.checks, ['wake', 'fullscreen']);
  wake.resolve(false); fullscreen.resolve(true); await work;
  assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].android.lightUpScreen, false);
  assert.equal(f.io.displayed[0].android.fullScreenAction, undefined, 'fullscreen never overrides wake policy');
});

test('a legacy restored booking without a timestamp stays visible for entry but cannot restart old audio', async t => {
  const f = fixture(t);
  Object.assign(f.data, { type: 'new_booking', actionProtocol: 'driver-v1', bookingId: requestId });
  delete f.data.ringUntil;
  f.mount(); await tick();
  assert.deepEqual(f.io.sound, []); assert.deepEqual(f.io.cancelled, []);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  assert.equal(f.session.pendingRideEntryAlerts(driverId).length, 1);
});

for (const kind of ['nearby', 'booking']) test(`Android ${kind} survives a second lock during OS sound cancellation`, async t => {
  const f = fixture(t), wait = deferred();
  if (kind === 'booking') Object.assign(f.data, { type: 'new_booking', actionProtocol: 'driver-v1', bookingId: requestId });
  f.io.cancelWait = wait.promise;
  f.mount(); await tick();
  f.io.cardsGone = true;
  f.state('background');
  wait.resolve(); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1, 'the cancelled card must not lose its pending event');
  assert.deepEqual(f.io.sound, [], 'no app player while locked');
  f.state('active'); await tick();
  assert.ok(f.io.sound.length > 0, 'resume without a card or a new push');
});

test('Android handoff captured while fresh survives the short sound deadline during cancellation', async t => {
  const f = fixture(t), wait = deferred(); f.io.cancelWait = wait.promise;
  f.mount(); await tick();
  t.mock.timers.tick(6000); await tick();
  wait.resolve(); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
  assert.ok(f.io.sound.length > 0, 'business event remains pending after a slow native handoff');
});

test('Android resumes known audio immediately while notification enumeration is stalled', async t => {
  const f = fixture(t); f.mount(); await tick();
  f.state('background'); await tick();
  const wait = deferred(); f.io.nativeRead = () => wait.promise; f.io.cardsGone = true;
  f.io.sound.length = 0;
  f.state('active'); await tick();
  assert.ok(f.io.sound.length > 0, 'do not wait eight seconds for notification reads');
  wait.resolve([]); await tick();
});

test('Android retries a transient restore failure even when no alert reached the JS queue', async t => {
  const f = fixture(t); f.io.cardsGone = true; let reads = 0;
  f.io.nativeRead = async () => {
    if (++reads === 1) throw Error('temporary native read failure');
    return [{ id: cardId, notification: { data: f.data, android: { channelId: 'zwanga-ride-ring-v4' } } }];
  };
  f.mount(); await tick(); assert.deepEqual(f.io.sound, []);
  t.mock.timers.tick(3000); await tick();
  assert.ok(f.io.sound.length > 0, 'a failed first read must not permanently silence the entry');
});

test('Android retries a lost cancellation response even after the native card disappeared', async t => {
  const f = fixture(t), wait = deferred(); f.io.cancelWait = wait.promise;
  f.mount(); await tick();
  f.io.cardsGone = true;
  t.mock.timers.tick(6000); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 0, 'no second audio owner while cancellation is unconfirmed');
  assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 1);
  f.io.cancelWait = undefined;
  wait.reject(Error('native cancellation result lost')); await tick();
  t.mock.timers.tick(1000); await tick();
  assert.ok(f.io.sound.length > 0, 'the same in-memory event retries without another push');
  assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 0);
});

test('a pending Android handoff cannot revive a dispatch past its business expiry', async t => {
  const f = fixture(t), wait = deferred(); f.io.cancelWait = wait.promise;
  Object.assign(f.data, { type: 'driver_dispatch_offer', actionProtocol: 'driver-v1', offerId: requestId,
    expiresAt: new Date(Date.now() + 2000).toISOString() });
  f.mount(); await tick();
  t.mock.timers.tick(3000); await tick(); wait.resolve(); await tick();
  assert.deepEqual(f.io.sound, []);
  assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 0);
});

test('failed notification enumeration retries at most twice and never retries while locked', async t => {
  const f = fixture(t); f.io.cardsGone = true; let reads = 0;
  f.io.nativeRead = async () => { reads++; throw Error('native read failure'); };
  f.mount(); await tick();
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(3000); await tick(); }
  assert.equal(reads, 3);
  f.state('background'); f.state('active'); await tick();
  assert.equal(reads, 4);
  f.state('background'); t.mock.timers.tick(30000); await tick();
  assert.equal(reads, 4);
});
