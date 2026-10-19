const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const hooks = hookHarness(), intervals = new Map();
  let nextTimer = 0;
  t.mock.method(globalThis, 'setInterval', fn => { const id = ++nextTimer; intervals.set(id, fn); return id; });
  t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
  const io = { path: '/', user: 'driver', version: 0, reconciles: 0, rings: 0, stops: 0, background: () => {} };
  const app = { currentState: 'active', addEventListener: (_, fn) => { io.background = fn; return { remove() {} }; } };
  const load = loader({ react: hooks.react, 'expo-router': { usePathname: () => io.path },
    'react-native': { Platform: { OS: 'ios' }, AppState: app },
    'expo-notifications': { getPresentedNotificationsAsync: async () => [], addNotificationReceivedListener: () => ({ remove() {} }) },
    '@notifee/react-native': { getDisplayedNotifications: async () => [] },
    '@/services/foregroundRideSound': { startForegroundRideSound: async () => { io.rings++; }, stopForegroundRideSound() {} },
    '@/services/foregroundRideAnnouncement': { reconcileRideAnnouncement() { io.reconciles++; }, stopRideAnnouncement() { io.stops++; }, clearRideAnnouncementSession() {}, silenceRestoredRideAnnouncement() {} },
    '@/services/driverNotifications': { displayDriverInvitation: async () => {} },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
  });
  const useRideRinging = load('hooks/notifications/useRideRinging.ts').useRideRinging;
  const registry = load('services/rideEntryAnnouncement.ts');
  t.after(() => hooks.unmount());
  return { io, hooks, intervals, registry,
    render: () => hooks.render(() => useRideRinging(io.user)),
    state: value => { app.currentState = value; io.background(value); },
    pulse: () => { for (const fn of [...intervals.values()]) fn(); },
    settle: () => t.mock.timers.tick(501) };
}

test('coordinator wakes speech with no push but never starts a ringtone, and removes the entry retry timer when consumed', async t => {
  const f = fixture(t); f.render(); await tick();
  assert.equal(f.intervals.size, 1); assert.equal(f.io.rings, 0);
  const before = f.io.reconciles;
  f.registry.setRideSpeechEntryGate({ userId: 'driver', path: '/', blocked: false });
  f.registry.publishRideEntrySource({}, { userId: 'driver', path: '/', ready: true, message: null }); f.settle();
  assert.ok(f.io.reconciles > before, 'screen resolution wakes the speech coordinator');
  f.registry.consumeRideSpeechEntry(f.registry.readRideSpeechEntry('driver')); f.pulse();
  assert.equal(f.intervals.size, 0); assert.equal(f.io.rings, 0);
});

test('inactive dialogs do not replay an entry; background return does; account/unmount clears ownership', async t => {
  const f = fixture(t); f.render(); await tick();
  f.registry.setRideSpeechEntryGate({ userId: 'driver', path: '/', blocked: false });
  f.registry.publishRideEntrySource({}, { userId: 'driver', path: '/', ready: true, message: null }); f.settle();
  f.registry.consumeRideSpeechEntry(f.registry.readRideSpeechEntry('driver'));
  f.state('inactive'); f.state('active'); await tick();
  assert.equal(f.registry.hasPendingRideSpeechEntry('driver'), false);
  f.state('background'); assert.equal(f.intervals.size, 0); assert.ok(f.io.stops > 0);
  f.state('active'); await tick(); assert.equal(f.registry.hasPendingRideSpeechEntry('driver'), true);
  f.io.user = 'other'; f.render(); await tick();
  assert.equal(f.registry.hasPendingRideSpeechEntry('driver'), false);
  assert.equal(f.registry.hasPendingRideSpeechEntry('other'), true);
  f.hooks.unmount(); assert.equal(f.intervals.size, 0); assert.equal(f.registry.hasPendingRideSpeechEntry('other'), false);
});

test('waiting on an unresolved role never leaves a permanent entry polling timer or a ringtone', async t => {
  const f = fixture(t); f.render(); await tick();
  t.mock.timers.tick(30001); f.pulse();
  assert.equal(f.intervals.size, 0); assert.equal(f.io.rings, 0);
  assert.equal(f.registry.readRideSpeechEntry('driver').status, 'expired');
});
