const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
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
  const io = { version: 0, sound: [], displayed: [], cancelled: [], channels: [], checks: [], timeline: [] };
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
      canPresentFullScreen: async () => { io.checks.push('fullscreen'); return io.fullScreenWait ?? true; },
    } } },
    '@notifee/react-native': { __esModule: true, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 },
      AndroidStyle: { BIGTEXT: 'BIGTEXT' }, default: {
        createChannel: async channel => { io.channels.push(channel.id); if (channel.id === quietChannel) await io.channelWait; },
        cancelNotification: async id => { io.cancelled.push(id); if (id === cardId) await io.cancelWait; io.timeline.push(`cancel:${id}`); },
        displayNotification: async card => { io.displayed.push(card); if (card.android.channelId === quietChannel) await io.displayWait; },
        getDisplayedNotifications: async () => [{ id: cardId, notification: { data, android: { channelId: 'zwanga-ride-ring-v4' } } }],
      } },
    'expo-notifications': {
      getPresentedNotificationsAsync: async () => [{ request: { identifier: cardId, content: { data } } }],
      dismissNotificationAsync: async id => { io.cancelled.push(id); },
      addNotificationReceivedListener: () => ({ remove: noop }),
    },
    '@/services/foregroundRideSound': {
      startForegroundRideSound: async key => { io.timeline.push('sound'); io.sound.push(key); }, stopForegroundRideSound: noop,
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

for (const slow of ['channelWait', 'displayWait']) test(`fresh Android restoration starts app audio before a slow ${slow}`, async t => {
  const f = fixture(t), wait = deferred(); f.io[slow] = wait.promise;
  f.mount(); await tick();
  assert.deepEqual(f.session.pendingRideAlerts(driverId).map(a => a.key), [cardId]);
  assert.ok(f.io.sound.length > 0, 'sound must not wait for replacement card UI');
  assert.equal(f.io.cancelled.filter(id => id === cardId).length, 1, 'both providers share one handoff');
  assert.ok(f.io.timeline.indexOf(`cancel:${cardId}`) < f.io.timeline.indexOf('sound'), 'stop OS audio first');
  t.mock.timers.tick(6000); await tick(); wait.resolve(); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1, 'a sound started while fresh stays pending until decision');
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
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
  f.state('background');
  await f.background.reconcileBackgroundRideRinging(driverId);
  wait.resolve(); await work;
  assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].id, `ride-handoff-${cardId}`);
  assert.ok(f.io.displayed[0].android.timeoutAfter <= 5000, 'do not renew the original sound deadline');
  f.state('active'); await f.background.reconcileBackgroundRideRinging(driverId);
  await f.service.displayDriverInvitation(f.data);
  assert.equal(f.io.displayed.at(-1).id, cardId);
  assert.equal(f.io.displayed.at(-1).android.channelId, quietChannel);
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
