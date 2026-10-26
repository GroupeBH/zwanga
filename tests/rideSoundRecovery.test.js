const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, withHealth = true) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const io = { active: true, starts: 0, probes: 0, stops: 0, fails: false,
    state: 'stopped', allowed: true, logs: [], probe: null, owner: null };
  const native = {
    canPlayForegroundRingtone: async () => io.allowed,
    startForegroundSound: async (token, _channel, paused) => {
      io.starts++;
      if (io.fails) throw Error('private synthetic native error');
      io.owner = token; io.state = paused ? 'paused' : 'playing'; return true;
    },
    pauseForegroundSound: (token, paused) => {
      if (io.owner === token) io.state = paused ? 'paused' : 'playing';
    },
    stopForegroundSound: token => {
      io.stops++;
      if (io.owner === token) { io.state = 'stopped'; io.owner = null; }
    },
    ...(withHealth ? { getForegroundSoundState: async () => {
      io.probes++; return io.probe ? io.probe() : io.state;
    } } : {}),
  };
  const load = loader({
    'react-native': { Platform: { OS: 'android' }, NativeModules: { ZwangaDriverAlerts: native }, Vibration: {} },
    '@notifee/react-native': { getNotificationSettings: async () => ({ authorizationStatus: 1 }),
      getChannel: async () => ({ sound: 'driver_ring', importance: 4 }) },
    './driverAlertChannel': { getDriverAlertChannel: async () => 'zwanga-ride-ring-v4' },
    './appActivity': { isAppActive: () => io.active },
  }, { console: { warn: (...args) => io.logs.push(args) } });
  const sound = load('services/foregroundRideSound.ts');
  t.after(() => sound.stopForegroundRideSound());
  return { io, ...sound };
}

test('an asynchronously lost native player is detected and restarted, with no new notification required', async t => {
  const f = fixture(t); await f.startForegroundRideSound('first');
  f.io.state = 'stopped'; f.io.owner = null; // Java OnError release(), while JS remains active
  t.mock.timers.tick(5000); await f.startForegroundRideSound('first');
  assert.equal(f.isForegroundRideSoundReady(), false);
  assert.equal(f.io.starts, 1);
  t.mock.timers.tick(5000); await f.startForegroundRideSound('first');
  assert.equal(f.io.starts, 2); assert.equal(f.io.state, 'playing');
  assert.deepEqual(f.io.logs, [['[RideAudio]', 'RING_PLAYBACK_LOST']]);
});

test('after three failures a distinct alert can recover, but duplicates and queue reorder cannot reset the budget', async t => {
  const f = fixture(t); f.io.fails = true;
  await f.startForegroundRideSound('first');
  t.mock.timers.tick(5000); await f.startForegroundRideSound('first');
  t.mock.timers.tick(15000); await f.startForegroundRideSound('first');
  f.io.fails = false;
  t.mock.timers.tick(3600000); await f.startForegroundRideSound('first');
  assert.equal(f.io.starts, 3);
  await f.startForegroundRideSound('second'); assert.equal(f.io.starts, 4);
  // Even brief successful starts do not erase an episode's interruption budget.
  for (let i = 0; i < 3; i++) {
    f.io.state = 'stopped'; t.mock.timers.tick(5000);
    await f.startForegroundRideSound('second');
    t.mock.timers.tick(15000); await f.startForegroundRideSound('second');
  }
  const count = f.io.starts;
  t.mock.timers.tick(60000); await f.startForegroundRideSound('first');
  await f.startForegroundRideSound('second'); assert.equal(f.io.starts, count);
  await f.startForegroundRideSound('third'); assert.equal(f.io.starts, count + 1);
  assert.equal(JSON.stringify(f.io.logs).includes('private'), false);
});

test('a burst of new requests does not bypass the existing retry delay', async t => {
  const f = fixture(t); f.io.fails = true;
  await f.startForegroundRideSound('first');
  for (let i = 0; i < 20; i++) await f.startForegroundRideSound('request-' + i);
  assert.equal(f.io.starts, 1);
  f.io.fails = false; t.mock.timers.tick(5000);
  await f.startForegroundRideSound('request-19'); assert.equal(f.io.starts, 2);
});

test('health checks are coalesced and bounded to one every five seconds', async t => {
  const f = fixture(t); await f.startForegroundRideSound('first');
  for (let i = 0; i < 10; i++) await f.startForegroundRideSound('first');
  assert.equal(f.io.probes, 0);
  t.mock.timers.tick(5000);
  let finish;
  f.io.probe = () => new Promise(resolve => { finish = resolve; });
  const pending = f.startForegroundRideSound('first');
  await Promise.all(Array.from({ length: 10 }, () => f.startForegroundRideSound('first')));
  assert.equal(f.io.probes, 1);
  finish('playing'); await pending;
  await f.startForegroundRideSound('first'); assert.equal(f.io.probes, 1);
});

test('a late probe cannot stop a newer player after acknowledgement or account cleanup', async t => {
  const f = fixture(t); await f.startForegroundRideSound('first');
  t.mock.timers.tick(5000);
  let finish;
  f.io.probe = () => new Promise(resolve => { finish = resolve; });
  const pending = f.startForegroundRideSound('first'); await flush();
  f.stopForegroundRideSound();
  await f.startForegroundRideSound('second');
  finish('stopped'); await pending;
  assert.equal(f.io.state, 'playing'); assert.equal(f.io.starts, 2);
  assert.equal(f.isForegroundRideSoundReady(), true);
});

test('a stalled health check releases its handle and can recover without concurrent probes', async t => {
  const f = fixture(t); await f.startForegroundRideSound('first');
  f.io.probe = () => new Promise(() => {});
  t.mock.timers.tick(5000); const pending = f.startForegroundRideSound('first');
  t.mock.timers.tick(3000); await pending;
  assert.equal(f.isForegroundRideSoundReady(), false);
  assert.deepEqual(f.io.logs, [['[RideAudio]', 'RING_HEALTH_CHECK_FAILED']]);
  f.io.probe = null; t.mock.timers.tick(5000);
  await f.startForegroundRideSound('first'); assert.equal(f.io.starts, 2);
});

test('speech pauses are healthy, and a backgrounded app never probes or restarts audio', async t => {
  const f = fixture(t); await f.startForegroundRideSound('first');
  const resume = f.pauseForegroundRideSoundForSpeech();
  t.mock.timers.tick(5000); await f.startForegroundRideSound('first');
  assert.equal(f.io.state, 'paused'); assert.equal(f.io.starts, 1);
  resume(); assert.equal(f.io.state, 'playing');
  f.io.active = false; t.mock.timers.tick(5000);
  await f.startForegroundRideSound('second'); assert.equal(f.io.probes, 1);
  assert.equal(f.io.starts, 1);
});

test('a new alert cannot bypass silent mode or DND and old binaries remain compatible', async t => {
  const f = fixture(t, false); await f.startForegroundRideSound('first');
  t.mock.timers.tick(5000); await f.startForegroundRideSound('first');
  assert.equal(f.io.probes, 0); assert.equal(f.io.starts, 1);
  f.stopForegroundRideSound(); f.io.allowed = false;
  await f.startForegroundRideSound('second');
  assert.equal(f.io.starts, 1);
  assert.deepEqual(f.io.logs, [['[RideAudio]', 'RING_SYSTEM_AUDIO_UNAVAILABLE']]);
});

test('native health snapshots are token-scoped, main-threaded and respect system audio policy', () => {
  const source = fs.readFileSync('android/app/src/main/java/com/zwanga/notifications/ForegroundAlertPlayer.java', 'utf8');
  const method = source.slice(source.indexOf('void state('), source.indexOf('private void release()'));
  for (const fragment of ['main.post(', '!token.equals(owner)', '!allowed()', 'player.isPlaying()', 'promise.resolve("stopped")']) {
    assert.ok(method.includes(fragment), fragment);
  }
  const bridge = fs.readFileSync('android/app/src/main/java/com/zwanga/notifications/DriverAlertModule.java', 'utf8');
  assert.ok(bridge.includes('getForegroundSoundState(String token, Promise promise)'));
});

test('screen wake is bounded, fails closed on old binaries and never affects iOS', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const io = { platform: 'android', calls: 0, result: true, stall: false };
  const bridge = { canLightUpAlertScreen: async channel => {
    assert.equal(channel, 'ring'); io.calls++;
    if (io.stall) return new Promise(() => {});
    return io.result;
  } };
  const wake = loader({ 'react-native': {
    Platform: { get OS() { return io.platform; } }, NativeModules: { ZwangaDriverAlerts: bridge },
  } })('services/rideAlertScreenWake.ts').shouldLightUpRideAlertScreen;
  assert.equal(await wake('ring'), true);
  io.result = false; assert.equal(await wake('ring'), false);
  io.platform = 'ios'; assert.equal(await wake('ring'), false); assert.equal(io.calls, 2);
  io.platform = 'android'; io.stall = true;
  const pending = wake('ring'); t.mock.timers.tick(2000); assert.equal(await pending, false);
  delete bridge.canLightUpAlertScreen; assert.equal(await wake('ring'), false);
});

test('native screen-wake eligibility preserves permissions, silent mode, DND and channel choices', () => {
  const source = fs.readFileSync('android/app/src/main/java/com/zwanga/notifications/DriverAlertModule.java', 'utf8');
  const method = source.slice(source.indexOf('private static boolean allowsAlertScreenWake('), source.indexOf('private boolean canMigrate'));
  for (const fragment of ['manager.areNotificationsEnabled()', 'RINGER_MODE_NORMAL', 'STREAM_NOTIFICATION',
    'INTERRUPTION_FILTER_ALL', 'IMPORTANCE_HIGH', 'channel.getSound() == null', 'group.isBlocked()']) {
    assert.ok(method.includes(fragment), fragment);
  }
  assert.doesNotMatch(method, /setStreamVolume|setInterruptionFilter|startActivity|WakeLock|fullScreen/);
});
