const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const noop = () => {};
const alert = id => ({ id, key: id, kind: 'response', recipientId: 'driver', data: {} });
const nativeItem = id => ({ id, notification: { data: alert(id), android: {} } });
const remoteItem = id => ({ request: { identifier: id, content: { data: alert(id) } } });

function fixture(t, clock = true) {
  if (clock) t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const hooks = hookHarness(), remembered = [], logs = [];
  const io = { native: [nativeItem('first'), nativeItem('second')], remote: [remoteItem('remote')], reads: 0, cancels: [], remoteCancels: [], version: 0 };
  let change;
  const app = { currentState: 'active', addEventListener: (_event, listener) => { change = listener; return { remove: noop }; } };
  const load = loader({ react: hooks.react, 'expo-router': { usePathname: () => '/' },
    'react-native': { Platform: { OS: 'android' }, AppState: app },
    'expo-notifications': {
      getPresentedNotificationsAsync: async () => io.remoteWait ?? io.remote,
      dismissNotificationAsync: async id => { io.remoteCancels.push(id); if (io.failRemote === id) throw new Error('fake private native error'); },
      addNotificationReceivedListener: () => ({ remove: noop }),
    },
    '@notifee/react-native': {
      getDisplayedNotifications: () => { io.reads++; if (io.failSync) throw new Error('private');
        return io.failRead ? Promise.reject(new Error('private')) : Promise.resolve(io.readWait ?? io.native); },
      cancelNotification: async id => { io.cancels.push(id); if (io.failCancel === id) throw new Error('fake private native error'); if (io.cancelWait) await io.cancelWait; },
    },
    '@/features/notifications/rideAlert': { parseRideAlert: data => data, isRideResponseOpen: () => false },
    '@/services/rideAlertSession': { clearRideAlertSession: noop, pendingRideAlerts: () => [], rememberRideAlert: a => remembered.push(a.id),
      setRideAlertScreen: noop, subscribeRideAlerts: () => noop, pendingRideAlertHandoffs: () => [] },
    '@/services/foregroundRideSound': { startForegroundRideSound: async () => {}, stopForegroundRideSound: noop },
    '@/services/foregroundRideAnnouncement': { clearRideAnnouncementSession: noop, reconcileRideAnnouncement: noop, silenceRestoredRideAnnouncement: noop, stopRideAnnouncement: noop },
    '@/services/driverNotifications': { displayDriverInvitation: async () => {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    '@/services/passengerRideAlerts': { dismissOpenedRideResponses: async () => {} },
    '@/services/rideEntryAnnouncement': { beginRideSpeechEntry: noop, clearRideSpeechEntry: noop, hasPendingRideSpeechEntry: () => false, subscribeRideSpeechEntry: () => noop },
    '@/services/backgroundRideRinging': { BACKGROUND_RIDE_RING_PREFIX: 'background-', clearBackgroundRideRinging: async () => {}, reconcileBackgroundRideRinging: async () => {} },
  }, { console: { warn: (...args) => logs.push(args) } });
  const useRing = load('hooks/notifications/useRideRinging.ts').useRideRinging;
  t.after(() => hooks.unmount());
  return { io, remembered, logs, hooks, render: () => hooks.render(() => useRing('driver')),
    state: value => { app.currentState = value; change(value); } };
}

test('one failed native notification does not discard later native or remote alerts; errors are sanitized', async t => {
  const f = fixture(t); f.io.failCancel = 'first'; f.render(); await flush();
  assert.deepEqual([...f.remembered].sort(), ['remote', 'second']);
  assert.equal(f.logs[0][1], 'RESTORE_ANDROID_ITEM_FAILED'); assert.equal(JSON.stringify(f.logs).includes('private'), false);
});

test('a failed native provider leaves remote restoration available', async t => {
  const f = fixture(t); f.io.failRead = true; f.render(); await flush();
  assert.deepEqual(f.remembered, ['remote']); assert.equal(f.logs[0][1], 'RESTORE_ANDROID_READ_FAILED');
});

test('restoration dismisses own incoming OS alerts without replaying sound, speech or routing', async t => {
  const f = fixture(t), data = { type: 'trip_request_nearby', driverId: 'driver', passengerId: 'driver' };
  f.io.native.unshift({ id: 'own-native', notification: { data, android: {} } });
  f.io.remote.unshift({ request: { identifier: 'own-remote', content: { data } } });
  f.render(); await flush();
  assert.deepEqual([...f.remembered].sort(), ['first', 'remote', 'second']);
  assert.ok(f.io.cancels.includes('own-native'));
  assert.ok(f.io.remoteCancels.includes('own-remote'));
});

test('a synchronous bridge exception is isolated from the other provider too', async t => {
  const f = fixture(t); f.io.failSync = true; f.render(); await flush();
  assert.deepEqual(f.remembered, ['remote']); assert.equal(f.logs[0][1], 'RESTORE_ANDROID_READ_FAILED');
});

test('a stuck native provider never delays remote alerts; its late result is ignored after timeout', async t => {
  const f = fixture(t), wait = deferred(); f.io.readWait = wait.promise;
  f.render(); await flush(); assert.deepEqual(f.remembered, ['remote'], 'do not wait for the native timeout');
  t.mock.timers.tick(8000); await flush();
  assert.deepEqual(f.remembered, ['remote']); wait.resolve([nativeItem('late')]); await flush();
  assert.deepEqual(f.remembered, ['remote']);
});

test('a stuck Expo provider never delays native alerts or restores its late result', async t => {
  const f = fixture(t), wait = deferred(); f.io.remoteWait = wait.promise;
  f.render(); await flush(); assert.deepEqual(f.remembered, ['first', 'second']);
  t.mock.timers.tick(8000); await flush(); wait.resolve([remoteItem('late')]); await flush();
  assert.deepEqual(f.remembered, ['first', 'second']);
});

test('remote item failures do not skip the following notification', async t => {
  const f = fixture(t); f.io.native = []; f.io.remote = [remoteItem('bad'), remoteItem('good')]; f.io.failRemote = 'bad';
  f.render(); await flush(); assert.deepEqual(f.remembered, ['good']); assert.equal(f.logs[0][1], 'RESTORE_EXPO_ITEM_FAILED');
});

test('background, session change and unmount prevent a late cancellation from restoring an alert', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  for (const transition of ['background', 'session', 'unmount']) {
    const f = fixture(t, false), wait = deferred(); f.io.cancelWait = wait.promise; f.io.remote = [];
    f.render(); await flush();
    if (transition === 'background') f.state('background');
    if (transition === 'session') f.io.version++;
    if (transition === 'unmount') f.hooks.unmount();
    wait.resolve(); await flush(); assert.deepEqual(f.remembered, [], transition);
  }
});

test('rapid foreground returns serialize restoration and request at most one follow-up pass', async t => {
  const f = fixture(t), wait = deferred(); f.io.readWait = wait.promise; f.render(); await flush();
  assert.deepEqual(f.remembered, ['remote'], 'fast remote restoration finishes before backgrounding');
  f.remembered.length = 0;
  f.state('background'); f.state('active'); f.state('background'); f.state('active');
  assert.equal(f.io.reads, 1); f.io.readWait = undefined; wait.resolve(f.io.native); await flush();
  assert.equal(f.io.reads, 2); assert.deepEqual([...f.remembered].sort(), ['first', 'remote', 'second']);
});

test('a late Expo read cannot restore an alert after background, account change or unmount', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  for (const transition of ['background', 'session', 'unmount']) {
    const f = fixture(t, false), wait = deferred(); f.io.native = []; f.io.remoteWait = wait.promise;
    f.render(); await flush();
    if (transition === 'background') f.state('background');
    if (transition === 'session') f.io.version++;
    if (transition === 'unmount') f.hooks.unmount();
    wait.resolve([remoteItem('late')]); await flush(); assert.deepEqual(f.remembered, [], transition);
  }
});
