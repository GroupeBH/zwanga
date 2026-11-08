const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const driverId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const cardId = `driver-dispatch-${requestId}`;

function fixture(t, platform = 'android', appState = 'active') {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: Date.parse('2026-11-08T10:00:00Z') });
  const hooks = hookHarness(), listeners = new Set();
  const io = { calls: 0, offline: false, allowed: true, displayed: [], cancelled: [], sounds: [], version: 0,
    publishDelay: 0, channelDelay: 0, onPublish: noop, onCheck: noop, nativeStarts: 0 };
  const app = { currentState: appState, addEventListener: (_event, callback) => {
    listeners.add(callback); return { remove: () => listeners.delete(callback) };
  } };
  const load = loader({
    react: hooks.react, 'expo-router': { usePathname: () => '/' },
    '@/store': { store: { dispatch: () => ({ unwrap: async () => {
      io.calls++; await io.onCheck();
      if (io.offline) throw Error('SIMULATED_OFFLINE');
      return { allowed: io.allowed };
    }, abort: noop, reset: noop }) } },
    '@/store/api/rideRingApi': { rideRingApi: { endpoints: { validateRideRing: { initiate: () => ({}) } } } },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    './tokenStorage': { getTokens: async () => ({ refreshToken: 'synthetic-session' }) },
    '@/utils/jwt': { isTokenExpired: () => false, getUserIdFromToken: () => driverId },
    './rideNotificationReceipt': { reportRideNotificationReceipt: async () => {} },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    'expo-notifications': { getPresentedNotificationsAsync: async () => [], dismissNotificationAsync: async () => {},
      addNotificationReceivedListener: () => ({ remove: noop }) },
    '@notifee/react-native': { __esModule: true, default: {
      createChannel: async () => { t.mock.timers.tick(io.channelDelay); }, getDisplayedNotifications: async () => [],
      displayNotification: async card => { io.displayed.push(card); t.mock.timers.tick(io.publishDelay); await io.onPublish(); },
      cancelNotification: async id => { io.cancelled.push(id); },
    }, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 }, AndroidStyle: { BIGTEXT: 'BIGTEXT' } },
    'react-native': { Platform: { OS: platform }, AppState: app, NativeModules: { ZwangaDriverAlerts: {
      startBackgroundAlertSound: async () => { io.nativeStarts++; return true; },
    } } },
    '@/services/foregroundRideSound': { startForegroundRideSound: async key => { io.sounds.push(key); }, stopForegroundRideSound: noop },
    '@/services/foregroundRideAnnouncement': { clearRideAnnouncementSession: noop, reconcileRideAnnouncement: noop,
      silenceRestoredRideAnnouncement: noop, stopRideAnnouncement: noop },
    '@/services/rideEntryAnnouncement': { beginRideSpeechEntry: noop, clearRideSpeechEntry: noop, hasPendingRideSpeechEntry: () => false,
      subscribeRideSpeechEntry: () => noop },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
  });
  const session = load('services/rideAlertSession.ts'), service = load('services/driverNotifications.ts');
  const validation = load('services/rideRingValidation.ts');
  const data = { actionProtocol: 'driver-v1', type: 'driver_dispatch_offer', driverId, offerId: requestId,
    tripRequestId: requestId, expiresAt: new Date(Date.now() + 40000).toISOString(),
    ringUntil: new Date(Date.now() + 40000).toISOString(), ringValidationToken: 'synthetic-permit' };
  const mount = () => hooks.render(() => load('hooks/notifications/useRideRinging.ts').useRideRinging(driverId));
  t.after(() => hooks.unmount());
  return { io, data, session, service, validation, mount,
    state: value => { app.currentState = value; listeners.forEach(callback => callback(value)); } };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: first failed admission stays silent then recovers without another push`, async t => {
    const f = fixture(t, platform); f.mount(); await tick(); f.io.offline = true;
    await f.service.displayDriverInvitation(f.data);
    assert.equal(f.session.pendingRideAlerts(driverId).length, 0); assert.deepEqual(f.io.sounds, []);
    assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 1);
    f.io.offline = false; t.mock.timers.tick(3000); await tick();
    assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
    assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 0);
    assert.ok(f.io.sounds.length > 0); assert.equal(f.io.calls, 2);
  });

  test(`${platform}: unavailable admission retries are bounded and never make anonymous audio`, async t => {
    const f = fixture(t, platform); f.mount(); await tick(); f.io.offline = true;
    await f.service.displayDriverInvitation(f.data);
    for (let i = 0; i < 15; i++) { t.mock.timers.tick(3000); await tick(); }
    assert.equal(f.io.calls, 3); assert.deepEqual(f.io.sounds, []); assert.deepEqual(f.io.displayed, []);
    assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 0);
  });

  for (const terminal of ['decision', 'account', 'expiry', 'refusal'])
    test(`${platform}: ${terminal} prevents a failed admission from becoming audible`, async t => {
      const f = fixture(t, platform); f.mount(); await tick(); f.io.offline = true;
      await f.service.displayDriverInvitation(f.data); f.io.offline = false;
      if (terminal === 'decision') await f.service.dismissDriverInvitation({ kind: 'dispatch', id: requestId, driverId });
      if (terminal === 'account') f.io.version++;
      if (terminal === 'expiry') t.mock.timers.tick(40001);
      if (terminal === 'refusal') f.io.allowed = false;
      t.mock.timers.tick(3000); await tick();
      assert.deepEqual(f.io.sounds, []); assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
      assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 0);
    });
}

for (const appState of ['active', 'background']) for (const slow of ['channelDelay', 'publishDelay'])
  test(`${appState}: a slow ${slow} renews admission without cancelling the valid card`, async t => {
    const f = fixture(t, 'android', appState); f.io[slow] = 3500;
    const original = { ...f.data };
    await f.service.displayDriverInvitation(f.data);
    assert.equal(f.io.displayed.length, 1); assert.deepEqual(f.data, original);
    assert.equal(f.io.cancelled.filter(id => id === cardId).length, appState === 'active' ? 1 : 0,
      'only the existing foreground OS sound handoff cancels the old card');
    assert.equal(f.io.calls, 2, 'only stale publication admission is renewed');
    if (appState === 'active') assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
    else assert.equal(f.io.nativeStarts, 1, 'the existing background audio owner starts once');
  });

test('a terminal event during a slow publication cancels the card instead of renewing admission', async t => {
  const f = fixture(t); f.io.publishDelay = 3500;
  f.io.onPublish = () => f.validation.invalidateRideRingValidation(requestId);
  await f.service.displayDriverInvitation(f.data);
  assert.equal(f.io.calls, 1); assert.equal(f.session.pendingRideAlerts(driverId).length, 0);
  assert.equal(f.io.cancelled.filter(id => id === cardId).length, 2);
});

test('a background failed admission resumes on foreground, with no retries while suspended', async t => {
  const f = fixture(t, 'android', 'background'); f.mount(); await tick(); f.io.offline = true;
  await f.service.displayDriverInvitation(f.data);
  t.mock.timers.tick(6000); await tick(); assert.equal(f.io.calls, 1);
  f.io.offline = false; f.state('active'); await tick();
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
});

test('a retry still awaiting the server is shared across foreground timer ticks', async t => {
  const f = fixture(t); f.mount(); await tick(); f.io.offline = true;
  await f.service.displayDriverInvitation(f.data); f.io.offline = false;
  let release; f.io.onCheck = () => new Promise(resolve => { release = resolve; });
  t.mock.timers.tick(3000); await tick(); assert.equal(f.io.calls, 2);
  t.mock.timers.tick(2000); await tick(); assert.equal(f.io.calls, 2);
  release(); await tick(); assert.equal(f.io.displayed.length, 1);
  assert.equal(f.session.pendingRideAlerts(driverId).length, 1);
});

for (const kind of ['booking', 'dispatch', 'nearby'])
test(`normal ${kind} delivery retains one card and its original admission cost`, async t => {
  const f = fixture(t, 'android', 'background');
  if (kind === 'booking') Object.assign(f.data, { type: 'new_booking', bookingId: requestId });
  if (kind === 'nearby') Object.assign(f.data, { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3' });
  await f.service.displayDriverInvitation(f.data);
  assert.equal(f.io.calls, kind === 'booking' ? 0 : 1);
  assert.equal(f.io.nativeStarts, 1); assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].android.sound, 'driver_ring');
  assert.equal(f.io.displayed[0].data.ringUntil, f.data.ringUntil);
  assert.equal(f.session.pendingRideAlertHandoffs(driverId).length, 0);
  assert.deepEqual(f.io.cancelled, []);
});
