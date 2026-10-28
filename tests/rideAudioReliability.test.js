const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function background(t, kind = 'booking', timers = ['Date']) {
  t.mock.timers.enable({ apis: timers, now: 100000 });
  const io = { version: 0, platform: 'android', state: 'background', pending: [], displayed: [], cancelled: [], wakes: [], channel: async () => 'ring', display: async () => {}, wake: true, fullscreen: false, fullScreenCalls: [] };
  const alert = { key: `driver-${kind}-one`, kind, recipientId: 'driver', id: 'one',
    data: { driverId: 'driver', ringUntil: new Date(Date.now() + 30000).toISOString(), type: kind === 'booking' ? 'new_booking' : 'booking_response' } };
  io.pending.push(alert);
  const load = loader({ 'react-native': { Platform: { get OS() { return io.platform; } }, AppState: { get currentState() { return io.state; } },
    NativeModules: { ZwangaDriverAlerts: { canLightUpAlertScreen: async () => io.wake,
      wakeDisplayedAlert: async id => { io.wakes.push(id); return 'requested'; },
      prepareForegroundAlert: async () => io.retainAudio ?? false,
      canPresentFullScreen: async id => { io.fullScreenCalls.push(id); return io.fullscreen; } } } },
    '@notifee/react-native': { __esModule: true, AndroidStyle: { BIGTEXT: 1 }, AndroidImportance: { HIGH: 4 }, AndroidVisibility: { PRIVATE: 0 }, default: {
      displayNotification: async n => { io.displayed.push(n); await io.display(); }, cancelNotification: async id => io.cancelled.push(id) } },
    './driverAlertChannel': { getDriverAlertChannel: () => io.channel() }, './rideAlertSession': { pendingRideAlerts: () => io.pending },
    './tokenSession': { getTokenSessionVersion: () => io.version } });
  return { io, alert, ...load('services/backgroundRideRinging.ts') };
}

test('background handoff is deduplicated and preserves original remaining ring time and decision actions', async t => {
  const f = background(t); t.mock.timers.tick(12000);
  await Promise.all([f.reconcileBackgroundRideRinging('driver'), f.reconcileBackgroundRideRinging('driver')]);
  assert.equal(f.io.displayed.length, 1);
  const notification = f.io.displayed[0];
  assert.equal(notification.android.timeoutAfter, 18000);
  assert.equal(notification.android.loopSound, true);
  assert.equal(notification.android.lightUpScreen, false, 'avoid Notifee unbounded wake locks');
  assert.deepEqual(f.io.wakes, [notification.id]);
  assert.equal(notification.android.fullScreenAction, undefined);
  assert.deepEqual(notification.android.actions.map(a => a.pressAction.id), ['driver-decline', 'driver-accept']);
  f.io.pending = []; await f.reconcileBackgroundRideRinging('driver');
  assert.deepEqual(f.io.cancelled, [notification.id]);
});

test('a 60-second alert can hand off after 30 seconds without renewing its deadline or shortening it to 30', async t => {
  const f = background(t);
  f.alert.data.ringUntil = new Date(Date.now() + 60000).toISOString();
  await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed[0].android.timeoutAfter, 60000);
  t.mock.timers.tick(35000); await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 1);
  t.mock.timers.tick(26000); await f.reconcileBackgroundRideRinging('driver');
  assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id]);
});

test('a passenger response hands back to Android but has no driver decision buttons', async t => {
  const f = background(t, 'response'); f.io.fullscreen = true; await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 1); assert.equal(f.io.displayed[0].android.actions, undefined);
  assert.equal(f.io.displayed[0].android.fullScreenAction, undefined); assert.deepEqual(f.io.fullScreenCalls, []);
  f.io.state = 'active'; await f.reconcileBackgroundRideRinging('driver');
  assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id]);
});

test('foreground handoff retains the native owner until player readiness, but never across a decision or account change', async t => {
  for (const reason of ['decision', 'account', 'expiry']) {
    const f = background(t); f.io.retainAudio = true;
    await f.reconcileBackgroundRideRinging('driver');
    f.io.state = 'active'; await f.reconcileBackgroundRideRinging('driver');
    assert.deepEqual(f.io.cancelled, []);
    if (reason === 'decision') f.io.pending = [];
    if (reason === 'account') f.io.version++;
    if (reason === 'expiry') t.mock.timers.tick(31000);
    await f.reconcileBackgroundRideRinging('driver');
    assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id], reason);
    t.mock.timers.reset();
  }
});

test('a decision during asynchronous foreground preparation cannot retain stale audio', async t => {
  const f = background(t); await f.reconcileBackgroundRideRinging('driver');
  let finish; f.io.retainAudio = new Promise(resolve => { finish = resolve; });
  f.io.state = 'active'; const work = f.reconcileBackgroundRideRinging('driver'); await tick();
  f.io.pending = []; finish(true); await work;
  assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id]);
});

test('locking again after native foreground handoff recreates the card with only the remaining time', async t => {
  const f = background(t); f.io.retainAudio = true;
  await f.reconcileBackgroundRideRinging('driver');
  f.io.state = 'active'; await f.reconcileBackgroundRideRinging('driver');
  t.mock.timers.tick(5000); f.io.state = 'background';
  await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 2);
  assert.equal(f.io.displayed[1].android.timeoutAfter, 25000);
  assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id]);
});

test('locking during a driver alert preserves the same opt-in fullscreen eligibility and deadline as a fresh push', async t => {
  for (const kind of ['booking', 'dispatch', 'nearby']) {
    const f = background(t, kind); f.io.fullscreen = true; t.mock.timers.tick(12000);
    await f.reconcileBackgroundRideRinging('driver');
    assert.equal(f.io.displayed[0].android.fullScreenAction.launchActivity, 'com.zwanga.notifications.IncomingRideActivity');
    assert.equal(f.io.displayed[0].android.timeoutAfter, 18000);
    assert.deepEqual(f.io.fullScreenCalls, ['driver']);
    t.mock.timers.reset();
  }
});

test('fullscreen eligibility errors preserve the ordinary handoff notification', async t => {
  const f = background(t);
  f.io.fullscreen = Promise.reject(Error('synthetic native failure'));
  await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].android.fullScreenAction, undefined);
});

test('fullscreen background handoff defers manual wake and suppresses it after returning to the app', async t => {
  const f = background(t, 'booking', ['Date', 'setTimeout']); f.io.fullscreen = true;
  await f.reconcileBackgroundRideRinging('driver');
  assert.ok(f.io.displayed[0].android.fullScreenAction); assert.deepEqual(f.io.wakes, []);
  t.mock.timers.tick(1499); await tick(); assert.deepEqual(f.io.wakes, []);
  f.io.state = 'active'; t.mock.timers.tick(1); await tick(); assert.deepEqual(f.io.wakes, []);
  await f.clearBackgroundRideRinging();
});

test('an alert expiring while fullscreen eligibility resolves cannot wake the phone afterwards', async t => {
  const f = background(t); let finish;
  f.io.fullscreen = new Promise(resolve => { finish = resolve; });
  const work = f.reconcileBackgroundRideRinging('driver'); await tick();
  t.mock.timers.tick(31000); finish(true); await work;
  assert.equal(f.io.displayed.length, 0);
});

test('background handoff preserves nearby price/destination and its two safe action buttons', async t => {
  const f = background(t, 'nearby');
  Object.assign(f.alert.data, { ridePricePerSeat: '1000', ridePriceKind: 'budget', rideArrival: 'Gare' });
  await f.reconcileBackgroundRideRinging('driver');
  const notification = f.io.displayed[0];
  assert.match(notification.body.replace(/[\u202f\u00a0]/g, ' '), /Budget : 1 000 FC \/ place/);
  assert.match(notification.body, /Destination : Gare/);
  assert.equal(notification.android.style.text, notification.body);
  assert.deepEqual(notification.android.actions.map(a => a.pressAction.id), ['driver-ignore-nearby', 'driver-review-nearby']);
});

test('a DND or muted-channel decision suppresses screen wake without discarding the notification', async t => {
  const f = background(t); f.io.wake = false; f.io.fullscreen = true; await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 1);
  assert.equal(f.io.displayed[0].android.lightUpScreen, false);
  assert.equal(f.io.displayed[0].android.fullScreenAction, undefined);
  assert.deepEqual(f.io.wakes, []);
});

test('handoff cannot start after expiry, a decision, a foreground return or a changed account during initialization', async t => {
  for (const change of ['expired', 'answered', 'active', 'account']) {
    const f = background(t); let finish;
    f.io.channel = () => new Promise(resolve => { finish = resolve; });
    const work = f.reconcileBackgroundRideRinging('driver'); await tick();
    if (change === 'expired') t.mock.timers.tick(31000);
    if (change === 'answered') f.io.pending = [];
    if (change === 'active') f.io.state = 'active';
    if (change === 'account') f.io.version++;
    finish('ring'); await work; assert.equal(f.io.displayed.length, 0, change);
    t.mock.timers.reset();
  }
});

test('iOS and an inactive permission dialog never create a local looping background notification', async t => {
  const f = background(t); f.io.platform = 'ios'; await f.reconcileBackgroundRideRinging('driver');
  f.io.platform = 'android'; f.io.state = 'inactive'; await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 0);
});

test('a late native display is cancelled after a decision or foreground return', async t => {
  for (const reason of ['decision', 'foreground']) {
    const f = background(t); let finish;
    f.io.display = () => new Promise(resolve => { finish = resolve; });
    const work = f.reconcileBackgroundRideRinging('driver'); await tick();
    if (reason === 'decision') f.io.pending = [];
    else f.io.state = 'active';
    const queued = f.reconcileBackgroundRideRinging('driver');
    finish(); await Promise.all([work, queued]);
    assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id]);
    assert.deepEqual(f.io.wakes, [], 'a cancelled or foreground card must not wake the screen');
    t.mock.timers.reset();
  }
});

test('background screen wake waits for card publication without holding the card on a slow wake bridge', async t => {
  const f = background(t); let finish;
  f.io.display = () => new Promise(resolve => { finish = resolve; });
  const work = f.reconcileBackgroundRideRinging('driver'); await tick();
  assert.deepEqual(f.io.wakes, []);
  finish(); await work;
  assert.deepEqual(f.io.wakes, [f.io.displayed[0].id]);
});

test('cleanup invalidates an initializing handoff without needing a token rotation', async t => {
  const f = background(t); let finish;
  f.io.channel = () => new Promise(resolve => { finish = resolve; });
  const work = f.reconcileBackgroundRideRinging('driver'); await tick();
  await f.clearBackgroundRideRinging(); finish('ring'); await work;
  assert.equal(f.io.displayed.length, 0);
});

test('a newly received alert can replace an expired native handoff, never extend the first deadline', async t => {
  const f = background(t); await f.reconcileBackgroundRideRinging('driver');
  t.mock.timers.tick(31000);
  f.io.pending.push({ ...f.alert, key: 'driver-booking-two', data: { ...f.alert.data, ringUntil: new Date(Date.now() + 20000).toISOString() } });
  await f.reconcileBackgroundRideRinging('driver');
  assert.equal(f.io.displayed.length, 2);
  assert.deepEqual(f.io.cancelled, [f.io.displayed[0].id]);
  assert.equal(f.io.displayed[1].android.timeoutAfter, 20000);
});

test('rapid foreground/background changes queue reconciliation without reviving the stale initialization', async t => {
  const f = background(t); let finish, calls = 0;
  f.io.channel = () => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve('ring');
  const work = f.reconcileBackgroundRideRinging('driver'); await tick();
  f.io.state = 'active'; void f.reconcileBackgroundRideRinging('driver');
  f.io.state = 'background'; void f.reconcileBackgroundRideRinging('driver');
  finish('ring'); await work;
  assert.equal(calls, 2);
  assert.equal(f.io.displayed.length, 1);
});

test('detail entry validates participation, booking state and request action availability', () => {
  const { buildManageTripEntry: manage, buildRequestDetailEntry: request } = loader()('features/notifications/detailEntryAnnouncement.ts');
  const trip = { id: 'trip', driverId: 'driver', status: 'upcoming', departure: { address: 'Place' }, arrival: { address: 'Gare' } };
  const booking = { id: 'booking', tripId: 'trip', status: 'pending' };
  assert.match(manage('driver', trip, [booking]).text, /réservation.*Acceptez ou refusez/);
  assert.equal(manage('other', trip, [booking]), null);
  assert.equal(manage('driver', { ...trip, status: 'completed' }, [booking]), null);
  const input = { userId: 'driver', isDriver: true, canAccept: true, assigned: false,
    request: { id: 'request', passengerId: 'passenger', status: 'pending', departure: trip.departure, arrival: trip.arrival } };
  assert.match(request(input).text, /Acceptez ou refusez/);
  assert.match(request(input).text, /contacter le client/);
  assert.ok(!request({ ...input, canAccept: false }).text.includes('accepter sa commande'));
  assert.equal(request({ ...input, isDriver: false }), null);
  assert.match(request({ ...input, request: { ...input.request, status: 'expired' } }).text, /plus disponible/);
  assert.match(request({ ...input, userId: 'passenger', isDriver: false }).text, /Attendez la réponse/);
});

test('Android foreground audio uses notification attributes and releases on lifecycle/prepare failure without volume override', () => {
  const source = fs.readFileSync('android/app/src/main/java/com/zwanga/notifications/ForegroundAlertPlayer.java', 'utf8');
  for (const contract of ['AudioAttributes.USAGE_NOTIFICATION', 'AudioManager.STREAM_NOTIFICATION', 'LifecycleState.RESUMED',
    'manager.areNotificationsEnabled()', 'channel.getSound() == null', 'group.isBlocked()', 'prepareAsync()',
    'main.postDelayed(timeout, 5000)', 'onHostPause()', 'previous.release()', 'token.equals(owner)']) assert.ok(source.includes(contract), contract);
  assert.doesNotMatch(source, /setStreamVolume|adjustStreamVolume|startForegroundService|WakeLock|TYPE_RINGTONE/);
});

test('a stalled native audio promise times out, while completed work releases its timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { boundedRideAudio } = loader()('services/rideAudioDiagnostics.ts');
  assert.equal(await boundedRideAudio(Promise.resolve('ready')), 'ready');
  const stalled = assert.rejects(boundedRideAudio(new Promise(() => {})), /RIDE_AUDIO_TIMEOUT/);
  t.mock.timers.tick(8000); await stalled;
  // No rejected timeout remains attached to the completed operation.
  t.mock.timers.tick(8000); await tick();
});

test('audio diagnostics throttle repeated static codes without logging event payloads', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const warn = t.mock.fn(() => {});
  const { reportRideAudioFailure } = loader({}, { console: { warn } })('services/rideAudioDiagnostics.ts');
  for (let index = 0; index < 100; index++) reportRideAudioFailure('RING_INITIALIZATION_FAILED');
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls[0].arguments, ['[RideAudio]', 'RING_INITIALIZATION_FAILED']);
  t.mock.timers.tick(60000); reportRideAudioFailure('RING_INITIALIZATION_FAILED');
  assert.equal(warn.mock.callCount(), 2);
});

test('release diagnostics forward only throttled static unexpected failures, never payloads or mute choices', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const errors = [];
  const { reportRideAudioFailure } = loader({ './diagnostics': {
    reportUnexpectedError: error => errors.push(error.message),
  } })('services/rideAudioDiagnostics.ts');
  reportRideAudioFailure('RING_PLAYBACK_LOST'); reportRideAudioFailure('RING_PLAYBACK_LOST');
  reportRideAudioFailure('RING_CHANNEL_DISABLED');
  reportRideAudioFailure('private user data');
  await tick();
  assert.deepEqual(errors, ['RideAudio:RING_PLAYBACK_LOST']);
  t.mock.timers.tick(60000); reportRideAudioFailure('RING_PLAYBACK_LOST'); await tick();
  assert.equal(errors.length, 2);
});
